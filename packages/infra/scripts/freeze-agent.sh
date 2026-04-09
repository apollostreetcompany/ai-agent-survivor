#!/bin/bash
# Freeze an agent's Docker image at Day 0
# Usage: ./freeze-agent.sh <agent-name>

set -euo pipefail

AGENT_NAME="${1:?Usage: ./freeze-agent.sh <agent-name>}"
IMAGE_TAG="survivor-agent-${AGENT_NAME}:frozen"

echo "Building agent image: ${IMAGE_TAG}"
docker build -t "${IMAGE_TAG}" "../agent-${AGENT_NAME}/"

DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "${IMAGE_TAG}" 2>/dev/null || \
         docker image inspect --format='{{.Id}}' "${IMAGE_TAG}")

echo ""
echo "=== FROZEN IMAGE ==="
echo "Agent:  ${AGENT_NAME}"
echo "Image:  ${IMAGE_TAG}"
echo "Digest: ${DIGEST}"
echo "Time:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""
echo "${AGENT_NAME}|${IMAGE_TAG}|${DIGEST}|$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> frozen-manifest.txt
echo "Saved to frozen-manifest.txt"
