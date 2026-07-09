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
./test_api.sh            # startet Server, prüft Reports/Vouches/Blacklist, räumt auf
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

## Anti-Missbrauch

- Dedup pro (Melder, Ziel) – Massen-Spam durch eine Person bringt nichts.
- Rate-Limit pro Melder-UUID (20 Schreib-Aktionen/Minute).
- Selbst-Report/-Vouch wird abgelehnt.
- Optionaler API-Key.

**Wichtig für den Produktivbetrieb:** Das Backend vertraut aktuell der vom Client
gelieferten UUID. Für einen echten öffentlichen Dienst sollte die Identität serverseitig
verifiziert werden (z. B. Mojang-Session-Token oder ein pro-Spieler ausgegebenes Token),
damit UUIDs nicht gefälscht werden können.

## Deployment-Hinweis

Für Dauerbetrieb hinter einen Reverse-Proxy (nginx/Caddy) mit HTTPS setzen und als
systemd-Service oder im Container laufen lassen. SQLite reicht für kleine bis mittlere
Communities problemlos.
