# SMP-Kit (Fabric-Client-Mod)

Client-seitige Fabric-Mod für Economy-SMPs (Donut SMP, Hugo SMP) mit drei Modulen:

1. **Reputation / Trust** – Spieler per GUI melden (Report) oder empfehlen (Vouch). Jeder
   Spieler bekommt einen **Vertrauenswert in %**, der beim Anschauen eingeblendet wird. Ab
   genügend Meldern landet jemand auf einer **geteilten Blacklist**, die alle Mod-Nutzer sehen.
   Warnung, wenn ein geflaggter Spieler in der Nähe ist.
2. **SafeTrade** – Doppelbestätigung für große `/pay`-Beträge (Schutz vor dem „eine Null zu
   viel"-Vertipper).
3. **Ledger + Grind** – persönliches Economy-HUD (Kontostand, Netto/Sitzung, Einkommen/h) und
   optionaler Grind-Ertrag pro Stunde.

Alles rein client-seitig und ohne Kampf-/Radar-Vorteil (siehe „Regelkonformität").

## Voraussetzungen

- Minecraft **1.21.1** (Java), **Fabric Loader** + **Fabric API**
- Zum Bauen: **JDK 21**
- Das **Trust-Backend** (Ordner `../smpkit-backend`) muss laufen und im Client per
  `/smpkit seturl <url>` eingetragen sein, sonst funktionieren Report/Vouch/Trust-Anzeige nicht
  (SafeTrade und Ledger laufen auch ohne Backend).

## Bauen

```bash
./gradlew build
# Ergebnis: build/libs/smpkit-1.0.0.jar  ->  in den mods-Ordner kopieren
```

> **Hinweis:** Dieses Projekt wurde in einer Sandbox erstellt, deren Netzwerk-Policy die
> Fabric-/Mojang-Server blockiert – dort ließ es sich nicht kompilieren. Auf einem normalen
> Rechner mit Internet baut `./gradlew build` das Projekt (Loom lädt Minecraft, Mappings und
> Fabric API selbst). Passt du eine **andere Minecraft-Version** an, ändere die vier Werte in
> `gradle.properties` (aktuelle Zahlen: https://fabricmc.net/develop ).

## Bedienung

**Tastenkürzel** (in den Steuerungs-Optionen unter „SMP-Kit" änderbar):
- `R` – angeschauten Spieler melden (öffnet das Report-GUI)
- `B` – geteilte Blacklist öffnen

**Befehle** (`/smpkit …` oder `/smptrust …`):
| Befehl | Wirkung |
|---|---|
| `check <spieler>` | Trust-Wert abfragen |
| `report <spieler>` | Report-GUI öffnen |
| `vouch <spieler>` | Spieler empfehlen |
| `unreport <spieler>` | eigenen Report zurückziehen |
| `list` | Blacklist-GUI |
| `seturl <url>` | Backend-URL setzen |
| `setkey <key>` | API-Key setzen |
| `hud ledger\|grind\|trust` | HUD-Anzeige an/aus |
| `grindstart <name>` | neue Grind-Messung starten |

**Konfiguration:** `config/smpkit.json` (Schwellen, Toggles, Backend-URL).

## Regelkonformität (wichtig für Donut/Hugo SMP)

Die Mod liest ausschließlich **eigene Aktionen** sowie ohnehin sichtbare **Nametags/Chat**.
Sie enthält **kein** Player-Radar, **keine** Kampf-Automatisierung und **kein** Auto-Totem –
also nichts aus den typischen Bann-Listen. Die Trust-Anzeige ist rein informativ. Prüfe vor
dem Einsatz dennoch die aktuellen Serverregeln; im Zweifel bei der Serverleitung nachfragen.

## Architektur (Kurzüberblick)

```
SmpKitClient        Einstieg: registriert HUDs, Chat, Keybinds, Commands, Tick-Handler
config/             persistente JSON-Konfiguration
net/TrustApi        asynchroner HTTP-Client zum Backend (java.net.http)
net/ChatBus         /pay-Doppelbestätigung + Parsing eingehender Zahlungen
reputation/         TrustCache, ReportScreen (GUI), BlacklistScreen (GUI), TrustHud
ledger/ + grind/    Economy-/Grind-Statistik + gemeinsamer EconomyHud
util/               Blickstrahl, Geldbeträge, Chat-Ausgabe, Identität
```
