import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  encodeGmMessage,
  parseMessage,
  type AgentMessage,
} from "@survivor/shared";
import {
  clearAgentMessageTransport,
  configureAgentMessageTransport,
  sendAgentMessage,
} from "../src/discord-handler.js";
import {
  expectedLocalCanaryResponse,
  runLocalProtocolSmoke,
} from "../src/local-runner.js";

function survivorCanaryMessage(): string {
  return encodeGmMessage({
    tag: "GM:CANARY",
    id: "canary-test-survivor",
    prompt: "Compute SHA-256('survivor') and respond with only the hex digest.",
    deadlineSeconds: 30,
  });
}

describe("local agent protocol runner", () => {
  afterEach(() => {
    clearAgentMessageTransport();
  });

  test("parses a GM canary message and emits a typed canary response", async () => {
    const emitted = await runLocalProtocolSmoke({
      agentId: "agent-alpha",
      gmMessage: survivorCanaryMessage(),
    });

    assert.equal(emitted.length, 1);
    assert.match(emitted[0]!, /^\[AGENT:CANARY_RESPONSE:agent-alpha\] /);

    const parsed = parseMessage(emitted[0]!) as AgentMessage;
    assert.deepEqual(parsed, {
      tag: "AGENT:CANARY_RESPONSE",
      agentId: "agent-alpha",
      challengeId: "canary-test-survivor",
      response: expectedLocalCanaryResponse(),
    });
  });

  test("fails clearly when AGENT_ID is missing or not in the local roster", async () => {
    await assert.rejects(
      () => runLocalProtocolSmoke({ gmMessage: survivorCanaryMessage() }),
      /AGENT_ID is required for local agent runner/,
    );

    await assert.rejects(
      () => runLocalProtocolSmoke({
        agentId: "agent-omega",
        gmMessage: survivorCanaryMessage(),
      }),
      /Invalid AGENT_ID "agent-omega"/,
    );
  });

  test("encodes injected outbound agent messages with the shared protocol format", async () => {
    const captured: Array<{ encoded: string; message: AgentMessage }> = [];
    configureAgentMessageTransport("agent-bravo", (encoded, message) => {
      captured.push({ encoded, message });
    });

    await sendAgentMessage({
      tag: "AGENT:STATUS",
      memoryHash: "hash-123",
      uptimeSeconds: 42,
    });

    assert.equal(captured.length, 1);
    assert.equal(
      captured[0]!.encoded,
      '[AGENT:STATUS:agent-bravo] {"memoryHash":"hash-123","uptimeSeconds":42}',
    );
    assert.deepEqual(parseMessage(captured[0]!.encoded), {
      tag: "AGENT:STATUS",
      agentId: "agent-bravo",
      memoryHash: "hash-123",
      uptimeSeconds: 42,
    });
    assert.deepEqual(captured[0]!.message, {
      tag: "AGENT:STATUS",
      agentId: "agent-bravo",
      memoryHash: "hash-123",
      uptimeSeconds: 42,
    });
  });
});
