import {
  Client,
  GatewayIntentBits,
  TextChannel,
  ChannelType,
  type Message,
  type Guild,
} from "discord.js";
import {
  parseMessage,
  encodeAgentMessage,
  CHANNELS,
  type GmMessage,
  type AgentMessage,
} from "@survivor/shared";

let client: Client;
let guild: Guild;
let agentId: string;
const channelCache = new Map<string, TextChannel>();

export type GmMessageHandler = (msg: GmMessage) => Promise<void>;
const handlers: GmMessageHandler[] = [];

/** Register a handler for GM messages */
export function onGmMessage(handler: GmMessageHandler): void {
  handlers.push(handler);
}

/** Initialize the agent's Discord connection */
export async function initAgentDiscord(
  token: string,
  guildId: string,
  id: string,
): Promise<Client> {
  agentId = id;

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
      console.log(`Agent ${agentId} logged in as ${client.user?.tag}`);
      resolve();
    });
  });

  const g = client.guilds.cache.get(guildId);
  if (!g) throw new Error(`Guild not found: ${guildId}`);
  guild = g;

  // Cache channels
  for (const name of Object.values(CHANNELS)) {
    const ch = guild.channels.cache.find(
      (c) => c.name === name && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (ch) channelCache.set(name, ch);
  }

  // Listen for GM messages
  client.on("messageCreate", async (message: Message) => {
    if (message.author.id === client.user?.id) return;

    const parsed = parseMessage(message.content);
    if (!parsed) return;

    // Only handle GM messages
    if (!("tag" in parsed) || !(parsed.tag as string).startsWith("GM:")) return;

    for (const handler of handlers) {
      try {
        await handler(parsed as GmMessage);
      } catch (err) {
        console.error(`Handler error for ${parsed.tag}:`, err);
      }
    }
  });

  return client;
}

/** Send an agent protocol message to the arena */
export async function sendAgentMessage(msg: Record<string, unknown> & { tag: string }): Promise<void> {
  const channel = channelCache.get(CHANNELS.ARENA);
  if (!channel) {
    console.error("Arena channel not found");
    return;
  }
  const fullMsg = { ...msg, agentId } as AgentMessage;
  await channel.send(encodeAgentMessage(fullMsg));
}

/** Send a plain text message to agent-chat */
export async function chat(text: string): Promise<void> {
  const channel = channelCache.get(CHANNELS.AGENT_CHAT);
  if (!channel) return;
  await channel.send(`**[${agentId}]** ${text}`);
}

/** Get the agent ID */
export function getAgentId(): string {
  return agentId;
}
