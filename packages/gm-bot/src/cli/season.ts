import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type SeasonCommand = "bootstrap" | "start" | "setup";

interface AgentSummary {
  id: string;
}

interface StartSeasonSummary {
  phase: "active";
  currentDay: number;
  activatedAgents: AgentSummary[];
}

interface SeasonEngine {
  bootstrapDefaultRoster: () => AgentSummary[];
  resetDefaultRosterForFreshSeason: () => AgentSummary[];
  startDefaultRosterSeason: () => StartSeasonSummary;
  startGameWithRegisteredAgents: () => StartSeasonSummary;
}

export interface SeasonCommandIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

const DEFAULT_DB_PATH = "./data/survivor.db";

const defaultIo: SeasonCommandIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
};

const COMMAND_ALIASES: Record<string, SeasonCommand> = {
  bootstrap: "bootstrap",
  roster: "bootstrap",
  start: "start",
  setup: "setup",
  "bootstrap-start": "setup",
  "bootstrap-and-start": "setup",
};

export const SEASON_CLI_USAGE = [
  "Usage: bun --filter @survivor/gm-bot season <command>",
  "",
  "Commands:",
  "  bootstrap            Register the deterministic default playable roster.",
  "  start                Start a season with already registered agents.",
  "  setup                Reset the default roster, then start clean Day 1.",
  "  bootstrap-start      Alias for setup.",
].join("\n");

function parseCommand(args: readonly string[]): SeasonCommand | "help" {
  const command = args[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    return "help";
  }

  const parsed = COMMAND_ALIASES[command];
  if (!parsed) {
    throw new Error(`Unknown season command: ${command}\n\n${SEASON_CLI_USAGE}`);
  }

  return parsed;
}

function ensureDbDirectory(): void {
  const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
  if (dbPath === ":memory:" || dbPath.startsWith("file:")) return;

  mkdirSync(dirname(resolve(dbPath)), { recursive: true });
}

async function loadSeasonEngine(): Promise<SeasonEngine> {
  ensureDbDirectory();

  const [{ initDb }, roster] = await Promise.all([
    import("../db/index.js"),
    import("../engine/roster.js"),
  ]);
  initDb();

  return {
    bootstrapDefaultRoster: roster.bootstrapDefaultRoster,
    resetDefaultRosterForFreshSeason: roster.resetDefaultRosterForFreshSeason,
    startDefaultRosterSeason: roster.startDefaultRosterSeason,
    startGameWithRegisteredAgents: roster.startGameWithRegisteredAgents,
  };
}

function agentIds(agents: AgentSummary[]): string {
  return agents.map((agent) => agent.id).join(", ");
}

function writeBootstrapStatus(io: SeasonCommandIo, agents: AgentSummary[]): void {
  io.stdout(`Bootstrapped default roster: ${agents.length} agent(s)`);
  io.stdout(`Registered agents: ${agentIds(agents)}`);
}

function writeStartStatus(io: SeasonCommandIo, result: StartSeasonSummary): void {
  io.stdout(`Started season: phase=${result.phase} day=${result.currentDay}`);
  io.stdout(
    `Activated agents (${result.activatedAgents.length}): ${agentIds(result.activatedAgents)}`,
  );
}

export async function bootstrapSeason(io: SeasonCommandIo = defaultIo): Promise<AgentSummary[]> {
  const engine = await loadSeasonEngine();
  const agents = engine.bootstrapDefaultRoster();
  writeBootstrapStatus(io, agents);
  return agents;
}

export async function startSeason(
  io: SeasonCommandIo = defaultIo,
): Promise<StartSeasonSummary> {
  const engine = await loadSeasonEngine();
  const result = engine.startGameWithRegisteredAgents();
  writeStartStatus(io, result);
  return result;
}

export async function setupSeason(
  io: SeasonCommandIo = defaultIo,
): Promise<StartSeasonSummary> {
  const engine = await loadSeasonEngine();
  const agents = engine.resetDefaultRosterForFreshSeason();
  writeBootstrapStatus(io, agents);

  const result = engine.startDefaultRosterSeason();
  writeStartStatus(io, result);
  return result;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runSeasonCommand(
  args: readonly string[],
  io: SeasonCommandIo = defaultIo,
): Promise<number> {
  try {
    const command = parseCommand(args);

    if (command === "help") {
      io.stdout(SEASON_CLI_USAGE);
      return 0;
    }

    if (command === "bootstrap") {
      await bootstrapSeason(io);
      return 0;
    }

    if (command === "start") {
      await startSeason(io);
      return 0;
    }

    await setupSeason(io);
    return 0;
  } catch (error) {
    io.stderr(formatError(error));
    return 1;
  }
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
  return invokedPath === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const exitCode = await runSeasonCommand(process.argv.slice(2));
  process.exitCode = exitCode;
}
