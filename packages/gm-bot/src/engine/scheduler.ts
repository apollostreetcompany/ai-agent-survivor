import cron from "node-cron";
import { MAX_DAYS } from "@survivor/shared";
import { getGameState, advanceDay, transitionTo, getPhase } from "./game-state.js";
import { applyDailyDecay, getActiveAgentCount } from "./resources.js";
import { expireOverdueTasks } from "./task-manager.js";

export interface SchedulerCallbacks {
  onDayStart: (day: number) => Promise<void>;
  onDailyDecay: (eliminatedAgents: string[]) => Promise<void>;
  onTaskExpiry: (expiredTaskIds: string[]) => Promise<void>;
  onGameOver: () => Promise<void>;
}

let scheduledJobs: cron.ScheduledTask[] = [];

/** Start the game scheduler */
export function startScheduler(callbacks: SchedulerCallbacks): void {
  stopScheduler();

  // Day transition: every day at 00:00 UTC
  const dayJob = cron.schedule("0 0 * * *", async () => {
    const phase = getPhase();
    if (phase !== "active") return;

    const state = getGameState();
    if (state.currentDay >= MAX_DAYS) {
      transitionTo("complete");
      await callbacks.onGameOver();
      stopScheduler();
      return;
    }

    const newDay = advanceDay();
    await callbacks.onDayStart(newDay);
  }, { timezone: "UTC" });

  // Daily decay: every day at 06:00 UTC
  const decayJob = cron.schedule("0 6 * * *", async () => {
    if (getPhase() !== "active") return;

    const eliminated = applyDailyDecay();
    await callbacks.onDailyDecay(eliminated);

    // Check if game should end
    if (getActiveAgentCount() <= 1) {
      transitionTo("complete");
      await callbacks.onGameOver();
      stopScheduler();
    }
  }, { timezone: "UTC" });

  // Expire overdue tasks: every 5 minutes
  const expiryJob = cron.schedule("*/5 * * * *", async () => {
    if (getPhase() !== "active") return;
    const expired = expireOverdueTasks();
    if (expired.length > 0) {
      await callbacks.onTaskExpiry(expired);
    }
  }, { timezone: "UTC" });

  scheduledJobs = [dayJob, decayJob, expiryJob];
}

/** Stop all scheduled jobs */
export function stopScheduler(): void {
  for (const job of scheduledJobs) {
    job.stop();
  }
  scheduledJobs = [];
}
