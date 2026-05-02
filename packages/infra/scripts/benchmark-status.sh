#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/benchmark-common.sh"

load_env_if_present
ensure_runtime_dirs
write_status_json
cat "${STATUS_JSON}"
