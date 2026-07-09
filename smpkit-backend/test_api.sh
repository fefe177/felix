#!/usr/bin/env bash
# End-to-End-Test des Trust-Backends. Startet den Server, feuert Requests,
# prüft das Verhalten und beendet den Server wieder.
set -euo pipefail
cd "$(dirname "$0")"

PORT=${1:-8137}
BASE="http://127.0.0.1:${PORT}"
DB="test_$$.db"

rm -f "$DB"
python3 trust_server.py --port "$PORT" --db "$DB" > "test_server_$$.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f "$DB" "test_server_$$.log"' EXIT
sleep 1.5

echo "== health =="
curl -s "$BASE/api/health"; echo

echo "== unbekannter Spieler (neutral 50%) =="
curl -s "$BASE/api/player?name=Steve"; echo

echo "== 6 verschiedene Melder reporten Steve =="
for i in 1 2 3 4 5 6; do
  curl -s -X POST "$BASE/api/report" \
    -d "{\"reporterUuid\":\"uuid-$i\",\"reporter\":\"Melder$i\",\"target\":\"Steve\",\"category\":\"scam_tptrade\"}" > /dev/null
done
curl -s "$BASE/api/player?name=Steve"; echo

echo "== Blacklist =="
curl -s "$BASE/api/blacklist"; echo

echo "== Vouch: Alex =="
curl -s -X POST "$BASE/api/vouch" -d '{"voucherUuid":"v1","voucher":"Fan1","target":"Alex"}' > /dev/null
curl -s -X POST "$BASE/api/vouch" -d '{"voucherUuid":"v2","voucher":"Fan2","target":"Alex"}' > /dev/null
curl -s "$BASE/api/player?name=Alex"; echo

echo "== fertig =="
