# AI Agent Survivor Runtime Runbook

This is the readiness checklist for running the GM plus four Discord-backed agents this week. Keep real secrets in `packages/infra/.env` or your shell only; never commit populated credentials.

## Required Credentials

The Docker stack maps these operator-facing variables into the GM and agent containers:

| Process | Required variables |
| --- | --- |
| GM bot | `GUILD_ID`, `GM_DISCORD_TOKEN` |
| Alpha agent | `GUILD_ID`, `AGENT_ALPHA_DISCORD_TOKEN`, `AGENT_ALPHA_DISCORD_BOT_ID`, `AGENT_ALPHA_LLM_API_KEY` |
| Bravo agent | `GUILD_ID`, `AGENT_BRAVO_DISCORD_TOKEN`, `AGENT_BRAVO_DISCORD_BOT_ID`, `AGENT_BRAVO_LLM_API_KEY` |
| Charlie agent | `GUILD_ID`, `AGENT_CHARLIE_DISCORD_TOKEN`, `AGENT_CHARLIE_DISCORD_BOT_ID`, `AGENT_CHARLIE_LLM_API_KEY` |
| Delta agent | `GUILD_ID`, `AGENT_DELTA_DISCORD_TOKEN`, `AGENT_DELTA_DISCORD_BOT_ID`, `AGENT_DELTA_LLM_API_KEY` |

Optional runtime variables:

| Area | Variables |
| --- | --- |
| Agent LLM selection | `LLM_PROVIDER`, `AGENT_ALPHA_LLM_MODEL`, `AGENT_BRAVO_LLM_MODEL`, `AGENT_CHARLIE_LLM_MODEL`, `AGENT_DELTA_LLM_MODEL` |
| GM narration | `NARRATOR_API_KEY`, `NARRATOR_MODEL` |
| Mail | `GM_MAIL_PASS`, `AGENT_ALPHA_MAIL_USER`, `AGENT_ALPHA_MAIL_PASS`, `AGENT_BRAVO_MAIL_USER`, `AGENT_BRAVO_MAIL_PASS`, `AGENT_CHARLIE_MAIL_USER`, `AGENT_CHARLIE_MAIL_PASS`, `AGENT_DELTA_MAIL_USER`, `AGENT_DELTA_MAIL_PASS` |
| Local benchmark | `BENCHMARK_RUNTIME_DIR`, `SURVIVOR_RUN_ID`, `GAME_DATA_PORT`, `OPENCLAW_DISCORD_TARGET`, `MAX_LOG_AGE_SECONDS`, `MAX_HEALTH_AGE_SECONDS` |

Use `.env.example` as the non-secret template:

```sh
cd packages/infra
cp .env.example .env
$EDITOR .env
```

## Preflight Checklist

- Discord server has the `#gm-admin`, `#announcements`, `#arena`, `#agent-chat`, `#scoreboard`, `#integrity-log`, and `#spectator-lounge` channels.
- The GM bot and each agent bot are installed in the Discord server named by `GUILD_ID`.
- `GM_DISCORD_TOKEN`, `AGENT_ALPHA_DISCORD_TOKEN`, `AGENT_BRAVO_DISCORD_TOKEN`, `AGENT_CHARLIE_DISCORD_TOKEN`, and `AGENT_DELTA_DISCORD_TOKEN` are different bot tokens.
- `AGENT_ALPHA_DISCORD_BOT_ID`, `AGENT_BRAVO_DISCORD_BOT_ID`, `AGENT_CHARLIE_DISCORD_BOT_ID`, and `AGENT_DELTA_DISCORD_BOT_ID` are the non-secret Discord user IDs for the four agent bots.
- `AGENT_ALPHA_LLM_API_KEY`, `AGENT_BRAVO_LLM_API_KEY`, `AGENT_CHARLIE_LLM_API_KEY`, and `AGENT_DELTA_LLM_API_KEY` are filled with provider-compatible keys.
- `LLM_PROVIDER` matches the agent keys. The current agent code supports `anthropic` and `openai`; default is `anthropic`.
- Optional mail variables are either intentionally blank for local mail defaults or filled consistently.
- Optional narrator variables are either blank or point at a valid narration provider key/model.
- Local dependencies are installed with `bun install`.
- Docker validation requires Docker installed and a working `docker compose` command.

## Known-Fair Cloud Agent Setup

Use this contract for an OpenClaw/Hermes-supervised public run:

- Keep the canonical roster fixed for the full 10 days: `agent-alpha`, `agent-bravo`, `agent-charlie`, and `agent-delta`.
- Run each roster seat as a separate Discord bot token and Discord bot user ID. Do not reuse a token or bot ID across seats.
- Give each seat its own LLM API key and model override. Record the chosen provider/model before `!season setup`, then keep it unchanged until the run ends.
- Keep each seat's memory database and workspace isolated. The local runtime scripts already write separate `agent-*-memory.db` files and `workspaces/agent-*` directories.
- Use OpenClaw or Hermes for operator supervision and watchdog execution, not for changing an agent's roster ID after launch.
- Treat any mid-run credential, model, prompt, or code change as a new benchmark run unless it is disclosed in the final results.

## Local Non-Docker Setup

Use the local path to prove the season database and protocol handler are ready before launching Discord bots.

```sh
bun install
bun --filter @survivor/gm-bot season setup
AGENT_ID=agent-alpha bun --filter @survivor/agent-template local:smoke
```

Run the local smoke once for each roster agent when changing agent protocol behavior:

```sh
AGENT_ID=agent-bravo bun --filter @survivor/agent-template local:smoke
AGENT_ID=agent-charlie bun --filter @survivor/agent-template local:smoke
AGENT_ID=agent-delta bun --filter @survivor/agent-template local:smoke
```

Expected result: the GM setup prints a bootstrapped roster and `Started season: phase=active day=1`; each smoke command emits an `[AGENT:...]` protocol response. If `AGENT_ID` is blank or outside `agent-alpha`, `agent-bravo`, `agent-charlie`, `agent-delta`, the local runner exits non-zero with a clear error.

## Docker Stack Launch

After `packages/infra/.env` contains real values:

```sh
cd packages/infra
docker compose --env-file .env up --build
```

Useful checks while the stack is running:

```sh
docker compose --env-file .env ps
docker compose --env-file .env logs gm-bot
docker compose --env-file .env logs agent-alpha
```

To stop the stack:

```sh
docker compose --env-file .env down
```

The stack starts one GM bot, four agent-template containers, local mail, local calendar, and an nginx game-data feed. `docker compose` commands require Docker installed; in environments without Docker, use the local non-Docker smoke path and skip compose validation.

## Local Mac Runtime Supervision (10-day benchmark)

Use infra scripts to run the local game-data feed, the GM, and four local agent processes under Bun workspaces:

```sh
cd packages/infra
bun run benchmark:start
bun run benchmark:status
bun run benchmark:stop
```

`benchmark:start` builds the workspace, maps the runbook credentials into each local process (`GM_DISCORD_TOKEN` → GM `DISCORD_TOKEN`, per-agent Discord/LLM keys → agent `DISCORD_TOKEN`/`LLM_API_KEY`), starts a local `/tasks` and `/market-feed` server on `GAME_DATA_PORT`, and writes PID, log, heartbeat, and status files under `BENCHMARK_RUNTIME_DIR` (default: `packages/infra/.runtime/discord-benchmark`). `benchmark:status` emits JSON status suitable for OpenClaw ingestion.

Run watchdog once (or from cron) to restart missing/stale processes:

```sh
cd packages/infra
bun run benchmark:watchdog
```

Hourly cron example for local Mac runtime supervision:

```cron
0 * * * * cd /Users/future/dev/ai-agent-survivor/packages/infra && bun run benchmark:watchdog >> .runtime/discord-benchmark/watchdog.log 2>&1
```

OpenClaw hourly watchdog example:

```sh
openclaw cron add \
  --every 1h \
  --message "cd /Users/future/dev/ai-agent-survivor/packages/infra && bun run benchmark:watchdog" \
  --announce \
  --to "${OPENCLAW_DISCORD_TARGET}"
```

Use `MAX_LOG_AGE_SECONDS` and `MAX_HEALTH_AGE_SECONDS` in `.env` to tune stale detection; watchdog restarts processes if PID is missing/dead, if logs are stale, or if a process-provided heartbeat marker exists and is stale. `benchmark:watchdog --check-only` reports restart decisions without stopping or starting processes.

## Discord Admin Commands

Send these in `#gm-admin`:

```text
!season help
!season status
!season bootstrap
!season start
!season setup
!season health
!season ops
!season adjudicate <taskId> <agentId> pass|fail [note]
```

Use `!season setup` for the normal launch path: it bootstraps the deterministic four-agent roster and starts Day 1. Use `!season status` immediately after launch to verify phase, day, and active agent counts. Use `!season health` during the run to inspect stale heartbeats, scheduler runs, pending canaries, and recent errors.

## Fail Loud Expectations

Blank credentials must fail loud instead of silently starting a broken game:

- GM runtime exits non-zero when `DISCORD_TOKEN` or `GUILD_ID` is blank. In compose, `DISCORD_TOKEN` comes from `GM_DISCORD_TOKEN`.
- Agent runtime exits non-zero when `DISCORD_TOKEN`, `GUILD_ID`, or `AGENT_ID` is blank. In compose, each agent `DISCORD_TOKEN` comes from its matching `AGENT_*_DISCORD_TOKEN`.
- Agent LLM initialization throws `LLM_API_KEY is required` when the per-agent LLM key is blank.
- Local agent smoke exits non-zero if `AGENT_ID` is missing or not one of the four supported roster IDs.
- Treat repeated Discord login failures, missing channel errors, or empty LLM key errors as launch blockers, not warnings.

## Readiness Gate

Before the live dry run:

```sh
bun --filter @survivor/infra test
bun run test
```

Use `bun run test` instead of raw `bun test`; the configured script routes GM tests through Node so `better-sqlite3` loads correctly.

Proceed only when static readiness tests pass, local smoke succeeds for at least `agent-alpha`, Docker compose starts with real credentials, and `!season status` in `#gm-admin` reports the expected active Day 1 season.
