#!/usr/bin/env node

const TEXT_CHANNEL_TYPE = 0;
const ALL_REQUIRED_CHANNELS = [
  "announcements",
  "arena",
  "agent-chat",
  "scoreboard",
  "integrity-log",
  "spectator-lounge",
  "gm-admin",
];
const AGENT_REQUIRED_CHANNELS = [
  "announcements",
  "arena",
  "agent-chat",
  "scoreboard",
];

const IDENTITIES = [
  {
    role: "GM",
    tokenEnv: "GM_DISCORD_TOKEN",
    botIdEnv: "GM_DISCORD_BOT_ID",
    requiredChannels: ALL_REQUIRED_CHANNELS,
  },
  {
    role: "agent-alpha",
    tokenEnv: "AGENT_ALPHA_DISCORD_TOKEN",
    botIdEnv: "AGENT_ALPHA_DISCORD_BOT_ID",
    requiredChannels: AGENT_REQUIRED_CHANNELS,
  },
  {
    role: "agent-bravo",
    tokenEnv: "AGENT_BRAVO_DISCORD_TOKEN",
    botIdEnv: "AGENT_BRAVO_DISCORD_BOT_ID",
    requiredChannels: AGENT_REQUIRED_CHANNELS,
  },
  {
    role: "agent-charlie",
    tokenEnv: "AGENT_CHARLIE_DISCORD_TOKEN",
    botIdEnv: "AGENT_CHARLIE_DISCORD_BOT_ID",
    requiredChannels: AGENT_REQUIRED_CHANNELS,
  },
  {
    role: "agent-delta",
    tokenEnv: "AGENT_DELTA_DISCORD_TOKEN",
    botIdEnv: "AGENT_DELTA_DISCORD_BOT_ID",
    requiredChannels: AGENT_REQUIRED_CHANNELS,
  },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required launch variable: ${name}`);
  }
  return value;
}

function apiUrl(apiBase, path) {
  return `${apiBase.replace(/\/$/, "")}${path}`;
}

async function discordFetchJson({ apiBase, path, token, label }) {
  const timeoutMs = Number(process.env.BENCHMARK_DISCORD_IDENTITY_CHECK_TIMEOUT_MS || 10_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(apiUrl(apiBase, path), {
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
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }

  return await response.json();
}

async function fetchCurrentUser({ apiBase, token, role }) {
  const user = await discordFetchJson({
    apiBase,
    path: "/users/@me",
    token,
    label: `Discord identity check for ${role}`,
  });

  if (!user || typeof user.id !== "string" || user.id.length === 0) {
    throw new Error(`Discord identity check for ${role} returned no user id`);
  }

  return user;
}

async function fetchGuildChannels({ apiBase, guildId, token, role }) {
  const channels = await discordFetchJson({
    apiBase,
    path: `/guilds/${encodeURIComponent(guildId)}/channels`,
    token,
    label: `Discord channel visibility check for ${role}`,
  });

  if (!Array.isArray(channels)) {
    throw new Error(`Discord channel visibility check for ${role} returned non-array JSON`);
  }

  return channels;
}

function visibleTextChannelNames(channels) {
  return new Set(
    channels
      .filter((channel) => channel && channel.type === TEXT_CHANNEL_TYPE)
      .map((channel) => channel.name)
      .filter((name) => typeof name === "string" && name.length > 0),
  );
}

async function verifyIdentity({ identity, guildId, apiBase }) {
  const token = requireEnv(identity.tokenEnv);
  const expectedBotId = requireEnv(identity.botIdEnv);
  const user = await fetchCurrentUser({ apiBase, token, role: identity.role });

  if (user.id !== expectedBotId) {
    throw new Error(
      `${identity.tokenEnv} resolves to Discord user ${user.id}, expected ${identity.botIdEnv}=${expectedBotId}`,
    );
  }

  const channels = await fetchGuildChannels({
    apiBase,
    guildId,
    token,
    role: identity.role,
  });
  const textChannelNames = visibleTextChannelNames(channels);
  const missingChannels = identity.requiredChannels.filter((name) => !textChannelNames.has(name));
  if (missingChannels.length > 0) {
    throw new Error(
      `${identity.role} cannot see required Discord channels: ${missingChannels.join(", ")}`,
    );
  }

  return {
    role: identity.role,
    botId: expectedBotId,
    channelCount: identity.requiredChannels.length,
  };
}

async function main() {
  const guildId = requireEnv("GUILD_ID");
  const apiBase = process.env.BENCHMARK_DISCORD_API_BASE || "https://discord.com/api/v10";
  const checks = [];

  for (const identity of IDENTITIES) {
    checks.push(await verifyIdentity({ identity, guildId, apiBase }));
  }

  process.stdout.write(
    `${JSON.stringify({
      discordIdentities: "ok",
      guildId,
      checked: checks.length,
      roles: checks.map((check) => check.role),
    })}\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
