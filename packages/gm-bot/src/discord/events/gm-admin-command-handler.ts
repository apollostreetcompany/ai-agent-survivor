import { db, initDb, schema } from "../../db/index.js";
import { getGameState } from "../../engine/game-state.js";
import { runSeasonCommand } from "../../cli/season.js";
import {
  formatHealthSnapshot,
  formatOpsStatus,
  recordTaskAdjudication,
} from "../../ops/runtime.js";

type MaybePromise<T> = T | Promise<T>;

export type GmAdminSeasonCommand =
  | "bootstrap"
  | "start"
  | "setup"
  | "status"
  | "health"
  | "ops"
  | "adjudicate"
  | "help";

export interface GmAdminCommandSinks {
  reply?: (line: string) => MaybePromise<void>;
}

export interface GmAdminCommandResult {
  handled: boolean;
  ok?: boolean;
  command?: GmAdminSeasonCommand;
  replies: string[];
  error?: string;
}

const SEASON_COMMANDS: Record<string, GmAdminSeasonCommand> = {
  bootstrap: "bootstrap",
  roster: "bootstrap",
  start: "start",
  setup: "setup",
  "bootstrap-start": "setup",
  "bootstrap-and-start": "setup",
  status: "status",
  smoke: "status",
  health: "health",
  ops: "ops",
  adjudicate: "adjudicate",
  help: "help",
  "--help": "help",
  "-h": "help",
};

const GM_SEASON_HELP = [
  "GM season commands:",
  "  !season bootstrap       Register the deterministic default playable roster.",
  "  !season start           Start Day 1 with already registered agents.",
  "  !season setup           Bootstrap the default roster, then start Day 1.",
  "  !season status          Show season phase, day, and agent counts.",
  "  !season health          Show runtime health, stale heartbeats, scheduler status, and recent errors.",
  "  !season ops             Show run id, DB path, log path, and monitoring metadata.",
  "  !season adjudicate <taskId> <agentId> pass|fail [note]",
  "  !season help            Show this help text.",
].join("\n");

function parseSeasonCommand(content: string): {
  handled: boolean;
  command?: GmAdminSeasonCommand;
  rawCommand?: string;
  args?: string[];
} {
  const [prefix, rawCommand = "help", ...args] = content.trim().split(/\s+/);
  if (prefix?.toLowerCase() !== "!season") return { handled: false };

  return {
    handled: true,
    command: SEASON_COMMANDS[rawCommand.toLowerCase()],
    rawCommand,
    args,
  };
}

function formatSeasonStatus(): string {
  initDb();

  const state = getGameState();
  const agents = db.select().from(schema.agents).all();
  const counts = {
    registered: 0,
    active: 0,
    eliminated: 0,
  };

  for (const agent of agents) {
    counts[agent.status] += 1;
  }

  return [
    `Season status: phase=${state.phase} day=${state.currentDay}`,
    `Agents: total=${agents.length} registered=${counts.registered} active=${counts.active} eliminated=${counts.eliminated}`,
  ].join("\n");
}

function formatFailure(command: GmAdminSeasonCommand, stderr: readonly string[]): string {
  const details = stderr.join("\n").trim() || "unknown error";
  return `Season ${command} failed: ${details}`;
}

function recordAdjudication(args: string[], adjudicatedBy = "discord-gm"): string {
  const [taskId, agentId, verdict, ...noteParts] = args;
  if (!taskId || !agentId || (verdict !== "pass" && verdict !== "fail")) {
    throw new Error("Usage: !season adjudicate <taskId> <agentId> pass|fail [note]");
  }

  recordTaskAdjudication({
    taskId,
    agentId,
    verdict,
    note: noteParts.join(" ").trim() || undefined,
    adjudicatedBy,
  });

  return `Adjudication recorded: task=${taskId} agent=${agentId} verdict=${verdict}`;
}

export async function handleGmAdminCommand(
  content: string,
  sinks: GmAdminCommandSinks = {},
): Promise<GmAdminCommandResult> {
  const parsed = parseSeasonCommand(content);
  const replies: string[] = [];

  async function reply(line: string): Promise<void> {
    replies.push(line);
    await sinks.reply?.(line);
  }

  if (!parsed.handled) return { handled: false, replies };

  if (!parsed.command) {
    const error = `Unknown season command: ${parsed.rawCommand}`;
    await reply(`${error}\n\n${GM_SEASON_HELP}`);
    return { handled: true, ok: false, replies, error };
  }

  if (parsed.command === "help") {
    await reply(GM_SEASON_HELP);
    return { handled: true, ok: true, command: parsed.command, replies };
  }

  if (parsed.command === "status") {
    try {
      await reply(formatSeasonStatus());
      return { handled: true, ok: true, command: parsed.command, replies };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await reply(`Season status failed: ${error}`);
      return { handled: true, ok: false, command: parsed.command, replies, error };
    }
  }

  if (parsed.command === "health") {
    try {
      await reply(formatHealthSnapshot());
      return { handled: true, ok: true, command: parsed.command, replies };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await reply(`Season health failed: ${error}`);
      return { handled: true, ok: false, command: parsed.command, replies, error };
    }
  }

  if (parsed.command === "ops") {
    try {
      await reply(formatOpsStatus());
      return { handled: true, ok: true, command: parsed.command, replies };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await reply(`Season ops failed: ${error}`);
      return { handled: true, ok: false, command: parsed.command, replies, error };
    }
  }

  if (parsed.command === "adjudicate") {
    try {
      const line = recordAdjudication(parsed.args ?? []);
      await reply(line);
      return { handled: true, ok: true, command: parsed.command, replies };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await reply(`Season adjudication failed: ${error}`);
      return { handled: true, ok: false, command: parsed.command, replies, error };
    }
  }

  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runSeasonCommand([parsed.command], {
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });

  if (exitCode === 0) {
    await reply(stdout.join("\n"));
    return { handled: true, ok: true, command: parsed.command, replies };
  }

  const error = stderr.join("\n").trim() || "unknown error";
  await reply(formatFailure(parsed.command, stderr));
  return { handled: true, ok: false, command: parsed.command, replies, error };
}
