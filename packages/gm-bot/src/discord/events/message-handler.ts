import { type Message } from "discord.js";
import { parseMessage, CHANNELS, type AgentMessage } from "@survivor/shared";
import { getChannel } from "../client.js";
import { claimTask, submitTask } from "../../engine/task-manager.js";
import { getResources } from "../../engine/resources.js";
import { getCurrentDay } from "../../engine/game-state.js";
import { getGenerator } from "../../tasks/registry.js";
import { recordCanaryResponse } from "../../integrity/canary.js";
import { recordTiming } from "../../integrity/timing.js";
import { recordEvent } from "../../commentary/narrator.js";
import { db, schema } from "../../db/index.js";
import { eq } from "drizzle-orm";

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

  // Record timing
  const receivedAt = Date.now();

  // Route by message type
  switch (agentMsg.tag) {
    case "AGENT:CLAIM": {
      const taskId = (agentMsg as any).taskId as string;
      const result = claimTask(taskId, agentMsg.agentId);
      if (result.success) {
        await message.reply(`Task ${taskId} claimed.`);
        recordEvent({
          type: "task_claim",
          description: `${agentMsg.agentId} claimed task ${taskId}`,
          agents: [agentMsg.agentId],
          timestamp: new Date().toISOString(),
        });
      } else {
        await message.reply(`Claim failed: ${result.reason}`);
      }
      break;
    }
    case "AGENT:SUBMIT": {
      const { taskId, result: taskResult } = agentMsg as any;

      // Look up the task to get its type, then evaluate properly
      const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
      let valid = false;

      if (task) {
        const generator = getGenerator(task.type as any);
        if (generator) {
          try {
            valid = await generator.evaluate(taskResult, task as any);
          } catch (err) {
            console.error(`Evaluation error for ${taskId}:`, err);
            valid = false;
          }
        } else {
          // No generator found, basic validation
          valid = taskResult != null && typeof (taskResult as any).answer === "string";
        }
      }

      const submitResult = submitTask(taskId, agentMsg.agentId, taskResult, valid);
      if (submitResult.rewarded) {
        const res = getResources(agentMsg.agentId);
        await message.reply(
          `Task completed! +${submitResult.reward!.water}W +${submitResult.reward!.food}F. ` +
          `Current: ${res.water}W / ${res.food}F`,
        );
        recordEvent({
          type: "task_complete",
          description: `${agentMsg.agentId} completed ${task?.title || taskId} (+${submitResult.reward!.water}W/+${submitResult.reward!.food}F)`,
          agents: [agentMsg.agentId],
          timestamp: new Date().toISOString(),
        });
      } else {
        await message.reply(`Submission ${valid ? "accepted" : "rejected"}: ${submitResult.reason || "invalid answer"}`);
      }
      break;
    }
    case "AGENT:CANARY_RESPONSE": {
      const { challengeId, response } = agentMsg as any;
      const correct = recordCanaryResponse(challengeId, agentMsg.agentId, response);
      // Don't reveal result to the agent (they shouldn't know if they passed)
      recordTiming(agentMsg.agentId, "canary", receivedAt - 30000, receivedAt);
      break;
    }
    case "AGENT:STATUS": {
      // Log to integrity channel
      const integrityChannel = getChannel(CHANNELS.INTEGRITY_LOG);
      if (integrityChannel) {
        const { memoryHash, uptimeSeconds } = agentMsg as any;
        await integrityChannel.send(
          `**${agentMsg.agentId}** status: uptime=${uptimeSeconds}s hash=${memoryHash || "N/A"}`,
        );
      }
      break;
    }
  }

  // Record timing for all message types
  recordTiming(agentMsg.agentId, agentMsg.tag, receivedAt - 5000, receivedAt);

  // Notify all registered callbacks
  for (const cb of callbacks) {
    await cb(agentMsg, message);
  }
}
