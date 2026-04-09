import { TaskGenerator } from "./base.js";
import { EmailTriageTask } from "./email-triage.js";
import { CodeChallengeTask } from "./code-challenge.js";
import { TradingSimTask } from "./trading-sim.js";
import { DataAnalysisTask } from "./data-analysis.js";
import { ResearchTask } from "./research.js";
import { BugFixTask } from "./bug-fix.js";
import { AdversarialTask } from "./adversarial.js";
import { MultiStepTask } from "./multi-step.js";
import { ContentGenTask } from "./content-gen.js";
import { CalendarMgmtTask } from "./calendar-mgmt.js";
import { getDifficultyForDay } from "../engine/difficulty.js";
import type { TaskType, DifficultyProfile } from "@survivor/shared";

const generators: Map<TaskType, TaskGenerator> = new Map();

function register(gen: TaskGenerator) {
  generators.set(gen.type, gen);
}

// Register all task types
register(new EmailTriageTask());
register(new CodeChallengeTask());
register(new TradingSimTask());
register(new DataAnalysisTask());
register(new ResearchTask());
register(new BugFixTask());
register(new AdversarialTask());
register(new MultiStepTask());
register(new ContentGenTask());
register(new CalendarMgmtTask());

/** Get a task generator by type */
export function getGenerator(type: TaskType): TaskGenerator | undefined {
  return generators.get(type);
}

/** Get all registered generators */
export function getAllGenerators(): TaskGenerator[] {
  return Array.from(generators.values());
}

/**
 * Generate the task schedule for a given day.
 * Returns which task types to spawn and when.
 */
export function getDaySchedule(day: number): Array<{
  type: TaskType;
  source: "ambient" | "urgent";
  spawnHourUTC: number;
}> {
  const diff = getDifficultyForDay(day);

  // Base schedule: always have some ambient and urgent tasks
  const schedule: Array<{ type: TaskType; source: "ambient" | "urgent"; spawnHourUTC: number }> = [];

  // Ambient tasks (spawn throughout the day)
  schedule.push({ type: "email-triage", source: "ambient", spawnHourUTC: 8 });
  schedule.push({ type: "calendar-mgmt", source: "ambient", spawnHourUTC: 9 });

  // Urgent tasks (announced at specific times)
  if (day <= 3) {
    schedule.push({ type: "code-challenge", source: "urgent", spawnHourUTC: 14 });
  }
  if (day >= 2) {
    schedule.push({ type: "data-analysis", source: "ambient", spawnHourUTC: 10 });
  }
  if (day >= 3) {
    schedule.push({ type: "trading-sim", source: "urgent", spawnHourUTC: 16 });
  }
  if (day >= 3) {
    schedule.push({ type: "research", source: "ambient", spawnHourUTC: 11 });
  }
  if (day >= 4) {
    schedule.push({ type: "bug-fix", source: "ambient", spawnHourUTC: 13 });
  }
  if (day >= 5) {
    schedule.push({ type: "content-gen", source: "urgent", spawnHourUTC: 15 });
  }
  if (day >= 6) {
    schedule.push({ type: "code-challenge", source: "urgent", spawnHourUTC: 18 }); // second code challenge
  }
  if (day >= 7) {
    schedule.push({ type: "adversarial", source: "urgent", spawnHourUTC: 12 });
  }
  if (day >= 8) {
    schedule.push({ type: "multi-step", source: "urgent", spawnHourUTC: 10 });
  }
  if (day >= 9) {
    // Day 9-10: everything at once, maximum pressure
    schedule.push({ type: "multi-step", source: "urgent", spawnHourUTC: 14 });
    schedule.push({ type: "adversarial", source: "urgent", spawnHourUTC: 17 });
    schedule.push({ type: "trading-sim", source: "urgent", spawnHourUTC: 20 });
  }

  return schedule;
}

/** Spawn all tasks scheduled for a specific hour */
export async function spawnScheduledTasks(day: number, hourUTC: number): Promise<void> {
  const schedule = getDaySchedule(day);
  const diff = getDifficultyForDay(day);
  const toSpawn = schedule.filter((s) => s.spawnHourUTC === hourUTC);

  for (const entry of toSpawn) {
    const gen = generators.get(entry.type);
    if (gen) {
      try {
        const def = await gen.spawn(day, diff);
        console.log(`Spawned task: ${def.id} (${def.type}, ${def.source})`);
      } catch (err) {
        console.error(`Failed to spawn ${entry.type}:`, err);
      }
    }
  }
}
