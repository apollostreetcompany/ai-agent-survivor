#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_ROOT}/../.." && pwd)"
RUNTIME_DIR="${BENCHMARK_RUNTIME_DIR:-${INFRA_ROOT}/.runtime/discord-benchmark}"
LOG_DIR="${RUNTIME_DIR}/logs"
PID_DIR="${RUNTIME_DIR}/pids"
HEALTH_DIR="${RUNTIME_DIR}/health"
STATUS_JSON="${RUNTIME_DIR}/status.json"
EVENTS_JSONL="${RUNTIME_DIR}/events.jsonl"
ENV_FILE="${BENCHMARK_ENV_FILE:-${INFRA_ROOT}/.env}"

PROCESS_NAMES=(game-data gm-bot agent-alpha agent-bravo agent-charlie agent-delta)

configure_runtime_paths() {
  RUNTIME_DIR="${BENCHMARK_RUNTIME_DIR:-${INFRA_ROOT}/.runtime/discord-benchmark}"
  LOG_DIR="${RUNTIME_DIR}/logs"
  PID_DIR="${RUNTIME_DIR}/pids"
  HEALTH_DIR="${RUNTIME_DIR}/health"
  STATUS_JSON="${RUNTIME_DIR}/status.json"
  EVENTS_JSONL="${RUNTIME_DIR}/events.jsonl"
  export BENCHMARK_RUNTIME_DIR="${RUNTIME_DIR}"
}

ensure_runtime_dirs() {
  mkdir -p "${LOG_DIR}" "${PID_DIR}" "${HEALTH_DIR}" "${RUNTIME_DIR}/data" "${RUNTIME_DIR}/workspaces"
}

escape_json() {
  local value="${1:-}"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "${value}"
}

load_env_if_present() {
  if [[ -f "${ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a
  fi
  configure_runtime_paths
}

pid_path() {
  printf '%s/%s.pid' "${PID_DIR}" "$1"
}

log_path() {
  printf '%s/%s.log' "${LOG_DIR}" "$1"
}

health_path() {
  printf '%s/%s.heartbeat' "${HEALTH_DIR}" "$1"
}

is_pid_running() {
  local pid="$1"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

read_pid() {
  local path
  path="$(pid_path "$1")"
  if [[ -f "${path}" ]]; then
    tr -d '[:space:]' < "${path}"
  fi
}

process_command() {
  local agent_discord_channel_env gm_discord_channel_env
  agent_discord_channel_env='DISCORD_ANNOUNCEMENTS_CHANNEL_ID="${DISCORD_ANNOUNCEMENTS_CHANNEL_ID:-}" DISCORD_ARENA_CHANNEL_ID="${DISCORD_ARENA_CHANNEL_ID:-}" DISCORD_AGENT_CHAT_CHANNEL_ID="${DISCORD_AGENT_CHAT_CHANNEL_ID:-}" DISCORD_SCOREBOARD_CHANNEL_ID="${DISCORD_SCOREBOARD_CHANNEL_ID:-}"'
  gm_discord_channel_env="${agent_discord_channel_env}"' DISCORD_INTEGRITY_LOG_CHANNEL_ID="${DISCORD_INTEGRITY_LOG_CHANNEL_ID:-}" DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID="${DISCORD_SPECTATOR_LOUNGE_CHANNEL_ID:-}" DISCORD_GM_ADMIN_CHANNEL_ID="${DISCORD_GM_ADMIN_CHANNEL_ID:-}"'

  case "$1" in
    gm-bot)
      printf '%s' "${gm_discord_channel_env}"' DISCORD_TOKEN="${GM_DISCORD_TOKEN:-}" GUILD_ID="${GUILD_ID:-}" AGENT_ALPHA_DISCORD_BOT_ID="${AGENT_ALPHA_DISCORD_BOT_ID:-}" AGENT_BRAVO_DISCORD_BOT_ID="${AGENT_BRAVO_DISCORD_BOT_ID:-}" AGENT_CHARLIE_DISCORD_BOT_ID="${AGENT_CHARLIE_DISCORD_BOT_ID:-}" AGENT_DELTA_DISCORD_BOT_ID="${AGENT_DELTA_DISCORD_BOT_ID:-}" DB_PATH="${GM_DB_PATH:-${BENCHMARK_RUNTIME_DIR}/data/survivor.db}" GAME_DATA_DIR="${GAME_DATA_DIR:-${BENCHMARK_RUNTIME_DIR}/game-data-content}" SURVIVOR_RUN_ID="${SURVIVOR_RUN_ID:-discord-benchmark}" SURVIVOR_LOG_DIR="${BENCHMARK_RUNTIME_DIR}/logs" SURVIVOR_HEALTH_FILE="${BENCHMARK_RUNTIME_DIR}/health/gm-bot.heartbeat" MAIL_HOST="${MAIL_HOST:-localhost}" GM_MAIL_PASS="${GM_MAIL_PASS:-}" NARRATOR_API_KEY="${NARRATOR_API_KEY:-}" NARRATOR_MODEL="${NARRATOR_MODEL:-}" bun --filter @survivor/gm-bot start'
      ;;
    game-data)
      printf '%s' 'GAME_DATA_DIR="${GAME_DATA_DIR:-${BENCHMARK_RUNTIME_DIR}/game-data-content}" GAME_DATA_PORT="${GAME_DATA_PORT:-8787}" SURVIVOR_HEALTH_FILE="${BENCHMARK_RUNTIME_DIR}/health/game-data.heartbeat" node packages/infra/scripts/game-data-server.mjs'
      ;;
    agent-alpha)
      printf '%s' "${agent_discord_channel_env}"' AGENT_ID=agent-alpha DISCORD_TOKEN="${AGENT_ALPHA_DISCORD_TOKEN:-}" GM_DISCORD_BOT_ID="${GM_DISCORD_BOT_ID:-}" GUILD_ID="${GUILD_ID:-}" LLM_API_KEY="${AGENT_ALPHA_LLM_API_KEY:-}" LLM_PROVIDER="${LLM_PROVIDER:-anthropic}" LLM_MODEL="${AGENT_ALPHA_LLM_MODEL:-}" SURVIVOR_RUN_ID="${SURVIVOR_RUN_ID:-discord-benchmark}" SURVIVOR_LOG_DIR="${BENCHMARK_RUNTIME_DIR}/logs" SURVIVOR_HEALTH_FILE="${BENCHMARK_RUNTIME_DIR}/health/agent-alpha.heartbeat" MAIL_HOST="${MAIL_HOST:-localhost}" MAIL_USER="${AGENT_ALPHA_MAIL_USER:-agent-alpha}" MAIL_PASS="${AGENT_ALPHA_MAIL_PASS:-}" GAME_DATA_URL="${GAME_DATA_URL:-http://127.0.0.1:${GAME_DATA_PORT:-8787}}" MEMORY_DB_PATH="${BENCHMARK_RUNTIME_DIR}/data/agent-alpha-memory.db" AGENT_WORKSPACE="${BENCHMARK_RUNTIME_DIR}/workspaces/agent-alpha" bun --filter @survivor/agent-template start'
      ;;
    agent-bravo)
      printf '%s' "${agent_discord_channel_env}"' AGENT_ID=agent-bravo DISCORD_TOKEN="${AGENT_BRAVO_DISCORD_TOKEN:-}" GM_DISCORD_BOT_ID="${GM_DISCORD_BOT_ID:-}" GUILD_ID="${GUILD_ID:-}" LLM_API_KEY="${AGENT_BRAVO_LLM_API_KEY:-}" LLM_PROVIDER="${LLM_PROVIDER:-anthropic}" LLM_MODEL="${AGENT_BRAVO_LLM_MODEL:-}" SURVIVOR_RUN_ID="${SURVIVOR_RUN_ID:-discord-benchmark}" SURVIVOR_LOG_DIR="${BENCHMARK_RUNTIME_DIR}/logs" SURVIVOR_HEALTH_FILE="${BENCHMARK_RUNTIME_DIR}/health/agent-bravo.heartbeat" MAIL_HOST="${MAIL_HOST:-localhost}" MAIL_USER="${AGENT_BRAVO_MAIL_USER:-agent-bravo}" MAIL_PASS="${AGENT_BRAVO_MAIL_PASS:-}" GAME_DATA_URL="${GAME_DATA_URL:-http://127.0.0.1:${GAME_DATA_PORT:-8787}}" MEMORY_DB_PATH="${BENCHMARK_RUNTIME_DIR}/data/agent-bravo-memory.db" AGENT_WORKSPACE="${BENCHMARK_RUNTIME_DIR}/workspaces/agent-bravo" bun --filter @survivor/agent-template start'
      ;;
    agent-charlie)
      printf '%s' "${agent_discord_channel_env}"' AGENT_ID=agent-charlie DISCORD_TOKEN="${AGENT_CHARLIE_DISCORD_TOKEN:-}" GM_DISCORD_BOT_ID="${GM_DISCORD_BOT_ID:-}" GUILD_ID="${GUILD_ID:-}" LLM_API_KEY="${AGENT_CHARLIE_LLM_API_KEY:-}" LLM_PROVIDER="${LLM_PROVIDER:-anthropic}" LLM_MODEL="${AGENT_CHARLIE_LLM_MODEL:-}" SURVIVOR_RUN_ID="${SURVIVOR_RUN_ID:-discord-benchmark}" SURVIVOR_LOG_DIR="${BENCHMARK_RUNTIME_DIR}/logs" SURVIVOR_HEALTH_FILE="${BENCHMARK_RUNTIME_DIR}/health/agent-charlie.heartbeat" MAIL_HOST="${MAIL_HOST:-localhost}" MAIL_USER="${AGENT_CHARLIE_MAIL_USER:-agent-charlie}" MAIL_PASS="${AGENT_CHARLIE_MAIL_PASS:-}" GAME_DATA_URL="${GAME_DATA_URL:-http://127.0.0.1:${GAME_DATA_PORT:-8787}}" MEMORY_DB_PATH="${BENCHMARK_RUNTIME_DIR}/data/agent-charlie-memory.db" AGENT_WORKSPACE="${BENCHMARK_RUNTIME_DIR}/workspaces/agent-charlie" bun --filter @survivor/agent-template start'
      ;;
    agent-delta)
      printf '%s' "${agent_discord_channel_env}"' AGENT_ID=agent-delta DISCORD_TOKEN="${AGENT_DELTA_DISCORD_TOKEN:-}" GM_DISCORD_BOT_ID="${GM_DISCORD_BOT_ID:-}" GUILD_ID="${GUILD_ID:-}" LLM_API_KEY="${AGENT_DELTA_LLM_API_KEY:-}" LLM_PROVIDER="${LLM_PROVIDER:-anthropic}" LLM_MODEL="${AGENT_DELTA_LLM_MODEL:-}" SURVIVOR_RUN_ID="${SURVIVOR_RUN_ID:-discord-benchmark}" SURVIVOR_LOG_DIR="${BENCHMARK_RUNTIME_DIR}/logs" SURVIVOR_HEALTH_FILE="${BENCHMARK_RUNTIME_DIR}/health/agent-delta.heartbeat" MAIL_HOST="${MAIL_HOST:-localhost}" MAIL_USER="${AGENT_DELTA_MAIL_USER:-agent-delta}" MAIL_PASS="${AGENT_DELTA_MAIL_PASS:-}" GAME_DATA_URL="${GAME_DATA_URL:-http://127.0.0.1:${GAME_DATA_PORT:-8787}}" MEMORY_DB_PATH="${BENCHMARK_RUNTIME_DIR}/data/agent-delta-memory.db" AGENT_WORKSPACE="${BENCHMARK_RUNTIME_DIR}/workspaces/agent-delta" bun --filter @survivor/agent-template start'
      ;;
    *)
      return 1
      ;;
  esac
}

write_status_json() {
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    local healthy=true
    local name pid
    for name in "${PROCESS_NAMES[@]}"; do
      pid="$(read_pid "${name}")"
      if ! is_pid_running "${pid}"; then
        healthy=false
      fi
    done

    printf '{"timestamp":"%s","runtimeDir":"%s","healthy":%s,"processes":[' "${now}" "$(escape_json "${RUNTIME_DIR}")" "${healthy}"
    local first=1
    local running log health
    for name in "${PROCESS_NAMES[@]}"; do
      pid="$(read_pid "${name}")"
      running=false
      if is_pid_running "${pid}"; then
        running=true
      fi
      log="$(log_path "${name}")"
      health="$(health_path "${name}")"
      [[ ${first} -eq 0 ]] && printf ','
      first=0
      printf '{"name":"%s","pid":"%s","running":%s,"log":"%s","health":"%s"}' \
        "${name}" "$(escape_json "${pid}")" "${running}" "$(escape_json "${log}")" "$(escape_json "${health}")"
    done
    printf ']}'
  } > "${STATUS_JSON}"
}

append_event() {
  local action="$1"
  local process="$2"
  local detail="${3:-}"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"timestamp":"%s","action":"%s","process":"%s","detail":"%s"}\n' \
    "${now}" "$(escape_json "${action}")" "$(escape_json "${process}")" "$(escape_json "${detail}")" >> "${EVENTS_JSONL}"
}
