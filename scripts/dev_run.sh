#!/usr/bin/env bash
# dev_run.sh - start the LocalPilot backend and the desktop GUI for development
# (Linux/macOS counterpart of dev_run.ps1).
#
# Usage (from anywhere):
#     ./scripts/dev_run.sh
#
# Starts `localpilot serve` in the background and launches the Electron GUI
# configured to use that external backend. Ctrl-C stops the GUI; the backend is
# then stopped automatically.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Activate the virtual environment if present.
if [[ -f ".venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

echo "Starting backend (localpilot serve)..."
localpilot serve &
backend_pid=$!
trap 'kill "$backend_pid" 2>/dev/null || true' EXIT

cd gui
if [[ ! -d node_modules ]]; then
  npm install
fi
echo "Starting GUI (npm run dev) against the external backend..."
LOCALPILOT_EXTERNAL_BACKEND=1 npm run dev
