# BigMC

**BigMC** ist ein selbst entwickeltes Survival-SMP-Plugin für **Paper 1.21.x** im Stil von HugoSMP (LetsHugo) und DonutSMP. Es bündelt Wirtschaft, Shops, Auktionshaus, Aufträge, Statistiken, Duelle, Ränge, kostenpflichtiges Fliegen, Vote-Belohnungen und Events – ohne fertige Fremd-Plugins, komplett eigener Code.

- **Java:** 21
- **API:** Paper 1.21.x
- **Build:** Maven → eine `BigMC.jar`
- **Datenspeicher:** SQLite (persistent, kein externer DB-Server – der Treiber ist in die JAR eingebettet)

---

## Inhaltsverzeichnis

1. [Features & Befehle](#features--befehle)
2. [Bauen (mvn package)](#bauen-mvn-package)
3. [Installation](#installation)
4. [Konfiguration](#konfiguration)
5. [Reihenfolge der Server-Plugins](#reihenfolge-der-server-plugins)
6. [Crossplay & Voice Chat](#crossplay--voice-chat)
7. [Permissions-Übersicht](#permissions-übersicht)
8. [Projektstruktur](#projektstruktur)

---

## Features & Befehle

| Feature | Befehle | Kurzbeschreibung |
|---|---|---|
| **Wirtschaft** | `/money`, `/pay`, `/baltop` | Persistente Ingame-Währung pro Spieler |
| **Shop** | `/shop`, `/sell hand`, `/sell all` | Adminshop mit Festpreisen (GUI) |
| **Auktionshaus** | `/ah`, `/ah sell <preis>`, `/ah collect` | Spieler-zu-Spieler-Handel, scam-sicher |
| **Aufträge** | `/order create/list/fulfill/collect/cancel` | Buy-Orders mit Pfand-Prinzip |
| **Statistiken** | `/stats [spieler]`, `/top <kategorie>` | Kills, Tode, Duell-Siege, Spielzeit, Geld |
| **Duelle** | `/duel <spieler>`, `/duel accept/deny`, `/duel setspawn <1\|2>` | 1vs1 mit Inventar-Sicherung |
| **Ränge** | `/rank`, `/rank buy`, `/ranks`, `/rank set` | Leiter-System mit Prefix & Permissions |
| **Fliegen** | `/fly`, `/fly off`, `/fly time` | Befristeter Flug gegen Ingame-Geld |
| **Votes** | `/vote`, `/vote claim`, `/vote test` | Belohnungen über NuVotifier |
| **Events** | `/event start/stop/join/leave/info` | Einfaches Event-Grundgerüst |

Alle Zahlen stehen in `config.yml`, alle Texte in `messages.yml` (deutsch, mit `&`-Farbcodes).

---

## Bauen (mvn package)

Voraussetzungen: **JDK 21** und **Maven 3.8+** installiert.

```bash
# Im Projektordner (dort, wo die pom.xml liegt):
mvn clean package
```

Die fertige Datei liegt danach unter:

```
target/BigMC.jar
```

Der SQLite-JDBC-Treiber wird per `maven-shade-plugin` direkt in die JAR gepackt und umbenannt (relocated) – es ist also **kein** separater Datenbank-Server und keine zusätzliche Library nötig.

> **Hinweis zu Repositories:** Der Build lädt die Paper-API von `repo.papermc.io` und die optionale NuVotifier-API von `jitpack.io`. Beide müssen beim Bauen erreichbar sein. Hinter einer restriktiven Firewall ggf. einen Proxy/Spiegel konfigurieren.

---

## Installation

1. `BigMC.jar` in den `plugins/`-Ordner deines **Paper-1.21.x**-Servers kopieren.
2. Server starten. Beim ersten Start werden automatisch erstellt:
   ```
   plugins/BigMC/config.yml
   plugins/BigMC/messages.yml
   plugins/BigMC/bigmc.db        (+ bigmc.db-wal / bigmc.db-shm durch WAL-Modus)
   ```
3. In der Konsole sollte stehen:
   ```
   [BigMC] SQLite-Datenbank erfolgreich verbunden.
   [BigMC] BigMC vX.Y.Z wurde aktiviert.
   ```

### Wichtig nach der Installation

- **Duell-Arena einrichten:** Stelle dich an Position 1 → `/duel setspawn 1`, an Position 2 → `/duel setspawn 2`. Ohne gesetzte Arena lassen sich keine Duelle starten.
- **Ränge prüfen/anpassen:** Die Beispiel-Leiter (`Spieler → Bronze → Silber → Gold → Diamant`) in der `config.yml` nach Belieben ändern.
- **Vote-Links & Belohnungen** in der `config.yml` anpassen.

---

## Konfiguration

Nach Änderungen an `config.yml`/`messages.yml` den Server neu starten (oder `/reload confirm`, weniger empfohlen). Die wichtigsten Abschnitte:

| Abschnitt | Was einstellbar ist |
|---|---|
| `economy` | Startguthaben, Währungssymbol, Mindest-Pay, Baltop-Größe |
| `shop.categories` | Kategorien, Items, Kauf-/Verkaufspreise |
| `auction` | Laufzeit, max. Auktionen/Spieler, Preisspanne |
| `order` | max. Aufträge/Spieler, max. Menge, Mindestpreis |
| `stats` | Größe der `/top`-Listen |
| `duel` | Countdown, Herausforderungs-Timeout, Arena-Spawns, Start-Kit |
| `ranks.list` | Rang-Leiter: Name, Prefix, Preis, Voraussetzungen, Permissions |
| `fly` | Preis, Dauer, Vorwarnzeit, Sturzschutz |
| `vote` | Geld/Items/Befehle pro Vote, Vote-Links |
| `event.reward` | Belohnung (Geld/Items) für Event-Teilnehmer |

> **Tipp:** Item-/Material-Namen folgen den Bukkit-Material-Konstanten, z. B. `DIAMOND`, `IRON_INGOT`, `GRASS_BLOCK`. Referenz: <https://jd.papermc.io/paper/1.21/org/bukkit/Material.html>

---

## Reihenfolge der Server-Plugins

BigMC selbst hat **keine harten Abhängigkeiten** und startet eigenständig. Für ein vollständiges SMP wie HugoSMP/DonutSMP empfiehlt sich folgende Plugin-Zusammenstellung. Reihenfolge des Hineinkopierens ist unkritisch (Bukkit löst Abhängigkeiten beim Start selbst auf); entscheidend ist nur, dass abhängige Plugins zusammen vorhanden sind:

1. **Floodgate** – muss zusammen mit Geyser installiert sein (Bedrock-Authentifizierung).
2. **Geyser-Spigot** – Crossplay-Brücke für Bedrock-Spieler. Lädt Floodgate als Abhängigkeit.
3. **NuVotifier** *(optional)* – wird für echte Vote-Belohnungen benötigt. **Muss vor/zusammen mit BigMC vorhanden sein**, damit BigMC den Votifier-Listener registriert. Fehlt es, läuft BigMC trotzdem (Soft-Depend) – Votes dann nur über `/vote test` testbar.
4. **Simple Voice Chat** *(optional)* – serverseitiger Voice Chat, völlig unabhängig von BigMC.
5. **BigMC** – dieses Plugin.

> BigMC erkennt NuVotifier automatisch beim Start und meldet in der Konsole, ob Vote-Belohnungen aktiv sind.

---

## Crossplay & Voice Chat

Diese Komponenten sind **nicht Teil von BigMC** und laufen serverseitig separat – sie sind hier nur der Vollständigkeit halber dokumentiert:

### Crossplay (Java + Bedrock)
- **Geyser** + **Floodgate** ermöglichen, dass Bedrock-Spieler (Handy/Konsole/Win10) auf den Java-Server kommen.
- Downloads: <https://geysermc.org/download>
- Floodgate erlaubt Bedrock-Spielern den Beitritt **ohne** Java-Account.

### Voice Chat
- **Simple Voice Chat** (serverseitiges Plugin, Spieler brauchen die Client-Mod).
- Download: <https://modrinth.com/plugin/simple-voice-chat>

Beide funktionieren parallel zu BigMC ohne weitere Konfiguration auf BigMC-Seite.

---

## Permissions-Übersicht

Standardmäßig sind alle Spieler-Befehle für jeden freigegeben (`default: true`), Admin-Rechte nur für OPs (`default: op`).

| Permission | Standard | Zweck |
|---|---|---|
| `bigmc.money`, `bigmc.pay`, `bigmc.baltop` | true | Wirtschaft |
| `bigmc.money.admin` | op | Geld geben/abziehen/setzen |
| `bigmc.shop`, `bigmc.sell` | true | Shop & Verkauf |
| `bigmc.ah`, `bigmc.order` | true | Auktionshaus & Aufträge |
| `bigmc.stats`, `bigmc.top` | true | Statistiken & Ranglisten |
| `bigmc.duel` | true | Duelle |
| `bigmc.duel.admin` | op | Arena-Spawns setzen |
| `bigmc.rank`, `bigmc.ranks` | true | Ränge ansehen/kaufen |
| `bigmc.rank.admin` | op | Ränge anderer setzen |
| `bigmc.fly` | true | Fliegen kaufen |
| `bigmc.vote` | true | Vote-Links/Belohnungen |
| `bigmc.vote.admin` | op | `/vote test` |
| `bigmc.event` | true | Events beitreten |
| `bigmc.event.admin` | op | Events starten/beenden |

Rang-Permissions (z. B. `bigmc.perk.gold`) werden **kumulativ** über das Rangsystem vergeben und sind in `config.yml` frei definierbar.

---

## Projektstruktur

```
src/main/java/eu/bieder/bigmc/
├── BigMC.java                  # Hauptklasse / Service-Locator
├── config/                     # ConfigManager, MessageManager
├── database/                   # SQLite-Anbindung
├── economy/                    # Wirtschaft (Phase 1)
├── shop/                       # Adminshop (Phase 2)
├── auction/                    # Auktionshaus (Phase 3)
├── order/                      # Auftragssystem (Phase 4)
├── stats/                      # Statistiken (Phase 5)
├── duel/                       # Duelle (Phase 6)
├── rank/                       # Ränge (Phase 7)
├── fly/                        # Fliegen (Phase 8)
├── vote/                       # Vote-Belohnungen (Phase 9)
└── event/                      # Events (Phase 10)

src/main/resources/
├── plugin.yml                  # Commands & Permissions
├── config.yml                  # Alle Zahlen
└── messages.yml                # Alle Texte (deutsch)
```

Pro Feature gibt es einen eigenen Manager; die `BigMC`-Hauptklasse erzeugt sie und reicht sie per Getter weiter. Jede Klasse ist deutsch kommentiert.

---

## Datenbank

SQLite-Datei: `plugins/BigMC/bigmc.db`. Angelegte Tabellen u. a.:
`economy`, `auctions`, `auction_pending`, `orders`, `order_deliveries`, `stats`, `player_ranks`, `votes`, `bigmc_meta`.

Backups: einfach die `bigmc.db` (bei laufendem Server zusätzlich `-wal`/`-shm`) sichern.

---

*BigMC – viel Spaß auf deinem SMP!*
