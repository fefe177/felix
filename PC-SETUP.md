# SMP-Kit Server auf deinem PC einrichten

Schritt-für-Schritt. Für **Windows** geschrieben (Mac/Linux-Hinweise stehen dabei).
Du brauchst nichts zu programmieren – nur herunterladen, starten, fertig.

---

## Schritt 1 – Python installieren (einmalig)

1. Auf https://www.python.org/downloads/ **„Download Python"** klicken und installieren.
2. **Ganz wichtig (Windows):** im Installer unten **„Add Python to PATH"** anhaken, dann „Install Now".

> Mac: `brew install python` · Linux: `sudo apt install python3` — meist schon vorhanden.

Es sind **keine** weiteren Pakete/Downloads nötig — der Server nutzt nur Bordmittel.

---

## Schritt 2 – Projekt auf den PC holen

**Einfach (ohne Git):** Auf GitHub oben grün **„Code" → „Download ZIP"**, entpacken.
Achte auf den richtigen Branch `claude/mod-suggestion-research-2w3ed2`.

**Mit Git:**
```
git clone https://github.com/fefe177/felix.git
cd felix
git checkout claude/mod-suggestion-research-2w3ed2
```

Alles, was du brauchst, liegt im Ordner **`smpkit-backend`**.

---

## Schritt 3 – Server starten

Öffne den Ordner `smpkit-backend` und **doppelklicke `start.bat`** (Windows).

> Mac/Linux: im Terminal `./start.sh` (vorher einmal `chmod +x start.sh`).

Es öffnet sich ein schwarzes Fenster mit ungefähr:
```
[SMP-Kit] Server startet ...
[SMP-Kit] Shop im Browser:  http://localhost:8080
```
**Lass dieses Fenster offen** – solange es läuft, läuft der Server.
Beim ersten Mal fragt Windows evtl. die Firewall → **„Zugriff zulassen"**.

**Test:** Browser öffnen, `http://localhost:8080` eingeben → du siehst die Verkaufsseite. 🎉

---

## Schritt 4 – Im Spiel verbinden

In Minecraft mit installierter SMP-Kit-Mod:
```
/smpkit seturl http://localhost:8080
/smpkit check <spielername>
```
Läuft der Server nur zum Testen auf demselben PC, reicht `localhost`. Fürs Zusammenspiel mit
anderen brauchst du Schritt 5.

---

## Schritt 5 – Für andere erreichbar machen (Tunnel, empfohlen)

Ein Heim-PC ist von außen normalerweise nicht erreichbar. Am einfachsten ohne Router-Gefummel:
ein **Cloudflare-Tunnel**. Der gibt dir sofort eine öffentliche `https`-Adresse.

1. `cloudflared` installieren
   - Windows: im Terminal `winget install --id Cloudflare.cloudflared`
     (oder .exe von https://github.com/cloudflare/cloudflared/releases)
   - Mac: `brew install cloudflared`
2. Server läuft (Schritt 3). In einem **zweiten** Fenster:
   ```
   cloudflared tunnel --url http://localhost:8080
   ```
3. Es erscheint eine Adresse wie `https://zufall-name.trycloudflare.com`. **Das ist deine
   öffentliche Server-Adresse.** Alle tragen im Spiel ein:
   ```
   /smpkit seturl https://zufall-name.trycloudflare.com
   ```

> Solange dein PC an ist und beide Fenster laufen, ist der Dienst online. Schaltest du den PC
> aus, ist er offline. Für Dauerbetrieb lohnt später ein kleiner Server/VPS (siehe
> `smpkit-backend/README.md`, Docker/systemd) oder ein fester Cloudflare-Tunnel mit eigener Domain.

---

## Schritt 6 – Echten Verkauf aktivieren (optional, für die 4,99 €)

Solange du keine Stripe-Schlüssel einträgst, läuft der Kauf nur **simuliert** (Dev-Modus) – gut
zum Ausprobieren. Für echtes Geld:

1. Im Ordner `smpkit-backend` die Datei `config.env.example` kopieren zu **`config.env`**.
2. In `config.env` das `#` entfernen und ausfüllen:
   ```
   SMPKIT_PUBLIC_URL=https://deine-tunnel-oder-domain
   SMPKIT_LICENSE_REQUIRED=true
   STRIPE_SECRET_KEY=sk_live_...      # aus dem Stripe-Dashboard
   ```
3. Kostenloses Stripe-Konto auf https://stripe.com anlegen, Secret Key kopieren.
4. Server neu starten (Fenster schließen, `start.bat` erneut). Fertig – Käufe zahlen jetzt auf
   dein Stripe-/Bankkonto ein, Käufer bekommen ihren Lizenzschlüssel automatisch.

> Für einen echten, öffentlichen Verkauf brauchst du **Impressum, AGB/Widerruf und musst die
> Umsatzsteuer beachten** – je nach Land/Umfang. Bitte vorher kurz informieren.

---

## Kurz-Spickzettel

| Ich will … | Tun |
|---|---|
| Server starten | `start.bat` doppelklicken (Fenster offen lassen) |
| Shop ansehen | Browser → `http://localhost:8080` |
| Server beenden | Fenster schließen oder `Strg + C` |
| Öffentlich machen | `cloudflared tunnel --url http://localhost:8080` |
| Verkauf scharf schalten | `config.env` mit Stripe-Keys + `SMPKIT_LICENSE_REQUIRED=true` |
| Einstellungen ändern | `config.env` bearbeiten, Server neu starten |

Probleme? „Python nicht gefunden" → Schritt 1, „Add to PATH" vergessen. Alles andere steht in
`smpkit-backend/README.md`.
