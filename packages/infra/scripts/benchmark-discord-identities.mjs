#!/usr/bin/env node

const TEXT_CHANNEL_TYPE = 0;
const ALL_REQUIRED_CHANNELS = [
  { name: "announcements", env: "DISCORD_ANNOUNCEMENTS_CHANNEL_ID" },
  { name: "arena", env: "DISCORD_ARENA_CHANNEL_ID" },
  { name: "agent-chat", env: "DISCORD_AGENT_CHAT_CHANNEL_ID" },
  { name: "scoreboard", env: "DISCORD_SCOREBOARD_CHANNEL_ID" },
  { name: "integrity-log", env: "DISCORD_INTEGRITY_LOG_CHANNEL_ID" },
  { name: "spectator-lounge", env: "DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID" },
  { name: "gm-admin", env: "DISCORD_GM_ADMIN_CHANNEL_ID" },
];
const AGENT_REQUIRED_CHANNELS = [
  { name: "announcements", env: "DISCORD_ANNOUNCEMENTS_CHANNEL_ID" },
  { name: "arena", env: "DISCORD_ARENA_CHANNEL_ID" },
  { name: "agent-chat", env: "DISCORD_AGENT_CHAT_CHANNEL_ID" },
  { name: "scoreboard", env: "DISCORD_SCOREBOARD_CHANNEL_ID" },
];
const GM_WRITE_REQUIRED_CHANNELS = [
  { name: "gm-admin", env: "DISCORD_GM_ADMIN_CHANNEL_ID" },
  { name: "announcements", env: "DISCORD_ANNOUNCEMENTS_CHANNEL_ID" },
  { name: "arena", env: "DISCORD_ARENA_CHANNEL_ID" },
  { name: "agent-chat", env: "DISCORD_AGENT_CHAT_CHANNEL_ID" },
  { name: "scoreboard", env: "DISCORD_SCOREBOARD_CHANNEL_ID" },
  { name: "integrity-log", env: "DISCORD_INTEGRITY_LOG_CHANNEL_ID" },
];
const AGENT_WRITE_REQUIRED_CHANNELS = [
  { name: "arena", env: "DISCORD_ARENA_CHANNEL_ID" },
  { name: "agent-chat", env: "DISCORD_AGENT_CHAT_CHANNEL_ID" },
];

const IDENTITIES = [
  {
    role: "GM",
    tokenEnv: "GM_DISCORD_TOKEN",
    botIdEnv: "GM_DISCORD_BOT_ID",
    requiredChannels: ALL_REQUIRED_CHANNELS,
    requiredWriteChannels: GM_WRITE_REQUIRED_CHANNELS,
  },
  {
    role: "agent-alpha",
    tokenEnv: "AGENT_ALPHA_DISCORD_TOKEN",
    botIdEnv: "AGENT_ALPHA_DISCORD_BOT_ID",
    requiredChannels: AGENT_REQUIRED_CHANNELS,
    requiredWriteChannels: AGENT_WRITE_REQUIRED_CHANNELS,
  },
  {
    role: "agent-bravo",
    tokenEnv: "AGENT_BRAVO_DISCORD_TOKEN",
    botIdEnv: "AGENT_BRAVO_DISCORD_BOT_ID",
    requiredChannels: AGENT_REQUIRED_CHANNELS,
    requiredWriteChannels: AGENT_WRITE_REQUIRED_CHANNELS,
  },
  {
    role: "agent-charlie",
    tokenEnv: "AGENT_CHARLIE_DISCORD_TOKEN",
    botIdEnv: "AGENT_CHARLIE_DISCORD_BOT_ID",
    requiredChannels: AGENT_REQUIRED_CHANNELS,
    requiredWriteChannels: AGENT_WRITE_REQUIRED_CHANNELS,
  },
  {
    role: "agent-delta",
    tokenEnv: "AGENT_DELTA_DISCORD_TOKEN",
    botIdEnv: "AGENT_DELTA_DISCORD_BOT_ID",
    requiredChannels: AGENT_REQUIRED_CHANNELS,
    requiredWriteChannels: AGENT_WRITE_REQUIRED_CHANNELS,
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

async function discordPost({ apiBase, path, token, label }) {
  const timeoutMs = Number(process.env.BENCHMARK_DISCORD_IDENTITY_CHECK_TIMEOUT_MS || 10_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(apiUrl(apiBase, path), {
      method: "POST",
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

async function fetchChannel({ apiBase, channelId, token, role, channelName }) {
  const channel = await discordFetchJson({
    apiBase,
    path: `/channels/${encodeURIComponent(channelId)}`,
    token,
    label: `Discord channel metadata check for ${role} #${channelName}`,
  });

  if (!channel || typeof channel.id !== "string") {
    throw new Error(`Discord channel metadata check for ${role} #${channelName} returned no channel id`);
  }

  return channel;
}

async function fetchChannelMessages({ apiBase, channelId, token, role, channelName }) {
  const messages = await discordFetchJson({
    apiBase,
    path: `/channels/${encodeURIComponent(channelId)}/messages?limit=1`,
    token,
    label: `Discord channel read check for ${role} #${channelName}`,
  });

  if (!Array.isArray(messages)) {
    throw new Error(`Discord channel read check for ${role} #${channelName} returned non-array JSON`);
  }

  return messages;
}

async function verifyChannelAccess({ apiBase, guildId, token, role, channel }) {
  const channelId = requireEnv(channel.env);
  const metadata = await fetchChannel({
    apiBase,
    channelId,
    token,
    role,
    channelName: channel.name,
  });

  if (metadata.guild_id !== guildId) {
    throw new Error(
      `${role} #${channel.name} channel ${channel.env} is not in configured GUILD_ID`,
    );
  }

  if (metadata.type !== TEXT_CHANNEL_TYPE) {
    throw new Error(`${role} #${channel.name} channel ${channel.env} is not a Discord text channel`);
  }

  if (metadata.name !== channel.name) {
    throw new Error(
      `${role} #${channel.name} channel ${channel.env} resolved to #${metadata.name || "unknown"}`,
    );
  }

  await fetchChannelMessages({
    apiBase,
    channelId,
    token,
    role,
    channelName: channel.name,
  });
}

async function verifyChannelWriteAccess({ apiBase, token, role, channel }) {
  const channelId = requireEnv(channel.env);
  await discordPost({
    apiBase,
    path: `/channels/${encodeURIComponent(channelId)}/typing`,
    token,
    label: `Discord channel write check for ${role} #${channel.name}`,
  });
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

  const inaccessibleChannels = [];
  for (const channel of identity.requiredChannels) {
    try {
      await verifyChannelAccess({ apiBase, guildId, token, role: identity.role, channel });
    } catch (err) {
      inaccessibleChannels.push(`#${channel.name} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  if (inaccessibleChannels.length > 0) {
    throw new Error(`${identity.role} cannot read required Discord channels: ${inaccessibleChannels.join(", ")}`);
  }

  const unwritableChannels = [];
  for (const channel of identity.requiredWriteChannels || []) {
    try {
      await verifyChannelWriteAccess({ apiBase, token, role: identity.role, channel });
    } catch (err) {
      unwritableChannels.push(`#${channel.name} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  if (unwritableChannels.length > 0) {
    throw new Error(`${identity.role} cannot write required Discord channels: ${unwritableChannels.join(", ")}`);
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
