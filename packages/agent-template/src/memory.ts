import Database from "better-sqlite3";

const DB_PATH = process.env.MEMORY_DB_PATH || "./data/agent-memory.db";

let db: Database.Database;

export function initMemory(): void {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      day INTEGER,
      category TEXT DEFAULT 'general',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);

    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL UNIQUE,
      task_type TEXT NOT NULL,
      day INTEGER NOT NULL,
      result TEXT,
      success INTEGER NOT NULL,
      submitted_at TEXT NOT NULL
    );
  `);
}

/** Store a key-value memory */
export function remember(key: string, value: string, category = "general", day?: number): void {
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT id FROM memories WHERE key = ?")
    .get(key) as { id: number } | undefined;

  if (existing) {
    db.prepare("UPDATE memories SET value = ?, updated_at = ?, day = COALESCE(?, day) WHERE id = ?")
      .run(value, now, day ?? null, existing.id);
  } else {
    db.prepare("INSERT INTO memories (key, value, day, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(key, value, day ?? null, category, now, now);
  }
}

/** Recall a specific memory by key */
export function recall(key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM memories WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

/** Recall all memories in a category */
export function recallCategory(category: string): Array<{ key: string; value: string; day: number | null }> {
  return db
    .prepare("SELECT key, value, day FROM memories WHERE category = ? ORDER BY created_at DESC")
    .all(category) as Array<{ key: string; value: string; day: number | null }>;
}

/** Recall memories from a specific day */
export function recallDay(day: number): Array<{ key: string; value: string; category: string }> {
  return db
    .prepare("SELECT key, value, category FROM memories WHERE day = ? ORDER BY created_at DESC")
    .all(day) as Array<{ key: string; value: string; category: string }>;
}

/** Search memories by value content */
export function search(query: string): Array<{ key: string; value: string; category: string }> {
  return db
    .prepare("SELECT key, value, category FROM memories WHERE value LIKE ? ORDER BY updated_at DESC LIMIT 20")
    .all(`%${query}%`) as Array<{ key: string; value: string; category: string }>;
}

/** Record a task completion */
export function recordTask(taskId: string, taskType: string, day: number, result: unknown, success: boolean): void {
  db.prepare(
    "INSERT OR REPLACE INTO task_history (task_id, task_type, day, result, success, submitted_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(taskId, taskType, day, JSON.stringify(result), success ? 1 : 0, new Date().toISOString());
}

/** Get task history */
export function getTaskHistory(): Array<{ task_id: string; task_type: string; day: number; success: boolean }> {
  const rows = db
    .prepare("SELECT task_id, task_type, day, success FROM task_history ORDER BY submitted_at DESC")
    .all() as Array<{ task_id: string; task_type: string; day: number; success: number }>;
  return rows.map((r) => ({ ...r, success: Boolean(r.success) }));
}

/** Check whether a task has already been attempted by this agent. */
export function hasTaskHistory(taskId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM task_history WHERE task_id = ? LIMIT 1")
    .get(taskId);
  return Boolean(row);
}

/** Get a SHA-256 hash of the memory state (for canary challenges) */
export async function getMemoryHash(): Promise<string> {
  const all = db.prepare("SELECT key, value FROM memories ORDER BY key").all();
  const data = JSON.stringify(all);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
