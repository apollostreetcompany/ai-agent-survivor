import { type Message } from "discord.js";
import { parseMessage, CHANNELS, type AgentMessage } from "@survivor/shared";
import { getChannel } from "../client.js";
import { claimTask, submitTask } from "../../engine/task-manager.js";
import { getResources } from "../../engine/resources.js";

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

  // Only process messages in game channels
  const arenaChannel = getChannel(CHANNELS.ARENA);
  if (!arenaChannel || message.channelId !== arenaChannel.id) return;

  // Try to parse as protocol message
  const parsed = parseMessage(message.content);
  if (!parsed) return;

  // Only handle agent messages
  if (!("agentId" in parsed)) return;
  const agentMsg = parsed as AgentMessage;

  // Route by message type
  switch (agentMsg.tag) {
    case "AGENT:CLAIM": {
      const taskId = (agentMsg as any).taskId;
      const result = claimTask(taskId, agentMsg.agentId);
      if (result.success) {
        await message.reply(`Task ${taskId} claimed.`);
      } else {
        await message.reply(`Claim failed: ${result.reason}`);
      }
      break;
    }
    case "AGENT:SUBMIT": {
      const { taskId, result: taskResult } = agentMsg as any;
      // For now, mark all submissions as valid (evaluation logic comes later)
      const submitResult = submitTask(taskId, agentMsg.agentId, taskResult, true);
      if (submitResult.rewarded) {
        const res = getResources(agentMsg.agentId);
        await message.reply(
          `Task completed! +${submitResult.reward!.water} water, +${submitResult.reward!.food} food. ` +
          `Current: ${res.water}W / ${res.food}F`,
        );
      } else {
        await message.reply(`Submission rejected: ${submitResult.reason}`);
      }
      break;
    }
    case "AGENT:CANARY_RESPONSE": {
      // Handled by canary module
      break;
    }
    case "AGENT:STATUS": {
      // Log to integrity channel
      break;
    }
  }

  // Notify all registered callbacks
  for (const cb of callbacks) {
    await cb(agentMsg, message);
  }
}
