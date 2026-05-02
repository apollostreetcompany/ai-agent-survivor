import { eq } from "drizzle-orm";
import type { AgentMessage, TaskType } from "@survivor/shared";
import { claimTask, submitTask } from "../../engine/task-manager.js";
import { getResources } from "../../engine/resources.js";
import { getGenerator } from "../../tasks/registry.js";
import { recordCanaryResponse } from "../../integrity/canary.js";
import { recordTiming } from "../../integrity/timing.js";
import { recordEvent } from "../../commentary/narrator.js";
import { db, schema } from "../../db/index.js";
import { recordProcessHeartbeat, recordRuntimeEvent } from "../../ops/runtime.js";

type MaybePromise<T> = T | Promise<T>;

export interface AgentProtocolSinks {
  reply?: (line: string) => MaybePromise<void>;
  integrityLog?: (line: string) => MaybePromise<void>;
  receivedAt?: number;
}

export interface AgentProtocolResult {
  replies: string[];
  integrityLogs: string[];
}

async function evaluateSubmission(taskId: string, taskResult: unknown): Promise<{
  task: typeof schema.tasks.$inferSelect | undefined;
  valid: boolean;
}> {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  let valid = false;

  if (task) {
    const generator = getGenerator(task.type as TaskType);
    if (generator) {
      try {
        valid = await generator.evaluate(taskResult, task as any);
      } catch (err) {
        console.error(`Evaluation error for ${taskId}:`, err);
        valid = false;
      }
    } else {
      valid = taskResult != null && typeof (taskResult as any).answer === "string";
    }
  }

  return { task, valid };
}

export async function handleAgentProtocolMessage(
  agentMsg: AgentMessage,
  sinks: AgentProtocolSinks = {},
): Promise<AgentProtocolResult> {
  const replies: string[] = [];
  const integrityLogs: string[] = [];
  const receivedAt = sinks.receivedAt ?? Date.now();
  const timingIssuedAt = (() => {
    if (agentMsg.tag === "AGENT:CANARY_RESPONSE") {
      const challenge = db
        .select()
        .from(schema.canaryChallenges)
        .where(eq(schema.canaryChallenges.id, agentMsg.challengeId))
        .get();
      if (challenge) return new Date(challenge.issuedAt).getTime();
    }
    return receivedAt - 5000;
  })();

  async function reply(line: string): Promise<void> {
    replies.push(line);
    await sinks.reply?.(line);
  }

  async function integrityLog(line: string): Promise<void> {
    integrityLogs.push(line);
    await sinks.integrityLog?.(line);
  }

  switch (agentMsg.tag) {
    case "AGENT:CLAIM": {
      const result = claimTask(agentMsg.taskId, agentMsg.agentId);
      if (result.success) {
        await reply(`Task ${agentMsg.taskId} claimed.`);
        recordRuntimeEvent({
          event: "task_claimed",
          processType: "agent",
          processId: agentMsg.agentId,
          details: { taskId: agentMsg.taskId },
        });
        recordEvent({
          type: "task_claim",
          description: `${agentMsg.agentId} claimed task ${agentMsg.taskId}`,
          agents: [agentMsg.agentId],
          timestamp: new Date().toISOString(),
        });
      } else {
        await reply(`Claim failed: ${result.reason}`);
      }
      break;
    }
    case "AGENT:SUBMIT": {
      const { taskId, result: taskResult } = agentMsg;
      const { task, valid } = await evaluateSubmission(taskId, taskResult);

      const submitResult = submitTask(taskId, agentMsg.agentId, taskResult, valid);
      recordRuntimeEvent({
        event: "task_submission_evaluated",
        processType: "agent",
        processId: agentMsg.agentId,
        details: { taskId, valid, rewarded: submitResult.rewarded, reason: submitResult.reason },
      });
      if (submitResult.rewarded) {
        const res = getResources(agentMsg.agentId);
        await reply(
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
        await reply(`Submission ${valid ? "accepted" : "rejected"}: ${submitResult.reason || "invalid answer"}`);
      }
      break;
    }
    case "AGENT:CANARY_RESPONSE": {
      recordCanaryResponse(agentMsg.challengeId, agentMsg.agentId, agentMsg.response);
      break;
    }
    case "AGENT:STATUS": {
      recordProcessHeartbeat({
        processType: "agent",
        processId: agentMsg.agentId,
        uptimeSeconds: agentMsg.uptimeSeconds,
        memoryHash: agentMsg.memoryHash,
      });
      await integrityLog(
        `**${agentMsg.agentId}** status: uptime=${agentMsg.uptimeSeconds}s hash=${agentMsg.memoryHash || "N/A"}`,
      );
      break;
    }
  }

  recordTiming(agentMsg.agentId, agentMsg.tag, timingIssuedAt, receivedAt);

  return { replies, integrityLogs };
}
