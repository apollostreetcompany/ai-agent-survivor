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
  AGENT_ALPHA_LLM_API_KEY
  AGENT_BRAVO_LLM_API_KEY
  AGENT_CHARLIE_LLM_API_KEY
  AGENT_DELTA_LLM_API_KEY
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

agent_count=$(( ${#PROCESS_NAMES[@]} - 2 ))

printf '{"preflight":"ok","agentCount":%s,"openclawTarget":"configured"}\n' "${agent_count}"
