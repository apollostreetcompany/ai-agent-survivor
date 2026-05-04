import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const infraRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(infraRoot, "../..");
const runbookPath = resolve(infraRoot, "RUNBOOK.md");
const landingPagePath = resolve(repoRoot, "docs/index.html");
const envExamplePath = resolve(infraRoot, ".env.example");

const requiredEnvVars = [
  "GUILD_ID",
  "GM_DISCORD_TOKEN",
  "GM_DISCORD_BOT_ID",
  "AGENT_ALPHA_DISCORD_TOKEN",
  "AGENT_BRAVO_DISCORD_TOKEN",
  "AGENT_CHARLIE_DISCORD_TOKEN",
  "AGENT_DELTA_DISCORD_TOKEN",
  "AGENT_ALPHA_DISCORD_BOT_ID",
  "AGENT_BRAVO_DISCORD_BOT_ID",
  "AGENT_CHARLIE_DISCORD_BOT_ID",
  "AGENT_DELTA_DISCORD_BOT_ID",
  "LLM_PROVIDER",
  "BENCHMARK_WATCHDOG_SUPERVISOR",
  "OPENCLAW_DISCORD_TARGET",
  "AGENT_ALPHA_CLOUD_SEAT_PROVIDER",
  "AGENT_BRAVO_CLOUD_SEAT_PROVIDER",
  "AGENT_CHARLIE_CLOUD_SEAT_PROVIDER",
  "AGENT_DELTA_CLOUD_SEAT_PROVIDER",
  "AGENT_ALPHA_CLOUD_SEAT_ID",
  "AGENT_BRAVO_CLOUD_SEAT_ID",
  "AGENT_CHARLIE_CLOUD_SEAT_ID",
  "AGENT_DELTA_CLOUD_SEAT_ID",
  "AGENT_ALPHA_LLM_API_KEY",
  "AGENT_BRAVO_LLM_API_KEY",
  "AGENT_CHARLIE_LLM_API_KEY",
  "AGENT_DELTA_LLM_API_KEY",
  "AGENT_ALPHA_LLM_MODEL",
  "AGENT_BRAVO_LLM_MODEL",
  "AGENT_CHARLIE_LLM_MODEL",
  "AGENT_DELTA_LLM_MODEL",
];

const optionalEnvVars = [
  "NARRATOR_API_KEY",
  "NARRATOR_MODEL",
  "GM_MAIL_PASS",
  "AGENT_ALPHA_MAIL_USER",
  "AGENT_ALPHA_MAIL_PASS",
  "AGENT_BRAVO_MAIL_USER",
  "AGENT_BRAVO_MAIL_PASS",
  "AGENT_CHARLIE_MAIL_USER",
  "AGENT_CHARLIE_MAIL_PASS",
  "AGENT_DELTA_MAIL_USER",
  "AGENT_DELTA_MAIL_PASS",
  "BENCHMARK_RUNTIME_DIR",
  "BENCHMARK_METADATA_PATH",
  "SURVIVOR_RUN_ID",
  "GAME_DATA_PORT",
  "BENCHMARK_OPENCLAW_COMMAND",
  "BENCHMARK_HERMES_COMMAND",
  "BENCHMARK_OPENCLAW_SEATS_COMMAND",
  "BENCHMARK_HERMES_SEATS_COMMAND",
  "BENCHMARK_DOCKER_COMMAND",
  "BENCHMARK_REQUIRE_DOCKER",
  "MAX_LOG_AGE_SECONDS",
  "MAX_HEALTH_AGE_SECONDS",
  "BENCHMARK_DISCORD_API_BASE",
];

const requiredCommands = [
  "bun --filter @survivor/gm-bot season setup",
  "bun --filter @survivor/agent-template local:smoke",
  "bun run test",
  "cd packages/infra",
  "cp .env.example .env",
  "docker compose --env-file .env up --build",
  "bun run benchmark:doctor",
  "bun run benchmark:preflight",
  "bun run benchmark:start",
  "bun run benchmark:status",
  "bun run benchmark:stop",
  "bun run benchmark:watchdog",
  "!season help",
  "!season status",
  "!season bootstrap",
  "!season start",
  "!season setup",
  "!season health",
  "!season ops",
  "!season adjudicate",
  "#gm-admin",
];

function readRequiredFile(path) {
  assert.equal(existsSync(path), true, `${path} must exist`);
  return readFileSync(path, "utf8");
}

test("runtime runbook names every required launch credential and command", () => {
  const runbook = readRequiredFile(runbookPath);

  for (const envVar of [...requiredEnvVars, ...optionalEnvVars]) {
    assert.match(runbook, new RegExp(`\\b${envVar}\\b`), `${envVar} must stay documented`);
  }

  for (const command of requiredCommands) {
    assert.match(runbook, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${command} must stay documented`);
  }

  assert.match(runbook, /blank credentials/i);
  assert.match(runbook, /fail loud/i);
  assert.match(runbook, /Docker installed/i);
});

test("Discord Message Content intent stays documented for all benchmark bots", () => {
  const runbook = readRequiredFile(runbookPath);
  const landingPage = readRequiredFile(landingPagePath);

  for (const [name, source] of [
    ["runbook", runbook],
    ["landing page", landingPage],
  ]) {
    assert.match(source, /Message Content intent/i, `${name} must document the Message Content intent`);
    assert.match(
      source,
      /Discord Developer Portal/i,
      `${name} must point operators to the Discord Developer Portal`,
    );
    assert.match(
      source,
      /GM[^.]*agents[^.]*read message content|GM[^.]*agent[^.]*read message content/i,
      `${name} must explain why the GM and agents need message content`,
    );
    assert.match(
      source,
      /five Discord bot applications|GM bot and four agent bots/i,
      `${name} must apply the requirement to all five bot applications`,
    );
  }
});

test("env example preserves the required non-secret runtime keys", () => {
  const envExample = readRequiredFile(envExamplePath);

  for (const envVar of requiredEnvVars) {
    assert.match(envExample, new RegExp(`^${envVar}=`, "m"), `${envVar} must be in .env.example`);
  }

  for (const envVar of optionalEnvVars) {
    assert.match(envExample, new RegExp(`^${envVar}=`, "m"), `${envVar} must be in .env.example`);
  }
});

test("env example is shell-sourceable by runtime scripts", () => {
  const command = [
    "set -euo pipefail",
    "set -a",
    `source ${JSON.stringify(envExamplePath)}`,
    "set +a",
    'test "$BENCHMARK_OPENCLAW_SEATS_COMMAND" = "openclaw agents list --bindings"',
    'test "$BENCHMARK_HERMES_SEATS_COMMAND" = "hermes agents list"',
  ].join("; ");

  const result = spawnSync("bash", ["-lc", command], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
