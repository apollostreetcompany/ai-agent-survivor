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
let agentId: string | undefined;
const channelCache = new Map<string, TextChannel>();
const GM_PROTOCOL_CHANNELS = [
  CHANNELS.ANNOUNCEMENTS,
  CHANNELS.ARENA,
  CHANNELS.SCOREBOARD,
];

export type AgentMessageTransport = (
  encodedMessage: string,
  message: AgentMessage,
) => Promise<void> | void;

let injectedAgentMessageTransport: AgentMessageTransport | undefined;

export type GmMessageHandler = (msg: GmMessage) => Promise<void>;
const handlers: GmMessageHandler[] = [];

export type IncomingDiscordMessage = {
  content: string;
  authorId: string;
  channelId?: string;
  selfUserId?: string;
  gmDiscordBotId: string;
  allowedChannelIds?: Iterable<string>;
};

export function parseTrustedGmMessage({
  content,
  authorId,
  channelId,
  selfUserId,
  gmDiscordBotId,
  allowedChannelIds,
}: IncomingDiscordMessage): GmMessage | null {
  const trustedGmDiscordBotId = gmDiscordBotId.trim();
  if (!trustedGmDiscordBotId) {
    throw new Error("GM Discord bot user ID is required to authenticate GM protocol messages.");
  }

  if (authorId === selfUserId) return null;
  if (authorId !== trustedGmDiscordBotId) return null;
  if (allowedChannelIds && (!channelId || !new Set(allowedChannelIds).has(channelId))) return null;

  const parsed = parseMessage(content);
  if (!parsed) return null;

  if (!("tag" in parsed) || !(parsed.tag as string).startsWith("GM:")) return null;
  return parsed as GmMessage;
}

/** Register a handler for GM messages */
export function onGmMessage(handler: GmMessageHandler): void {
  handlers.push(handler);
}

/** Route encoded agent protocol messages to a non-Discord transport. */
export function configureAgentMessageTransport(
  id: string,
  transport: AgentMessageTransport,
): void {
  agentId = id;
  injectedAgentMessageTransport = transport;
}

/** Clear the injected transport used by tests and local runners. */
export function clearAgentMessageTransport(): void {
  injectedAgentMessageTransport = undefined;
  agentId = undefined;
}

/** Initialize the agent's Discord connection */
export async function initAgentDiscord(
  token: string,
  guildId: string,
  id: string,
  gmDiscordBotId: string,
): Promise<Client> {
  agentId = id;
  const trustedGmDiscordBotId = gmDiscordBotId.trim();
  if (!trustedGmDiscordBotId) {
    throw new Error("GM Discord bot user ID is required to authenticate GM protocol messages.");
  }

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

  const missingProtocolChannels = GM_PROTOCOL_CHANNELS.filter((name) => !channelCache.has(name));
  if (missingProtocolChannels.length > 0) {
    throw new Error(`Missing required Discord channels for agent: ${missingProtocolChannels.join(", ")}`);
  }

  // Listen for GM messages
  client.on("messageCreate", async (message: Message) => {
    const parsed = parseTrustedGmMessage({
      content: message.content,
      authorId: message.author.id,
      channelId: message.channelId,
      selfUserId: client.user?.id,
      gmDiscordBotId: trustedGmDiscordBotId,
      allowedChannelIds: GM_PROTOCOL_CHANNELS
        .map((name) => channelCache.get(name)?.id)
        .filter((id): id is string => Boolean(id)),
    });
    if (!parsed) return;

    for (const handler of handlers) {
      try {
        await handler(parsed);
      } catch (err) {
        console.error(`Handler error for ${parsed.tag}:`, err);
      }
    }
  });

  return client;
}

/** Send an agent protocol message to the arena */
export async function sendAgentMessage(msg: Record<string, unknown> & { tag: string }): Promise<void> {
  const currentAgentId = getAgentId();
  const fullMsg = { ...msg, agentId: currentAgentId } as AgentMessage;
  const encodedMessage = encodeAgentMessage(fullMsg);

  if (injectedAgentMessageTransport) {
    await injectedAgentMessageTransport(encodedMessage, fullMsg);
    return;
  }

  const channel = channelCache.get(CHANNELS.ARENA);
  if (!channel) {
    throw new Error("Arena channel not found; cannot send agent protocol message.");
  }
  await channel.send(encodedMessage);
}

/** Send a plain text message to agent-chat */
export async function chat(text: string): Promise<void> {
  const channel = channelCache.get(CHANNELS.AGENT_CHAT);
  if (!channel) return;
  await channel.send(`**[${getAgentId()}]** ${text}`);
}

/** Get the agent ID */
export function getAgentId(): string {
  if (!agentId) {
    throw new Error("Agent ID is not configured. Initialize Discord or configure an agent transport first.");
  }
  return agentId;
}
