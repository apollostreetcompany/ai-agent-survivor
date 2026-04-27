import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { AgentMessage, TaskDefinition } from "@survivor/shared";

const tempDir = mkdtempSync(join(tmpdir(), "survivor-agent-protocol-smoke-"));
process.env.DB_PATH = join(tempDir, "survivor-test.db");

const { encodeAgentMessage, parseMessage, STARTING_RESOURCES } = await import("@survivor/shared");
const { db, initDb, schema } = await import("../src/db/index.js");
const { createTask } = await import("../src/engine/task-manager.js");
const { getResources } = await import("../src/engine/resources.js");
const { bootstrapDefaultRoster, startGameWithRegisteredAgents } = await import("../src/engine/roster.js");
const { handleAgentProtocolMessage } = await import("../src/discord/events/agent-protocol-handler.js");

const agentId = "agent-alpha";
const taskId = "smoke-claim-submit";

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

function seedActiveGameWithTask() {
  bootstrapDefaultRoster();
  startGameWithRegisteredAgents();

  const task: TaskDefinition = {
    id: taskId,
    type: "multi-step",
    source: "urgent",
    claimMode: "claim_with_timeout",
    day: 1,
    difficulty: 1,
    title: "Smoke Test Workflow",
    description: "Claim this task, then submit a substantial workflow summary.",
    reward: { water: 7, food: 5 },
    penalty: { water: 1, food: 1 },
    deadlineMinutes: 30,
    claimTimeoutMinutes: 15,
  };
  createTask(task);
}

function parseAgentMessage(message: AgentMessage): AgentMessage {
  const parsed = parseMessage(encodeAgentMessage(message));

  assert.ok(parsed);
  assert.ok("agentId" in parsed);

  return parsed;
}

function successfulSubmission() {
  return {
    answer: [
      "Claim acknowledged and workflow completed.",
      "Step 1 parsed the incident payload and identified the impacted service.",
      "Step 2 cross-referenced deployment records and isolated the risky release.",
      "Step 3 ran a deterministic analysis script over the provided evidence.",
      "Step 4 drafted a concise incident report with owner, cause, mitigation, and follow-up actions.",
      "Step 5 recorded the findings for future day-to-day continuity checks.",
    ].join(" "),
  };
}

describe("agent protocol smoke path", () => {
  beforeEach(resetDb);

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("rejects submit before claim without rewarding the agent", async () => {
    seedActiveGameWithTask();
    const replies: string[] = [];

    await handleAgentProtocolMessage(
      parseAgentMessage({
        tag: "AGENT:SUBMIT",
        agentId,
        taskId,
        result: successfulSubmission(),
      }),
      {
        reply: (line) => replies.push(line),
      },
    );

    assert.match(replies.join("\n"), /Task not claimed by this agent/);
    assert.deepEqual(getResources(agentId), STARTING_RESOURCES);
    assert.equal(db.select().from(schema.taskCompletions).all().length, 0);
  });

  test("claims and submits a task through encoded protocol messages", async () => {
    seedActiveGameWithTask();
    const replies: string[] = [];

    await handleAgentProtocolMessage(
      parseAgentMessage({
        tag: "AGENT:CLAIM",
        agentId,
        taskId,
      }),
      {
        reply: (line) => replies.push(line),
      },
    );

    const claimedTask = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .get();

    assert.match(replies.at(-1) ?? "", /Task smoke-claim-submit claimed\./);
    assert.equal(claimedTask?.status, "claimed");
    assert.equal(claimedTask?.claimedBy, agentId);

    await handleAgentProtocolMessage(
      parseAgentMessage({
        tag: "AGENT:SUBMIT",
        agentId,
        taskId,
        result: successfulSubmission(),
      }),
      {
        reply: (line) => replies.push(line),
      },
    );

    const completedTask = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .get();
    const completions = db.select().from(schema.taskCompletions).all();

    assert.match(replies.at(-1) ?? "", /Task completed! \+7W \+5F/);
    assert.equal(completedTask?.status, "completed");
    assert.equal(completions.length, 1);
    assert.equal(completions[0].agentId, agentId);
    assert.equal(completions[0].valid, true);
    assert.deepEqual(getResources(agentId), {
      water: STARTING_RESOURCES.water + 7,
      food: STARTING_RESOURCES.food + 5,
    });
  });
});
