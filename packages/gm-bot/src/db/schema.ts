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
