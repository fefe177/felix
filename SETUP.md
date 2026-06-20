# BigMC – Schnellstart-Checkliste

Diese Checkliste führt durch die **Erst-Einrichtung** nach dem Einspielen der
`BigMC.jar`. Reihenfolge empfohlen. Alle Zahlen stehen in `config.yml`, alle
Texte in `messages.yml`. Nach Config-Änderungen: **`/bigmc reload`** (kein
Server-Neustart nötig).

> Voraussetzung: Paper 1.21.x, `BigMC.jar` in `plugins/`, Server einmal gestartet
> (erzeugt `config.yml`, `messages.yml`, `bigmc.db`). Mach dich per
> `op <DeinName>` in der Server-Konsole zum Admin.

---

## 1. Grundlagen (Welt & Teleporte)

- [ ] **Spawn bauen & setzen:** an eine **freie, flache Stelle** stellen →
  `/spawnbuild` → eines der **10 Designs** anklicken. Das setzt Spawn +
  Schutzzone automatisch. (Alternativ nur Punkt setzen: `/setspawn`.)
- [ ] **RTP-Welt prüfen:** in `config.yml` unter `rtp.world` den Namen deiner
  Hauptwelt eintragen (Standard `world`), ggf. `center-x/z` und `min/max-radius`.
- [ ] **AFK-Zone setzen:** an den gewünschten Ort stellen → `/afk set`.
  Belohnung pro Intervall: `afk.shards-per-interval` / `afk.reward-interval-seconds`.
- [ ] **Duell-Arena setzen** (falls genutzt): `/duel setspawn 1` und
  `/duel setspawn 2` an zwei Positionen.

## 2. Wirtschaft & Währungen

- [ ] **Startguthaben** prüfen: `economy.start-balance`.
- [ ] **Shards-Quellen** justieren: `shards.per-kill` (PvP) und die AFK-Werte.
- [ ] **Shop-/Sell-Preise** anpassen: Abschnitt `shop.categories` +
  `shop.fallback-sell-price` (Standardwert für nicht gelistete Blöcke).
- [ ] **Spawner-Preise**: `spawners.types.<typ>.shard-price` (0 = kostet Geld).

## 3. Progression

- [ ] **Quests** anpassen: `quests.daily` / `quests.weekly` (Ziele, Mengen,
  Belohnungen). `daily-count` / `weekly-count` = wie viele gleichzeitig aktiv.
- [ ] **Battle Pass**: `battlepass.season` (aktuelle Season-Nummer),
  `xp-per-level`, `max-level`, `premium-cost-money` und die Level-Belohnungen.
- [ ] **Prestige**: `prestige.base-cost`, `cost-multiplier`,
  `sell-bonus-percent` (Bonus je Stufe).
- [ ] **Daily Login**: `dailylogin.cycle` (Zykluslänge) + `rewards.<tag>`.

## 4. Belohnungs-Systeme

- [ ] **Crates** definieren: `crates.<id>` (Belohnungen + Gewichte). Schlüssel
  vergeben: `/crate givekey <spieler> <crate> <anzahl>` (auch offline) oder
  `/bigmcadmin crate givekey ...`.
- [ ] **Boss-Events**: in `bossevents.bosses.<id>.location` die `world` +
  Koordinaten setzen (leer = nahe zufälligem Spieler). `interval-minutes`,
  `fight-timeout-seconds`, Belohnungen je Platz. Test: `/bossevent start`.
- [ ] **Cosmetics**: Partikel/Titel/Join-Nachrichten in `cosmetics.*` nach
  Wunsch erweitern.

## 5. Season & Verwaltung

- [ ] **Season-Wertung** festlegen: `season.ranking` (`kills` oder `money`),
  `season.reset-stats` (welche Stats beim Ende auf 0 gehen), Belohnungen je Platz.
  Optional `season.duration-days` > 0 für automatisches Ende.
- [ ] **Season manuell beenden/starten:** `/season end` (oder
  `/bigmcadmin season end`).

## 6. Optionale Server-Plugins (separat installieren)

- [ ] **Geyser + Floodgate** für Java+Bedrock-Crossplay.
- [ ] **NuVotifier** für echte Vote-Belohnungen (sonst nur `/vote test`).
- [ ] **Simple Voice Chat** für Voice.

---

## Wichtige Admin-Befehle

| Zweck | Befehl |
|---|---|
| Config & Texte neu laden | `/bigmc reload` |
| Zentrale Verwaltung | `/bigmcadmin` (Hilfe), `/bigmcadmin reload` |
| Battle Pass setzen | `/bigmcadmin battlepass setlevel\|addxp\|premium <spieler> <wert>` |
| Quests | `/bigmcadmin quest reset\|complete <spieler> [questId]` |
| Crate-Keys | `/bigmcadmin crate givekey <spieler> <crate> <anzahl>` |
| Clan | `/bigmcadmin clan disband\|setpoints <name> [punkte]` |
| Prestige | `/bigmcadmin prestige set <spieler> <level>` |
| Season | `/bigmcadmin season end` |
| Geld/Shards | `/money give ...`, `/shards give ...` |

---

## Test-Runde (5 Minuten)

1. `/money give <Name> 1000000` und `/shards give <Name> 1000`
2. `/quests` → Ziel erfüllen → Belohnung abholen
3. `/battlepass` → Level/Belohnungen ansehen, ggf. `/battlepass buy`
4. `/crate givekey <Name> vote 3` → `/crate` → öffnen (Animation)
5. `/clan create TestClan` → `/clan info`, `/clan top`
6. `/prestige` → aufsteigen → im Shop verkaufen (Bonus aktiv)
7. `/cosmetics` → Partikel/Titel ausrüsten
8. `/dailyreward` → abholen
9. `/bossevent start` → Boss bekämpfen → Rangliste
10. `/leaderboard` → Kategorien durchklicken

Viel Erfolg mit deinem Server! Bei Konsolen-Fehlern einfach die Meldung schicken.
