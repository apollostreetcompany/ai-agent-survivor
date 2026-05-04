import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ChannelType } from "discord.js";
import { CHANNELS, encodeAgentMessage, encodeGmMessage } from "@survivor/shared";
import { parseTrustedGmMessage, resolveRuntimeChannel } from "../src/discord-handler.js";

const channelEnvVars = [
  "DISCORD_ANNOUNCEMENTS_CHANNEL_ID",
  "DISCORD_ARENA_CHANNEL_ID",
  "DISCORD_AGENT_CHAT_CHANNEL_ID",
  "DISCORD_SCOREBOARD_CHANNEL_ID",
  "DISCORD_INTEGRITY_LOG_CHANNEL_ID",
  "DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID",
  "DISCORD_GM_ADMIN_CHANNEL_ID",
];

const gmMessage = {
  tag: "GM:CANARY" as const,
  id: "canary-1",
  prompt: "reply with the nonce",
  deadlineSeconds: 30,
};

afterEach(() => {
  for (const envVar of channelEnvVars) {
    delete process.env[envVar];
  }
});

function fakeGuild(channels: Array<Record<string, unknown>>, fetched: Record<string, unknown> | null = null) {
  return {
    id: "guild-123",
    channels: {
      cache: {
        get: (id: string) => channels.find((channel) => channel.id === id),
        find: (predicate: (channel: Record<string, unknown>) => boolean) => channels.find(predicate),
      },
      fetch: async () => fetched,
    },
  } as never;
}

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

test("resolves configured Discord channel IDs before name fallback", async () => {
  process.env.DISCORD_ARENA_CHANNEL_ID = "arena-live-id";
  const wrongNameChannel = {
    id: "arena-local-id",
    name: CHANNELS.ARENA,
    type: ChannelType.GuildText,
    guildId: "guild-123",
  };
  const liveChannel = {
    id: "arena-live-id",
    name: CHANNELS.ARENA,
    type: ChannelType.GuildText,
    guildId: "guild-123",
  };

  const channel = await resolveRuntimeChannel(fakeGuild([wrongNameChannel, liveChannel]), CHANNELS.ARENA);

  assert.equal(channel?.id, "arena-live-id");
});

test("rejects configured Discord channel IDs with a clear mismatch error", async () => {
  process.env.DISCORD_ARENA_CHANNEL_ID = "wrong-arena-id";
  const wrongChannel = {
    id: "wrong-arena-id",
    name: "ops",
    type: ChannelType.GuildText,
    guildId: "guild-123",
  };

  await assert.rejects(
    () => resolveRuntimeChannel(fakeGuild([wrongChannel]), CHANNELS.ARENA),
    /DISCORD_ARENA_CHANNEL_ID resolved to #ops, expected #arena/,
  );
});

test("keeps name-based Discord channel fallback when no ID is configured", async () => {
  const localChannel = {
    id: "local-agent-chat-id",
    name: CHANNELS.AGENT_CHAT,
    type: ChannelType.GuildText,
    guildId: "guild-123",
  };

  const channel = await resolveRuntimeChannel(fakeGuild([localChannel]), CHANNELS.AGENT_CHAT);

  assert.equal(channel?.id, "local-agent-chat-id");
});
