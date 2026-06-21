# AGENT_SETUP — Anleitung für die lokale KI

**Diese Datei richtet sich an eine KI (z. B. Claude Code), die LOKAL auf dem
Windows-PC des Nutzers mit Shell-Zugriff läuft.** Ziel: einen lauffähigen
Paper-1.21.x-Server mit dem Plugin **BigMC** aufsetzen und verifizieren, dass das
Plugin ohne Fehler lädt. Arbeite die Schritte der Reihe nach ab, prüfe nach jedem
Schritt das Ergebnis und melde dem Nutzer klar, was passiert ist.

> Repo: `fefe177/felix` · Branch: `claude/bigmc-minecraft-plugin-srqtf3`
> Betriebssystem i. d. R. Windows. Erkenne das OS und nutze passende Befehle.

---

## 0. Voraussetzungen prüfen / herstellen

1. **Java 21** muss vorhanden sein: `java -version` → muss `21.x` zeigen.
   - Falls nicht: Nutzer bitten, Temurin JDK 21 zu installieren
     (<https://adoptium.net/temurin/releases/?version=21>, „Add to PATH“ anhaken),
     **oder** per Paketmanager (winget: `winget install EclipseAdoptium.Temurin.21.JDK`).
2. **Git** vorhanden? `git --version`. Falls nicht und nötig: winget `Git.Git`.
3. Arbeitsverzeichnis festlegen, z. B. `C:\BigMC-Server` (erstellen, falls nicht da).

## 1. Code holen

- Falls die Session bereits im geklonten Repo läuft: nichts zu tun.
- Sonst klonen:
  ```
  git clone https://github.com/fefe177/felix.git
  cd felix
  git checkout claude/bigmc-minecraft-plugin-srqtf3
  ```

## 2. `BigMC.jar` beschaffen

**Variante A (empfohlen): selbst bauen**
- Maven vorhanden? `mvn -version`. Falls nicht: winget `Apache.Maven` (oder Nutzer bitten).
- Bauen:
  ```
  mvn -q clean package
  ```
- Ergebnis: `target/BigMC.jar`. Prüfen, dass die Datei existiert.

**Variante B: fertige JAR aus GitHub Actions laden** (falls Maven fehlt und `gh` da ist)
- `gh auth status` → falls eingeloggt:
  ```
  gh run download -R fefe177/felix -n BigMC --dir build-out
  ```
- Ergebnis: `build-out/BigMC.jar`.

Wenn beides nicht geht, dem Nutzer sagen: „Bitte lade BigMC.jar aus GitHub →
Actions → neuester grüner Lauf → Artifacts → BigMC herunter und lege sie hier ab.“

## 3. Server-Ordner aufsetzen

Im Arbeitsverzeichnis (z. B. `C:\BigMC-Server`):

- Wenn die Datei `server-setup.bat` aus dem Repo verfügbar ist, kann sie genutzt
  werden. **Empfohlen ist aber, die Schritte direkt auszuführen**, damit du die
  Ausgaben kontrollieren kannst:

1. **Neueste Paper-1.21.4-Build ermitteln und herunterladen** (Host
   `api.papermc.io` ist vom PC aus erreichbar):
   - Build-Nummer holen:
     `https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds`
     → letztes Objekt im Array, Feld `build`.
   - Download:
     `https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds/<BUILD>/downloads/paper-1.21.4-<BUILD>.jar`
     → als `paper.jar` speichern.
   - PowerShell-Einzeiler (Windows):
     ```
     powershell -NoProfile -Command "$b=(Invoke-RestMethod 'https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds').builds[-1].build; Invoke-WebRequest \"https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds/$b/downloads/paper-1.21.4-$b.jar\" -OutFile 'paper.jar'"
     ```
2. **EULA akzeptieren** (Nutzer stimmt Mojang-EULA zu): Datei `eula.txt` mit
   Inhalt `eula=true` schreiben.
3. **plugins-Ordner** anlegen.
4. **BigMC.jar** aus Schritt 2 nach `plugins/BigMC.jar` kopieren.

## 4. Server starten und Plugin verifizieren

1. Server **headless** starten und die Konsolenausgabe mitlesen, z. B.:
   ```
   java -Xmx4G -jar paper.jar nogui
   ```
   (In Claude Code: als Hintergrund-Prozess starten und die Logdatei
   `logs/latest.log` beobachten.)
2. **Erfolg prüfen** — in der Ausgabe / `logs/latest.log` müssen erscheinen:
   - `[BigMC] SQLite-Datenbank erfolgreich verbunden.`
   - `[BigMC] BigMC vX.Y.Z wurde aktiviert.`
   - Zusätzlich Lade-Logs wie „Quests geladen“, „Crates geladen“, „Bosse geladen“,
     „Clans geladen“ usw.
   - **Es darf KEIN** `SEVERE`/`ERROR` mit `BigMC` oder Stacktrace auftauchen.
3. **Falls Fehler auftauchen:** die genaue Stacktrace/Meldung erfassen. Häufige
   Ursachen sind fehlende/zu alte Server-Version. Wenn der Fehler eindeutig im
   Plugin liegt, dem Nutzer die Zeilen zeigen — diese können an die Cloud-Session
   gemeldet und dort gefixt werden (neuer Build über GitHub Actions).
4. Server **sauber stoppen** mit dem Konsolenbefehl `stop` (nicht hart killen),
   damit die Datenbank sauber geschrieben wird.

## 5. Letzte Einrichtung (für den Nutzer)

Die folgenden Schritte kann die KI NICHT übernehmen (brauchen einen Spieler
im Spiel). Sage dem Nutzer wörtlich, was zu tun ist:

1. Server mit `start.bat` (bzw. `java -Xmx4G -jar paper.jar nogui`) starten.
2. In der **Server-Konsole**: `op <SPIELERNAME>` (du, die KI, kannst das auch in
   die laufende Konsole schreiben, wenn dir der Name bekannt ist).
3. In **Minecraft 1.21.x** → Mehrspieler → Direkte Verbindung → `localhost`.
4. Im Spiel:
   - `/spawnbuild` → ein Design anklicken (setzt Spawn + Schutzzone automatisch)
   - `/afk set` → an der gewünschten AFK-Stelle stehen
5. Optional: Preise/Belohnungen in `plugins/BigMC/config.yml` anpassen →
   `/bigmc reload`. Siehe `SETUP.md` für die Schnellstart-Checkliste.

## 6. Abschlussbericht an den Nutzer

Fasse am Ende zusammen:
- Java-Version, Paper-Build, ob das Plugin sauber geladen hat (mit den 2 Log-Zeilen).
- Pfad des Server-Ordners.
- Die 3–4 verbleibenden Ingame-Schritte (op, verbinden, /spawnbuild, /afk set).
- Falls ein Plugin-Fehler auftrat: die Stacktrace, damit er behoben werden kann.

> Hinweis: Crystal-PvP, Raids und Diebstahl sind Vanilla — KEIN Schutz-Plugin
> installieren, dann ist die Welt „anarchisch“ wie gewünscht. Optional separat:
> Geyser + Floodgate (Crossplay), NuVotifier (echte Votes), Simple Voice Chat.
