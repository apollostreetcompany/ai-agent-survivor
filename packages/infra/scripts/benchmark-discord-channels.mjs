#!/usr/bin/env node

const REQUIRED_CHANNELS = [
  { name: "gm-admin", env: "DISCORD_GM_ADMIN_CHANNEL_ID" },
  { name: "announcements", env: "DISCORD_ANNOUNCEMENTS_CHANNEL_ID" },
  { name: "arena", env: "DISCORD_ARENA_CHANNEL_ID" },
  { name: "agent-chat", env: "DISCORD_AGENT_CHAT_CHANNEL_ID" },
  { name: "scoreboard", env: "DISCORD_SCOREBOARD_CHANNEL_ID" },
  { name: "integrity-log", env: "DISCORD_INTEGRITY_LOG_CHANNEL_ID" },
  { name: "spectator-lounge", env: "DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID" },
];

const TEXT_CHANNEL_TYPE = 0;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required launch variable: ${name}`);
  }
  return value;
}

async function fetchChannel({ channel, token, apiBase }) {
  const channelId = requireEnv(channel.env);
  const url = `${apiBase.replace(/\/$/, "")}/channels/${encodeURIComponent(channelId)}`;
  const timeoutMs = Number(process.env.BENCHMARK_DISCORD_CHANNEL_CHECK_TIMEOUT_MS || 10_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      headers: {
        authorization: `Bot ${token}`,
        accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Discord channel check for #${channel.name} failed with HTTP ${response.status}`);
  }

  const fetchedChannel = await response.json();
  if (!fetchedChannel || fetchedChannel.id !== channelId) {
    throw new Error(`Discord channel check for #${channel.name} returned the wrong channel`);
  }
  if (fetchedChannel.type !== TEXT_CHANNEL_TYPE) {
    throw new Error(`Discord channel check for #${channel.name} returned a non-text channel`);
  }
  if (fetchedChannel.name !== channel.name) {
    throw new Error(
      `Discord channel check for #${channel.name} expected exact name, got #${fetchedChannel.name || "unknown"}`,
    );
  }
  return fetchedChannel;
}

async function fetchChannelMessages({ channel, token, apiBase }) {
  const channelId = requireEnv(channel.env);
  const url = `${apiBase.replace(/\/$/, "")}/channels/${encodeURIComponent(channelId)}/messages?limit=1`;
  const timeoutMs = Number(process.env.BENCHMARK_DISCORD_CHANNEL_CHECK_TIMEOUT_MS || 10_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      headers: {
        authorization: `Bot ${token}`,
        accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Discord channel read check for #${channel.name} failed with HTTP ${response.status}`);
  }

  const messages = await response.json();
  if (!Array.isArray(messages)) {
    throw new Error(`Discord channel read check for #${channel.name} returned non-array JSON`);
  }
}

async function main() {
  const guildId = requireEnv("GUILD_ID");
  const token = requireEnv("GM_DISCORD_TOKEN");
  const apiBase = process.env.BENCHMARK_DISCORD_API_BASE || "https://discord.com/api/v10";

  for (const channel of REQUIRED_CHANNELS) {
    const fetchedChannel = await fetchChannel({ channel, token, apiBase });
    if (fetchedChannel.guild_id !== guildId) {
      throw new Error(`#${channel.name} is not in configured GUILD_ID`);
    }
    await fetchChannelMessages({ channel, token, apiBase });
  }

  process.stdout.write(
    `${JSON.stringify({
      discordChannels: "ok",
      guildId,
      channelCount: REQUIRED_CHANNELS.length,
    })}\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
