# Claude spielt Minecraft – wirklich selbst

Hier bekommt Claude einen eigenen Körper in Minecraft. Anders als früher gibt es **keinen Autopiloten**:
kein „geh zu x/y/z“ und kein Programm, das Zombies automatisch haut. Claude hat nur:

- **Augen**: Nach jeder Aktion bekommt Claude ein Bild aus der Sicht der eigenen Figur, dazu eine kurze
  Beschreibung (Leben, was im Fadenkreuz ist, welche Monster wo sind) und eine kleine Karte von oben.
- **Hände und Füße**: umschauen, Tasten drücken (laufen, springen, sprinten, schleichen), schlagen,
  abbauen, Blöcke setzen, essen, Türen öffnen, Sachen herstellen und im Chat schreiben.

Jede Bewegung entscheidet Claude selbst. Taucht ein Zombie auf, muss Claude sich selbst zu ihm drehen,
hinlaufen, zuschlagen und ausweichen.

**Der Trick mit der Zeit:** Claude braucht zum Nachdenken ein paar Sekunden. Im **Rundenmodus** hält
Claude die Welt mit `/tick freeze` an, solange Claude nachdenkt. Nur während der Aktionen läuft sie
weiter, wie bei einem Rundenspiel. Wenn du mitspielst und das nicht willst, sag Claude einfach
„spiel in Echtzeit“.

**Bauen:** Gebäude denkt sich Claude selbst aus, Schicht für Schicht mit genauen Koordinaten. Beim
Setzen zielt der Bot nur ganz genau auf die richtige Blockseite, so wie eine ruhige Hand an der Maus.
Welcher Block wohin kommt, entscheidet Claude. Dafür muss Claude selbst hinlaufen, denn die Hand reicht nur
4,5 Blöcke weit. Für hohe Wände baut Claude sich eine Säule und klettert hoch.

---

## Was du brauchst (einmalig)

1. **Minecraft Java Edition** mit Version **1.21.4**:
   Im Minecraft Launcher auf *Installationen* → *Neue Installation* klicken und als Version
   „release 1.21.4“ auswählen.
2. **Node.js 22 oder neuer**: https://nodejs.org (die „LTS“-Version)
3. **Java 21** für den Server: https://adoptium.net
   (Windows geht auch so: `winget install EclipseAdoptium.Temurin.21.JRE`)
4. **Claude Code** auf deinem PC (Claude-Desktop-App → *Code*, oder im Terminal `claude`).
5. **Chrome oder Edge**, damit Claude sehen kann. Edge ist bei Windows schon dabei.
   Falls es trotzdem nicht klappt: `npm run augen`.

Dann in diesem Ordner einmal ausführen:

```
npm install
```

## Spielen

**Fenster 1 – der Minecraft-Server:**

```
npm run server
```

Beim ersten Mal lädt das den offiziellen Server von Mojang herunter. Danach fragt es, ob du den
Minecraft-Nutzungsbedingungen (EULA) zustimmst (bist du noch nicht volljährig, frag deine Eltern), und wie du in Minecraft
heißt. So darfst du auch Befehle benutzen. Der Server läuft, solange das Fenster offen ist. Zum
Beenden tippst du `stop`.

**Minecraft:** *Mehrspieler* → *Direktverbindung* → `localhost` → *Server betreten*.

**Fenster 2 – Claude:** In diesem Ordner Claude Code starten und schreiben:

> Spiel Minecraft mit mir!

Beim ersten Mal fragt Claude Code, ob es den MCP-Server „minecraft“ benutzen darf: **Ja**.
Dann kommt Claude als Spieler „Claude“ in deine Welt.

**Zuschauen, was Claude sieht:** Öffne im Browser http://localhost:3007

## Ideen

- „Bau mir eine Burg mit zwei Türmen neben meinem Haus.“
- „Hilf mir, die Nacht zu überleben.“
- „Such Eisen und mach dir eine Rüstung.“
- „Spiel in Echtzeit“ / „Spiel im Rundenmodus“
- Im Minecraft-Chat kannst du Claude direkt etwas schreiben. Claude liest es beim nächsten Zug.

## Wenn etwas nicht klappt

| Problem | Lösung |
| --- | --- |
| Alle Monster stehen still | Das ist der Rundenmodus. Sag Claude „spiel in Echtzeit“, oder tippe im Minecraft-Chat `/tick unfreeze` |
| „Kein Minecraft-Server“ | Läuft Fenster 1 mit `npm run server`? |
| Minecraft sagt „Veraltet“ / „Outdated“ | Im Launcher die Version **1.21.4** auswählen |
| „Rundenmodus geht nicht“ | In Fenster 1 `op Claude` eintippen, dann Claude neu verbinden lassen |
| „Augen aus“ | Chrome oder Edge installieren oder `npm run augen` |
| Java fehlt | siehe oben, Java 21 installieren und das Fenster neu öffnen |

## Wie es gebaut ist

```
bot/index.js   MCP-Server: die Werkzeuge, die Claude in Claude Code benutzt
bot/body.js    Körper: jede Aktion ist so klein wie ein Tastendruck oder Mausklick
bot/senses.js  Sinne: Status, Fadenkreuz, Wesen, Karte (ohne Röntgenblick)
bot/eyes.js    Augen: 3D-Ansicht (prismarine-viewer) + Screenshots mit Beschriftung
server/start.js  lädt und startet den offiziellen Minecraft-Server 1.21.4
CLAUDE.md      Spielregeln und Tipps für Claude
```

Der Server ist nur auf deinem PC erreichbar (`server-ip=127.0.0.1`) und läuft im Offline-Modus,
damit Claude kein eigenes Minecraft-Konto braucht.
