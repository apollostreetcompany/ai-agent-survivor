import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { GamePhase } from "@survivor/shared";

const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  registration: ["frozen"],
  frozen: ["active"],
  active: ["complete"],
  complete: [],
};

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
  if (!VALID_TRANSITIONS[current]?.includes(newPhase)) {
    throw new Error(`Invalid phase transition: ${current} -> ${newPhase}`);
  }

  const updates: Record<string, unknown> = { phase: newPhase };
  if (newPhase === "active") updates.startedAt = new Date().toISOString();
  if (newPhase === "complete") updates.completedAt = new Date().toISOString();

  db.update(schema.gameState).set(updates).where(eq(schema.gameState.id, 1)).run();
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
