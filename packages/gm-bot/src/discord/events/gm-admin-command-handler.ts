import { db, initDb, schema } from "../../db/index.js";
import { getGameState } from "../../engine/game-state.js";
import { runSeasonCommand } from "../../cli/season.js";

type MaybePromise<T> = T | Promise<T>;

export type GmAdminSeasonCommand = "bootstrap" | "start" | "setup" | "status" | "help";

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
  "  !season help            Show this help text.",
].join("\n");

function parseSeasonCommand(content: string): {
  handled: boolean;
  command?: GmAdminSeasonCommand;
  rawCommand?: string;
} {
  const [prefix, rawCommand = "help"] = content.trim().split(/\s+/);
  if (prefix?.toLowerCase() !== "!season") return { handled: false };

  return {
    handled: true,
    command: SEASON_COMMANDS[rawCommand.toLowerCase()],
    rawCommand,
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
