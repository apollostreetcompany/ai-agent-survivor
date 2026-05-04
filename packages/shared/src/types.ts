/** Unique identifier for an agent in the game */
export type AgentId = string;

/** Unique identifier for a task */
export type TaskId = string;

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface Resources {
  water: number;
  food: number;
}

export interface ResourceDelta {
  water: number;
  food: number;
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export type AgentStatus = "registered" | "active" | "eliminated";

export interface Agent {
  id: AgentId;
  name: string;
  discordBotId: string;
  status: AgentStatus;
  resources: Resources;
  llmProvider: string;
  registeredAt: string;
  eliminatedAt?: string;
  eliminatedOnDay?: number;
}

export interface DefaultRosterAgent {
  id: AgentId;
  name: string;
  discordBotId: string;
  llmProvider: string;
  registeredAt: string;
}

// ---------------------------------------------------------------------------
// Game State
// ---------------------------------------------------------------------------

export type GamePhase =
  | "registration"
  | "frozen"
  | "active"
  | "complete";

export interface GameState {
  phase: GamePhase;
  currentDay: number;
  startedAt?: string;
  completedAt?: string;
  agents: Agent[];
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskType =
  | "email-triage"
  | "calendar-mgmt"
  | "data-analysis"
  | "code-challenge"
  | "trading-sim"
  | "research"
  | "content-gen"
  | "bug-fix"
  | "multi-step"
  | "adversarial";

export type TaskSource = "ambient" | "urgent";

export type ClaimMode =
  | "first_correct"
  | "claim_with_timeout"
  | "parallel";

export type TaskStatus =
  | "pending"
  | "active"
  | "claimed"
  | "completed"
  | "expired";

export interface TaskDefinition {
  id: TaskId;
  type: TaskType;
  source: TaskSource;
  claimMode: ClaimMode;
  day: number;
  difficulty: number; // 1-10
  title: string;
  description: string;
  reward: ResourceDelta;
  penalty?: ResourceDelta;
  deadlineMinutes?: number;
  claimTimeoutMinutes?: number;
  maxCompletions?: number; // for parallel mode
  requiresMemoryFromDay?: number;
  toolsRequired?: string[];
}

export interface TaskInstance {
  definition: TaskDefinition;
  status: TaskStatus;
  claimedBy?: AgentId;
  claimedAt?: string;
  completions: TaskCompletion[];
  createdAt: string;
  expiresAt?: string;
}

export interface TaskCompletion {
  agentId: AgentId;
  result: unknown;
  submittedAt: string;
  valid: boolean;
  rewardGranted?: ResourceDelta;
}

// ---------------------------------------------------------------------------
// Integrity / Canary
// ---------------------------------------------------------------------------

export interface CanaryChallenge {
  id: string;
  prompt: string;
  expectedAnswer?: string;
  deadlineSeconds: number;
  issuedAt: string;
}

export interface CanaryResult {
  challengeId: string;
  agentId: AgentId;
  response?: string;
  correct: boolean;
  respondedAt?: string;
  timedOut: boolean;
}

// ---------------------------------------------------------------------------
// Difficulty Axes
// ---------------------------------------------------------------------------

export interface DifficultyProfile {
  complexity: number;     // 1-10
  timePressure: number;   // 1-10
  toolChaining: number;   // 1-10
  memoryRequired: number; // 1-10
  ambiguity: number;      // 1-10
}

// ---------------------------------------------------------------------------
// Resource Log
// ---------------------------------------------------------------------------

export type ResourceEvent =
  | "task_reward"
  | "task_penalty"
  | "daily_decay"
  | "collaboration_bonus"
  | "canary_penalty"
  | "gm_adjustment";

export interface ResourceLogEntry {
  agentId: AgentId;
  day: number;
  event: ResourceEvent;
  delta: ResourceDelta;
  reason: string;
  timestamp: string;
}
