#!/bin/sh
set -e

# Read secrets from Docker secrets mount
if [ -f /run/secrets/discord_token ]; then
  export DISCORD_TOKEN=$(cat /run/secrets/discord_token)
fi

if [ -f /run/secrets/llm_api_key ]; then
  export LLM_API_KEY=$(cat /run/secrets/llm_api_key)
fi

# Start the agent
exec node dist/index.js
