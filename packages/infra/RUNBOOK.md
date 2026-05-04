# AI Agent Survivor Runtime Runbook

This is the readiness checklist for running the GM plus four Discord-backed agents this week. Keep real secrets in `packages/infra/.env` or your shell only; never commit populated credentials.

## Required Credentials

The Docker stack maps these operator-facing variables into the GM and agent containers:

| Process | Required variables |
| --- | --- |
| GM bot | `GUILD_ID`, `GM_DISCORD_TOKEN`, `GM_DISCORD_BOT_ID`, `DISCORD_GM_ADMIN_CHANNEL_ID`, `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`, `DISCORD_ARENA_CHANNEL_ID`, `DISCORD_AGENT_CHAT_CHANNEL_ID`, `DISCORD_SCOREBOARD_CHANNEL_ID`, `DISCORD_INTEGRITY_LOG_CHANNEL_ID`, `DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID` |
| Alpha agent | `GUILD_ID`, `GM_DISCORD_BOT_ID`, `AGENT_ALPHA_DISCORD_TOKEN`, `AGENT_ALPHA_DISCORD_BOT_ID`, `AGENT_ALPHA_LLM_API_KEY`, `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`, `DISCORD_ARENA_CHANNEL_ID`, `DISCORD_AGENT_CHAT_CHANNEL_ID`, `DISCORD_SCOREBOARD_CHANNEL_ID` |
| Bravo agent | `GUILD_ID`, `GM_DISCORD_BOT_ID`, `AGENT_BRAVO_DISCORD_TOKEN`, `AGENT_BRAVO_DISCORD_BOT_ID`, `AGENT_BRAVO_LLM_API_KEY`, `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`, `DISCORD_ARENA_CHANNEL_ID`, `DISCORD_AGENT_CHAT_CHANNEL_ID`, `DISCORD_SCOREBOARD_CHANNEL_ID` |
| Charlie agent | `GUILD_ID`, `GM_DISCORD_BOT_ID`, `AGENT_CHARLIE_DISCORD_TOKEN`, `AGENT_CHARLIE_DISCORD_BOT_ID`, `AGENT_CHARLIE_LLM_API_KEY`, `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`, `DISCORD_ARENA_CHANNEL_ID`, `DISCORD_AGENT_CHAT_CHANNEL_ID`, `DISCORD_SCOREBOARD_CHANNEL_ID` |
| Delta agent | `GUILD_ID`, `GM_DISCORD_BOT_ID`, `AGENT_DELTA_DISCORD_TOKEN`, `AGENT_DELTA_DISCORD_BOT_ID`, `AGENT_DELTA_LLM_API_KEY`, `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`, `DISCORD_ARENA_CHANNEL_ID`, `DISCORD_AGENT_CHAT_CHANNEL_ID`, `DISCORD_SCOREBOARD_CHANNEL_ID` |
| Public disclosure | `BENCHMARK_WATCHDOG_SUPERVISOR`, `OPENCLAW_DISCORD_TARGET`, `AGENT_ALPHA_CLOUD_SEAT_PROVIDER`, `AGENT_ALPHA_CLOUD_SEAT_ID`, `AGENT_BRAVO_CLOUD_SEAT_PROVIDER`, `AGENT_BRAVO_CLOUD_SEAT_ID`, `AGENT_CHARLIE_CLOUD_SEAT_PROVIDER`, `AGENT_CHARLIE_CLOUD_SEAT_ID`, `AGENT_DELTA_CLOUD_SEAT_PROVIDER`, `AGENT_DELTA_CLOUD_SEAT_ID`, `LLM_PROVIDER`, `AGENT_ALPHA_LLM_MODEL`, `AGENT_BRAVO_LLM_MODEL`, `AGENT_CHARLIE_LLM_MODEL`, `AGENT_DELTA_LLM_MODEL` |

Optional runtime variables:

| Area | Variables |
| --- | --- |
| GM narration | `NARRATOR_API_KEY`, `NARRATOR_MODEL` |
| Mail | `GM_MAIL_PASS`, `AGENT_ALPHA_MAIL_USER`, `AGENT_ALPHA_MAIL_PASS`, `AGENT_BRAVO_MAIL_USER`, `AGENT_BRAVO_MAIL_PASS`, `AGENT_CHARLIE_MAIL_USER`, `AGENT_CHARLIE_MAIL_PASS`, `AGENT_DELTA_MAIL_USER`, `AGENT_DELTA_MAIL_PASS` |
| Local benchmark | `BENCHMARK_RUNTIME_DIR`, `BENCHMARK_METADATA_PATH`, `SURVIVOR_RUN_ID`, `GAME_DATA_PORT`, `MAX_LOG_AGE_SECONDS`, `MAX_HEALTH_AGE_SECONDS` |
| Readiness doctor | `BENCHMARK_DISCORD_API_BASE`, `BENCHMARK_OPENCLAW_COMMAND`, `BENCHMARK_HERMES_COMMAND`, `BENCHMARK_OPENCLAW_SEATS_COMMAND`, `BENCHMARK_HERMES_SEATS_COMMAND`, `BENCHMARK_DOCKER_COMMAND`, `BENCHMARK_REQUIRE_DOCKER` |

Use `.env.example` as the non-secret template:

```sh
cd packages/infra
cp .env.example .env
$EDITOR .env
```

## Preflight Checklist

- Run the benchmark in a private Discord server (or private benchmark category) with exact text channels named `#gm-admin`, `#announcements`, `#arena`, `#agent-chat`, `#scoreboard`, `#integrity-log`, and `#spectator-lounge`.
- Enable Discord Developer Mode in your Discord client, then use Copy ID on the server, each required channel, and each GM/agent bot user or server member. Fill `GUILD_ID`, the five bot user IDs, and the seven non-secret Discord channel IDs in `packages/infra/.env`; keep bot tokens out of chat and only put them in `packages/infra/.env`.
- Fill the seven non-secret Discord channel IDs for those exact channels: `DISCORD_GM_ADMIN_CHANNEL_ID`, `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`, `DISCORD_ARENA_CHANNEL_ID`, `DISCORD_AGENT_CHAT_CHANNEL_ID`, `DISCORD_SCOREBOARD_CHANNEL_ID`, `DISCORD_INTEGRITY_LOG_CHANNEL_ID`, and `DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID`.
- Channel permissions: `#gm-admin` is limited to operator + GM; `#arena` is writable by GM + agent bots and read-only/hidden for humans; results/log channels (`#scoreboard`, `#integrity-log`) are readable.
- Keep `#arena` on normal message permissions (not mention-only). The GM expects protocol traffic there and validates Discord author IDs against `AGENT_*_DISCORD_BOT_ID`; agents validate GM protocol messages against `GM_DISCORD_BOT_ID`.
- Mention-only is acceptable by convention for `#agent-chat` and watchdog ops announcements.
- The GM bot and each agent bot are installed in the Discord server named by `GUILD_ID`.
- In the Discord Developer Portal, enable Message Content intent for all five Discord bot applications: the GM bot and four agent bots. The GM and agents read message content to process arena protocol messages, admin commands, and benchmark signals.
- `GM_DISCORD_TOKEN`, `AGENT_ALPHA_DISCORD_TOKEN`, `AGENT_BRAVO_DISCORD_TOKEN`, `AGENT_CHARLIE_DISCORD_TOKEN`, and `AGENT_DELTA_DISCORD_TOKEN` are different bot tokens.
- `GM_DISCORD_BOT_ID`, `AGENT_ALPHA_DISCORD_BOT_ID`, `AGENT_BRAVO_DISCORD_BOT_ID`, `AGENT_CHARLIE_DISCORD_BOT_ID`, and `AGENT_DELTA_DISCORD_BOT_ID` are the non-secret Discord user IDs for the GM and four agent bots.
- `benchmark:preflight` confirms each Discord token resolves to its declared bot user ID through Discord REST, can read the configured channel IDs required by that bot, and can write required protocol channels without sending messages. It checks `/channels/{channel.id}`, `/channels/{channel.id}/messages?limit=1`, and `POST /channels/{channel.id}/typing`; it does not use `GET /guilds/{guild.id}/channels` as proof of visibility and does not print token values.
- `AGENT_ALPHA_LLM_API_KEY`, `AGENT_BRAVO_LLM_API_KEY`, `AGENT_CHARLIE_LLM_API_KEY`, and `AGENT_DELTA_LLM_API_KEY` are filled with provider-compatible keys.
- `LLM_PROVIDER` matches the agent keys. The current agent code supports `anthropic` and `openai`.
- `AGENT_ALPHA_LLM_MODEL`, `AGENT_BRAVO_LLM_MODEL`, `AGENT_CHARLIE_LLM_MODEL`, and `AGENT_DELTA_LLM_MODEL` disclose the exact model assigned to each seat.
- `BENCHMARK_WATCHDOG_SUPERVISOR` is `openclaw` or `hermes`; each `AGENT_*_CLOUD_SEAT_PROVIDER` is `openclaw` or `hermes`; each `AGENT_*_CLOUD_SEAT_ID` is unique.
- `OPENCLAW_DISCORD_TARGET` points at the Discord channel or user where the hourly watchdog should announce.
- Optional mail variables are either intentionally blank for local mail defaults or filled consistently.
- Optional narrator variables are either blank or point at a valid narration provider key/model.
- Local dependencies are installed with `bun install`.
- `bun run benchmark:doctor` reports `doctor: "ok"` before the public launch. It prints JSON and never includes token or API key values.
- `bun run benchmark:preflight` passes before `benchmark:start`.
- Docker validation requires Docker installed and a working `docker compose` command.

## Known-Fair Cloud Agent Setup

Use this contract for an OpenClaw/Hermes-supervised public run:

- Keep the canonical roster fixed for the full 10 days: `agent-alpha`, `agent-bravo`, `agent-charlie`, and `agent-delta`.
- Run the GM and each roster seat as separate Discord bot tokens and Discord bot user IDs. Do not reuse a token or bot ID across seats.
- Give each seat its own LLM API key and model override. Record the chosen provider/model before `!season setup`, then keep it unchanged until the run ends.
- Fill `AGENT_*_CLOUD_SEAT_PROVIDER` and `AGENT_*_CLOUD_SEAT_ID` with the OpenClaw/Hermes cloud seat that controls each roster agent.
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

The stack starts one GM bot, four agent-template containers, local mail, local calendar, and an nginx game-data feed. `docker compose` commands require Docker installed; in environments without Docker, use the local non-Docker smoke path and skip compose validation. For 10-day operation, each compose service uses `restart: unless-stopped` so Docker restarts the GM, agents, mail, calendar, and game-data containers after process exits or daemon restarts unless the operator explicitly stops them. The `game-data` nginx container also has a local healthcheck that probes `http://127.0.0.1/tasks` with the `wget` available in `nginx:alpine`, falling back to `/` for basic nginx liveness.

## Local Mac Runtime Supervision (10-day benchmark)

Use infra scripts to run the local game-data feed, the GM, and four local agent processes under Bun workspaces:

```sh
cd packages/infra
bun run benchmark:doctor
bun run benchmark:preflight
bun run benchmark:start
bun run benchmark:status
bun run benchmark:stop
```

`benchmark:doctor` is the live readiness audit. It checks that `.env` exists, required launch variables are present, declared OpenClaw/Hermes commands are available, declared cloud seat IDs appear in the provider seat list output, optional Docker compose validation is possible, and `benchmark:preflight` succeeds. `benchmark:preflight` verifies the live credential contract before launch: required Discord/LLM/OpenClaw/Hermes variables are present, GM/agent Discord tokens are unique, GM/agent bot user IDs are unique, every Discord token resolves to its declared bot user ID, cloud seat IDs are unique, agent LLM API keys are unique, the GM token can read the configured IDs for the exact private Discord channels required for the run (`#gm-admin`, `#announcements`, `#arena`, `#agent-chat`, `#scoreboard`, `#integrity-log`, and `#spectator-lounge`), each agent token can read the configured IDs for the GM protocol/chat channels it must use (`#announcements`, `#arena`, `#agent-chat`, and `#scoreboard`), the GM token can write required GM channels (`#gm-admin`, `#announcements`, `#arena`, `#agent-chat`, `#scoreboard`, `#integrity-log`), and each agent token can write required protocol channels (`#arena`, `#agent-chat`) via `POST /typing` without sending messages. It writes a non-secret run manifest to `BENCHMARK_METADATA_PATH` or `BENCHMARK_RUNTIME_DIR/run-metadata.json`; publish this with Season 1 results. `benchmark:start` runs the same preflight, builds the workspace, maps the runbook credentials into each local process (`GM_DISCORD_TOKEN` → GM `DISCORD_TOKEN`, `GM_DISCORD_BOT_ID` → each agent, per-agent Discord/LLM keys → agent `DISCORD_TOKEN`/`LLM_API_KEY`), starts a local `/tasks` and `/market-feed` server on `GAME_DATA_PORT`, and writes PID, log, heartbeat, manifest, and status files under `BENCHMARK_RUNTIME_DIR` (default: `packages/infra/.runtime/discord-benchmark`). `benchmark:status` emits JSON status suitable for OpenClaw ingestion.

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

Use `MAX_LOG_AGE_SECONDS` and `MAX_HEALTH_AGE_SECONDS` in `.env` to tune stale detection; watchdog restarts processes if PID is missing/dead, if logs are stale while heartbeat is missing/stale, or if a process-provided heartbeat marker exists and is stale. `benchmark:watchdog --check-only` reports restart decisions without stopping or starting processes. The watchdog script supports both macOS (`stat -f %m`) and Linux (`stat -c %Y`) file mtime checks for portable stale-age detection.

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
cd packages/infra && bun run benchmark:doctor
cd packages/infra && bun run benchmark:preflight
```

Use `bun run test` instead of raw `bun test`; the configured script routes GM tests through Node so `better-sqlite3` loads correctly.

Proceed only when `benchmark:doctor` reports no blockers, static readiness tests pass, local smoke succeeds for at least `agent-alpha`, Docker compose starts with real credentials, and `!season status` in `#gm-admin` reports the expected active Day 1 season.
