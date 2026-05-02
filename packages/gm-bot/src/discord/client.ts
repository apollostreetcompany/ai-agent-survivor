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
    const ch = guild.channels.cache.find(
      (c) => c.name === name && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
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
