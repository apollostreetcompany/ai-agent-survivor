import { mkdirSync, appendFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { eq } from "drizzle-orm";
import { db, getDbPath, schema } from "../db/index.js";

export type RuntimeLevel = "debug" | "info" | "warn" | "error";
export type ProcessType = "gm" | "agent" | "watchdog" | "scheduler";

export interface RuntimeEventInput {
  level?: RuntimeLevel;
  event: string;
  processType?: ProcessType;
  processId?: string;
  details?: unknown;
}

export interface HeartbeatInput {
  processType: ProcessType;
  processId: string;
  status?: string;
  uptimeSeconds?: number;
  memoryHash?: string;
  details?: unknown;
}

export interface SchedulerRunInput {
  jobName: string;
  status: "ok" | "skipped" | "error";
  startedAt: string;
  finishedAt: string;
  error?: string;
  details?: unknown;
}

const RUN_ID = process.env.SURVIVOR_RUN_ID || `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const LOG_DIR = process.env.SURVIVOR_LOG_DIR || "./logs";
const HEARTBEAT_STALE_SECONDS = Number(process.env.HEARTBEAT_STALE_SECONDS || 180);

function nowIso(): string {
  return new Date().toISOString();
}

function encodeDetails(details: unknown): string | null {
  if (details == null) return null;
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function appendJsonl(processType: string, processId: string, record: Record<string, unknown>): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(
      join(LOG_DIR, `${processType}-${processId}.jsonl`),
      `${JSON.stringify(record)}\n`,
    );
  } catch (err) {
    console.error("runtime log write failed:", err);
  }
}

function writeLocalHealthFile(record: Record<string, unknown>): void {
  const healthFile = process.env.SURVIVOR_HEALTH_FILE;
  if (!healthFile) return;

  try {
    mkdirSync(dirname(healthFile), { recursive: true });
    writeFileSync(healthFile, `${JSON.stringify(record)}\n`);
  } catch (err) {
    console.error("health file write failed:", err);
  }
}

export function getRunId(): string {
  return RUN_ID;
}

export function getLogDir(): string {
  return LOG_DIR;
}

export function recordRuntimeEvent(input: RuntimeEventInput): void {
  const processType = input.processType || "gm";
  const processId = input.processId || process.env.PROCESS_ID || processType;
  const createdAt = nowIso();
  const details = encodeDetails(input.details);
  const level = input.level || "info";

  const record = {
    runId: RUN_ID,
    processType,
    processId,
    level,
    event: input.event,
    details,
    createdAt,
  };

  appendJsonl(processType, processId, record);

  try {
    db.insert(schema.runtimeEvents).values(record).run();
  } catch (err) {
    console.error("runtime event persistence failed:", err);
  }
}

export function recordProcessHeartbeat(input: HeartbeatInput): void {
  const recordedAt = nowIso();
  const record = {
    runId: RUN_ID,
    processType: input.processType,
    processId: input.processId,
    status: input.status || "ok",
    uptimeSeconds: input.uptimeSeconds,
    memoryHash: input.memoryHash,
    details: encodeDetails(input.details),
    recordedAt,
  };

  appendJsonl(input.processType, input.processId, {
    type: "heartbeat",
    ...record,
  });
  writeLocalHealthFile({ type: "heartbeat", ...record });

  try {
    db.insert(schema.processHeartbeats).values(record).run();
  } catch (err) {
    console.error("heartbeat persistence failed:", err);
  }
}

export function recordSchedulerRun(input: SchedulerRunInput): void {
  const record = {
    jobName: input.jobName,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    error: input.error,
    details: encodeDetails(input.details),
  };

  appendJsonl("scheduler", input.jobName, {
    type: "scheduler_run",
    runId: RUN_ID,
    ...record,
  });

  try {
    db.insert(schema.schedulerRuns).values(record).run();
  } catch (err) {
    console.error("scheduler run persistence failed:", err);
  }
}

export function recordDiscordAudit(input: {
  channelName: string;
  direction: "outbound" | "inbound";
  messageTag?: string;
  agentId?: string;
  status: "sent" | "received" | "failed";
  contentPreview?: string;
  error?: string;
}): void {
  try {
    db.insert(schema.discordMessageAudit)
      .values({
        ...input,
        contentPreview: input.contentPreview?.slice(0, 500),
        createdAt: nowIso(),
      })
      .run();
  } catch (err) {
    console.error("discord audit persistence failed:", err);
  }
}

export function recordTaskAdjudication(input: {
  taskId: string;
  agentId: string;
  verdict: "pass" | "fail";
  note?: string;
  adjudicatedBy: string;
}): void {
  db.insert(schema.taskAdjudications)
    .values({
      taskId: input.taskId,
      agentId: input.agentId,
      verdict: input.verdict,
      note: input.note,
      adjudicatedBy: input.adjudicatedBy,
      createdAt: nowIso(),
    })
    .run();

  recordRuntimeEvent({
    event: "task_adjudicated",
    details: input,
  });
}

function newestBy<T>(rows: T[], key: (row: T) => string, time: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    const existing = byKey.get(k);
    if (!existing || time(row) > time(existing)) {
      byKey.set(k, row);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => key(a).localeCompare(key(b)));
}

export function getHealthSnapshot() {
  const agents = db.select().from(schema.agents).all();
  const tasks = db.select().from(schema.tasks).all();
  const heartbeats = db.select().from(schema.processHeartbeats).all();
  const schedulerRuns = db.select().from(schema.schedulerRuns).all();
  const canaries = db.select().from(schema.canaryChallenges).all();
  const recentErrors = db
    .select()
    .from(schema.runtimeEvents)
    .where(eq(schema.runtimeEvents.level, "error"))
    .all()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const latestHeartbeats = newestBy(
    heartbeats,
    (row) => `${row.processType}:${row.processId}`,
    (row) => row.recordedAt,
  ).map((row) => {
    const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(row.recordedAt).getTime()) / 1000));
    return {
      ...row,
      ageSeconds,
      stale: ageSeconds > HEARTBEAT_STALE_SECONDS,
    };
  });

  const latestSchedulerRuns = newestBy(
    schedulerRuns,
    (row) => row.jobName,
    (row) => row.finishedAt,
  );

  return {
    runId: RUN_ID,
    dbPath: getDbPath(),
    logDir: LOG_DIR,
    heartbeatStaleSeconds: HEARTBEAT_STALE_SECONDS,
    agents: {
      total: agents.length,
      active: agents.filter((agent) => agent.status === "active").length,
      registered: agents.filter((agent) => agent.status === "registered").length,
      eliminated: agents.filter((agent) => agent.status === "eliminated").length,
    },
    tasks: {
      total: tasks.length,
      active: tasks.filter((task) => task.status === "active").length,
      claimed: tasks.filter((task) => task.status === "claimed").length,
      completed: tasks.filter((task) => task.status === "completed").length,
      expired: tasks.filter((task) => task.status === "expired").length,
    },
    pendingCanaries: canaries.filter((canary) => !canary.evaluatedAt).length,
    latestHeartbeats,
    latestSchedulerRuns,
    recentErrors,
  };
}

export function formatHealthSnapshot(): string {
  const snapshot = getHealthSnapshot();
  const stale = snapshot.latestHeartbeats.filter((heartbeat) => heartbeat.stale);
  const schedulerErrors = snapshot.latestSchedulerRuns.filter((run) => run.status === "error");
  const status = stale.length === 0 && schedulerErrors.length === 0 && snapshot.recentErrors.length === 0
    ? "green"
    : "attention";

  const heartbeatLines = snapshot.latestHeartbeats.length === 0
    ? ["Heartbeats: none recorded yet"]
    : snapshot.latestHeartbeats.map((heartbeat) =>
        `- ${heartbeat.processType}:${heartbeat.processId} ${heartbeat.status} age=${heartbeat.ageSeconds}s` +
        (heartbeat.stale ? " STALE" : ""),
      );

  const schedulerLines = snapshot.latestSchedulerRuns.length === 0
    ? ["Scheduler: no jobs recorded yet"]
    : snapshot.latestSchedulerRuns.map((run) =>
        `- ${run.jobName}: ${run.status} at ${run.finishedAt}` +
        (run.error ? ` error=${run.error}` : ""),
      );

  const errorLines = snapshot.recentErrors.length === 0
    ? ["Recent errors: none"]
    : snapshot.recentErrors.map((event) => `- ${event.createdAt} ${event.processType}:${event.processId} ${event.event}`);

  return [
    `Season health: ${status}`,
    `Run: ${snapshot.runId}`,
    `Agents: total=${snapshot.agents.total} active=${snapshot.agents.active} registered=${snapshot.agents.registered} eliminated=${snapshot.agents.eliminated}`,
    `Tasks: active=${snapshot.tasks.active} claimed=${snapshot.tasks.claimed} completed=${snapshot.tasks.completed} expired=${snapshot.tasks.expired}`,
    `Pending canaries: ${snapshot.pendingCanaries}`,
    "",
    ...heartbeatLines,
    "",
    ...schedulerLines,
    "",
    ...errorLines,
  ].join("\n");
}

export function formatOpsStatus(): string {
  const snapshot = getHealthSnapshot();
  return [
    `Ops status for ${snapshot.runId}`,
    `DB: ${snapshot.dbPath}`,
    `Logs: ${snapshot.logDir}`,
    `Heartbeat stale threshold: ${snapshot.heartbeatStaleSeconds}s`,
    `Latest heartbeats: ${snapshot.latestHeartbeats.length}`,
    `Latest scheduler jobs: ${snapshot.latestSchedulerRuns.length}`,
  ].join("\n");
}
