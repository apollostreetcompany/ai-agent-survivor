import { eq } from "drizzle-orm";
import { MIN_AGENTS, STARTING_RESOURCES } from "@survivor/shared";
import type { AgentId, GamePhase } from "@survivor/shared";
import { db, schema } from "../db/index.js";
import {
  assertValidPhaseTransition,
  getGameState,
  getPhaseTransitionUpdates,
} from "./game-state.js";

export interface AgentRegistrationInput {
  id: AgentId;
  name: string;
  discordBotId: string;
  llmProvider: string;
  registeredAt?: string;
}

export type AgentRow = typeof schema.agents.$inferSelect;

export interface StartGameResult {
  phase: "active";
  currentDay: number;
  startedAt: string | null;
  activatedAgents: AgentRow[];
}

export const DEFAULT_ROSTER_REGISTERED_AT = "2026-01-01T00:00:00.000Z";

export const DEFAULT_PLAYABLE_ROSTER: AgentRegistrationInput[] = [
  {
    id: "agent-alpha",
    name: "Agent Alpha",
    discordBotId: "local-agent-alpha",
    llmProvider: "prototype",
    registeredAt: DEFAULT_ROSTER_REGISTERED_AT,
  },
  {
    id: "agent-bravo",
    name: "Agent Bravo",
    discordBotId: "local-agent-bravo",
    llmProvider: "prototype",
    registeredAt: DEFAULT_ROSTER_REGISTERED_AT,
  },
  {
    id: "agent-charlie",
    name: "Agent Charlie",
    discordBotId: "local-agent-charlie",
    llmProvider: "prototype",
    registeredAt: DEFAULT_ROSTER_REGISTERED_AT,
  },
  {
    id: "agent-delta",
    name: "Agent Delta",
    discordBotId: "local-agent-delta",
    llmProvider: "prototype",
    registeredAt: DEFAULT_ROSTER_REGISTERED_AT,
  },
];

function getAgent(agentId: AgentId): AgentRow | undefined {
  return db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.id, agentId))
    .get();
}

function getRegisteredAgents(): AgentRow[] {
  return db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.status, "registered"))
    .orderBy(schema.agents.id)
    .all();
}

function getActiveAgents(): AgentRow[] {
  return db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.status, "active"))
    .orderBy(schema.agents.id)
    .all();
}

function assertStartablePhase(phase: GamePhase): void {
  if (phase === "registration") {
    assertValidPhaseTransition("registration", "frozen");
    assertValidPhaseTransition("frozen", "active");
    return;
  }

  if (phase === "frozen") {
    assertValidPhaseTransition("frozen", "active");
    return;
  }

  throw new Error(`Cannot start game from phase: ${phase}.`);
}

export function registerAgent(input: AgentRegistrationInput): AgentRow {
  const existing = getAgent(input.id);
  if (existing) return existing;

  db.insert(schema.agents)
    .values({
      id: input.id,
      name: input.name,
      discordBotId: input.discordBotId,
      status: "registered",
      water: STARTING_RESOURCES.water,
      food: STARTING_RESOURCES.food,
      llmProvider: input.llmProvider,
      registeredAt: input.registeredAt ?? new Date().toISOString(),
    })
    .run();

  const registered = getAgent(input.id);
  if (!registered) {
    throw new Error(`Failed to register agent: ${input.id}`);
  }

  return registered;
}

export function bootstrapDefaultRoster(
  roster: AgentRegistrationInput[] = DEFAULT_PLAYABLE_ROSTER,
): AgentRow[] {
  if (roster.length < MIN_AGENTS) {
    throw new Error(
      `Default roster must include at least ${MIN_AGENTS} agents, found ${roster.length}.`,
    );
  }

  return roster.map((agent) => registerAgent(agent));
}

export function startGameWithRegisteredAgents(): StartGameResult {
  const state = getGameState();
  const phase = state.phase as GamePhase;
  assertStartablePhase(phase);

  const registeredAgents = getRegisteredAgents();
  if (registeredAgents.length < MIN_AGENTS) {
    throw new Error(
      `Cannot start game: need at least ${MIN_AGENTS} registered agents, found ${registeredAgents.length}.`,
    );
  }

  const startedAt = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(schema.agents)
      .set({ status: "active" })
      .where(eq(schema.agents.status, "registered"))
      .run();

    if (phase === "registration") {
      tx.update(schema.gameState)
        .set(getPhaseTransitionUpdates("frozen", startedAt))
        .where(eq(schema.gameState.id, 1))
        .run();
    }

    tx.update(schema.gameState)
      .set({
        ...getPhaseTransitionUpdates("active", startedAt),
        currentDay: 1,
      })
      .where(eq(schema.gameState.id, 1))
      .run();
  });

  const nextState = getGameState();
  if (nextState.phase !== "active" || nextState.currentDay !== 1) {
    throw new Error("Game start failed: expected active phase on day 1.");
  }

  return {
    phase: "active",
    currentDay: nextState.currentDay,
    startedAt: nextState.startedAt,
    activatedAgents: getActiveAgents(),
  };
}
