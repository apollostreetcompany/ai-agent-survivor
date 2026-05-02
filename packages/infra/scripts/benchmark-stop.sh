#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/benchmark-common.sh"

load_env_if_present
ensure_runtime_dirs

stop_process() {
  local name="$1"
  local pid_file pid
  pid_file="$(pid_path "${name}")"
  pid="$(read_pid "${name}")"

  if is_pid_running "${pid}"; then
    kill "${pid}" 2>/dev/null || true
    sleep 1
    if is_pid_running "${pid}"; then
      kill -9 "${pid}" 2>/dev/null || true
    fi
    append_event "stop" "${name}" "pid=${pid}"
  else
    append_event "stop_skip" "${name}" "not running"
  fi

  rm -f "${pid_file}"
}

for name in "${PROCESS_NAMES[@]}"; do
  stop_process "${name}"
done

write_status_json
cat "${STATUS_JSON}"
