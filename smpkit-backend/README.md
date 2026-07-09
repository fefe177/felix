# SMP-Kit Trust Backend

Abhängigkeitsfreier Reputations-/Trust-Server für die SMP-Kit-Mod. Nutzt ausschließlich
die Python-Standardbibliothek (`http.server` + `sqlite3`) – **kein pip, keine Installation**.

## Start

```bash
python3 trust_server.py --port 8080 --db trust.db
# optional mit gemeinsamem API-Key (muss dann im Mod-Client gesetzt werden):
python3 trust_server.py --port 8080 --db trust.db --api-key GEHEIM
```

Danach im Spiel: `/smpkit seturl http://DEINE-IP:8080` (und ggf. `/smpkit setkey GEHEIM`).

## Test

```bash
./test_api.sh            # HTTP-End-to-End: Reports/Vouches/Blacklist, räumt auf
python3 test_algorithm.py  # Unit-Tests: Zeitverfall + Melder-Reputation
```

## Endpunkte

| Methode | Pfad | Zweck |
|---|---|---|
| GET  | `/api/health` | Statuscheck |
| GET  | `/api/player?name=NAME` | Trust-Info eines Spielers |
| GET  | `/api/players?names=A,B,C` | Batch-Abfrage (HUD naher Spieler) |
| GET  | `/api/blacklist` | geteilte Liste geflaggter Spieler |
| POST | `/api/report` | `{reporterUuid, reporter, target, category, note}` |
| POST | `/api/vouch` | `{voucherUuid, voucher, target}` |
| POST | `/api/unreport` | `{reporterUuid, target}` |

## Trust-Berechnung

Pro Spieler zählen nur **unterschiedliche** Melder bzw. Empfehler (ein Spieler kann ein
Ziel nur einmal melden). Der Wert ist beta-artig geglättet:

```
trust% = 100 * (vouches + k) / (vouches + W*reports + 2k)
         mit W = 3 (Reports wiegen schwerer), k = 1 (Glättung)
```

- **Unbekannt** (0 Daten) → 50 %, `rated=false` (neutral, nicht „schlecht").
- **1 Report** → 20 %, **6 Reports** → 5 %.
- **Vouches** heben den Wert (1 Vouch → 67 %, 2 → 75 %).
- **Blacklist-Flag**, wenn `reports ≥ 5` **und** `trust < 30 %` (beide Schwellen oben im Code
  konfigurierbar: `FLAG_THRESHOLD`, `FLAG_TRUST_BELOW`).

Dabei sind `reports`/`vouches` in der Formel **gewichtete** Summen (`effReports`/`effVouches`
in der Antwort), nicht bloße Zählungen:

- **Zeitverfall** (`DECAY_ENABLED`, `HALFLIFE_DAYS=45`): Eine Meldung wiegt nach 45 Tagen nur
  noch halb, nach 90 Tagen ein Viertel. Alte Vorfälle verblassen, verschwinden aber nie ganz.
- **Melder-Reputation** (`CREDIBILITY_ENABLED`): Die Meldung eines selbst gut bewerteten
  Spielers zählt mehr (bis ×1.4), die eines schlecht bewerteten weniger (bis ×0.3); unbewertete
  Melder zählen neutral (×1.0). So bringt es einem Scammer wenig, mit Zweitaccounts massenhaft
  Unschuldige zu melden – solche Melder haben selbst kaum Gewicht.

Die harte Flag-Schwelle (`reports ≥ 5`) nutzt weiterhin die **rohe** Zahl unterschiedlicher
Melder, damit Gewichtung ein Flag nie ganz verhindert.

## Anti-Missbrauch

- Dedup pro (Melder, Ziel) – Massen-Spam durch eine Person bringt nichts.
- Rate-Limit pro Melder-UUID (20 Schreib-Aktionen/Minute).
- Selbst-Report/-Vouch wird abgelehnt.
- Optionaler API-Key.

**Wichtig für den Produktivbetrieb:** Das Backend vertraut aktuell der vom Client
gelieferten UUID. Für einen echten öffentlichen Dienst sollte die Identität serverseitig
verifiziert werden (z. B. Mojang-Session-Token oder ein pro-Spieler ausgegebenes Token),
damit UUIDs nicht gefälscht werden können.

## Deployment

Für Dauerbetrieb hinter einen Reverse-Proxy (nginx/Caddy) mit HTTPS setzen. SQLite reicht für
kleine bis mittlere Communities problemlos. Zwei fertige Varianten liegen bei:

**Docker (empfohlen):**
```bash
docker compose up -d --build      # lauscht auf :8080, DB im Volume smpkit-data
```
Konfiguration über Environment-Variablen (`SMPKIT_PORT`, `SMPKIT_DB`, `SMPKIT_API_KEY`) in
`docker-compose.yml`. Enthält Healthcheck und läuft als Nicht-Root-User.

**systemd (ohne Docker):** siehe Kopf von `smpkit-trust.service` – kopiert `trust_server.py`
nach `/opt/smpkit`, legt die DB in `/var/lib/smpkit` und startet als eigener User mit
Härtungs-Optionen.

Alle drei Startwege lesen dieselben Env-Variablen (CLI-Argument schlägt Env schlägt Standard).
