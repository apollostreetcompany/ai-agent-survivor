#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const infraRoot = resolve(scriptDir, "..");
const envFile = process.env.BENCHMARK_ENV_FILE || resolve(infraRoot, ".env");
const preflightScript = resolve(scriptDir, "benchmark-preflight.sh");

const REQUIRED_VARS = [
  "GUILD_ID",
  "GM_DISCORD_TOKEN",
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

const PROVIDER_VARS = [
  "BENCHMARK_WATCHDOG_SUPERVISOR",
  "AGENT_ALPHA_CLOUD_SEAT_PROVIDER",
  "AGENT_BRAVO_CLOUD_SEAT_PROVIDER",
  "AGENT_CHARLIE_CLOUD_SEAT_PROVIDER",
  "AGENT_DELTA_CLOUD_SEAT_PROVIDER",
];

const VALID_PROVIDERS = new Set(["openclaw", "hermes"]);

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};

  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = parseEnvValue(match[2]);
  }
  return values;
}

function commandExists(command) {
  const result = spawnSync("sh", ["-c", "command -v \"$1\" >/dev/null 2>&1", "sh", command], {
    encoding: "utf8",
  });
  return result.status === 0;
}

function booleanEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function addCheck(report, id, status, summary) {
  report.checks.push({ id, status, summary });
  if (status === "fail") report.blockers.push(summary);
  if (status === "warn") report.warnings.push(summary);
}

function providerCommand(provider, env) {
  if (provider === "openclaw") return env.BENCHMARK_OPENCLAW_COMMAND || "openclaw";
  if (provider === "hermes") return env.BENCHMARK_HERMES_COMMAND || "hermes";
  return "";
}

function runPreflight(env) {
  const result = spawnSync("bash", [preflightScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      BENCHMARK_ENV_FILE: envFile,
    },
  });

  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || "benchmark:preflight failed").trim(),
    };
  }

  try {
    return { ok: true, result: JSON.parse(result.stdout) };
  } catch {
    return { ok: false, error: "benchmark:preflight returned non-JSON output" };
  }
}

function main() {
  const fileEnv = parseEnvFile(envFile);
  const env = { ...process.env, ...fileEnv };
  const report = {
    doctor: "blocked",
    env: {
      path: envFile,
      present: existsSync(envFile),
    },
    checks: [],
    blockers: [],
    warnings: [],
    preflight: { ok: false },
    metadata: {},
  };

  if (report.env.present) {
    addCheck(report, "env-file", "pass", "benchmark env file is present");
  } else {
    addCheck(report, "env-file", "fail", `${envFile} is missing`);
  }

  const missingVars = REQUIRED_VARS.filter((name) => !env[name]);
  if (missingVars.length > 0) {
    addCheck(report, "required-vars", "fail", `missing required variables: ${missingVars.join(", ")}`);
  } else {
    addCheck(report, "required-vars", "pass", "required live launch variables are present");
  }

  const providers = new Set();
  const invalidProviders = [];
  for (const name of PROVIDER_VARS) {
    if (!env[name]) continue;
    const provider = env[name].toLowerCase();
    if (!VALID_PROVIDERS.has(provider)) {
      invalidProviders.push(name);
      continue;
    }
    providers.add(provider);
  }

  if (invalidProviders.length > 0) {
    addCheck(
      report,
      "cloud-providers",
      "fail",
      `unsupported cloud provider variables: ${invalidProviders.join(", ")}`,
    );
  } else if (providers.size > 0) {
    addCheck(report, "cloud-providers", "pass", `declared cloud providers: ${[...providers].sort().join(", ")}`);
  }

  for (const provider of [...providers].sort()) {
    const command = providerCommand(provider, env);
    if (commandExists(command)) {
      addCheck(report, `${provider}-command`, "pass", `${command} command is available`);
    } else {
      addCheck(report, `${provider}-command`, "fail", `${command} command not found for ${provider}`);
    }
  }

  const dockerCommand = env.BENCHMARK_DOCKER_COMMAND || "docker";
  if (commandExists(dockerCommand)) {
    addCheck(report, "docker-command", "pass", `${dockerCommand} command is available`);
  } else if (booleanEnv(env.BENCHMARK_REQUIRE_DOCKER)) {
    addCheck(report, "docker-command", "fail", `${dockerCommand} command not found for required compose validation`);
  } else {
    addCheck(report, "docker-command", "warn", `${dockerCommand} command not found; Docker compose validation unavailable`);
  }

  const preflight = runPreflight(env);
  if (preflight.ok) {
    report.preflight = { ok: true };
    report.metadata = { path: preflight.result.metadata };
    addCheck(report, "preflight", "pass", "benchmark:preflight passed");
  } else {
    report.preflight = { ok: false };
    addCheck(report, "preflight", "fail", `benchmark:preflight failed: ${preflight.error}`);
  }

  if (report.blockers.length === 0) {
    report.doctor = "ok";
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.blockers.length === 0 ? 0 : 1);
}

main();
