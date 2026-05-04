import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  DEFAULT_PLAYABLE_ROSTER as SHARED_DEFAULT_PLAYABLE_ROSTER,
  MIN_AGENTS,
  STARTING_RESOURCES,
} from "@survivor/shared";

const tempDir = mkdtempSync(join(tmpdir(), "survivor-gm-test-"));
process.env.DB_PATH = join(tempDir, "survivor-test.db");

const { db, initDb, schema } = await import("../src/db/index.js");
const { getGameState, transitionTo } = await import("../src/engine/game-state.js");
const {
  DEFAULT_PLAYABLE_ROSTER,
  assertAgentDiscordAuthor,
  bootstrapDefaultRoster,
  registerAgent,
  resetDefaultRosterForFreshSeason,
  setupFreshDefaultSeason,
  startDefaultRosterSeason,
  startGameWithRegisteredAgents,
} = await import("../src/engine/roster.js");

function resetDb() {
  initDb();

  db.delete(schema.taskAdjudications).run();
  db.delete(schema.runtimeEvents).run();
  db.delete(schema.processHeartbeats).run();
  db.delete(schema.schedulerRuns).run();
  db.delete(schema.discordMessageAudit).run();
  db.delete(schema.timingRecords).run();
  db.delete(schema.resourceLog).run();
  db.delete(schema.taskCompletions).run();
  db.delete(schema.tasks).run();
  db.delete(schema.canaryResults).run();
  db.delete(schema.canaryChallenges).run();
  db.delete(schema.agents).run();

  db.update(schema.gameState)
    .set({
      phase: "registration",
      currentDay: 0,
      startedAt: null,
      completedAt: null,
    })
    .where(eq(schema.gameState.id, 1))
    .run();
}

describe("roster bootstrap and game activation", () => {
  beforeEach(resetDb);

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("bootstraps a deterministic playable roster with starting resources", () => {
    const bootstrapped = bootstrapDefaultRoster();

    assert.equal(DEFAULT_PLAYABLE_ROSTER, SHARED_DEFAULT_PLAYABLE_ROSTER);
    assert.equal(DEFAULT_PLAYABLE_ROSTER.length, MIN_AGENTS);
    assert.deepEqual(
      bootstrapped.map((agent) => agent.id),
      DEFAULT_PLAYABLE_ROSTER.map((agent) => agent.id),
    );

    const rows = db
      .select()
      .from(schema.agents)
      .orderBy(schema.agents.id)
      .all();

    assert.equal(rows.length, MIN_AGENTS);
    assert.deepEqual(
      rows.map((agent) => agent.id),
      DEFAULT_PLAYABLE_ROSTER.map((agent) => agent.id).sort(),
    );

    for (const row of rows) {
      assert.equal(row.status, "registered");
      assert.equal(row.water, STARTING_RESOURCES.water);
      assert.equal(row.food, STARTING_RESOURCES.food);
      assert.ok(row.llmProvider);
      assert.equal(row.registeredAt, "2026-01-01T00:00:00.000Z");
    }
  });

  test("bootstrap is idempotent and does not duplicate or reset existing agents", () => {
    bootstrapDefaultRoster();

    const customizedAgentId = DEFAULT_PLAYABLE_ROSTER[0].id;
    db.update(schema.agents)
      .set({ water: 77 })
      .where(eq(schema.agents.id, customizedAgentId))
      .run();

    const bootstrappedAgain = bootstrapDefaultRoster();
    const rows = db.select().from(schema.agents).all();
    const customizedAgent = rows.find((agent) => agent.id === customizedAgentId);

    assert.equal(bootstrappedAgain.length, MIN_AGENTS);
    assert.equal(rows.length, MIN_AGENTS);
    assert.equal(customizedAgent?.water, 77);
  });

  test("starts a registration-phase game on day 1 and activates registered agents", () => {
    bootstrapDefaultRoster();

    const result = startGameWithRegisteredAgents();

    assert.equal(result.phase, "active");
    assert.equal(result.currentDay, 1);
    assert.equal(result.activatedAgents.length, MIN_AGENTS);

    const state = getGameState();
    assert.equal(state.phase, "active");
    assert.equal(state.currentDay, 1);
    assert.ok(state.startedAt);

    const rows = db.select().from(schema.agents).all();
    assert.equal(rows.every((agent) => agent.status === "active"), true);
    assert.equal(rows.every((agent) => agent.water === STARTING_RESOURCES.water), true);
    assert.equal(rows.every((agent) => agent.food === STARTING_RESOURCES.food), true);
  });

  test("starts a frozen-phase game on day 1 and activates registered agents", () => {
    bootstrapDefaultRoster();
    transitionTo("frozen");

    const result = startGameWithRegisteredAgents();

    assert.equal(result.phase, "active");
    assert.equal(result.currentDay, 1);
    assert.equal(result.activatedAgents.length, MIN_AGENTS);
    assert.equal(getGameState().phase, "active");
  });

  test("fresh default setup resets stale state before active day one", () => {
    bootstrapDefaultRoster();
    registerAgent({
      id: "agent-omega",
      name: "Agent Omega",
      discordBotId: "agent-omega-bot",
      llmProvider: "test-provider",
    });

    db.update(schema.agents)
      .set({ water: 77, food: 12, status: "active" })
      .where(eq(schema.agents.id, DEFAULT_PLAYABLE_ROSTER[0].id))
      .run();
    db.insert(schema.resourceLog)
      .values({
        agentId: DEFAULT_PLAYABLE_ROSTER[0].id,
        day: 1,
        event: "gm_adjustment",
        deltaWater: -23,
        deltaFood: -88,
        reason: "stale dry-run state",
        timestamp: new Date().toISOString(),
      })
      .run();

    const result = setupFreshDefaultSeason();

    assert.equal(result.phase, "active");
    assert.equal(result.currentDay, 1);
    assert.deepEqual(
      result.activatedAgents.map((agent) => agent.id),
      DEFAULT_PLAYABLE_ROSTER.map((agent) => agent.id).sort(),
    );

    const rows = db.select().from(schema.agents).orderBy(schema.agents.id).all();
    assert.deepEqual(
      rows.map((agent) => agent.id),
      DEFAULT_PLAYABLE_ROSTER.map((agent) => agent.id).sort(),
    );
    assert.equal(rows.every((agent) => agent.status === "active"), true);
    assert.equal(rows.every((agent) => agent.water === STARTING_RESOURCES.water), true);
    assert.equal(rows.every((agent) => agent.food === STARTING_RESOURCES.food), true);
    assert.equal(db.select().from(schema.resourceLog).all().length, 0);
  });

  test("runtime Discord bot IDs override local default roster placeholders", () => {
    process.env.AGENT_ALPHA_DISCORD_BOT_ID = "discord-alpha-live";

    try {
      resetDefaultRosterForFreshSeason();

      const alpha = db
        .select()
        .from(schema.agents)
        .where(eq(schema.agents.id, DEFAULT_PLAYABLE_ROSTER[0].id))
        .get();

      assert.equal(alpha?.discordBotId, "discord-alpha-live");
      assert.equal(assertAgentDiscordAuthor(DEFAULT_PLAYABLE_ROSTER[0].id, "discord-alpha-live").id, "agent-alpha");
    } finally {
      delete process.env.AGENT_ALPHA_DISCORD_BOT_ID;
    }
  });

  test("default roster start refuses unexpected registered agents", () => {
    bootstrapDefaultRoster();
    registerAgent({
      id: "agent-omega",
      name: "Agent Omega",
      discordBotId: "agent-omega-bot",
      llmProvider: "test-provider",
    });

    assert.throws(
      () => startDefaultRosterSeason(),
      /Cannot start default season: unexpected agents: agent-omega\./,
    );

    assert.equal(getGameState().phase, "registration");
  });

  test("agent protocol identity must match the registered Discord author", () => {
    bootstrapDefaultRoster();
    const alpha = DEFAULT_PLAYABLE_ROSTER[0];

    assert.equal(assertAgentDiscordAuthor(alpha.id, alpha.discordBotId).id, alpha.id);
    assert.throws(
      () => assertAgentDiscordAuthor(alpha.id, "spoofed-discord-author"),
      /Agent identity mismatch for agent-alpha/,
    );
    assert.throws(
      () => assertAgentDiscordAuthor("agent-omega", "agent-omega-bot"),
      /Unknown agent ID: agent-omega/,
    );
  });

  test("fails loudly and leaves state unchanged when too few agents are registered", () => {
    registerAgent({
      id: "solo-agent",
      name: "Solo Agent",
      discordBotId: "solo-agent-bot",
      llmProvider: "test-provider",
    });

    assert.throws(
      () => startGameWithRegisteredAgents(),
      /Cannot start game: need at least 4 registered agents, found 1\./,
    );

    const state = getGameState();
    const agents = db.select().from(schema.agents).all();

    assert.equal(state.phase, "registration");
    assert.equal(state.currentDay, 0);
    assert.equal(agents.length, 1);
    assert.equal(agents[0].status, "registered");
  });
});
