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
  preflight: resolve(scriptsDir, "benchmark-preflight.sh"),
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

function writeValidBenchmarkEnv(path, overrides = {}) {
  const values = {
    GUILD_ID: "guild-123",
    GM_DISCORD_TOKEN: "gm-token",
    AGENT_ALPHA_DISCORD_TOKEN: "alpha-discord-token",
    AGENT_BRAVO_DISCORD_TOKEN: "bravo-discord-token",
    AGENT_CHARLIE_DISCORD_TOKEN: "charlie-discord-token",
    AGENT_DELTA_DISCORD_TOKEN: "delta-discord-token",
    AGENT_ALPHA_DISCORD_BOT_ID: "alpha-discord-bot",
    AGENT_BRAVO_DISCORD_BOT_ID: "bravo-discord-bot",
    AGENT_CHARLIE_DISCORD_BOT_ID: "charlie-discord-bot",
    AGENT_DELTA_DISCORD_BOT_ID: "delta-discord-bot",
    LLM_PROVIDER: "anthropic",
    BENCHMARK_WATCHDOG_SUPERVISOR: "openclaw",
    AGENT_ALPHA_CLOUD_SEAT_PROVIDER: "openclaw",
    AGENT_BRAVO_CLOUD_SEAT_PROVIDER: "openclaw",
    AGENT_CHARLIE_CLOUD_SEAT_PROVIDER: "hermes",
    AGENT_DELTA_CLOUD_SEAT_PROVIDER: "hermes",
    AGENT_ALPHA_CLOUD_SEAT_ID: "openclaw-alpha",
    AGENT_BRAVO_CLOUD_SEAT_ID: "openclaw-bravo",
    AGENT_CHARLIE_CLOUD_SEAT_ID: "hermes-charlie",
    AGENT_DELTA_CLOUD_SEAT_ID: "hermes-delta",
    AGENT_ALPHA_LLM_API_KEY: "alpha-llm-key",
    AGENT_BRAVO_LLM_API_KEY: "bravo-llm-key",
    AGENT_CHARLIE_LLM_API_KEY: "charlie-llm-key",
    AGENT_DELTA_LLM_API_KEY: "delta-llm-key",
    AGENT_ALPHA_LLM_MODEL: "claude-alpha",
    AGENT_BRAVO_LLM_MODEL: "claude-bravo",
    AGENT_CHARLIE_LLM_MODEL: "claude-charlie",
    AGENT_DELTA_LLM_MODEL: "claude-delta",
    OPENCLAW_DISCORD_TARGET: "discord-target",
    ...overrides,
  };

  writeFileSync(
    path,
    Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n"),
  );
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

test("benchmark preflight fails before launch when required credentials are missing", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-preflight-missing-"));
  const envFile = resolve(tempRoot, ".env");

  try {
    writeFileSync(envFile, "GUILD_ID=guild-123\n");

    assert.throws(
      () => run(scripts.preflight, [], { envFile }),
      /Missing required launch variables: GM_DISCORD_TOKEN/,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark preflight rejects duplicate identity credentials", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-preflight-duplicate-"));
  const envFile = resolve(tempRoot, ".env");

  try {
    writeValidBenchmarkEnv(envFile, {
      AGENT_DELTA_DISCORD_TOKEN: "alpha-discord-token",
    });

    assert.throws(
      () => run(scripts.preflight, [], { envFile }),
      /Discord bot tokens must be unique/,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark preflight rejects duplicate cloud seat IDs", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-preflight-duplicate-seat-"));
  const envFile = resolve(tempRoot, ".env");

  try {
    writeValidBenchmarkEnv(envFile, {
      AGENT_DELTA_CLOUD_SEAT_ID: "openclaw-alpha",
    });

    assert.throws(
      () => run(scripts.preflight, [], { envFile }),
      /Cloud seat IDs must be unique/,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark preflight rejects undisclosed or unsupported cloud runtimes", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-preflight-runtime-"));
  const envFile = resolve(tempRoot, ".env");

  try {
    writeValidBenchmarkEnv(envFile, {
      AGENT_ALPHA_CLOUD_SEAT_PROVIDER: "local-template",
    });

    assert.throws(
      () => run(scripts.preflight, [], { envFile }),
      /AGENT_ALPHA_CLOUD_SEAT_PROVIDER must be one of: openclaw, hermes/,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark preflight passes with complete known-fair launch credentials", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-preflight-ok-"));
  const envFile = resolve(tempRoot, ".env");
  const runtimeDir = resolve(tempRoot, "runtime");

  try {
    writeValidBenchmarkEnv(envFile);

    const result = JSON.parse(run(scripts.preflight, [], { envFile, runtimeDir }));
    assert.equal(result.preflight, "ok");
    assert.equal(result.agentCount, defaultRosterAgentIds().length);
    assert.equal(result.openclawTarget, "configured");
    assert.equal(result.metadata, resolve(runtimeDir, "run-metadata.json"));

    const metadata = JSON.parse(readFileSync(result.metadata, "utf8"));
    assert.equal(metadata.schemaVersion, 1);
    assert.equal(metadata.runId, "discord-benchmark");
    assert.deepEqual(
      metadata.agents.map((agent) => agent.id),
      defaultRosterAgentIds(),
    );
    assert.deepEqual(
      metadata.agents.map((agent) => agent.cloudSeatProvider),
      ["openclaw", "openclaw", "hermes", "hermes"],
    );
    assert.equal(metadata.agents[0].cloudSeatId, "openclaw-alpha");
    assert.equal(metadata.agents[0].llmProvider, "anthropic");
    assert.equal(metadata.agents[0].llmModel, "claude-alpha");
    assert.equal(metadata.supervision.watchdog.supervisor, "openclaw");
    assert.equal(metadata.supervision.watchdog.cadence, "1h");
    const serialized = JSON.stringify(metadata);
    assert.equal(serialized.includes("alpha-discord-token"), false);
    assert.equal(serialized.includes("alpha-llm-key"), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark start runs credential preflight before launching processes", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-start-preflight-"));
  const envFile = resolve(tempRoot, ".env");
  const runtimeDir = resolve(tempRoot, "runtime");

  try {
    writeFileSync(envFile, "GUILD_ID=guild-123\n");

    assert.throws(
      () => run(scripts.start, [], { envFile, runtimeDir }),
      /Missing required launch variables: GM_DISCORD_TOKEN/,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
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
