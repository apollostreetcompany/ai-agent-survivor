import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { MIN_AGENTS } from "@survivor/shared";

const tempDir = mkdtempSync(join(tmpdir(), "survivor-gm-admin-test-"));
process.env.DB_PATH = join(tempDir, "survivor-test.db");
process.env.GAME_DATA_DIR = join(tempDir, "game-data");
process.env.SURVIVOR_LOG_DIR = join(tempDir, "logs");

const { db, initDb, schema } = await import("../src/db/index.js");
const { getGameState } = await import("../src/engine/game-state.js");
const { createTask } = await import("../src/engine/task-manager.js");
const { DEFAULT_PLAYABLE_ROSTER, registerAgent } = await import("../src/engine/roster.js");
const { handleGmAdminCommand } = await import(
  "../src/discord/events/gm-admin-command-handler.js"
);

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

async function runAdminCommand(content: string) {
  const replies: string[] = [];
  const result = await handleGmAdminCommand(content, {
    reply: (line) => replies.push(line),
  });

  return { result, replies, text: replies.join("\n") };
}

describe("GM admin season command handler", () => {
  beforeEach(resetDb);

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("replies with help and registration status", async () => {
    const help = await runAdminCommand("!season help");

    assert.equal(help.result.handled, true);
    assert.equal(help.result.ok, true);
    assert.match(help.text, /!season setup/);
    assert.match(help.text, /!season status/);
    assert.match(help.text, /!season health/);

    const status = await runAdminCommand("!season status");

    assert.equal(status.result.handled, true);
    assert.equal(status.result.ok, true);
    assert.match(status.text, /Season status: phase=registration day=0/);
    assert.match(status.text, /Agents: total=0 registered=0 active=0 eliminated=0/);
  });

  test("reports health and ops status from persisted runtime state", async () => {
    const health = await runAdminCommand("!season health");

    assert.equal(health.result.handled, true);
    assert.equal(health.result.ok, true);
    assert.match(health.text, /Season health:/);
    assert.match(health.text, /Heartbeats: none recorded yet/);

    const ops = await runAdminCommand("!season ops");

    assert.equal(ops.result.handled, true);
    assert.equal(ops.result.ok, true);
    assert.match(ops.text, /Ops status for/);
    assert.match(ops.text, /DB:/);
    assert.match(ops.text, /Logs:/);
  });

  test("setup bootstraps the roster and starts active day 1", async () => {
    const { result, text } = await runAdminCommand("!season setup");

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    assert.match(text, /Bootstrapped default roster: 4 agent\(s\)/);
    assert.match(text, /Started season: phase=active day=1/);

    const state = getGameState();
    const agents = db.select().from(schema.agents).orderBy(schema.agents.id).all();

    assert.equal(state.phase, "active");
    assert.equal(state.currentDay, 1);
    assert.equal(agents.length, MIN_AGENTS);
    assert.deepEqual(
      agents.map((agent) => agent.id),
      DEFAULT_PLAYABLE_ROSTER.map((agent) => agent.id).sort(),
    );
    assert.equal(agents.every((agent) => agent.status === "active"), true);
  });

  test("start fails clearly with too few agents and leaves state unchanged", async () => {
    registerAgent({
      id: "solo-agent",
      name: "Solo Agent",
      discordBotId: "solo-agent-bot",
      llmProvider: "test-provider",
    });

    const { result, text } = await runAdminCommand("!season start");

    assert.equal(result.handled, true);
    assert.equal(result.ok, false);
    assert.match(
      text,
      /Season start failed: Cannot start game: need at least 4 registered agents, found 1\./,
    );

    const state = getGameState();
    const agents = db.select().from(schema.agents).all();

    assert.equal(state.phase, "registration");
    assert.equal(state.currentDay, 0);
    assert.equal(agents.length, 1);
    assert.equal(agents[0].status, "registered");
  });

  test("records hybrid GM adjudication for an existing task submission", async () => {
    registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      discordBotId: "agent-alpha-bot",
      llmProvider: "test-provider",
    });
    createTask({
      id: "manual-review-task",
      type: "research",
      source: "ambient",
      claimMode: "parallel",
      day: 1,
      difficulty: 1,
      title: "Manual review task",
      description: "Produce a research answer that can be reviewed by a GM.",
      reward: { water: 5, food: 5 },
    });
    const taskFeedPath = join(tempDir, "game-data/api/tasks.json");
    assert.equal(existsSync(taskFeedPath), true);
    assert.match(readFileSync(taskFeedPath, "utf8"), /manual-review-task/);

    const { result, text } = await runAdminCommand(
      "!season adjudicate manual-review-task agent-alpha pass strong answer",
    );

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    assert.match(text, /Adjudication recorded/);

    const adjudication = db.select().from(schema.taskAdjudications).get();
    assert.equal(adjudication?.taskId, "manual-review-task");
    assert.equal(adjudication?.agentId, "agent-alpha");
    assert.equal(adjudication?.verdict, "pass");
    assert.equal(adjudication?.note, "strong answer");
  });

  test("ignores non-command admin text", async () => {
    const { result, replies } = await runAdminCommand("season setup");

    assert.equal(result.handled, false);
    assert.equal(replies.length, 0);
  });
});
