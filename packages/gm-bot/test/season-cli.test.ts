import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { MIN_AGENTS } from "@survivor/shared";

const tempDir = mkdtempSync(join(tmpdir(), "survivor-season-cli-test-"));
process.env.DB_PATH = join(tempDir, "survivor-test.db");

const { db, initDb, schema } = await import("../src/db/index.js");
const { getGameState } = await import("../src/engine/game-state.js");
const { DEFAULT_PLAYABLE_ROSTER, registerAgent } = await import("../src/engine/roster.js");
const { runSeasonCommand } = await import("../src/cli/season.js");

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

function captureOutput() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    io: {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
  };
}

describe("season operator CLI", () => {
  beforeEach(resetDb);

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("bootstraps the default roster and reports registered agent IDs", async () => {
    const output = captureOutput();

    const exitCode = await runSeasonCommand(["bootstrap"], output.io);

    assert.equal(exitCode, 0);
    assert.equal(output.stderr.length, 0);
    assert.match(output.stdout.join("\n"), /Bootstrapped default roster: 4 agent\(s\)/);
    assert.match(output.stdout.join("\n"), /agent-alpha, agent-bravo, agent-charlie, agent-delta/);

    const agents = db.select().from(schema.agents).orderBy(schema.agents.id).all();
    assert.equal(agents.length, MIN_AGENTS);
    assert.deepEqual(
      agents.map((agent) => agent.id),
      DEFAULT_PLAYABLE_ROSTER.map((agent) => agent.id).sort(),
    );
    assert.equal(agents.every((agent) => agent.status === "registered"), true);
    assert.equal(getGameState().phase, "registration");
  });

  test("starts a season from registered agents and reports active day one state", async () => {
    for (const agent of DEFAULT_PLAYABLE_ROSTER) {
      registerAgent(agent);
    }
    const output = captureOutput();

    const exitCode = await runSeasonCommand(["start"], output.io);

    assert.equal(exitCode, 0);
    assert.equal(output.stderr.length, 0);
    assert.match(output.stdout.join("\n"), /Started season: phase=active day=1/);
    assert.match(output.stdout.join("\n"), /Activated agents \(4\): agent-alpha, agent-bravo, agent-charlie, agent-delta/);

    const state = getGameState();
    const agents = db.select().from(schema.agents).all();
    assert.equal(state.phase, "active");
    assert.equal(state.currentDay, 1);
    assert.equal(agents.every((agent) => agent.status === "active"), true);
  });

  test("setup bootstraps and starts the local season in one command", async () => {
    const output = captureOutput();

    const exitCode = await runSeasonCommand(["setup"], output.io);

    assert.equal(exitCode, 0);
    assert.equal(output.stderr.length, 0);
    assert.match(output.stdout.join("\n"), /Bootstrapped default roster: 4 agent\(s\)/);
    assert.match(output.stdout.join("\n"), /Started season: phase=active day=1/);

    const state = getGameState();
    const agents = db.select().from(schema.agents).orderBy(schema.agents.id).all();
    assert.equal(state.phase, "active");
    assert.equal(state.currentDay, 1);
    assert.equal(agents.length, MIN_AGENTS);
    assert.equal(agents.every((agent) => agent.status === "active"), true);
  });

  test("start fails clearly and leaves the database unchanged with too few agents", async () => {
    registerAgent({
      id: "solo-agent",
      name: "Solo Agent",
      discordBotId: "solo-agent-bot",
      llmProvider: "test-provider",
    });
    const output = captureOutput();

    const exitCode = await runSeasonCommand(["start"], output.io);

    assert.equal(exitCode, 1);
    assert.equal(output.stdout.length, 0);
    assert.match(
      output.stderr.join("\n"),
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
