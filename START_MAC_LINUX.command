#!/bin/bash
# ============================================================
#  Startet Blox Tower Defense 3D als ECHTE APP (kein Browser).
#  Doppelklicken (macOS) bzw. ausführen (Linux).
# ============================================================
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js ist noch nicht installiert."
  echo "  Bitte einmalig von https://nodejs.org installieren (LTS),"
  echo "  danach diese Datei erneut starten."
  echo ""
  read -p "Druecke Enter zum Schliessen..."
  exit 1
fi

if [ ! -d "node_modules/electron" ]; then
  echo "Erstes Mal: richte das Spiel ein, bitte kurz warten..."
  npm install
fi

echo "Starte Blox Tower Defense 3D..."
npm start
