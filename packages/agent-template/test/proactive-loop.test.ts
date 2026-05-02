import assert from "node:assert/strict";
import { after, afterEach, describe, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMessage, type AgentMessage } from "@survivor/shared";

const tempDir = mkdtempSync(join(tmpdir(), "survivor-agent-proactive-test-"));
process.env.MEMORY_DB_PATH = join(tempDir, "agent-memory.db");
process.env.AGENT_DRY_RUN_TASKS = "1";
process.env.GAME_DATA_URL = "http://game-data.test";
process.env.AGENT_MAX_TASKS_PER_POLL = "2";
process.env.SURVIVOR_LOG_DIR = join(tempDir, "logs");

const { initMemory } = await import("../src/memory.js");
const { attemptActiveTasksOnce } = await import("../src/agent.js");
const {
  clearAgentMessageTransport,
  configureAgentMessageTransport,
} = await import("../src/discord-handler.js");

describe("proactive task loop", () => {
  afterEach(() => {
    clearAgentMessageTransport();
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("polls task feed, submits a task once, and persists the attempt", async () => {
    initMemory();
    const originalFetch = globalThis.fetch;
    const emitted: string[] = [];

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/tasks")) {
        return new Response(JSON.stringify([
          {
            id: "ambient-research-1",
            type: "research",
            source: "ambient",
            claimMode: "parallel",
            status: "active",
            day: 1,
            title: "Research task",
            description: "Summarize the prototype benchmark risks.",
            rewardWater: 5,
            rewardFood: 5,
            deadlineMinutes: 30,
          },
        ]), { headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    };

    configureAgentMessageTransport("agent-alpha", (encoded) => {
      emitted.push(encoded);
    });

    try {
      assert.equal(await attemptActiveTasksOnce(), 1);
      assert.equal(await attemptActiveTasksOnce(), 0);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(emitted.length, 1);
    const parsed = parseMessage(emitted[0]!) as AgentMessage;
    assert.equal(parsed.tag, "AGENT:SUBMIT");
    assert.equal(parsed.agentId, "agent-alpha");
    assert.equal(parsed.taskId, "ambient-research-1");
    assert.match(JSON.stringify(parsed.result), /Dry-run completion/);
  });
});
