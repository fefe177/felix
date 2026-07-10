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
./test_api.sh              # HTTP-End-to-End: Reports/Vouches/Blacklist, räumt auf
python3 test_algorithm.py  # Unit-Tests: Zeitverfall + Melder-Reputation
python3 test_licensing.py  # Unit-Tests: Lizenzausstellung + Idempotenz
```

## Verkauf / Lizenzen (Serverkosten decken)

Der Server bringt einen **eingebauten Shop** mit: unter `/` liegt eine Verkaufsseite, auf der
Spieler für **4,99 €** einen dauerhaften Lizenzschlüssel kaufen. Ist `SMPKIT_LICENSE_REQUIRED=true`,
funktioniert die Trust-API nur mit einem gültigen **Token**. Der Spieler löst seinen gekauften
Schlüssel im Client **einmalig** per `/smpkit redeem <schlüssel>` ein; die Mod speichert das
zurückgegebene Token automatisch und schickt es fortan als `X-Api-Key` mit.

Ablauf: `/` (kaufen) → Stripe-Checkout → `/success` zeigt den Schlüssel `SMPK-XXXX-XXXX-XXXX-XXXX`
→ im Spiel `/smpkit redeem SMPK-…` (einmalig) → Zugang aktiv.

**Bezahlung** läuft über **Stripe** (direkt via REST-API, keine Zusatz-Abhängigkeit):

| Env-Variable | Zweck |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Secret Key (`sk_live_…`). **Fehlt er → Dev-Modus** (simulierter Kauf). |
| `STRIPE_WEBHOOK_SECRET` | für die Webhook-Signaturprüfung (`whsec_…`), optional |
| `SMPKIT_PUBLIC_URL` | öffentliche Basis-URL (für Stripe-Redirects) |
| `SMPKIT_PRICE_CENTS` | Preis in Cent (Standard `499`) |
| `SMPKIT_CURRENCY` | Währung (Standard `eur`) |
| `SMPKIT_LICENSE_REQUIRED` | `true` = Trust-API nur mit Lizenz |
| `SMPKIT_ADMIN_KEY` | optionaler Voll-Zugriff ohne Lizenz |

**Stripe einrichten (Kurzfassung):**
1. Kostenloses Stripe-Konto anlegen, im Dashboard den **Secret Key** kopieren.
2. `STRIPE_SECRET_KEY` setzen und `SMPKIT_PUBLIC_URL` auf deine (HTTPS-)Domain.
3. Optional Webhook auf `https://deine-domain/api/stripe-webhook` einrichten und
   `STRIPE_WEBHOOK_SECRET` setzen (die Erfolgsseite stellt den Schlüssel auch ohne Webhook aus).
4. Stripe zahlt die Einnahmen automatisch auf dein Bankkonto aus.

> **Dev-Modus:** Ohne `STRIPE_SECRET_KEY` wird der Kauf **simuliert** – ideal zum lokalen Testen
> des kompletten Ablaufs, ohne echtes Geld. Die Verkaufsseite weist darauf hin.

> **Rechtlicher Hinweis:** SMP-Kit ist ein eigenständiges Tool; verkauft wird der Zugang zu
> **deinem** Dienst, nicht zu Minecraft oder den Servern. Für einen echten Verkauf brauchst du
> ein Impressum, Widerrufs-/AGB-Hinweise und musst Umsatzsteuer beachten – kläre das je nach
> Land/Umfang ab.

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
| POST | `/api/redeem` | einmalige Einlösung, liefert `{token}` (Felder je nach Mojang-Modus) |
| GET  | `/api/auth/nonce` | serverId (Nonce) + `mojangAuth`-Flag für die Verifikation |
| GET  | `/api/license/verify?token=…` | prüft ein laufendes Zugriffs-Token |

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

## Anti-Missbrauch & Sicherheit

- **Kryptografisch sichere Schlüssel:** Einlöse-Schlüssel und Token werden mit `secrets`
  (CSPRNG) erzeugt – ~79 Bit (Schlüssel) bzw. ~256 Bit (Token), nicht erratbar/vorhersagbar.
- **Einmal-Einlösung:** Ein gekaufter Schlüssel wird über `/api/redeem` genau **einmal**
  eingelöst, an die UUID gebunden und ist danach dauerhaft verbraucht (2. Versuch → 409).
  Für den laufenden Zugriff dient das dabei ausgegebene **Token** – so lässt sich ein Schlüssel
  nicht weiterverkaufen oder mehrfach nutzen.
- **Brute-Force-Schutz:** `/api/redeem` und die Token-Prüfung sind pro IP limitiert
  (max. 10 Versuche / 10 Min → 429).
- **Mojang-Verifikation** (`SMPKIT_MOJANG_AUTH=true`): Beim Einlösen beweist die Mod ihre
  Identität über Mojang (joinServer/hasJoined, wie beim Server-Beitritt). Die UUID kommt dann
  aus **Mojangs Antwort**, nicht vom Client – niemand kann unter fremder UUID einlösen. Das
  ausgegebene Token ist an diese verifizierte UUID gebunden; Reports/Vouches werden serverseitig
  dieser UUID zugeordnet (die im Request mitgeschickte `reporterUuid` wird ignoriert).
- **Bewertungssperre:** Dieselbe Person kann man nur alle **5 Stunden** neu bewerten
  (pro Melder×Ziel). Bewertungen an *andere* Personen sind nicht betroffen – das verhindert
  künstliches Hoch-/Runterbewerten einer einzelnen Person.
- **Dedup** pro (Melder, Ziel) und **Rate-Limit** pro Melder-UUID (20 Schreib-Aktionen/Minute).
- Selbst-Report/-Vouch wird abgelehnt. Optionaler Admin-Schlüssel.

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
