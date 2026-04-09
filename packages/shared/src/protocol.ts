import type {
  AgentId,
  TaskId,
  TaskDefinition,
  Resources,
  ResourceDelta,
  CanaryChallenge,
} from "./types.js";

export const PROTOCOL_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Message Prefixes (used in Discord channel messages)
// ---------------------------------------------------------------------------

export const GM_PREFIX = "[GM" as const;
export const AGENT_PREFIX = "[AGENT" as const;

// ---------------------------------------------------------------------------
// GM -> Agent Messages
// ---------------------------------------------------------------------------

/** Urgent task announced in #arena */
export interface GmTaskUrgent {
  tag: "GM:TASK:URGENT";
  id: TaskId;
  type: TaskDefinition["type"];
  reward: ResourceDelta;
  penalty?: ResourceDelta;
  description: string;
  deadlineMinutes: number;
  claimMode: TaskDefinition["claimMode"];
}

/** Canary challenge (prove-you're-alone) */
export interface GmCanary {
  tag: "GM:CANARY";
  id: string;
  prompt: string;
  deadlineSeconds: number;
}

/** Daily resource update broadcast */
export interface GmResources {
  tag: "GM:RESOURCES";
  day: number;
  agents: Array<{ id: AgentId; water: number; food: number }>;
}

/** Agent eliminated */
export interface GmElimination {
  tag: "GM:ELIMINATION";
  agentId: AgentId;
  day: number;
  reason: string;
  finalResources: Resources;
}

/** Day transition */
export interface GmDayStart {
  tag: "GM:DAY_START";
  day: number;
  difficulty: {
    complexity: number;
    timePressure: number;
    toolChaining: number;
    memoryRequired: number;
    ambiguity: number;
  };
}

/** Game over */
export interface GmGameOver {
  tag: "GM:GAME_OVER";
  day: number;
  survivors: Array<{ id: AgentId; resources: Resources }>;
}

export type GmMessage =
  | GmTaskUrgent
  | GmCanary
  | GmResources
  | GmElimination
  | GmDayStart
  | GmGameOver;

// ---------------------------------------------------------------------------
// Agent -> GM Messages
// ---------------------------------------------------------------------------

/** Agent claims a task */
export interface AgentClaim {
  tag: "AGENT:CLAIM";
  agentId: AgentId;
  taskId: TaskId;
}

/** Agent submits task completion */
export interface AgentSubmit {
  tag: "AGENT:SUBMIT";
  agentId: AgentId;
  taskId: TaskId;
  result: unknown;
}

/** Agent responds to canary */
export interface AgentCanaryResponse {
  tag: "AGENT:CANARY_RESPONSE";
  agentId: AgentId;
  challengeId: string;
  response: string;
}

/** Agent status report (voluntary) */
export interface AgentStatusReport {
  tag: "AGENT:STATUS";
  agentId: AgentId;
  memoryHash?: string;
  uptimeSeconds: number;
}

export type AgentMessage =
  | AgentClaim
  | AgentSubmit
  | AgentCanaryResponse
  | AgentStatusReport;

// ---------------------------------------------------------------------------
// Protocol Helpers
// ---------------------------------------------------------------------------

/** Encode a GM message for Discord */
export function encodeGmMessage(msg: GmMessage): string {
  const { tag, ...payload } = msg;
  return `[${tag}] ${JSON.stringify(payload)}`;
}

/** Encode an agent message for Discord */
export function encodeAgentMessage(msg: AgentMessage): string {
  const { tag, agentId, ...payload } = msg;
  return `[${tag}:${agentId}] ${JSON.stringify(payload)}`;
}

/** Parse a raw Discord message into a typed message, or null if not a protocol message */
export function parseMessage(raw: string): GmMessage | AgentMessage | null {
  // Match: [TAG:...] {...}
  const match = raw.match(/^\[([A-Z:_]+(?::[^\]]*)?)\]\s*(\{.*\})$/s);
  if (!match) return null;

  const fullTag = match[1]!;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(match[2]!);
  } catch {
    return null;
  }

  // GM messages: tag is the full bracket content
  if (fullTag.startsWith("GM:")) {
    return { tag: fullTag, ...payload } as GmMessage;
  }

  // Agent messages: [AGENT:CLAIM:agent-name] or [AGENT:SUBMIT:agent-name]
  if (fullTag.startsWith("AGENT:")) {
    const parts = fullTag.split(":");
    // Format: AGENT:<action>:<agentId>
    if (parts.length >= 3) {
      const agentId = parts.slice(2).join(":");
      const tag = `AGENT:${parts[1]}` as AgentMessage["tag"];
      return { tag, agentId, ...payload } as AgentMessage;
    }
  }

  return null;
}
