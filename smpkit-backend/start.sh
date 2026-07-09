#!/usr/bin/env bash
# SMP-Kit Server-Starter für macOS / Linux.
#   chmod +x start.sh   (einmalig)
#   ./start.sh
set -euo pipefail
cd "$(dirname "$0")"

# --- Konfiguration laden (falls vorhanden) ---
if [ -f config.env ]; then
  set -a; . ./config.env; set +a
  echo "[SMP-Kit] config.env geladen."
else
  echo "[SMP-Kit] Keine config.env – starte im lokalen Test-Modus."
fi

# --- Datenordner + Standard-DB ---
mkdir -p data
: "${SMPKIT_DB:=data/trust.db}"
export SMPKIT_DB

# --- Python finden ---
PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo
  echo "[FEHLER] Python wurde nicht gefunden. Installiere Python 3 und versuche es erneut."
  echo "  macOS:  brew install python   |  Linux:  sudo apt install python3"
  exit 1
fi

PORT="${SMPKIT_PORT:-8080}"
echo
echo "[SMP-Kit] Server startet … zum Beenden Strg+C."
echo "[SMP-Kit] Shop im Browser:  http://localhost:${PORT}"
echo
exec "$PY" trust_server.py
