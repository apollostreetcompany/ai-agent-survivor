import {
  Client,
  GatewayIntentBits,
  TextChannel,
  ChannelType,
  type Guild,
} from "discord.js";
import { CHANNELS } from "@survivor/shared";
import { encodeGmMessage, type GmMessage } from "@survivor/shared";

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
  for (const name of Object.values(CHANNELS)) {
    const ch = guild.channels.cache.find(
      (c) => c.name === name && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (ch) channelCache.set(name, ch);
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
    console.error(`Channel not found: ${channelName}`);
    return;
  }
  await channel.send(encodeGmMessage(msg));
}

/** Send a plain text message to a channel */
export async function sendText(channelName: string, text: string): Promise<void> {
  const channel = getChannel(channelName);
  if (!channel) {
    console.error(`Channel not found: ${channelName}`);
    return;
  }
  await channel.send(text);
}

/** Get the Discord client instance */
export function getClient(): Client {
  return client;
}

/** Get the guild instance */
export function getGuild(): Guild {
  return guild;
}
