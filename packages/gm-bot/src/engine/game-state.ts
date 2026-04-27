import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { GamePhase } from "@survivor/shared";

const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  registration: ["frozen"],
  frozen: ["active"],
  active: ["complete"],
  complete: [],
};

export function isValidTransition(current: GamePhase, newPhase: GamePhase): boolean {
  return VALID_TRANSITIONS[current]?.includes(newPhase) ?? false;
}

export function assertValidPhaseTransition(current: GamePhase, newPhase: GamePhase): void {
  if (!isValidTransition(current, newPhase)) {
    throw new Error(`Invalid phase transition: ${current} -> ${newPhase}`);
  }
}

export function getPhaseTransitionUpdates(
  newPhase: GamePhase,
  timestamp = new Date().toISOString(),
): {
  phase: GamePhase;
  startedAt?: string;
  completedAt?: string;
} {
  const updates: {
    phase: GamePhase;
    startedAt?: string;
    completedAt?: string;
  } = { phase: newPhase };

  if (newPhase === "active") updates.startedAt = timestamp;
  if (newPhase === "complete") updates.completedAt = timestamp;

  return updates;
}

export function getGameState() {
  const row = db.select().from(schema.gameState).where(eq(schema.gameState.id, 1)).get();
  if (!row) throw new Error("Game state not initialized. Call initDb() first.");
  return row;
}

export function getPhase(): GamePhase {
  return getGameState().phase as GamePhase;
}

export function getCurrentDay(): number {
  return getGameState().currentDay;
}

export function transitionTo(newPhase: GamePhase): void {
  const current = getPhase();
  assertValidPhaseTransition(current, newPhase);

  db.update(schema.gameState)
    .set(getPhaseTransitionUpdates(newPhase))
    .where(eq(schema.gameState.id, 1))
    .run();
}

export function advanceDay(): number {
  const state = getGameState();
  if (state.phase !== "active") throw new Error(`Cannot advance day in phase: ${state.phase}`);

  const nextDay = state.currentDay + 1;
  db.update(schema.gameState)
    .set({ currentDay: nextDay })
    .where(eq(schema.gameState.id, 1))
    .run();

  return nextDay;
}
