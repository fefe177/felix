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

## 🎮 So funktioniert's

- **Türme kaufen:** Im Shop rechts auf einen Turm klicken, dann aufs Gras klicken zum Platzieren. Auf dem Weg geht's nicht!
- **Upgraden:** Platzierten Turm anklicken → im Panel rechts auf 🆙 Upgrade (5 Level pro Turm).
- **Verkaufen:** Bringt 70 % des investierten Geldes zurück.
- **Zielmodus:** Pro Turm umschaltbar – Erster / Letzter / Stärkster.
- **Wellen:** 40 Wellen, alle 10 Wellen kommt ein **BOSS** 👑. Mit „Auto" starten die Wellen automatisch.
- **Geschwindigkeit:** ⏩ Knopf schaltet 1x / 2x / 3x.
- **Tasten:** `Leertaste` = Welle starten, `ESC` = Abbrechen.

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

- **3 Schwierigkeitsgrade:** 😊 Leicht / 🙂 Normal / 😈 Schwer (mehr Gegner-HP, weniger Startgeld)
- **🏆 Highscore** wird automatisch gespeichert
- **Wellen-Vorschau:** Du siehst vor jeder Welle, welche Gegner kommen
- **⏸ Pause** (Knopf oder Taste P), 🎵 Hintergrundmusik an/aus
- **Schadenszahlen**, Todesanimationen, brennende Gegner und Kettenblitze in 3D

Viel Spaß! 🎉
