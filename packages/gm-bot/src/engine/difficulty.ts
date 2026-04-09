import { DIFFICULTY_BY_DAY } from "@survivor/shared";
import type { DifficultyProfile, TaskType, ResourceDelta } from "@survivor/shared";

/** Get the difficulty profile for a given day */
export function getDifficultyForDay(day: number): DifficultyProfile {
  return DIFFICULTY_BY_DAY[day] ?? DIFFICULTY_BY_DAY[10]!;
}

/** Scale a base reward by day difficulty (harder days = bigger rewards) */
export function scaleReward(base: ResourceDelta, day: number): ResourceDelta {
  const diff = getDifficultyForDay(day);
  const multiplier = 0.5 + (diff.complexity / 10) * 1.0; // 0.7x on day 1, 1.5x on day 10
  return {
    water: Math.round(base.water * multiplier),
    food: Math.round(base.food * multiplier),
  };
}

/** Get the deadline multiplier (tighter deadlines on harder days) */
export function getDeadlineMultiplier(day: number): number {
  const diff = getDifficultyForDay(day);
  // Day 1: 1.5x base deadline, Day 10: 0.4x base deadline
  return 1.6 - (diff.timePressure / 10) * 1.2;
}

/** Determine how many tools a task should require based on day */
export function getToolChainLength(day: number): number {
  const diff = getDifficultyForDay(day);
  return Math.max(1, Math.ceil(diff.toolChaining / 2));
}

/** Whether tasks on this day should reference previous days */
export function requiresMemory(day: number): boolean {
  const diff = getDifficultyForDay(day);
  return diff.memoryRequired >= 3;
}

/** Get the earliest day that tasks on this day can reference */
export function memoryReachBackDay(day: number): number {
  const diff = getDifficultyForDay(day);
  // Low memory requirement: only previous day. High: back to day 1
  const reachBack = Math.ceil((diff.memoryRequired / 10) * day);
  return Math.max(1, day - reachBack);
}
