import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const infraRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runbookPath = resolve(infraRoot, "RUNBOOK.md");
const envExamplePath = resolve(infraRoot, ".env.example");

const requiredEnvVars = [
  "GUILD_ID",
  "GM_DISCORD_TOKEN",
  "AGENT_ALPHA_DISCORD_TOKEN",
  "AGENT_BRAVO_DISCORD_TOKEN",
  "AGENT_CHARLIE_DISCORD_TOKEN",
  "AGENT_DELTA_DISCORD_TOKEN",
  "AGENT_ALPHA_LLM_API_KEY",
  "AGENT_BRAVO_LLM_API_KEY",
  "AGENT_CHARLIE_LLM_API_KEY",
  "AGENT_DELTA_LLM_API_KEY",
];

const optionalEnvVars = [
  "LLM_PROVIDER",
  "AGENT_ALPHA_LLM_MODEL",
  "AGENT_BRAVO_LLM_MODEL",
  "AGENT_CHARLIE_LLM_MODEL",
  "AGENT_DELTA_LLM_MODEL",
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
];

const requiredCommands = [
  "bun --filter @survivor/gm-bot season setup",
  "bun --filter @survivor/agent-template local:smoke",
  "bun run test",
  "cd packages/infra",
  "cp .env.example .env",
  "docker compose --env-file .env up --build",
  "!season help",
  "!season status",
  "!season bootstrap",
  "!season start",
  "!season setup",
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

test("env example preserves the required non-secret runtime keys", () => {
  const envExample = readRequiredFile(envExamplePath);

  for (const envVar of requiredEnvVars) {
    assert.match(envExample, new RegExp(`^${envVar}=`, "m"), `${envVar} must be in .env.example`);
  }

  for (const envVar of optionalEnvVars) {
    assert.match(envExample, new RegExp(`^${envVar}=`, "m"), `${envVar} must be in .env.example`);
  }
});
