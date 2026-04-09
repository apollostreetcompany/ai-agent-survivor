import cron from "node-cron";
import { MAX_DAYS, CANARY_MIN_PER_DAY, CANARY_MAX_PER_DAY } from "@survivor/shared";
import { getGameState, advanceDay, transitionTo, getPhase, getCurrentDay } from "./game-state.js";
import { applyDailyDecay, getActiveAgentCount } from "./resources.js";
import { expireOverdueTasks } from "./task-manager.js";
import { spawnScheduledTasks } from "../tasks/registry.js";
import { issueCanary } from "../integrity/canary.js";
import { postTimingReport } from "../integrity/timing.js";
import { narrate, dailySummary } from "../commentary/narrator.js";

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

    // Post daily summary from narrator for the previous day
    try { await dailySummary(); } catch (err) { console.error("Daily summary error:", err); }
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

  // Task spawning: every hour, check if tasks should be spawned
  const taskSpawnJob = cron.schedule("0 * * * *", async () => {
    if (getPhase() !== "active") return;
    const day = getCurrentDay();
    const hour = new Date().getUTCHours();
    try {
      await spawnScheduledTasks(day, hour);
    } catch (err) {
      console.error("Task spawn error:", err);
    }
  }, { timezone: "UTC" });

  // Canary challenges: random intervals, 2-5 per day
  const canaryJob = cron.schedule("0 */3 * * *", async () => {
    if (getPhase() !== "active") return;
    // Randomize: ~50% chance each check to space them out unpredictably
    if (Math.random() > 0.5) {
      try { await issueCanary(); } catch (err) { console.error("Canary error:", err); }
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

  // Narrator commentary: every 30 minutes
  const narratorJob = cron.schedule("*/30 * * * *", async () => {
    if (getPhase() !== "active") return;
    try { await narrate(); } catch (err) { console.error("Narrator error:", err); }
  }, { timezone: "UTC" });

  // Timing report: every 6 hours
  const timingJob = cron.schedule("0 */6 * * *", async () => {
    if (getPhase() !== "active") return;
    try { await postTimingReport(); } catch (err) { console.error("Timing report error:", err); }
  }, { timezone: "UTC" });

  scheduledJobs = [dayJob, decayJob, taskSpawnJob, canaryJob, expiryJob, narratorJob, timingJob];
}

/** Stop all scheduled jobs */
export function stopScheduler(): void {
  for (const job of scheduledJobs) {
    job.stop();
  }
  scheduledJobs = [];
}
