#!/bin/bash
# Configure network egress rules for an agent container
# Usage: ./setup-network.sh <container-id>

set -euo pipefail

CONTAINER_ID="${1:?Usage: ./setup-network.sh <container-id>}"

echo "Setting up egress whitelist for container: ${CONTAINER_ID}"

# Get container PID for network namespace
PID=$(docker inspect --format '{{.State.Pid}}' "${CONTAINER_ID}")

# Enter container network namespace and apply iptables rules
nsenter -t "${PID}" -n sh -c '
  # Drop all outbound by default
  iptables -P OUTPUT DROP

  # Allow loopback
  iptables -A OUTPUT -o lo -j ACCEPT

  # Allow established connections
  iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

  # Allow DNS to game network resolver only
  iptables -A OUTPUT -p udp --dport 53 -d 10.0.0.1 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -d 10.0.0.1 -j ACCEPT

  # Allow game network (mail, calendar, game-data, GM bot)
  iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT
  iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
  iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT

  # All other traffic goes through squid proxy (port 3128)
  # Proxy handles the LLM API + Discord allowlist
  iptables -t nat -A OUTPUT -p tcp --dport 443 -j DNAT --to-destination 10.0.0.2:3128
  iptables -t nat -A OUTPUT -p tcp --dport 80 -j DNAT --to-destination 10.0.0.2:3128
'

echo "Egress whitelist applied for container: ${CONTAINER_ID}"
