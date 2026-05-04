import defaultRoster from "./default-roster.json" with { type: "json" };
import type {
  AgentId,
  DefaultRosterAgent,
  DifficultyProfile,
  ResourceDelta,
  Resources,
} from "./types.js";

export const GAME_NAME = "AI Agent Survivor";

// ---------------------------------------------------------------------------
// Resource Configuration
// ---------------------------------------------------------------------------

export const STARTING_RESOURCES: Resources = {
  water: 100,
  food: 100,
};

export const DAILY_DECAY: ResourceDelta = {
  water: -10,
  food: -8,
};

export const ELIMINATION_THRESHOLD = 0;

// ---------------------------------------------------------------------------
// Game Configuration
// ---------------------------------------------------------------------------

export const MAX_DAYS = 10;
export const MIN_AGENTS = 4;
export const MAX_AGENTS = 16;

// ---------------------------------------------------------------------------
// Default Local Roster
// ---------------------------------------------------------------------------

function validateDefaultPlayableRoster(
  roster: readonly DefaultRosterAgent[],
): readonly DefaultRosterAgent[] {
  if (roster.length < MIN_AGENTS) {
    throw new Error(
      `Default roster must include at least ${MIN_AGENTS} agents, found ${roster.length}.`,
    );
  }

  const seenIds = new Set<AgentId>();
  for (const agent of roster) {
    if (seenIds.has(agent.id)) {
      throw new Error(`Default roster contains duplicate agent ID: ${agent.id}`);
    }
    seenIds.add(agent.id);

    if (
      !agent.id ||
      !agent.name ||
      !agent.discordBotId ||
      !agent.llmProvider ||
      !agent.registeredAt
    ) {
      throw new Error(
        `Default roster agent ${agent.id || "(missing id)"} is missing required fields.`,
      );
    }
  }

  return roster;
}

export const DEFAULT_PLAYABLE_ROSTER: readonly DefaultRosterAgent[] =
  validateDefaultPlayableRoster(defaultRoster);
export const DEFAULT_PLAYABLE_ROSTER_AGENT_IDS: readonly AgentId[] =
  DEFAULT_PLAYABLE_ROSTER.map((agent) => agent.id);
export const DEFAULT_ROSTER_REGISTERED_AT = DEFAULT_PLAYABLE_ROSTER[0].registeredAt;

// ---------------------------------------------------------------------------
// Canary Configuration
// ---------------------------------------------------------------------------

export const CANARY_MIN_PER_DAY = 2;
export const CANARY_MAX_PER_DAY = 5;
export const CANARY_DEFAULT_DEADLINE_SECONDS = 30;
export const CANARY_FAILURE_PENALTY: ResourceDelta = { water: -5, food: -5 };
export const CANARY_INVESTIGATION_THRESHOLD = 3; // missed canaries before flagged

// ---------------------------------------------------------------------------
// Task Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CLAIM_TIMEOUT_MINUTES = 15;
export const DEFAULT_URGENT_DEADLINE_MINUTES = 30;

// ---------------------------------------------------------------------------
// Difficulty Profiles (per day)
// ---------------------------------------------------------------------------

export const DIFFICULTY_BY_DAY: Record<number, DifficultyProfile> = {
  1:  { complexity: 2, timePressure: 2, toolChaining: 1, memoryRequired: 1, ambiguity: 1 },
  2:  { complexity: 3, timePressure: 3, toolChaining: 2, memoryRequired: 1, ambiguity: 2 },
  3:  { complexity: 4, timePressure: 4, toolChaining: 3, memoryRequired: 2, ambiguity: 3 },
  4:  { complexity: 5, timePressure: 5, toolChaining: 3, memoryRequired: 3, ambiguity: 4 },
  5:  { complexity: 6, timePressure: 5, toolChaining: 4, memoryRequired: 4, ambiguity: 5 },
  6:  { complexity: 7, timePressure: 6, toolChaining: 5, memoryRequired: 5, ambiguity: 6 },
  7:  { complexity: 7, timePressure: 7, toolChaining: 6, memoryRequired: 6, ambiguity: 7 },
  8:  { complexity: 8, timePressure: 8, toolChaining: 7, memoryRequired: 7, ambiguity: 8 },
  9:  { complexity: 9, timePressure: 9, toolChaining: 8, memoryRequired: 8, ambiguity: 9 },
  10: { complexity: 10, timePressure: 10, toolChaining: 9, memoryRequired: 9, ambiguity: 10 },
};

// ---------------------------------------------------------------------------
// Discord Channel Names
// ---------------------------------------------------------------------------

export const CHANNELS = {
  ANNOUNCEMENTS: "announcements",
  ARENA: "arena",
  AGENT_CHAT: "agent-chat",
  SCOREBOARD: "scoreboard",
  INTEGRITY_LOG: "integrity-log",
  SPECTATOR_LOUNGE: "spectator-lounge",
  GM_ADMIN: "gm-admin",
} as const;

// ---------------------------------------------------------------------------
// Task Reward Tiers
// ---------------------------------------------------------------------------

export const URGENT_REWARD_TIERS = {
  water_small: { water: 10, food: 0 },
  water_medium: { water: 20, food: 0 },
  water_large: { water: 30, food: 0 },
  food_small: { water: 0, food: 10 },
  food_medium: { water: 0, food: 18 },
  food_large: { water: 0, food: 25 },
  mixed_small: { water: 8, food: 8 },
  mixed_medium: { water: 15, food: 12 },
  mixed_large: { water: 25, food: 20 },
} as const;

export const COLLABORATION_BONUS_MULTIPLIER = 1.3;
