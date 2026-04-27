import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { MIN_AGENTS, STARTING_RESOURCES } from "@survivor/shared";

const tempDir = mkdtempSync(join(tmpdir(), "survivor-gm-test-"));
process.env.DB_PATH = join(tempDir, "survivor-test.db");

const { db, initDb, schema } = await import("../src/db/index.js");
const { getGameState, transitionTo } = await import("../src/engine/game-state.js");
const {
  DEFAULT_PLAYABLE_ROSTER,
  bootstrapDefaultRoster,
  registerAgent,
  startGameWithRegisteredAgents,
} = await import("../src/engine/roster.js");

function resetDb() {
  initDb();

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
