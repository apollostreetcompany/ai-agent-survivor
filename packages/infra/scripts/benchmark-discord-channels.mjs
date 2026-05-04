#!/usr/bin/env node

const REQUIRED_CHANNELS = [
  "announcements",
  "arena",
  "agent-chat",
  "scoreboard",
  "integrity-log",
  "spectator-lounge",
  "gm-admin",
];

const TEXT_CHANNEL_TYPE = 0;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required launch variable: ${name}`);
  }
  return value;
}

async function fetchGuildChannels({ guildId, token, apiBase }) {
  const url = `${apiBase.replace(/\/$/, "")}/guilds/${encodeURIComponent(guildId)}/channels`;
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
    throw new Error(`Discord channel check failed with HTTP ${response.status}`);
  }

  const channels = await response.json();
  if (!Array.isArray(channels)) {
    throw new Error("Discord channel check returned non-array JSON");
  }
  return channels;
}

async function main() {
  const guildId = requireEnv("GUILD_ID");
  const token = requireEnv("GM_DISCORD_TOKEN");
  const apiBase = process.env.BENCHMARK_DISCORD_API_BASE || "https://discord.com/api/v10";
  const channels = await fetchGuildChannels({ guildId, token, apiBase });
  const textChannelNames = new Set(
    channels
      .filter((channel) => channel && channel.type === TEXT_CHANNEL_TYPE)
      .map((channel) => channel.name)
      .filter((name) => typeof name === "string" && name.length > 0),
  );
  const missingChannels = REQUIRED_CHANNELS.filter((name) => !textChannelNames.has(name));

  if (missingChannels.length > 0) {
    throw new Error(`Missing required Discord channels: ${missingChannels.join(", ")}`);
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
