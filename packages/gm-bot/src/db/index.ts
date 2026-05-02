import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const DB_PATH = process.env.DB_PATH || "./data/survivor.db";

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };

export function getDbPath(): string {
  return DB_PATH;
}

function hasColumn(table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  if (!hasColumn(table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Initialize database tables */
export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      discord_bot_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'registered',
      water INTEGER NOT NULL DEFAULT 100,
      food INTEGER NOT NULL DEFAULT 100,
      llm_provider TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      eliminated_at TEXT,
      eliminated_on_day INTEGER
    );

    CREATE TABLE IF NOT EXISTS game_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      phase TEXT NOT NULL DEFAULT 'registration',
      current_day INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      claim_mode TEXT NOT NULL,
      day INTEGER NOT NULL,
      difficulty INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reward_water INTEGER NOT NULL,
      reward_food INTEGER NOT NULL,
      penalty_water INTEGER DEFAULT 0,
      penalty_food INTEGER DEFAULT 0,
      deadline_minutes INTEGER,
      claim_timeout_minutes INTEGER,
      max_completions INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      claimed_by TEXT,
      claimed_at TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      result TEXT,
      submitted_at TEXT NOT NULL,
      valid INTEGER NOT NULL DEFAULT 0,
      reward_water INTEGER DEFAULT 0,
      reward_food INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS task_adjudications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      verdict TEXT NOT NULL,
      note TEXT,
      adjudicated_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resource_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      day INTEGER NOT NULL,
      event TEXT NOT NULL,
      delta_water INTEGER NOT NULL,
      delta_food INTEGER NOT NULL,
      reason TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS canary_challenges (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      expected_answer TEXT,
      deadline_seconds INTEGER NOT NULL,
      issued_at TEXT NOT NULL,
      evaluated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS canary_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id TEXT NOT NULL REFERENCES canary_challenges(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      response TEXT,
      correct INTEGER NOT NULL DEFAULT 0,
      responded_at TEXT,
      timed_out INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS runtime_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      process_type TEXT NOT NULL,
      process_id TEXT NOT NULL,
      level TEXT NOT NULL,
      event TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS process_heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      process_type TEXT NOT NULL,
      process_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      uptime_seconds INTEGER,
      memory_hash TEXT,
      details TEXT,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduler_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      error TEXT,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS discord_message_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_name TEXT NOT NULL,
      direction TEXT NOT NULL,
      message_tag TEXT,
      agent_id TEXT,
      status TEXT NOT NULL,
      content_preview TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timing_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      responded_at TEXT NOT NULL,
      latency_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_events_run ON runtime_events(run_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_process_heartbeats_process ON process_heartbeats(process_type, process_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_scheduler_runs_job ON scheduler_runs(job_name, finished_at);
    CREATE INDEX IF NOT EXISTS idx_timing_records_agent ON timing_records(agent_id, responded_at);

    -- Ensure exactly one game_state row exists
    INSERT OR IGNORE INTO game_state (id) VALUES (1);
  `);

  addColumnIfMissing("canary_challenges", "evaluated_at", "TEXT");
}
