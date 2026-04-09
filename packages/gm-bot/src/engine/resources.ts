import { eq, and, ne } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import {
  STARTING_RESOURCES,
  DAILY_DECAY,
  ELIMINATION_THRESHOLD,
} from "@survivor/shared";
import type { AgentId, ResourceDelta, ResourceEvent } from "@survivor/shared";
import { getCurrentDay } from "./game-state.js";

/** Get an agent's current resources */
export function getResources(agentId: AgentId) {
  const agent = db
    .select({ water: schema.agents.water, food: schema.agents.food })
    .from(schema.agents)
    .where(eq(schema.agents.id, agentId))
    .get();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  return agent;
}

/** Get all active agents with resources */
export function getAllActiveResources() {
  return db
    .select({
      id: schema.agents.id,
      name: schema.agents.name,
      water: schema.agents.water,
      food: schema.agents.food,
    })
    .from(schema.agents)
    .where(eq(schema.agents.status, "active"))
    .all();
}

/** Apply a resource delta to an agent */
export function applyDelta(
  agentId: AgentId,
  delta: ResourceDelta,
  event: ResourceEvent,
  reason: string,
): { water: number; food: number; eliminated: boolean } {
  const current = getResources(agentId);
  const newWater = Math.max(0, current.water + delta.water);
  const newFood = Math.max(0, current.food + delta.food);

  db.update(schema.agents)
    .set({ water: newWater, food: newFood })
    .where(eq(schema.agents.id, agentId))
    .run();

  // Log the change
  db.insert(schema.resourceLog)
    .values({
      agentId,
      day: getCurrentDay(),
      event,
      deltaWater: delta.water,
      deltaFood: delta.food,
      reason,
      timestamp: new Date().toISOString(),
    })
    .run();

  const eliminated =
    newWater <= ELIMINATION_THRESHOLD || newFood <= ELIMINATION_THRESHOLD;

  return { water: newWater, food: newFood, eliminated };
}

/** Apply daily decay to all active agents, returns list of eliminated agent IDs */
export function applyDailyDecay(): AgentId[] {
  const active = getAllActiveResources();
  const eliminated: AgentId[] = [];

  for (const agent of active) {
    const result = applyDelta(agent.id, DAILY_DECAY, "daily_decay", "Daily resource decay");
    if (result.eliminated) {
      eliminateAgent(agent.id, "Resources depleted");
      eliminated.push(agent.id);
    }
  }

  return eliminated;
}

/** Mark an agent as eliminated */
export function eliminateAgent(agentId: AgentId, reason: string): void {
  const day = getCurrentDay();
  db.update(schema.agents)
    .set({
      status: "eliminated",
      eliminatedAt: new Date().toISOString(),
      eliminatedOnDay: day,
    })
    .where(eq(schema.agents.id, agentId))
    .run();

  db.insert(schema.resourceLog)
    .values({
      agentId,
      day,
      event: "gm_adjustment",
      deltaWater: 0,
      deltaFood: 0,
      reason: `ELIMINATED: ${reason}`,
      timestamp: new Date().toISOString(),
    })
    .run();
}

/** Get resource history for an agent */
export function getResourceHistory(agentId: AgentId) {
  return db
    .select()
    .from(schema.resourceLog)
    .where(eq(schema.resourceLog.agentId, agentId))
    .all();
}

/** Check if any active agents remain */
export function getActiveAgentCount(): number {
  const result = db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.status, "active"))
    .all();
  return result.length;
}
