#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const infraRoot = resolve(scriptDir, "..");
const repoRoot = resolve(infraRoot, "../..");
const rosterPath = resolve(repoRoot, "packages/shared/src/default-roster.json");

const AGENT_SEATS = [
  { id: "agent-alpha", envPrefix: "AGENT_ALPHA" },
  { id: "agent-bravo", envPrefix: "AGENT_BRAVO" },
  { id: "agent-charlie", envPrefix: "AGENT_CHARLIE" },
  { id: "agent-delta", envPrefix: "AGENT_DELTA" },
];

const VALID_SUPERVISORS = new Set(["openclaw", "hermes"]);

function env(name) {
  return process.env[name] || "";
}

function requireEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing required launch variable: ${name}`);
  return value;
}

function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function readRoster() {
  return JSON.parse(readFileSync(rosterPath, "utf8"));
}

function buildMetadata() {
  const roster = readRoster();
  const rosterById = new Map(roster.map((agent) => [agent.id, agent]));
  const llmProvider = requireEnv("LLM_PROVIDER");
  const watchdogSupervisor = requireEnv("BENCHMARK_WATCHDOG_SUPERVISOR").toLowerCase();
  if (!VALID_SUPERVISORS.has(watchdogSupervisor)) {
    throw new Error(
      `BENCHMARK_WATCHDOG_SUPERVISOR must be one of: ${[...VALID_SUPERVISORS].join(", ")}`,
    );
  }

  return {
    schemaVersion: 1,
    runId: env("SURVIVOR_RUN_ID") || "discord-benchmark",
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    benchmark: {
      name: "AI Agent Survivor",
      durationDays: 10,
      startingResources: { water: 100, food: 100 },
      dailyDecay: { water: -10, food: -8 },
      minAgents: 4,
    },
    fairnessContract: {
      canonicalRoster: true,
      cleanDayOneReset: true,
      uniqueDiscordBotTokensRequired: true,
      gmDiscordAuthorBindingRequired: true,
      discordAuthorBindingRequired: true,
      isolatedMemoryAndWorkspaceRequired: true,
      noMidRunCredentialModelPromptOrCodeChangesWithoutDisclosure: true,
    },
    discord: {
      gmBotId: requireEnv("GM_DISCORD_BOT_ID"),
      channels: {
        gmAdmin: requireEnv("DISCORD_GM_ADMIN_CHANNEL_ID"),
        announcements: requireEnv("DISCORD_ANNOUNCEMENTS_CHANNEL_ID"),
        arena: requireEnv("DISCORD_ARENA_CHANNEL_ID"),
        agentChat: requireEnv("DISCORD_AGENT_CHAT_CHANNEL_ID"),
        scoreboard: requireEnv("DISCORD_SCOREBOARD_CHANNEL_ID"),
        integrityLog: requireEnv("DISCORD_INTEGRITY_LOG_CHANNEL_ID"),
        spectatorLounge: requireEnv("DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID"),
      },
    },
    supervision: {
      watchdog: {
        supervisor: watchdogSupervisor,
        cadence: "1h",
        target: "configured",
        command: "bun run benchmark:watchdog",
      },
      openclawDiscordTargetConfigured: Boolean(env("OPENCLAW_DISCORD_TARGET")),
    },
    agents: AGENT_SEATS.map(({ id, envPrefix }) => {
      const cloudSeatProvider = requireEnv(`${envPrefix}_CLOUD_SEAT_PROVIDER`).toLowerCase();
      if (!VALID_SUPERVISORS.has(cloudSeatProvider)) {
        throw new Error(
          `${envPrefix}_CLOUD_SEAT_PROVIDER must be one of: ${[...VALID_SUPERVISORS].join(", ")}`,
        );
      }

      const rosterAgent = rosterById.get(id);
      if (!rosterAgent) throw new Error(`Default roster is missing ${id}`);

      return {
        id,
        name: rosterAgent.name,
        cloudSeatProvider,
        cloudSeatId: requireEnv(`${envPrefix}_CLOUD_SEAT_ID`),
        discordBotId: requireEnv(`${envPrefix}_DISCORD_BOT_ID`),
        llmProvider,
        llmModel: requireEnv(`${envPrefix}_LLM_MODEL`),
        memoryDbPath: `data/${id}-memory.db`,
        workspacePath: `workspaces/${id}`,
      };
    }),
  };
}

function outputPathFromArgs(args) {
  const index = args.indexOf("--output");
  if (index !== -1) return args[index + 1];
  return env("BENCHMARK_METADATA_PATH");
}

function main() {
  const args = process.argv.slice(2);
  const metadata = buildMetadata();
  const outputPath = outputPathFromArgs(args);

  if (args.includes("--check")) {
    process.stdout.write(
      `${JSON.stringify({ metadata: "ok", agentCount: metadata.agents.length })}\n`,
    );
    return;
  }

  if (!outputPath) {
    process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ metadata: "written", path: outputPath, agentCount: metadata.agents.length })}\n`,
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
