import {
  Client,
  GatewayIntentBits,
  TextChannel,
  ChannelType,
  type Guild,
} from "discord.js";
import { CHANNELS } from "@survivor/shared";
import { encodeGmMessage, type GmMessage } from "@survivor/shared";
import { recordDiscordAudit, recordRuntimeEvent } from "../ops/runtime.js";

let client: Client;
let guild: Guild;
const channelCache = new Map<string, TextChannel>();

const CHANNEL_ID_ENV_BY_NAME: Record<string, string> = {
  [CHANNELS.ANNOUNCEMENTS]: "DISCORD_ANNOUNCEMENTS_CHANNEL_ID",
  [CHANNELS.ARENA]: "DISCORD_ARENA_CHANNEL_ID",
  [CHANNELS.AGENT_CHAT]: "DISCORD_AGENT_CHAT_CHANNEL_ID",
  [CHANNELS.SCOREBOARD]: "DISCORD_SCOREBOARD_CHANNEL_ID",
  [CHANNELS.INTEGRITY_LOG]: "DISCORD_INTEGRITY_LOG_CHANNEL_ID",
  [CHANNELS.SPECTATOR_LOUNGE]: "DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID",
  [CHANNELS.GM_ADMIN]: "DISCORD_GM_ADMIN_CHANNEL_ID",
};

type ChannelLookupGuild = Pick<Guild, "id" | "channels">;

function configuredChannelId(channelName: string): { envName: string; channelId: string } | undefined {
  const envName = CHANNEL_ID_ENV_BY_NAME[channelName];
  if (!envName) return undefined;

  const channelId = process.env[envName]?.trim();
  if (!channelId) return undefined;

  return { envName, channelId };
}

function assertGuildTextChannel(
  channel: unknown,
  channelName: string,
  envName: string,
  expectedGuildId: string,
): TextChannel {
  const candidate = channel as Partial<TextChannel> & {
    guildId?: string;
    guild?: { id?: string };
    id?: string;
    name?: string;
    type?: ChannelType;
  };

  if (!candidate) {
    throw new Error(`Configured Discord channel ${envName} for #${channelName} was not found.`);
  }

  const actualGuildId = candidate.guildId ?? candidate.guild?.id;
  if (actualGuildId && actualGuildId !== expectedGuildId) {
    throw new Error(
      `Configured Discord channel ${envName} for #${channelName} belongs to guild ${actualGuildId}, expected ${expectedGuildId}.`,
    );
  }

  if (candidate.type !== ChannelType.GuildText) {
    throw new Error(`Configured Discord channel ${envName} for #${channelName} is not a guild text channel.`);
  }

  if (candidate.name !== channelName) {
    throw new Error(
      `Configured Discord channel ${envName} resolved to #${candidate.name ?? "unknown"}, expected #${channelName}.`,
    );
  }

  return candidate as TextChannel;
}

/** Resolve a launch channel by verified env ID when present, otherwise by name for local/dev. */
export async function resolveRuntimeChannel(
  lookupGuild: ChannelLookupGuild,
  channelName: string,
): Promise<TextChannel | undefined> {
  const configured = configuredChannelId(channelName);
  if (configured) {
    const cached = lookupGuild.channels.cache.get(configured.channelId);
    const fetched = cached ?? await lookupGuild.channels.fetch(configured.channelId);

    return assertGuildTextChannel(fetched, channelName, configured.envName, lookupGuild.id);
  }

  return lookupGuild.channels.cache.find(
    (c) => c.name === channelName && c.type === ChannelType.GuildText,
  ) as TextChannel | undefined;
}

/** Initialize the Discord client and connect */
export async function initDiscord(token: string, guildId: string): Promise<Client> {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await client.login(token);

  await new Promise<void>((resolve) => {
    client.once("ready", () => {
      console.log(`GM Bot logged in as ${client.user?.tag}`);
      resolve();
    });
  });

  const g = client.guilds.cache.get(guildId);
  if (!g) throw new Error(`Guild not found: ${guildId}`);
  guild = g;

  // Cache known channels
  const missingChannels: string[] = [];
  for (const name of Object.values(CHANNELS)) {
    const ch = await resolveRuntimeChannel(guild, name);
    if (ch) {
      channelCache.set(name, ch);
    } else {
      missingChannels.push(name);
    }
  }

  if (missingChannels.length > 0) {
    recordRuntimeEvent({
      level: "error",
      event: "discord_channels_missing",
      details: { missingChannels },
    });
    throw new Error(`Missing required Discord channels: ${missingChannels.join(", ")}`);
  }

  return client;
}

/** Get a channel by name */
export function getChannel(name: string): TextChannel | undefined {
  return channelCache.get(name);
}

/** Send a GM protocol message to a channel */
export async function sendGmMessage(channelName: string, msg: GmMessage): Promise<void> {
  const channel = getChannel(channelName);
  if (!channel) {
    const error = `Channel not found: ${channelName}`;
    recordDiscordAudit({
      channelName,
      direction: "outbound",
      messageTag: msg.tag,
      status: "failed",
      error,
    });
    throw new Error(error);
  }
  const encoded = encodeGmMessage(msg);
  try {
    await channel.send(encoded);
    recordDiscordAudit({
      channelName,
      direction: "outbound",
      messageTag: msg.tag,
      status: "sent",
      contentPreview: encoded,
    });
  } catch (err) {
    recordDiscordAudit({
      channelName,
      direction: "outbound",
      messageTag: msg.tag,
      status: "failed",
      contentPreview: encoded,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Send a plain text message to a channel */
export async function sendText(channelName: string, text: string): Promise<void> {
  const channel = getChannel(channelName);
  if (!channel) {
    const error = `Channel not found: ${channelName}`;
    recordDiscordAudit({
      channelName,
      direction: "outbound",
      status: "failed",
      contentPreview: text,
      error,
    });
    throw new Error(error);
  }
  try {
    await channel.send(text);
    recordDiscordAudit({
      channelName,
      direction: "outbound",
      status: "sent",
      contentPreview: text,
    });
  } catch (err) {
    recordDiscordAudit({
      channelName,
      direction: "outbound",
      status: "failed",
      contentPreview: text,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Get the Discord client instance */
export function getClient(): Client {
  return client;
}

/** Get the guild instance */
export function getGuild(): Guild {
  return guild;
}
