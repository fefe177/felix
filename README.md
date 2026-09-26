# Claude der Baumeister 🧱

Du schreibst im Minecraft-Chat zum Beispiel:

> bau ein Haus mit Garten

… und ein paar Minuten später steht es vor dir. Claude läuft dafür **nicht** durch die Welt. Stattdessen passiert Folgendes:

1. Der Minecraft-Server gibt deine Nachricht an Claude weiter.
2. Claude **entwirft** das Gebäude als Bauplan (mit Bau-Helfern für Wände, Dächer, Türen, Türme …).
3. Claude bekommt eine **Vorschau**: ein 3D-Bild von allen Seiten, jede Schicht als Raster und eine
   automatische Fehlerprüfung, z. B. auf schwebende Blöcke, halbe Türen oder Betten in der Wand.
   Damit findet Claude eigene Fehler und verbessert den Plan, meistens in 1–2 Runden.
4. Der fertige Plan wird **auf einen Schlag** vor dir gebaut, mit der Vorderseite zu dir.

Ein Bau braucht etwa **1–3 Minuten** und genau **einen** Claude-Auftrag. Das ist viel sparsamer als
Block für Block.

## Im Spiel

| Du schreibst im Chat | Was passiert |
| --- | --- |
| `Hallo Claude, was kannst du?` (irgendwas) | Claude antwortet im Chat und merkt sich das Gespräch. Bittest du dabei um einen Bau, baut Claude ihn. |
| `bau ein Haus` / `baue eine Burg mit zwei Türmen` | Claude plant und baut es vor dir. Schau dabei in die Richtung, in der es stehen soll! |
| `bau das Dach rot` / `bau noch einen Turm dran` | Claude ändert den letzten Bau (an derselben Stelle). |
| Nachricht mit `...` am Ende | Für lange Texte (Minecraft erlaubt nur 256 Zeichen): Claude wartet, bis eine Nachricht ohne `...` kommt, und setzt alles zusammen. |
| `!weg` | Der letzte Bau wird wieder entfernt. |
| `!stopp` | Das Planen wird abgebrochen. |
| `!hilfe` | Kurze Hilfe im Chat. |

Während Claude plant, siehst du im Chat, was gerade passiert.
Die Vorschau-Bilder liegen danach in `bau/auftraege/<datum>/`, die Baupläne in `bau/bauten/`.

Gut zu wissen:
- Vor dem Bauen wird der Platz freigeräumt, und Löcher darunter werden mit Erde aufgefüllt. `!weg`
  entfernt den Bau, bringt aber Bäume oder Hügel, die dort standen, nicht zurück.
- Truhen bleiben leer, und Schilder haben keinen Text.

## Die Baumeister-Zentrale

Wenn der Server startet, öffnet sich im Browser **http://localhost:3008**. Dort kannst du:
- mit Claude **chatten – ohne Zeichenlimit**. Claude antwortet dort und im Spiel. Mit „bau …“ startest
  du auch dort einen Bau. Er wird vor dir im Spiel gebaut.
- **Einstellungen** ändern: welches KI-Modell baut und chattet (Haiku, Sonnet, Opus), wie gründlich
  Claude nachdenkt, wie viele Vorschau-Runden erlaubt sind und ob Claude auf alle Chat-Nachrichten
  antwortet oder nur, wenn „Claude“ darin vorkommt.
- den **Verbrauch** sehen: heute und insgesamt, getrennt nach Bauen und Chat, mit Tokens und Dauer.
  Die Beträge sind geschätzt. So viel würde es über die API kosten. Mit dem Claude-Abo zahlst du nichts
  extra, es zählt aber zum Nutzungslimit. Richtwerte mit Sonnet: ein Bau ca. $0.30–0.40, eine
  Chat-Antwort ca. $0.03.
- alle **Bauten** mit ihren Vorschau-Bildern und den **Chat** ansehen, einen Bau abbrechen oder den
  letzten Bau entfernen.

## Einrichten (einmalig)

Du brauchst Minecraft Java **1.21.4**, Node.js 22+, Java 21+ und Claude Code (angemeldet).
Im Projektordner einmal:

```
npm install
```

Für die 3D-Vorschau braucht es Chrome oder Edge (Edge ist bei Windows dabei). Klappt die Vorschau nicht:
`npm run augen`.

## Starten

In einem Befehlsfenster im Projektordner (in PowerShell vorher `cmd` eintippen):

```
npm run server
```

Dann in Minecraft: **Mehrspieler → Direktverbindung → `localhost`**. Fertig! Claude Code musst du dafür
nicht extra öffnen, der Server startet Claude selbst, sobald du im Chat „bau …“ schreibst.


## Einen Bauplan selbst ansehen

```
npm run vorschau -- bau/beispiele/haus.js
```

Das zeigt die Schichten und die Prüfung und speichert ein Vorschau-Bild neben dem Bauplan.

## Wie es gebaut ist

```
server/start.js     startet den Minecraft-Server und hängt die Chat-Brücke dazwischen
bau/bruecke.js      liest den Chat, antwortet, startet Aufträge, baut das Ergebnis mit fill/setblock
bau/auftrag.js      startet Claude Code im Hintergrund ("claude -p") für Bau und Chat
bau/zentrale.js     die Baumeister-Zentrale (Webseite in bau/zentrale/)
bau/einstellungen.js, bau/verbrauch.js   Einstellungen und Verbrauchszähler
bau/mcp.js          die Werkzeuge „vorschau“ und „fertig“ für Claude
bau/modell.js       führt Baupläne aus, prüft Blöcke, findet Fehler, zeichnet Schichten
bau/render.js       3D-Bilder mit prismarine-viewer
bau/platzieren.js   dreht den Bau zum Spieler und macht Minecraft-Befehle daraus
bau/beispiele/      Beispiel-Baupläne
CLAUDE.md           Bauregeln und Tipps für Claude
bot/                pausiert: das erste Projekt, in dem Claude selbst spielt
```
