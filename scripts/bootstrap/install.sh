#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN=""
BOOTSTRAP_PATH="${SCRIPT_DIR}/install.mjs"
if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
elif command -v node.exe >/dev/null 2>&1; then
  NODE_BIN="node.exe"
else
  echo "[nous:bootstrap] Node.js is required but not found in PATH." >&2
  exit 1
fi

if [[ "${NODE_BIN}" == "node.exe" ]]; then
  if command -v wslpath >/dev/null 2>&1; then
    BOOTSTRAP_PATH="$(wslpath -w "${BOOTSTRAP_PATH}")"
  elif command -v cygpath >/dev/null 2>&1; then
    BOOTSTRAP_PATH="$(cygpath -w "${BOOTSTRAP_PATH}")"
  fi
fi

"${NODE_BIN}" "${BOOTSTRAP_PATH}"
