#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/benchmark-common.sh"

load_env_if_present

required_vars=(
  GUILD_ID
  GM_DISCORD_TOKEN
  AGENT_ALPHA_DISCORD_TOKEN
  AGENT_BRAVO_DISCORD_TOKEN
  AGENT_CHARLIE_DISCORD_TOKEN
  AGENT_DELTA_DISCORD_TOKEN
  AGENT_ALPHA_DISCORD_BOT_ID
  AGENT_BRAVO_DISCORD_BOT_ID
  AGENT_CHARLIE_DISCORD_BOT_ID
  AGENT_DELTA_DISCORD_BOT_ID
  LLM_PROVIDER
  BENCHMARK_WATCHDOG_SUPERVISOR
  AGENT_ALPHA_CLOUD_SEAT_PROVIDER
  AGENT_BRAVO_CLOUD_SEAT_PROVIDER
  AGENT_CHARLIE_CLOUD_SEAT_PROVIDER
  AGENT_DELTA_CLOUD_SEAT_PROVIDER
  AGENT_ALPHA_CLOUD_SEAT_ID
  AGENT_BRAVO_CLOUD_SEAT_ID
  AGENT_CHARLIE_CLOUD_SEAT_ID
  AGENT_DELTA_CLOUD_SEAT_ID
  AGENT_ALPHA_LLM_API_KEY
  AGENT_BRAVO_LLM_API_KEY
  AGENT_CHARLIE_LLM_API_KEY
  AGENT_DELTA_LLM_API_KEY
  AGENT_ALPHA_LLM_MODEL
  AGENT_BRAVO_LLM_MODEL
  AGENT_CHARLIE_LLM_MODEL
  AGENT_DELTA_LLM_MODEL
  OPENCLAW_DISCORD_TARGET
)

missing=()
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("${name}")
  fi
done

if [[ "${#missing[@]}" -gt 0 ]]; then
  printf 'Missing required launch variables: %s\n' "${missing[*]}" >&2
  exit 1
fi

assert_provider() {
  local name="$1"
  local value="$2"
  case "${value}" in
    openclaw|hermes)
      return 0
      ;;
    *)
      printf '%s must be one of: openclaw, hermes\n' "${name}" >&2
      exit 1
      ;;
  esac
}

assert_provider "BENCHMARK_WATCHDOG_SUPERVISOR" "${BENCHMARK_WATCHDOG_SUPERVISOR}"
assert_provider "AGENT_ALPHA_CLOUD_SEAT_PROVIDER" "${AGENT_ALPHA_CLOUD_SEAT_PROVIDER}"
assert_provider "AGENT_BRAVO_CLOUD_SEAT_PROVIDER" "${AGENT_BRAVO_CLOUD_SEAT_PROVIDER}"
assert_provider "AGENT_CHARLIE_CLOUD_SEAT_PROVIDER" "${AGENT_CHARLIE_CLOUD_SEAT_PROVIDER}"
assert_provider "AGENT_DELTA_CLOUD_SEAT_PROVIDER" "${AGENT_DELTA_CLOUD_SEAT_PROVIDER}"

assert_unique_values() {
  local label="$1"
  shift

  local unique_count expected_count
  unique_count="$(printf '%s\n' "$@" | sort -u | wc -l | tr -d '[:space:]')"
  expected_count="$#"

  if [[ "${unique_count}" != "${expected_count}" ]]; then
    printf '%s must be unique.\n' "${label}" >&2
    exit 1
  fi
}

assert_unique_values \
  "Discord bot tokens" \
  "${GM_DISCORD_TOKEN}" \
  "${AGENT_ALPHA_DISCORD_TOKEN}" \
  "${AGENT_BRAVO_DISCORD_TOKEN}" \
  "${AGENT_CHARLIE_DISCORD_TOKEN}" \
  "${AGENT_DELTA_DISCORD_TOKEN}"

assert_unique_values \
  "Discord bot user IDs" \
  "${AGENT_ALPHA_DISCORD_BOT_ID}" \
  "${AGENT_BRAVO_DISCORD_BOT_ID}" \
  "${AGENT_CHARLIE_DISCORD_BOT_ID}" \
  "${AGENT_DELTA_DISCORD_BOT_ID}"

assert_unique_values \
  "Agent LLM API keys" \
  "${AGENT_ALPHA_LLM_API_KEY}" \
  "${AGENT_BRAVO_LLM_API_KEY}" \
  "${AGENT_CHARLIE_LLM_API_KEY}" \
  "${AGENT_DELTA_LLM_API_KEY}"

assert_unique_values \
  "Cloud seat IDs" \
  "${AGENT_ALPHA_CLOUD_SEAT_ID}" \
  "${AGENT_BRAVO_CLOUD_SEAT_ID}" \
  "${AGENT_CHARLIE_CLOUD_SEAT_ID}" \
  "${AGENT_DELTA_CLOUD_SEAT_ID}"

node "${SCRIPT_DIR}/benchmark-discord-channels.mjs" >/dev/null

agent_count=$(( ${#PROCESS_NAMES[@]} - 2 ))
metadata_path="${BENCHMARK_METADATA_PATH:-${RUNTIME_DIR}/run-metadata.json}"

ensure_runtime_dirs
node "${SCRIPT_DIR}/benchmark-metadata.mjs" --output "${metadata_path}" >/dev/null

printf '{"preflight":"ok","agentCount":%s,"openclawTarget":"configured","metadata":"%s"}\n' \
  "${agent_count}" \
  "$(escape_json "${metadata_path}")"
