import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type {
  AgentId,
  TaskId,
  TaskDefinition,
  ResourceDelta,
  ClaimMode,
} from "@survivor/shared";
import { applyDelta } from "./resources.js";
import { getCurrentDay } from "./game-state.js";
import { updateTaskFeed } from "../environment/feed-updater.js";
import { recordRuntimeEvent } from "../ops/runtime.js";

function syncActiveTaskFeed(): void {
  try {
    updateTaskFeed(getActiveTasks());
  } catch (err) {
    recordRuntimeEvent({
      level: "error",
      event: "task_feed_sync_failed",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/** Create a new task in the database */
export function createTask(def: TaskDefinition): void {
  db.insert(schema.tasks)
    .values({
      id: def.id,
      type: def.type,
      source: def.source,
      claimMode: def.claimMode,
      day: def.day,
      difficulty: def.difficulty,
      title: def.title,
      description: def.description,
      rewardWater: def.reward.water,
      rewardFood: def.reward.food,
      penaltyWater: def.penalty?.water ?? 0,
      penaltyFood: def.penalty?.food ?? 0,
      deadlineMinutes: def.deadlineMinutes,
      claimTimeoutMinutes: def.claimTimeoutMinutes,
      maxCompletions: def.maxCompletions,
      status: "active",
      createdAt: new Date().toISOString(),
      expiresAt: def.deadlineMinutes
        ? new Date(Date.now() + def.deadlineMinutes * 60_000).toISOString()
        : undefined,
    })
    .run();
  syncActiveTaskFeed();
}

/** Attempt to claim a task for an agent */
export function claimTask(
  taskId: TaskId,
  agentId: AgentId,
): { success: boolean; reason?: string } {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) return { success: false, reason: "Task not found" };
  if (task.status !== "active") return { success: false, reason: `Task is ${task.status}` };

  if (task.claimMode === "first_correct") {
    // No claiming needed for first_correct -- agents just submit
    return { success: true };
  }

  if (task.claimMode === "claim_with_timeout") {
    if (task.claimedBy) {
      // Check if claim has expired
      if (task.claimedAt && task.claimTimeoutMinutes) {
        const claimExpiry = new Date(task.claimedAt).getTime() + task.claimTimeoutMinutes * 60_000;
        if (Date.now() < claimExpiry) {
          return { success: false, reason: `Already claimed by another agent until ${new Date(claimExpiry).toISOString()}` };
        }
        // Claim expired, allow re-claim
      } else {
        return { success: false, reason: "Already claimed" };
      }
    }

    db.update(schema.tasks)
      .set({
        status: "claimed",
        claimedBy: agentId,
        claimedAt: new Date().toISOString(),
      })
      .where(eq(schema.tasks.id, taskId))
      .run();

    syncActiveTaskFeed();
    return { success: true };
  }

  // parallel mode: no claiming needed
  return { success: true };
}

/** Submit a task completion */
export function submitTask(
  taskId: TaskId,
  agentId: AgentId,
  result: unknown,
  valid: boolean,
): { rewarded: boolean; reward?: ResourceDelta; reason?: string } {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) return { rewarded: false, reason: "Task not found" };

  // Check deadline
  if (task.expiresAt && new Date(task.expiresAt) < new Date()) {
    return { rewarded: false, reason: "Task deadline expired" };
  }

  // Check if agent already submitted
  const existing = db
    .select()
    .from(schema.taskCompletions)
    .where(
      and(
        eq(schema.taskCompletions.taskId, taskId),
        eq(schema.taskCompletions.agentId, agentId),
      ),
    )
    .get();
  if (existing) return { rewarded: false, reason: "Already submitted" };

  // For claim_with_timeout, verify the agent holds the claim
  if (task.claimMode === "claim_with_timeout" && task.claimedBy !== agentId) {
    return { rewarded: false, reason: "Task not claimed by this agent" };
  }

  const reward: ResourceDelta = valid
    ? { water: task.rewardWater, food: task.rewardFood }
    : { water: -(task.penaltyWater ?? 0), food: -(task.penaltyFood ?? 0) };

  // Record completion
  db.insert(schema.taskCompletions)
    .values({
      taskId,
      agentId,
      result: JSON.stringify(result),
      submittedAt: new Date().toISOString(),
      valid,
      rewardWater: reward.water,
      rewardFood: reward.food,
    })
    .run();

  // Apply resources
  if (valid) {
    applyDelta(agentId, reward, "task_reward", `Completed task: ${task.title}`);
  } else if ((task.penaltyWater ?? 0) > 0 || (task.penaltyFood ?? 0) > 0) {
    applyDelta(agentId, reward, "task_penalty", `Failed task: ${task.title}`);
  }

  // Update task status based on claim mode
  if (task.claimMode === "first_correct" && valid) {
    db.update(schema.tasks)
      .set({ status: "completed" })
      .where(eq(schema.tasks.id, taskId))
      .run();
  } else if (task.claimMode === "parallel" && task.maxCompletions) {
    const completionCount = db
      .select()
      .from(schema.taskCompletions)
      .where(
        and(
          eq(schema.taskCompletions.taskId, taskId),
          eq(schema.taskCompletions.valid, true),
        ),
      )
      .all().length;
    if (completionCount >= task.maxCompletions) {
      db.update(schema.tasks)
        .set({ status: "completed" })
        .where(eq(schema.tasks.id, taskId))
        .run();
    }
  } else if (task.claimMode === "claim_with_timeout") {
    db.update(schema.tasks)
      .set({ status: "completed" })
      .where(eq(schema.tasks.id, taskId))
      .run();
  }

  syncActiveTaskFeed();
  return { rewarded: valid, reward };
}

/** Expire tasks that have passed their deadline */
export function expireOverdueTasks(): TaskId[] {
  const now = new Date().toISOString();
  // Single query: get all active tasks with expired deadlines
  const overdue = db
    .select({ id: schema.tasks.id, expiresAt: schema.tasks.expiresAt })
    .from(schema.tasks)
    .where(eq(schema.tasks.status, "active"))
    .all()
    .filter((t) => t.expiresAt != null && t.expiresAt < now);

  for (const t of overdue) {
    db.update(schema.tasks)
      .set({ status: "expired" })
      .where(eq(schema.tasks.id, t.id))
      .run();
  }

  if (overdue.length > 0) syncActiveTaskFeed();
  return overdue.map((t) => t.id);
}

/** Get all active tasks */
export function getActiveTasks() {
  return db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.status, "active"))
    .all();
}
