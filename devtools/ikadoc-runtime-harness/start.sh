#!/usr/bin/env bash
# Runs the Grist dev server (`yarn start`) in IkaDoc runtime mode against the development
# harness, so `/grist/editor/<fixture>` works without the IkaDoc stack. Development only.

set -euo pipefail

REQUIRED_NODE_MAJOR=22
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" != "$REQUIRED_NODE_MAJOR" ]]; then
  echo "Node ${REQUIRED_NODE_MAJOR}.x is required to run the Grist dev server (found Node ${NODE_MAJOR})." >&2
  echo "Use Node ${REQUIRED_NODE_MAJOR} (see .nvmrc), or run the harness against the Docker image (README)." >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

export IKADOC_HARNESS_PORT="${IKADOC_HARNESS_PORT:-18585}"
export IKADOC_HARNESS_GRIST_ORIGIN="${IKADOC_HARNESS_GRIST_ORIGIN:-http://localhost:${PORT:-8484}}"

export IKADOC_EDITOR_ADMISSION_URL="http://127.0.0.1:${IKADOC_HARNESS_PORT}/admission"
export IKADOC_EDITOR_VALIDATION_URL="http://127.0.0.1:${IKADOC_HARNESS_PORT}/session-validation"
export IKADOC_GRIST_RUNTIME_ONLY="${IKADOC_GRIST_RUNTIME_ONLY:-false}"
export GRIST_DEFAULT_LOCALE="${GRIST_DEFAULT_LOCALE:-fr-FR}"
export GRIST_SANDBOX_FLAVOR="${GRIST_SANDBOX_FLAVOR:-pyodide}"

node "$HERE/server.mjs" &
HARNESS_PID=$!
trap 'kill "$HARNESS_PID" 2>/dev/null || true' EXIT

cd "$REPO"
yarn start
