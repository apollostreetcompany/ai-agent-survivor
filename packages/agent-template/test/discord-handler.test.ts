import assert from "node:assert/strict";
import test from "node:test";
import { encodeAgentMessage, encodeGmMessage } from "@survivor/shared";
import { parseTrustedGmMessage } from "../src/discord-handler.js";

const gmMessage = {
  tag: "GM:CANARY" as const,
  id: "canary-1",
  prompt: "reply with the nonce",
  deadlineSeconds: 30,
};

test("accepts GM protocol messages only from the configured GM Discord bot user ID", () => {
  const trusted = parseTrustedGmMessage({
    content: encodeGmMessage(gmMessage),
    authorId: "gm-bot-123",
    channelId: "arena-channel",
    selfUserId: "agent-bot-456",
    gmDiscordBotId: "gm-bot-123",
    allowedChannelIds: ["arena-channel"],
  });

  assert.deepEqual(trusted, gmMessage);

  const spoofed = parseTrustedGmMessage({
    content: encodeGmMessage(gmMessage),
    authorId: "human-or-agent-789",
    channelId: "arena-channel",
    selfUserId: "agent-bot-456",
    gmDiscordBotId: "gm-bot-123",
    allowedChannelIds: ["arena-channel"],
  });

  assert.equal(spoofed, null);
});

test("rejects self-authored and non-GM protocol messages before handlers run", () => {
  assert.equal(
    parseTrustedGmMessage({
      content: encodeGmMessage(gmMessage),
      authorId: "agent-bot-456",
      channelId: "arena-channel",
      selfUserId: "agent-bot-456",
      gmDiscordBotId: "gm-bot-123",
      allowedChannelIds: ["arena-channel"],
    }),
    null,
  );

  assert.equal(
    parseTrustedGmMessage({
      content: encodeAgentMessage({
        tag: "AGENT:STATUS",
        agentId: "agent-alpha",
        uptimeSeconds: 1,
      }),
      authorId: "gm-bot-123",
      channelId: "arena-channel",
      selfUserId: "agent-bot-456",
      gmDiscordBotId: "gm-bot-123",
      allowedChannelIds: ["arena-channel"],
    }),
    null,
  );
});

test("rejects trusted GM messages from channels outside the GM protocol surface", () => {
  assert.equal(
    parseTrustedGmMessage({
      content: encodeGmMessage(gmMessage),
      authorId: "gm-bot-123",
      channelId: "agent-chat-channel",
      selfUserId: "agent-bot-456",
      gmDiscordBotId: "gm-bot-123",
      allowedChannelIds: ["arena-channel", "announcements-channel", "scoreboard-channel"],
    }),
    null,
  );
});

test("fails loudly when GM Discord bot user ID is not configured", () => {
  assert.throws(
    () =>
      parseTrustedGmMessage({
        content: encodeGmMessage(gmMessage),
        authorId: "gm-bot-123",
        channelId: "arena-channel",
        selfUserId: "agent-bot-456",
        gmDiscordBotId: " ",
        allowedChannelIds: ["arena-channel"],
      }),
    /GM Discord bot user ID is required/,
  );
});
