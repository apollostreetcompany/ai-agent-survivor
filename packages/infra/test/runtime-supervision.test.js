import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const infraRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(infraRoot, "../..");
const scriptsDir = resolve(infraRoot, "scripts");
const sharedDefaultRosterPath = resolve(repoRoot, "packages/shared/src/default-roster.json");
const requiredDiscordChannels = [
  "announcements",
  "arena",
  "agent-chat",
  "scoreboard",
  "integrity-log",
  "spectator-lounge",
  "gm-admin",
];

const scripts = {
  preflight: resolve(scriptsDir, "benchmark-preflight.sh"),
  start: resolve(scriptsDir, "benchmark-start.sh"),
  stop: resolve(scriptsDir, "benchmark-stop.sh"),
  status: resolve(scriptsDir, "benchmark-status.sh"),
  watchdog: resolve(scriptsDir, "benchmark-watchdog.sh"),
  doctor: resolve(scriptsDir, "benchmark-doctor.mjs"),
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

async function runResult(scriptPath, args = [], { runtimeDir, envFile = resolve(infraRoot, ".env.test.missing"), env = {} } = {}) {
  const childEnv = {
    ...process.env,
    BENCHMARK_ENV_FILE: envFile,
    ...env,
  };
  if (runtimeDir) {
    childEnv.BENCHMARK_RUNTIME_DIR = runtimeDir;
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(scriptPath, args, {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

async function runPreflight({ runtimeDir, envFile, env = {} } = {}) {
  const result = await runResult(scripts.preflight, [], { runtimeDir, envFile, env });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `preflight exited ${result.status}`);
  }
  return result.stdout;
}

function defaultRosterAgentIds() {
  const roster = JSON.parse(readFileSync(sharedDefaultRosterPath, "utf8"));
  return roster.map((agent) => agent.id);
}

function runDoctor({ runtimeDir, envFile, env = {} } = {}) {
  const childEnv = {
    ...process.env,
    BENCHMARK_ENV_FILE: envFile,
    ...env,
  };
  if (runtimeDir) {
    childEnv.BENCHMARK_RUNTIME_DIR = runtimeDir;
  }

  return spawnSync(scripts.doctor, {
    encoding: "utf8",
    env: childEnv,
  });
}

async function runDoctorAsync({ runtimeDir, envFile, env = {} } = {}) {
  return await runResult(scripts.doctor, [], { runtimeDir, envFile, env });
}

function expectedRuntimeProcesses() {
  return ["game-data", "gm-bot", ...defaultRosterAgentIds()];
}

function writeExecutable(path, content) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function writeValidBenchmarkEnv(path, overrides = {}) {
  const values = {
    GUILD_ID: "guild-123",
    GM_DISCORD_TOKEN: "gm-token",
    GM_DISCORD_BOT_ID: "gm-discord-bot",
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
    Object.entries(values).map(([key, value]) => `${key}=${shellEnvValue(value)}`).join("\n"),
  );
}

function shellEnvValue(value) {
  const stringValue = String(value);
  if (/^[A-Za-z0-9_./:@-]+$/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function withDiscordChannelServer(channelNames, callback) {
  const channels = channelNames.map((name, index) => ({
    id: String(index + 1),
    type: 0,
    name,
  }));
  const server = createServer((req, res) => {
    if (req.url === "/guilds/guild-123/channels") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(channels));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
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

test("benchmark preflight rejects duplicate GM and agent Discord bot user IDs", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-preflight-duplicate-gm-id-"));
  const envFile = resolve(tempRoot, ".env");

  try {
    writeValidBenchmarkEnv(envFile, {
      AGENT_ALPHA_DISCORD_BOT_ID: "gm-discord-bot",
    });

    assert.throws(
      () => run(scripts.preflight, [], { envFile }),
      /Discord bot user IDs must be unique/,
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

test("benchmark preflight rejects Discord servers missing required channels", async () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-preflight-discord-channels-"));
  const envFile = resolve(tempRoot, ".env");

  try {
    await withDiscordChannelServer(["gm-admin", "arena"], async (discordApiBase) => {
      writeValidBenchmarkEnv(envFile, {
        BENCHMARK_DISCORD_API_BASE: discordApiBase,
      });

      await assert.rejects(
        () => runPreflight({ envFile }),
        /Missing required Discord channels: announcements/,
      );
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark doctor fails when packages/infra/.env is missing", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-doctor-missing-env-"));
  const envFile = resolve(tempRoot, ".env");

  try {
    const doctor = runDoctor({ envFile });
    assert.notEqual(doctor.status, 0);

    const report = JSON.parse(doctor.stdout);
    assert.equal(report.doctor, "blocked");
    assert.equal(report.env.present, false);
    assert.equal(report.checks.some((check) => check.id === "env-file" && check.status === "fail"), true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark doctor fails when required docker command is missing", async () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-doctor-missing-docker-"));
  const envFile = resolve(tempRoot, ".env");
  const runtimeDir = resolve(tempRoot, "runtime");
  const openclawSeatsScript = resolve(tempRoot, "openclaw-seats.sh");
  const hermesSeatsScript = resolve(tempRoot, "hermes-seats.sh");

  try {
    writeExecutable(openclawSeatsScript, "#!/bin/sh\nprintf 'openclaw-alpha\\nopenclaw-bravo\\n'\n");
    writeExecutable(hermesSeatsScript, "#!/bin/sh\nprintf 'hermes-charlie\\nhermes-delta\\n'\n");

    await withDiscordChannelServer(requiredDiscordChannels, async (discordApiBase) => {
      writeValidBenchmarkEnv(envFile, {
        BENCHMARK_REQUIRE_DOCKER: "1",
        BENCHMARK_DOCKER_COMMAND: "docker-does-not-exist",
        BENCHMARK_OPENCLAW_COMMAND: "sh",
        BENCHMARK_HERMES_COMMAND: "sh",
        BENCHMARK_OPENCLAW_SEATS_COMMAND: openclawSeatsScript,
        BENCHMARK_HERMES_SEATS_COMMAND: hermesSeatsScript,
        BENCHMARK_DISCORD_API_BASE: discordApiBase,
      });

      const doctor = await runDoctorAsync({ envFile, runtimeDir });
      assert.notEqual(doctor.status, 0);

      const report = JSON.parse(doctor.stdout);
      assert.equal(report.checks.some((check) => check.id === "docker-command" && check.status === "fail"), true);
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark doctor validates OpenClaw/Hermes command availability from env", async () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-doctor-provider-check-"));
  const envFile = resolve(tempRoot, ".env");
  const runtimeDir = resolve(tempRoot, "runtime");
  const openclawSeatsScript = resolve(tempRoot, "openclaw-seats.sh");

  try {
    writeExecutable(openclawSeatsScript, "#!/bin/sh\nprintf 'openclaw-alpha\\nopenclaw-bravo\\n'\n");

    await withDiscordChannelServer(requiredDiscordChannels, async (discordApiBase) => {
      writeValidBenchmarkEnv(envFile, {
        BENCHMARK_OPENCLAW_COMMAND: "sh",
        BENCHMARK_HERMES_COMMAND: "hermes-does-not-exist",
        BENCHMARK_OPENCLAW_SEATS_COMMAND: openclawSeatsScript,
        BENCHMARK_DISCORD_API_BASE: discordApiBase,
      });

      const doctor = await runDoctorAsync({ envFile, runtimeDir });
      assert.notEqual(doctor.status, 0);

      const report = JSON.parse(doctor.stdout);
      assert.equal(report.checks.some((check) => check.id === "openclaw-command" && check.status === "pass"), true);
      assert.equal(report.checks.some((check) => check.id === "openclaw-seats" && check.status === "pass"), true);
      assert.equal(report.checks.some((check) => check.id === "hermes-command" && check.status === "fail"), true);
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark doctor fails when declared seat IDs are not in provider command output", async () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-doctor-seat-mismatch-"));
  const envFile = resolve(tempRoot, ".env");
  const runtimeDir = resolve(tempRoot, "runtime");
  const openclawSeatsScript = resolve(tempRoot, "openclaw-seats.sh");
  const hermesSeatsScript = resolve(tempRoot, "hermes-seats.sh");

  try {
    writeExecutable(openclawSeatsScript, "#!/bin/sh\nprintf 'openclaw-alpha\\n'\n");
    writeExecutable(hermesSeatsScript, "#!/bin/sh\nprintf 'hermes-charlie\\nhermes-delta\\n'\n");

    await withDiscordChannelServer(requiredDiscordChannels, async (discordApiBase) => {
      writeValidBenchmarkEnv(envFile, {
        BENCHMARK_OPENCLAW_COMMAND: "sh",
        BENCHMARK_HERMES_COMMAND: "sh",
        BENCHMARK_OPENCLAW_SEATS_COMMAND: openclawSeatsScript,
        BENCHMARK_HERMES_SEATS_COMMAND: hermesSeatsScript,
        BENCHMARK_DISCORD_API_BASE: discordApiBase,
      });

      const doctor = await runDoctorAsync({ envFile, runtimeDir });
      assert.notEqual(doctor.status, 0);

      const report = JSON.parse(doctor.stdout);
      assert.equal(report.checks.some((check) => check.id === "openclaw-seats" && check.status === "fail"), true);
      assert.equal(report.checks.some((check) => check.id === "hermes-seats" && check.status === "pass"), true);
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark doctor accepts seat IDs from temp fake seat command files", async () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-doctor-seat-fake-command-"));
  const envFile = resolve(tempRoot, ".env");
  const runtimeDir = resolve(tempRoot, "runtime");
  const openclawSeatsScript = resolve(tempRoot, "openclaw-seats.sh");
  const hermesSeatsScript = resolve(tempRoot, "hermes-seats.sh");

  try {
    writeExecutable(openclawSeatsScript, "#!/bin/sh\nprintf 'openclaw-alpha\\nopenclaw-bravo\\n'\n");
    writeExecutable(hermesSeatsScript, "#!/bin/sh\nprintf 'hermes-charlie\\nhermes-delta\\n'\n");

    await withDiscordChannelServer(requiredDiscordChannels, async (discordApiBase) => {
      writeValidBenchmarkEnv(envFile, {
        BENCHMARK_OPENCLAW_COMMAND: "sh",
        BENCHMARK_HERMES_COMMAND: "sh",
        BENCHMARK_OPENCLAW_SEATS_COMMAND: openclawSeatsScript,
        BENCHMARK_HERMES_SEATS_COMMAND: hermesSeatsScript,
        BENCHMARK_DISCORD_API_BASE: discordApiBase,
      });

      const doctor = await runDoctorAsync({ envFile, runtimeDir });
      assert.equal(doctor.status, 0);

      const report = JSON.parse(doctor.stdout);
      assert.equal(report.checks.some((check) => check.id === "openclaw-seats" && check.status === "pass"), true);
      assert.equal(report.checks.some((check) => check.id === "hermes-seats" && check.status === "pass"), true);
      assert.equal(report.doctor, "ok");
      assert.equal(report.preflight.ok, true);
      assert.equal(report.metadata.path, resolve(runtimeDir, "run-metadata.json"));
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark doctor integrates preflight and never prints secret values", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-doctor-preflight-"));
  const envFile = resolve(tempRoot, ".env");
  const runtimeDir = resolve(tempRoot, "runtime");
  const openclawSeatsScript = resolve(tempRoot, "openclaw-seats.sh");
  const hermesSeatsScript = resolve(tempRoot, "hermes-seats.sh");

  try {
    writeExecutable(openclawSeatsScript, "#!/bin/sh\nprintf 'openclaw-alpha\\nopenclaw-bravo\\n'\n");
    writeExecutable(hermesSeatsScript, "#!/bin/sh\nprintf 'hermes-charlie\\nhermes-delta\\n'\n");

    writeValidBenchmarkEnv(envFile, {
      AGENT_DELTA_DISCORD_TOKEN: "alpha-discord-token",
      BENCHMARK_OPENCLAW_COMMAND: "sh",
      BENCHMARK_HERMES_COMMAND: "sh",
      BENCHMARK_OPENCLAW_SEATS_COMMAND: openclawSeatsScript,
      BENCHMARK_HERMES_SEATS_COMMAND: hermesSeatsScript,
    });

    const doctor = runDoctor({ envFile, runtimeDir });
    assert.notEqual(doctor.status, 0);
    assert.equal(doctor.stdout.includes("alpha-discord-token"), false);
    assert.equal(doctor.stdout.includes("alpha-llm-key"), false);

    const report = JSON.parse(doctor.stdout);
    assert.equal(report.preflight.ok, false);
    assert.equal(report.checks.some((check) => check.id === "preflight" && check.status === "fail"), true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("benchmark preflight passes with complete known-fair launch credentials", async () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-preflight-ok-"));
  const envFile = resolve(tempRoot, ".env");
  const runtimeDir = resolve(tempRoot, "runtime");

  try {
    await withDiscordChannelServer(requiredDiscordChannels, async (discordApiBase) => {
      writeValidBenchmarkEnv(envFile, {
        BENCHMARK_DISCORD_API_BASE: discordApiBase,
      });

      const result = JSON.parse(await runPreflight({ envFile, runtimeDir }));
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
      assert.equal(metadata.discord.gmBotId, "gm-discord-bot");
      assert.equal(metadata.fairnessContract.gmDiscordAuthorBindingRequired, true);
      assert.equal(metadata.agents[0].llmProvider, "anthropic");
      assert.equal(metadata.agents[0].llmModel, "claude-alpha");
      assert.equal(metadata.supervision.watchdog.supervisor, "openclaw");
      assert.equal(metadata.supervision.watchdog.cadence, "1h");
      const serialized = JSON.stringify(metadata);
      assert.equal(serialized.includes("alpha-discord-token"), false);
      assert.equal(serialized.includes("alpha-llm-key"), false);
    });
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
  assert.match(common, /GM_DISCORD_BOT_ID="\$\{GM_DISCORD_BOT_ID:-\}"/);
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
    assert.match(events, /heartbeat missing/);
  } finally {
    try {
      process.kill(sleeper.pid, "SIGKILL");
    } catch {
      // Already exited.
    }
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("watchdog supports stat fallback for Linux-style file mtime checks", () => {
  const runtimeDir = mkdtempSync(resolve(tmpdir(), "infra-watchdog-stat-fallback-"));
  const tempRoot = mkdtempSync(resolve(tmpdir(), "infra-watchdog-stat-bin-"));
  const fakeBin = resolve(tempRoot, "bin");
  const sleeper = spawn("sleep", ["30"], { stdio: "ignore" });

  try {
    const pidsDir = resolve(runtimeDir, "pids");
    const logsDir = resolve(runtimeDir, "logs");
    mkdirSync(pidsDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });

    for (const processName of expectedRuntimeProcesses()) {
      writeFileSync(resolve(pidsDir, `${processName}.pid`), "999999\n");
      writeFileSync(resolve(logsDir, `${processName}.log`), "\n");
    }

    writeFileSync(resolve(pidsDir, "gm-bot.pid"), `${sleeper.pid}\n`);
    const gmLog = resolve(logsDir, "gm-bot.log");
    const old = new Date(Date.now() - 60_000);
    utimesSync(gmLog, old, old);

    const fakeStatPath = resolve(fakeBin, "stat");
    writeExecutable(
      fakeStatPath,
      "#!/bin/sh\nif [ \"$1\" = \"-f\" ]; then\n  exit 1\nfi\nif [ \"$1\" = \"-c\" ] && [ \"$2\" = \"%Y\" ]; then\n  date -r \"$3\" +%s\n  exit 0\nfi\nexit 1\n",
    );

    run(scripts.watchdog, ["--check-only"], {
      runtimeDir,
      env: {
        MAX_LOG_AGE_SECONDS: "1",
        PATH: `${fakeBin}:${process.env.PATH}`,
      },
    });

    const events = readFileSync(resolve(runtimeDir, "events.jsonl"), "utf8");
    assert.match(events, /"process":"gm-bot"/);
    assert.match(events, /heartbeat missing/);
  } finally {
    try {
      process.kill(sleeper.pid, "SIGKILL");
    } catch {
      // Already exited.
    }
    rmSync(runtimeDir, { recursive: true, force: true });
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
