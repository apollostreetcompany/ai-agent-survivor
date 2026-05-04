#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/benchmark-common.sh"

CHECK_ONLY=false

if [[ "${1:-}" == "--check-only" ]]; then
  CHECK_ONLY=true
fi

load_env_if_present
MAX_LOG_AGE_SECONDS="${MAX_LOG_AGE_SECONDS:-7200}"
MAX_HEALTH_AGE_SECONDS="${MAX_HEALTH_AGE_SECONDS:-7200}"
ensure_runtime_dirs

file_age_seconds() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    echo -1
    return 0
  fi

  local now mtime
  now="$(date +%s)"

  if mtime="$(stat -f %m "${file}" 2>/dev/null)"; then
    :
  elif mtime="$(stat -c %Y "${file}" 2>/dev/null)"; then
    :
  else
    echo -1
    return 0
  fi

  echo $((now - mtime))
}

restart_process() {
  local name="$1"
  local command="$2"
  local reason="$3"
  local old_pid="${4:-}"
  local log_file
  log_file="$(log_path "${name}")"

  if [[ "${CHECK_ONLY}" == "true" ]]; then
    append_event "watchdog_detected" "${name}" "${reason}; restart needed: ${command}"
    return 0
  fi

  if is_pid_running "${old_pid}"; then
    kill "${old_pid}" 2>/dev/null || true
    sleep 1
    if is_pid_running "${old_pid}"; then
      kill -9 "${old_pid}" 2>/dev/null || true
    fi
  fi

  (
    cd "${REPO_ROOT}"
    nohup bash -lc "exec ${command}" > "${log_file}" 2>&1 &
    echo $! > "$(pid_path "${name}")"
  )
  append_event "watchdog_restart" "${name}" "${reason}; ${command}"
}

check_process() {
  local name="$1"
  local command="$2"
  local pid log_file health_file log_age health_age
  pid="$(read_pid "${name}")"
  log_file="$(log_path "${name}")"
  health_file="$(health_path "${name}")"

  if ! is_pid_running "${pid}"; then
    restart_process "${name}" "${command}" "pid missing or dead" "${pid}"
    return
  fi

  log_age="$(file_age_seconds "${log_file}")"
  health_age="$(file_age_seconds "${health_file}")"

  if [[ "${log_age}" -ge 0 && "${log_age}" -gt "${MAX_LOG_AGE_SECONDS}" && ( "${health_age}" -lt 0 || "${health_age}" -gt "${MAX_HEALTH_AGE_SECONDS}" ) ]]; then
    local heartbeat_state
    if [[ "${health_age}" -lt 0 ]]; then
      heartbeat_state="heartbeat missing"
    else
      heartbeat_state="health stale: ${health_age}s > ${MAX_HEALTH_AGE_SECONDS}s"
    fi
    restart_process "${name}" "${command}" "log stale: ${log_age}s > ${MAX_LOG_AGE_SECONDS}s; ${heartbeat_state}" "${pid}"
    return
  fi

  if [[ "${health_age}" -ge 0 && "${health_age}" -gt "${MAX_HEALTH_AGE_SECONDS}" ]]; then
    restart_process "${name}" "${command}" "health stale: ${health_age}s > ${MAX_HEALTH_AGE_SECONDS}s" "${pid}"
  fi
}

for name in "${PROCESS_NAMES[@]}"; do
  check_process "${name}" "$(process_command "${name}")"
done

write_status_json
cat "${STATUS_JSON}"
