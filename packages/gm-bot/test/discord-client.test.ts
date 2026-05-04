import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType } from "discord.js";
import { CHANNELS } from "@survivor/shared";

const tempDir = mkdtempSync(join(tmpdir(), "survivor-gm-discord-client-"));
process.env.DB_PATH = join(tempDir, "survivor-test.db");

const { resolveRuntimeChannel } = await import("../src/discord/client.js");

const channelEnvVars = [
  "DISCORD_ANNOUNCEMENTS_CHANNEL_ID",
  "DISCORD_ARENA_CHANNEL_ID",
  "DISCORD_AGENT_CHAT_CHANNEL_ID",
  "DISCORD_SCOREBOARD_CHANNEL_ID",
  "DISCORD_INTEGRITY_LOG_CHANNEL_ID",
  "DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID",
  "DISCORD_GM_ADMIN_CHANNEL_ID",
];

afterEach(() => {
  for (const envVar of channelEnvVars) {
    delete process.env[envVar];
  }
});

test.after(() => {
  rmSync(tempDir, { recursive: true, force: true });
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

test("GM resolves configured Discord channel IDs before name fallback", async () => {
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

test("GM rejects configured Discord channel IDs from the wrong guild", async () => {
  process.env.DISCORD_SCOREBOARD_CHANNEL_ID = "scoreboard-live-id";
  const wrongGuildChannel = {
    id: "scoreboard-live-id",
    name: CHANNELS.SCOREBOARD,
    type: ChannelType.GuildText,
    guildId: "other-guild",
  };

  await assert.rejects(
    () => resolveRuntimeChannel(fakeGuild([wrongGuildChannel]), CHANNELS.SCOREBOARD),
    /DISCORD_SCOREBOARD_CHANNEL_ID for #scoreboard belongs to guild other-guild, expected guild-123/,
  );
});

test("GM rejects configured Discord channel IDs for non-text channels", async () => {
  process.env.DISCORD_GM_ADMIN_CHANNEL_ID = "gm-admin-live-id";
  const voiceChannel = {
    id: "gm-admin-live-id",
    name: CHANNELS.GM_ADMIN,
    type: ChannelType.GuildVoice,
    guildId: "guild-123",
  };

  await assert.rejects(
    () => resolveRuntimeChannel(fakeGuild([voiceChannel]), CHANNELS.GM_ADMIN),
    /DISCORD_GM_ADMIN_CHANNEL_ID for #gm-admin is not a guild text channel/,
  );
});

test("GM keeps name-based Discord channel fallback when no ID is configured", async () => {
  const localChannel = {
    id: "local-integrity-id",
    name: CHANNELS.INTEGRITY_LOG,
    type: ChannelType.GuildText,
    guildId: "guild-123",
  };

  const channel = await resolveRuntimeChannel(fakeGuild([localChannel]), CHANNELS.INTEGRITY_LOG);

  assert.equal(channel?.id, "local-integrity-id");
});
