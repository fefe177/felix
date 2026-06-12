# 🏰 Blox Tower Defense 3D

Ein Tower-Defense-Spiel im Roblox-Stil mit **echter 3D-Ansicht** – komplett im Browser spielbar, keine Installation nötig! (Three.js liegt im `vendor/`-Ordner, das Spiel funktioniert auch offline.)

## ▶️ So startest du das Spiel

Einfach die Datei **`index.html`** im Browser öffnen (Doppelklick) – fertig!

Oder mit einem kleinen lokalen Server (falls vorhanden):

```bash
npx serve .
# oder
python3 -m http.server 8000
```

und dann `http://localhost:8000` öffnen.

## 🎮 Das Menüsystem

1. **Hauptmenü:** Großer 🎮 **SPIELEN**-Button, dazu 🏪 Shop, ⚙ Einstellungen und 🏆 Rekorde.
2. **Modus auswählen:** Aktuell 🛡 **Normaler Modus** (40 Wellen). Hardcore, Endlos,
   Boss Rush, Sandbox und Koop sind schon sichtbar, aber noch 🔒 gesperrt.
3. **Karte auswählen:** 5 Karten mit Vorschaubild, ⭐-Schwierigkeit und deinem Rekord.
4. **▶ SPIEL STARTEN:** Kurzer Ladebildschirm („Lade Karte…"), dann geht's los –
   mit 500 Startgeld, 100 Leben, Welle 1.

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
- **⚙ Einstellungen:** Sound, Musik, Schatten und Schadenszahlen umschaltbar
- **⏸ Pause** (Knopf oder Taste P), 🎵 Hintergrundmusik an/aus
- **Schadenszahlen**, Todesanimationen, brennende Gegner und Kettenblitze in 3D

Viel Spaß! 🎉
