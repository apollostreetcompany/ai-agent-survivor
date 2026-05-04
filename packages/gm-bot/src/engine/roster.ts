import { eq } from "drizzle-orm";
import {
  DEFAULT_PLAYABLE_ROSTER as SHARED_DEFAULT_PLAYABLE_ROSTER,
  DEFAULT_PLAYABLE_ROSTER_AGENT_IDS,
  MIN_AGENTS,
  STARTING_RESOURCES,
} from "@survivor/shared";
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

export {
  DEFAULT_PLAYABLE_ROSTER,
  DEFAULT_ROSTER_REGISTERED_AT,
} from "@survivor/shared";

const DISCORD_BOT_ID_ENV_BY_AGENT_ID: Record<string, string> = {
  "agent-alpha": "AGENT_ALPHA_DISCORD_BOT_ID",
  "agent-bravo": "AGENT_BRAVO_DISCORD_BOT_ID",
  "agent-charlie": "AGENT_CHARLIE_DISCORD_BOT_ID",
  "agent-delta": "AGENT_DELTA_DISCORD_BOT_ID",
};

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

function getRuntimeDefaultRoster(): AgentRegistrationInput[] {
  return SHARED_DEFAULT_PLAYABLE_ROSTER.map((agent) => {
    const discordBotIdEnv = DISCORD_BOT_ID_ENV_BY_AGENT_ID[agent.id];
    const discordBotId = discordBotIdEnv ? process.env[discordBotIdEnv] : undefined;

    return {
      ...agent,
      discordBotId: discordBotId || agent.discordBotId,
      llmProvider: process.env.LLM_PROVIDER || agent.llmProvider,
    };
  });
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
  roster: readonly AgentRegistrationInput[] = getRuntimeDefaultRoster(),
): AgentRow[] {
  if (roster.length < MIN_AGENTS) {
    throw new Error(
      `Default roster must include at least ${MIN_AGENTS} agents, found ${roster.length}.`,
    );
  }

  return roster.map((agent) => registerAgent(agent));
}

export function resetDefaultRosterForFreshSeason(
  roster: readonly AgentRegistrationInput[] = getRuntimeDefaultRoster(),
): AgentRow[] {
  if (roster.length < MIN_AGENTS) {
    throw new Error(
      `Default roster must include at least ${MIN_AGENTS} agents, found ${roster.length}.`,
    );
  }

  db.transaction((tx) => {
    tx.delete(schema.taskAdjudications).run();
    tx.delete(schema.taskCompletions).run();
    tx.delete(schema.resourceLog).run();
    tx.delete(schema.canaryResults).run();
    tx.delete(schema.canaryChallenges).run();
    tx.delete(schema.tasks).run();
    tx.delete(schema.runtimeEvents).run();
    tx.delete(schema.processHeartbeats).run();
    tx.delete(schema.schedulerRuns).run();
    tx.delete(schema.discordMessageAudit).run();
    tx.delete(schema.timingRecords).run();
    tx.delete(schema.agents).run();

    tx.update(schema.gameState)
      .set({
        phase: "registration",
        currentDay: 0,
        startedAt: null,
        completedAt: null,
      })
      .where(eq(schema.gameState.id, 1))
      .run();

    for (const agent of roster) {
      tx.insert(schema.agents)
        .values({
          id: agent.id,
          name: agent.name,
          discordBotId: agent.discordBotId,
          status: "registered",
          water: STARTING_RESOURCES.water,
          food: STARTING_RESOURCES.food,
          llmProvider: agent.llmProvider,
          registeredAt: agent.registeredAt ?? new Date().toISOString(),
        })
        .run();
    }
  });

  return getRegisteredAgents();
}

export function assertOnlyDefaultRosterRegistered(): void {
  const expectedIds = [...DEFAULT_PLAYABLE_ROSTER_AGENT_IDS];
  const expected = new Set<string>(expectedIds);
  const agents = db.select().from(schema.agents).orderBy(schema.agents.id).all();
  const agentIds = new Set(agents.map((agent) => agent.id));
  const unexpected = agents
    .filter((agent) => !expected.has(agent.id))
    .map((agent) => agent.id);
  const missing = expectedIds.filter((agentId) => !agentIds.has(agentId));
  const notRegistered = agents
    .filter((agent) => expected.has(agent.id) && agent.status !== "registered")
    .map((agent) => `${agent.id}:${agent.status}`);

  if (unexpected.length > 0) {
    throw new Error(`Cannot start default season: unexpected agents: ${unexpected.join(", ")}.`);
  }

  if (missing.length > 0) {
    throw new Error(`Cannot start default season: missing agents: ${missing.join(", ")}.`);
  }

  if (notRegistered.length > 0) {
    throw new Error(
      `Cannot start default season: expected registered agents, found ${notRegistered.join(", ")}.`,
    );
  }
}

export function startDefaultRosterSeason(): StartGameResult {
  assertOnlyDefaultRosterRegistered();
  return startGameWithRegisteredAgents();
}

export function setupFreshDefaultSeason(): StartGameResult {
  resetDefaultRosterForFreshSeason();
  return startDefaultRosterSeason();
}

export function assertAgentDiscordAuthor(agentId: AgentId, discordAuthorId: string): AgentRow {
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Unknown agent ID: ${agentId}`);
  }

  if (agent.discordBotId !== discordAuthorId) {
    throw new Error(
      `Agent identity mismatch for ${agentId}: expected Discord bot ${agent.discordBotId}, got ${discordAuthorId}.`,
    );
  }

  return agent;
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
