import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  discordBotId: text("discord_bot_id").notNull().unique(),
  status: text("status", { enum: ["registered", "active", "eliminated"] })
    .notNull()
    .default("registered"),
  water: integer("water").notNull().default(100),
  food: integer("food").notNull().default(100),
  llmProvider: text("llm_provider").notNull(),
  registeredAt: text("registered_at").notNull(),
  eliminatedAt: text("eliminated_at"),
  eliminatedOnDay: integer("eliminated_on_day"),
});

// ---------------------------------------------------------------------------
// Game State
// ---------------------------------------------------------------------------

export const gameState = sqliteTable("game_state", {
  id: integer("id").primaryKey().default(1),
  phase: text("phase", { enum: ["registration", "frozen", "active", "complete"] })
    .notNull()
    .default("registration"),
  currentDay: integer("current_day").notNull().default(0),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  source: text("source", { enum: ["ambient", "urgent"] }).notNull(),
  claimMode: text("claim_mode", {
    enum: ["first_correct", "claim_with_timeout", "parallel"],
  }).notNull(),
  day: integer("day").notNull(),
  difficulty: integer("difficulty").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  rewardWater: integer("reward_water").notNull(),
  rewardFood: integer("reward_food").notNull(),
  penaltyWater: integer("penalty_water").default(0),
  penaltyFood: integer("penalty_food").default(0),
  deadlineMinutes: integer("deadline_minutes"),
  claimTimeoutMinutes: integer("claim_timeout_minutes"),
  maxCompletions: integer("max_completions"),
  status: text("status", {
    enum: ["pending", "active", "claimed", "completed", "expired"],
  })
    .notNull()
    .default("pending"),
  claimedBy: text("claimed_by"),
  claimedAt: text("claimed_at"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at"),
});

// ---------------------------------------------------------------------------
// Task Completions
// ---------------------------------------------------------------------------

export const taskCompletions = sqliteTable("task_completions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id),
  result: text("result"), // JSON
  submittedAt: text("submitted_at").notNull(),
  valid: integer("valid", { mode: "boolean" }).notNull().default(false),
  rewardWater: integer("reward_water").default(0),
  rewardFood: integer("reward_food").default(0),
});

// ---------------------------------------------------------------------------
// Task Adjudications
// ---------------------------------------------------------------------------

export const taskAdjudications = sqliteTable("task_adjudications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id),
  verdict: text("verdict", { enum: ["pass", "fail"] }).notNull(),
  note: text("note"),
  adjudicatedBy: text("adjudicated_by").notNull(),
  createdAt: text("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// Resource Log
// ---------------------------------------------------------------------------

export const resourceLog = sqliteTable("resource_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id),
  day: integer("day").notNull(),
  event: text("event").notNull(),
  deltaWater: integer("delta_water").notNull(),
  deltaFood: integer("delta_food").notNull(),
  reason: text("reason").notNull(),
  timestamp: text("timestamp").notNull(),
});

// ---------------------------------------------------------------------------
// Canary Challenges
// ---------------------------------------------------------------------------

export const canaryChallenges = sqliteTable("canary_challenges", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  expectedAnswer: text("expected_answer"),
  deadlineSeconds: integer("deadline_seconds").notNull(),
  issuedAt: text("issued_at").notNull(),
  evaluatedAt: text("evaluated_at"),
});

export const canaryResults = sqliteTable("canary_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => canaryChallenges.id),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id),
  response: text("response"),
  correct: integer("correct", { mode: "boolean" }).notNull().default(false),
  respondedAt: text("responded_at"),
  timedOut: integer("timed_out", { mode: "boolean" }).notNull().default(false),
});

// ---------------------------------------------------------------------------
// Runtime Operations
// ---------------------------------------------------------------------------

export const runtimeEvents = sqliteTable("runtime_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  processType: text("process_type").notNull(),
  processId: text("process_id").notNull(),
  level: text("level", { enum: ["debug", "info", "warn", "error"] }).notNull(),
  event: text("event").notNull(),
  details: text("details"),
  createdAt: text("created_at").notNull(),
});

export const processHeartbeats = sqliteTable("process_heartbeats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  processType: text("process_type").notNull(),
  processId: text("process_id").notNull(),
  status: text("status").notNull().default("ok"),
  uptimeSeconds: integer("uptime_seconds"),
  memoryHash: text("memory_hash"),
  details: text("details"),
  recordedAt: text("recorded_at").notNull(),
});

export const schedulerRuns = sqliteTable("scheduler_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobName: text("job_name").notNull(),
  status: text("status", { enum: ["ok", "skipped", "error"] }).notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at").notNull(),
  error: text("error"),
  details: text("details"),
});

export const discordMessageAudit = sqliteTable("discord_message_audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelName: text("channel_name").notNull(),
  direction: text("direction", { enum: ["outbound", "inbound"] }).notNull(),
  messageTag: text("message_tag"),
  agentId: text("agent_id"),
  status: text("status", { enum: ["sent", "received", "failed"] }).notNull(),
  contentPreview: text("content_preview"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
});

export const timingRecords = sqliteTable("timing_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: text("agent_id").notNull(),
  eventType: text("event_type").notNull(),
  issuedAt: text("issued_at").notNull(),
  respondedAt: text("responded_at").notNull(),
  latencyMs: integer("latency_ms").notNull(),
});
