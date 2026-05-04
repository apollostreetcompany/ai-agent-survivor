import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const infraRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(infraRoot, "../..");
const scriptsDir = resolve(infraRoot, "scripts");
const sharedDefaultRosterPath = resolve(repoRoot, "packages/shared/src/default-roster.json");

const scripts = {
  start: resolve(scriptsDir, "benchmark-start.sh"),
  stop: resolve(scriptsDir, "benchmark-stop.sh"),
  status: resolve(scriptsDir, "benchmark-status.sh"),
  watchdog: resolve(scriptsDir, "benchmark-watchdog.sh"),
};

function run(scriptPath, args = [], { runtimeDir, envFile = resolve(infraRoot, ".env.test.missing"), env = {} } = {}) {
  const childEnv = {
    ...process.env,
    BENCHMARK_ENV_FILE: envFile,
    ...env,
  };
  if (runtimeDir) {
    childEnv.BENCHMARK_RUNTIME_DIR = runtimeDir;
  }

  return execFileSync(scriptPath, args, {
    encoding: "utf8",
    env: childEnv,
  });
}

function defaultRosterAgentIds() {
  const roster = JSON.parse(readFileSync(sharedDefaultRosterPath, "utf8"));
  return roster.map((agent) => agent.id);
}

function expectedRuntimeProcesses() {
  return ["game-data", "gm-bot", ...defaultRosterAgentIds()];
}

test("runtime supervision scripts exist and output process JSON without credentials", () => {
  const runtimeDir = mkdtempSync(resolve(tmpdir(), "infra-runtime-"));
  const expectedProcessCount = expectedRuntimeProcesses().length;

  try {
    const start = JSON.parse(run(scripts.start, ["--dry-run"], { runtimeDir }));
    assert.equal(start.processes.length, expectedProcessCount);
    assert.equal(start.healthy, false);

    const status = JSON.parse(run(scripts.status, [], { runtimeDir }));
    assert.equal(status.processes.length, expectedProcessCount);
    assert.equal(status.processes.every((process) => typeof process.name === "string"), true);

    const stop = JSON.parse(run(scripts.stop, [], { runtimeDir }));
    assert.equal(stop.processes.length, expectedProcessCount);
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("watchdog marks dead pid files for restart in check-only mode", () => {
  const runtimeDir = mkdtempSync(resolve(tmpdir(), "infra-watchdog-"));

  try {
    const pidsDir = resolve(runtimeDir, "pids");
    const logsDir = resolve(runtimeDir, "logs");
    const healthDir = resolve(runtimeDir, "health");

    mkdirSync(pidsDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });
    mkdirSync(healthDir, { recursive: true });

    for (const process of expectedRuntimeProcesses()) {
      writeFileSync(resolve(pidsDir, `${process}.pid`), "999999\n");
      writeFileSync(resolve(logsDir, `${process}.log`), "");
      writeFileSync(resolve(healthDir, `${process}.heartbeat`), "");
    }

    run(scripts.watchdog, ["--check-only"], { runtimeDir });

    const events = readFileSync(resolve(runtimeDir, "events.jsonl"), "utf8");
    assert.match(events, /"action":"watchdog_detected"/);
    for (const process of expectedRuntimeProcesses()) {
      assert.match(events, new RegExp(`"process":"${process}"`));
    }
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("scripts map runbook credentials into workspace dev commands", () => {
  const common = readFileSync(resolve(scriptsDir, "benchmark-common.sh"), "utf8");

  assert.match(common, /DISCORD_TOKEN="\$\{GM_DISCORD_TOKEN:-\}"/);
  assert.match(common, /AGENT_ALPHA_DISCORD_BOT_ID="\$\{AGENT_ALPHA_DISCORD_BOT_ID:-\}"/);
  assert.match(common, /DISCORD_TOKEN="\$\{AGENT_ALPHA_DISCORD_TOKEN:-\}"/);
  assert.match(common, /LLM_API_KEY="\$\{AGENT_ALPHA_LLM_API_KEY:-\}"/);
  assert.match(common, /node packages\/infra\/scripts\/game-data-server\.mjs/);
  assert.match(common, /SURVIVOR_HEALTH_FILE="\$\{BENCHMARK_RUNTIME_DIR\}\/health\/agent-alpha\.heartbeat"/);
  assert.match(common, /bun --filter @survivor\/gm-bot start/);
  assert.match(common, /bun --filter @survivor\/agent-template start/);
});

test("env file runtime directory is honored by status script", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-env-runtime-"));
  const runtimeDir = resolve(tempRoot, "from-env");
  const envFile = resolve(tempRoot, ".env");
  const expectedProcessCount = expectedRuntimeProcesses().length;

  try {
    writeFileSync(envFile, `BENCHMARK_RUNTIME_DIR=${runtimeDir}\n`);

    const status = JSON.parse(run(scripts.status, [], { envFile }));
    assert.equal(status.runtimeDir, runtimeDir);
    assert.equal(status.processes.length, expectedProcessCount);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("watchdog check-only mode does not kill stale running processes", () => {
  const runtimeDir = mkdtempSync(resolve(tmpdir(), "infra-watchdog-running-"));
  const sleeper = spawn("sleep", ["30"], { stdio: "ignore" });

  try {
    const pidsDir = resolve(runtimeDir, "pids");
    const logsDir = resolve(runtimeDir, "logs");
    mkdirSync(pidsDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });

    writeFileSync(resolve(pidsDir, "gm-bot.pid"), `${sleeper.pid}\n`);
    const logFile = resolve(logsDir, "gm-bot.log");
    writeFileSync(logFile, "");
    const old = new Date(Date.now() - 60_000);
    utimesSync(logFile, old, old);

    run(scripts.watchdog, ["--check-only"], {
      runtimeDir,
      env: {
        MAX_LOG_AGE_SECONDS: "1",
      },
    });

    assert.doesNotThrow(() => process.kill(sleeper.pid, 0));
    const events = readFileSync(resolve(runtimeDir, "events.jsonl"), "utf8");
    assert.match(events, /"process":"gm-bot"/);
    assert.match(events, /log stale/);
  } finally {
    try {
      process.kill(sleeper.pid, "SIGKILL");
    } catch {
      // Already exited.
    }
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
