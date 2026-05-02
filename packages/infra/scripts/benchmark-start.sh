#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/benchmark-common.sh"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

load_env_if_present
ensure_runtime_dirs

if [[ "${DRY_RUN}" != "true" ]]; then
  (
    cd "${REPO_ROOT}"
    bun run build
  )
fi

start_process() {
  local name="$1"
  local command="$2"
  local pid_file log_file
  pid_file="$(pid_path "${name}")"
  log_file="$(log_path "${name}")"

  local existing_pid
  existing_pid="$(read_pid "${name}")"
  if is_pid_running "${existing_pid}"; then
    append_event "skip_start" "${name}" "already running: ${existing_pid}"
    return 0
  fi

  if [[ "${DRY_RUN}" == "true" ]]; then
    append_event "dry_run_start" "${name}" "${command}"
    return 0
  fi

  (
    cd "${REPO_ROOT}"
    nohup bash -lc "exec ${command}" > "${log_file}" 2>&1 &
    echo $! > "${pid_file}"
  )
  append_event "start" "${name}" "${command}"
}

for name in "${PROCESS_NAMES[@]}"; do
  start_process "${name}" "$(process_command "${name}")"
done

write_status_json
cat "${STATUS_JSON}"
