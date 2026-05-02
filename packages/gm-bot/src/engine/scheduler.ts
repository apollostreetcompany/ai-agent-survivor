import cron from "node-cron";
import { MAX_DAYS, CANARY_MIN_PER_DAY, CANARY_MAX_PER_DAY } from "@survivor/shared";
import { getGameState, advanceDay, transitionTo, getPhase, getCurrentDay } from "./game-state.js";
import { applyDailyDecay, getActiveAgentCount } from "./resources.js";
import { expireOverdueTasks } from "./task-manager.js";
import { spawnScheduledTasks } from "../tasks/registry.js";
import { issueCanary } from "../integrity/canary.js";
import { postTimingReport } from "../integrity/timing.js";
import { narrate, dailySummary } from "../commentary/narrator.js";
import { recordSchedulerRun } from "../ops/runtime.js";

export interface SchedulerCallbacks {
  onDayStart: (day: number) => Promise<void>;
  onDailyDecay: (eliminatedAgents: string[]) => Promise<void>;
  onTaskExpiry: (expiredTaskIds: string[]) => Promise<void>;
  onGameOver: () => Promise<void>;
}

let scheduledJobs: cron.ScheduledTask[] = [];

async function runSchedulerJob(
  jobName: string,
  fn: () => Promise<"ok" | "skipped" | void>,
): Promise<void> {
  const startedAt = new Date().toISOString();
  try {
    const result = await fn();
    recordSchedulerRun({
      jobName,
      status: result === "skipped" ? "skipped" : "ok",
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    recordSchedulerRun({
      jobName,
      status: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Start the game scheduler */
export function startScheduler(callbacks: SchedulerCallbacks): void {
  stopScheduler();

  // Day transition: every day at 00:00 UTC
  const dayJob = cron.schedule("0 0 * * *", async () => runSchedulerJob("day-transition", async () => {
    const phase = getPhase();
    if (phase !== "active") return "skipped";

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
  }), { timezone: "UTC" });

  // Daily decay: every day at 06:00 UTC
  const decayJob = cron.schedule("0 6 * * *", async () => runSchedulerJob("daily-decay", async () => {
    if (getPhase() !== "active") return "skipped";

    const eliminated = applyDailyDecay();
    await callbacks.onDailyDecay(eliminated);

    // Check if game should end
    if (getActiveAgentCount() <= 1) {
      transitionTo("complete");
      await callbacks.onGameOver();
      stopScheduler();
    }
  }), { timezone: "UTC" });

  // Task spawning: every hour, check if tasks should be spawned
  const taskSpawnJob = cron.schedule("0 * * * *", async () => runSchedulerJob("task-spawn", async () => {
    if (getPhase() !== "active") return "skipped";
    const day = getCurrentDay();
    const hour = new Date().getUTCHours();
    await spawnScheduledTasks(day, hour);
  }), { timezone: "UTC" });

  // Canary challenges: random intervals, 2-5 per day
  const canaryJob = cron.schedule("0 */3 * * *", async () => runSchedulerJob("canary", async () => {
    if (getPhase() !== "active") return "skipped";
    // Randomize: ~50% chance each check to space them out unpredictably
    if (Math.random() > 0.5) {
      await issueCanary();
    } else {
      return "skipped";
    }
  }), { timezone: "UTC" });

  // Expire overdue tasks: every 5 minutes
  const expiryJob = cron.schedule("*/5 * * * *", async () => runSchedulerJob("task-expiry", async () => {
    if (getPhase() !== "active") return "skipped";
    const expired = expireOverdueTasks();
    if (expired.length > 0) {
      await callbacks.onTaskExpiry(expired);
    }
  }), { timezone: "UTC" });

  // Narrator commentary: every 30 minutes
  const narratorJob = cron.schedule("*/30 * * * *", async () => runSchedulerJob("narrator", async () => {
    if (getPhase() !== "active") return "skipped";
    await narrate();
  }), { timezone: "UTC" });

  // Timing report: every 6 hours
  const timingJob = cron.schedule("0 */6 * * *", async () => runSchedulerJob("timing-report", async () => {
    if (getPhase() !== "active") return "skipped";
    await postTimingReport();
  }), { timezone: "UTC" });

  scheduledJobs = [dayJob, decayJob, taskSpawnJob, canaryJob, expiryJob, narratorJob, timingJob];
}

/** Stop all scheduled jobs */
export function stopScheduler(): void {
  for (const job of scheduledJobs) {
    job.stop();
  }
  scheduledJobs = [];
}
