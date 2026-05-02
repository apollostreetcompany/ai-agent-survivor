import { mkdirSync, appendFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const RUN_ID = process.env.SURVIVOR_RUN_ID || `agent-run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const LOG_DIR = process.env.SURVIVOR_LOG_DIR || "./logs";

export function getRunId(): string {
  return RUN_ID;
}

export function getLogDir(): string {
  return LOG_DIR;
}

export function logRuntimeEvent(input: {
  agentId: string;
  level?: "debug" | "info" | "warn" | "error";
  event: string;
  details?: unknown;
}): void {
  const record = {
    runId: RUN_ID,
    processType: "agent",
    processId: input.agentId,
    level: input.level || "info",
    event: input.event,
    details: input.details,
    createdAt: new Date().toISOString(),
  };

  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(join(LOG_DIR, `agent-${input.agentId}.jsonl`), `${JSON.stringify(record)}\n`);
  } catch (err) {
    console.error("agent runtime log write failed:", err);
  }
}

export function writeLocalHeartbeat(input: {
  agentId: string;
  status?: string;
  uptimeSeconds: number;
  memoryHash?: string;
}): void {
  const healthFile = process.env.SURVIVOR_HEALTH_FILE;
  if (!healthFile) return;

  const record = {
    runId: RUN_ID,
    processType: "agent",
    processId: input.agentId,
    status: input.status || "ok",
    uptimeSeconds: input.uptimeSeconds,
    memoryHash: input.memoryHash,
    recordedAt: new Date().toISOString(),
  };

  try {
    mkdirSync(dirname(healthFile), { recursive: true });
    writeFileSync(healthFile, `${JSON.stringify(record)}\n`);
  } catch (err) {
    console.error("agent health file write failed:", err);
  }
}
