import { type Message } from "discord.js";
import { parseMessage, CHANNELS, type AgentMessage } from "@survivor/shared";
import { getChannel } from "../client.js";
import { handleAgentProtocolMessage } from "./agent-protocol-handler.js";
import { handleGmAdminCommand } from "./gm-admin-command-handler.js";
import { assertAgentDiscordAuthor } from "../../engine/roster.js";
import { recordDiscordAudit } from "../../ops/runtime.js";

export type MessageCallback = (msg: AgentMessage, raw: Message) => Promise<void>;
const callbacks: MessageCallback[] = [];

/** Register a callback for agent messages */
export function onAgentMessage(cb: MessageCallback): void {
  callbacks.push(cb);
}

/** Handle incoming Discord messages */
export async function handleMessage(message: Message): Promise<void> {
  // Ignore messages from the GM bot itself
  if (message.author.id === message.client.user?.id) return;

  const gmAdminChannel = getChannel(CHANNELS.GM_ADMIN);
  if (gmAdminChannel && message.channelId === gmAdminChannel.id) {
    await handleGmAdminCommand(message.content, {
      reply: async (line) => {
        await message.reply(line);
      },
    });
    return;
  }

  // Only process messages in game channels
  const arenaChannel = getChannel(CHANNELS.ARENA);
  if (!arenaChannel || message.channelId !== arenaChannel.id) return;

  // Try to parse as protocol message
  const parsed = parseMessage(message.content);
  if (!parsed) return;

  // Only handle agent messages
  if (!("agentId" in parsed)) return;
  const agentMsg = parsed as AgentMessage;
  const receivedAt = Date.now();

  try {
    assertAgentDiscordAuthor(agentMsg.agentId, message.author.id);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    recordDiscordAudit({
      channelName: CHANNELS.ARENA,
      direction: "inbound",
      messageTag: agentMsg.tag,
      agentId: agentMsg.agentId,
      status: "failed",
      contentPreview: message.content,
      error,
    });

    const integrityChannel = getChannel(CHANNELS.INTEGRITY_LOG);
    if (integrityChannel) {
      await integrityChannel.send(`**AGENT IDENTITY REJECTED**: ${error}`);
    }
    return;
  }

  recordDiscordAudit({
    channelName: CHANNELS.ARENA,
    direction: "inbound",
    messageTag: agentMsg.tag,
    agentId: agentMsg.agentId,
    status: "received",
    contentPreview: message.content,
  });

  await handleAgentProtocolMessage(agentMsg, {
    receivedAt,
    reply: async (line) => {
      await message.reply(line);
    },
    integrityLog: async (line) => {
      const integrityChannel = getChannel(CHANNELS.INTEGRITY_LOG);
      if (integrityChannel) {
        await integrityChannel.send(line);
      }
    },
  });

  // Notify all registered callbacks
  for (const cb of callbacks) {
    await cb(agentMsg, message);
  }
}
