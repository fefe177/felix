# 🏰 Blox Tower Defense 3D

Ein Tower-Defense-Spiel im Roblox-Stil mit **echter 3D-Ansicht** – komplett im Browser spielbar, keine Installation nötig! (Three.js liegt im `vendor/`-Ordner, das Spiel funktioniert auch offline.)

## ▶️ Als richtige Desktop-App starten (kein Browser!)

Das Spiel läuft als **echte App** mit eigenem Fenster und Icon (Electron –
damit sind auch Discord und viele Steam-Spiele gebaut). Shader und
Ray-Tracing-Wasser laufen darin direkt auf deiner Grafikkarte.

### Am einfachsten (nur doppelklicken)

1. Einmalig [Node.js](https://nodejs.org) installieren (grüner **LTS**-Knopf)
2. Dann **doppelklicken**:
   - **Windows:** `START_WINDOWS.bat`
   - **macOS / Linux:** `START_MAC_LINUX.command`

Beim allerersten Start richtet sich das Spiel kurz selbst ein, danach öffnet
sich sofort das **App-Fenster** (keine Browserleisten, `F11` = Vollbild).
Ab dann startet jeder Doppelklick die App direkt.

### Für Profis (Terminal)

`npm install` einmalig, danach `npm start`.

### 📦 Echte EXE bauen (zum Weitergeben)

```bash
npm run build:win     # Windows  → dist/Blox Tower Defense 3D-win32-x64/
npm run build:mac     # macOS
npm run build:linux   # Linux
```

Danach liegt im `dist/`-Ordner eine **Blox Tower Defense 3D.exe**, die auf
jedem PC per Doppelklick läuft – ganz ohne Node.js oder Browser.

### Alternative (ohne Installation)

Zur Not kann man auch einfach `index.html` doppelklicken – dann läuft das
Spiel im Browser. Die Grafik ist identisch, denn auch dort rechnet die GPU.

## 🎮 Das Menüsystem

1. **Hauptmenü:** Großer 🎮 **SPIELEN**-Button, dazu 🏪 Shop, ⚙ Einstellungen und 🏆 Rekorde.
2. **Modus auswählen:** 🛡 **Normaler Modus** (40 Wellen) und 👹 **Boss Rush**
   (nach einem Sieg auf einer ⭐⭐⭐-Karte freigeschaltet). Hardcore, Endlos,
   Sandbox und Koop sind sichtbar, aber noch 🔒 gesperrt.
3. **Karte auswählen:** 5 Karten mit Vorschaubild, ⭐-Schwierigkeit und deinem Rekord.
4. **▶ SPIEL STARTEN:** Kurzer Ladebildschirm („Lade Karte…"), dann geht's los –
   mit 500 Startgeld, 100 Leben, Welle 1.

## 👹 Boss Rush

Freigeschaltet, sobald du eine ⭐⭐⭐-Karte (oder schwerer) durchgespielt hast.
Nur Bosse, alle **60 Sekunden** ein neuer – und jeder wird stärker. Jeder Boss
hat eine **Spezialfähigkeit**:

- 🟢 **Beschwörer** – ruft regelmäßig flinke Diener herbei
- 🟣 **Schattenfürst** – blendet alle Türme für 5 Sekunden (sie können nicht schießen)
- 🔴 **Berserker** – bekommt bei 50 % Leben einen Tempo-Schub
- ⬛ **Titan** – riesiger Beschwörer mit massig Leben

Mehr Startgeld (1500 💰), da es keine normalen Wellen gibt. Das Spawn-Portal
**pulsiert 2 Sekunden rot und bebt**, bevor ein neuer Boss erscheint.

## 🛒 Kaufleiste & 3D-Modelle

Jede Turm-Karte zeigt ein **echtes, sich drehendes 3D-Mini-Modell** des Turms
(statt eines Icons). Beim Drüberfahren rotiert es schneller und ein Tooltip zeigt
die Werte. Nicht leistbare/gesperrte Türme sind ausgegraut, der gewählte Turm
leuchtet in seiner Farbe. Im Upgrade-Panel dreht sich das Modell der aktuellen
Stufe (mit Gold-Noppen und Helm ab Level 3).

## 🗺 Die 5 Karten

| Karte | Schwierigkeit | Thema |
|---|---|---|
| 🌲 Grasslands | ⭐ Einfach | Grüne Wiesen, Holzbrücke, kleine Häuser |
| 🏜 Desert Valley | ⭐⭐ Mittel | Sand, Kakteen, Ruinen |
| ❄ Frozen Base | ⭐⭐⭐ Mittel | Schnee, Eiswege, gefrorene Gebäude |
| 🌋 Volcano Island | ⭐⭐⭐⭐ Schwer | **Lava statt Wasser**, Vulkan, schwarze Felsen |
| 🌌 Space Station | ⭐⭐⭐⭐⭐ Extrem | Weltraum, Neonblöcke, schwebende Plattformen |

Jede Karte hat einen **eigenen Weg**, eigene Farben und Deko – und je mehr Sterne,
desto stärker die Gegner!

## 🏪 Shop & Münzen

- Du verdienst 🪙 **Münzen** durch geschaffte Wellen, Siege und Niederlagen.
- Im Shop kaufst du **Skins** für deine Lobby-Figur (Roter Ritter, Ninja, Magier,
  Goldener Held, Schatten …).

## 🌀 Die Lobby

Über „3D-Lobby erkunden" läufst du mit deiner Figur (**WASD**/Pfeiltasten) über
die Lobby-Insel – mit deinem gekauften Skin! Das goldene **SPIELEN-Portal**
öffnet die Modus-Auswahl, die Rekord-Tafel zeigt deine beste Welle.

## 🎮 So funktioniert's im Spiel

- **Türme kaufen:** Im Shop rechts auf einen Turm klicken – die Truppe hängt dann
  **durchsichtig am Cursor** und kann **frei überall** auf dem Feld platziert werden
  (nicht auf dem Weg, nicht zu nah an anderen Türmen).
- **⛰ Anhöhen:** Jede Karte hat erhöhte Plateaus. Der **Scharfschütze** kann **nur
  auf Anhöhen** platziert werden – alle anderen Truppen überall sonst (aber nicht
  auf den Anhöhen).
- **Upgraden:** Platzierten Turm anklicken → 🆙 Upgrade (5 Level pro Turm).
- **Verkaufen:** Bringt 70 % des investierten Geldes zurück.
- **Zielmodus:** Pro Turm umschaltbar – Erster / Letzter / Stärkster.
- **Wellen:** 40 Wellen, alle 10 Wellen kommt ein **BOSS** 👑. Mit „Auto" starten die Wellen automatisch.
- **Geschwindigkeit:** ⏩ Knopf schaltet 1x / 2x / 3x.
- **Tasten:** `Leertaste` = Welle starten, `ESC` = Fenster schließen/Abbrechen, `P` = Pause.

## 🎥 Kamera (3D)

- **Drehen:** Linke Maustaste gedrückt halten und ziehen
- **Zoomen:** Mausrad
- **Verschieben:** Rechte Maustaste gedrückt halten und ziehen
- **Zurücksetzen:** 📷 Knopf oben rechts

## 🗼 Die Türme

| Turm | Kosten | Besonderheit |
|---|---|---|
| 🔫 Schütze | $250 | Günstiger Allrounder |
| 🎯 Scharfschütze | $400 | Riesige Reichweite, harter Schuss |
| ❄️ Eismagier | $500 | Verlangsamt Gegner (ab Welle 3) |
| 🔥 Flammenwerfer | $650 | Trifft Gruppen + Brand-Schaden (ab Welle 6) |
| 🚀 Raketenwerfer | $800 | Flächenschaden (ab Welle 5) |
| 💥 Minigunner | $900 | Extrem schnelles Feuer (ab Welle 8) |
| ⚡ Tesla | $1100 | Kettenblitz auf mehrere Gegner (ab Welle 12) |
| 🌾 Farm | $600 | Bringt Geld am Ende jeder Welle |

## 👾 Die Gegner

Zombie 🧟, Flitzer ⚡ (schnell!), Brocken 🪨, Panzer 🛡️, Dämon 😈, **Heiler** ⛑️
(heilt seine Freunde – zuerst ausschalten!) und der **BOSS** 👑.
Die Gegner werden mit jeder Welle stärker – baue deine Verteidigung clever aus!

## ✨ Extras

- **🏆 Rekorde pro Karte** werden automatisch gespeichert
- **Wellen-Vorschau:** Du siehst vor jeder Welle, welche Gegner kommen
- **🖥 Hohe Grafik:** Bis zu 3-fach Supersampling (mehr Pixel!), 4K-Schatten und
  Roblox-Noppen auf allen Kacheln – in den Einstellungen umschaltbar
- **✨ Ray-Tracing-Wasser:** Die ganze Insel spiegelt sich live im Wasser
  (echte Spiegel-Reflexion), dazu ein eigener Wellen-Shader mit Sonnen-Glitzern
  und ein Himmel-Shader mit Farbverlauf und Sonne – auf Volcano Island glüht
  stattdessen die Lava. In den Einstellungen umschaltbar.
- **🔊 Sound-Upgrade:** Jeder Turm hat einen eigenen Schuss-Sound (Schütze Plopp,
  Sniper Knall mit Hall, Tesla elektrisches Knistern, Rakete Zisch + Wumms),
  dazu Boss-Warnungs-Horn, Münz-Klingeln bei der Farm und UI-Klicks – alles per
  Web Audio API erzeugt, keine externen Dateien
- **🎚 Lautstärke-Regler** getrennt für Musik und Effekte
- **🌀 Spawn-Portale:** Jede Karte hat ein eigenes Portal (Höhle, Ruine, Eishöhle,
  Lavaspalt, Sci-Fi-Teleporter); Gegner treten mit Partikel-Puff aus dem Dunkel.
  Das Ziel-Tor blitzt rot, wenn ein Gegner durchkommt
- **⚙ Einstellungen:** Grafik, Sound, Musik, Schatten und Schadenszahlen umschaltbar
- **⏸ Pause** (Knopf oder Taste P), 🎵 Hintergrundmusik an/aus
- **Schadenszahlen**, Todesanimationen, brennende Gegner und Kettenblitze in 3D

Viel Spaß! 🎉
