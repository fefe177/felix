# 🎰 Neon Casino – Simulator

Ein reiner **Spielgeld**-Casino-Simulator im Browser. Kein Echtgeld, keine
Registrierung, keine Abhängigkeiten – einfach `index.html` öffnen und spielen.

![Spielgeld](https://img.shields.io/badge/Echtgeld-nein-2ecc71) ![Vanilla JS](https://img.shields.io/badge/JS-vanilla-00e5ff)

## Starten

Einfach die Datei im Browser öffnen:

```bash
# Direkt öffnen
xdg-open index.html      # Linux
open index.html          # macOS

# oder über einen lokalen Server
python3 -m http.server 8000
# → http://localhost:8000
```

## Auf dem Handy spielen 📱

Das Layout ist vollständig responsiv (Touch-optimiert, kein horizontales
Scrollen). Es gibt drei einfache Wege aufs Handy:

- **Einzeldatei:** `dist/index.html` enthält alles inline (CSS + JS, keine
  externen Referenzen). Diese eine Datei aufs Handy schicken/öffnen genügt.
- **GitHub Pages:** In den Repo-Einstellungen *Pages* aktivieren
  (Quelle: Branch + Wurzelverzeichnis). Dann ist das Spiel unter einer festen
  URL erreichbar, die man am Handy öffnen (und als Icon zum Homescreen
  hinzufügen) kann.
- **Lokales Netz:** `python3 -m http.server 8000` starten und am Handy im
  gleichen WLAN `http://<PC-IP>:8000` öffnen.

Die Einzeldatei wird aus den modularen Quellen erzeugt:

```bash
node scripts/build.mjs   # → dist/index.html
```

## Spiele

| Spiel | Beschreibung | Auszahlung |
|-------|--------------|------------|
| 🎰 **Slots** | Drei Walzen, sechs Symbole. | 2 Gleiche ×2 · 3 Gleiche ×8 · 3× 7️⃣ ×20 |
| 🎡 **Roulette** | Europäisch (0–36, eine grüne Null). | Einfache Chancen ×2 · Volle Zahl ×36 |
| 🃏 **Blackjack** | Gegen den Dealer (steht bei 17). | Gewinn ×2 · Blackjack 3:2 · Push = Einsatz zurück |
| 🎲 **Dice** | Over/Under mit einstellbarem Ziel (1–100). | Dynamisch, 1 % Hausvorteil |
| 🪙 **Coinflip** | Kopf oder Zahl, 50:50. | ×2 |
| 🂡 **Video Poker** | Jacks or Better – Karten halten & tauschen. | Buben ×1 bis Royal Flush ×250 |

## Features

- 💰 **Gemeinsames Guthaben** über alle Spiele (Start: 1.000 Credits)
- 📊 **Statistik-Screen** mit Gewinnquote, größtem Gewinn, Netto-Gewinn,
  Highscore (höchstes je erreichtes Guthaben) und Aufschlüsselung pro Spiel
- 🔊 **Sound-Effekte** – per Web Audio API erzeugt (keine externen Dateien),
  mit Mute-Schalter
- 💾 **Automatisches Speichern** im `localStorage` – bleibt nach dem Neuladen erhalten
- ↻ **Reset-Button** setzt Guthaben & Statistik zurück
- 📱 **Responsives Neon-Design**, funktioniert auf Desktop & Mobil
- 🛡️ Einsätze werden validiert (keine negativen oder zu hohen Einsätze)

## Projektstruktur

```
index.html          # Aufbau & alle Screens
css/styles.css      # Neon-Theme
js/main.js          # Guthaben, Statistik, Navigation, Speicherung (Modul "Casino")
js/sound.js         # Sound-Effekte (Web Audio API)
js/slots.js         # Slots
js/roulette.js      # Roulette
js/blackjack.js     # Blackjack
js/dice.js          # Dice
js/coinflip.js      # Coinflip
js/videopoker.js    # Video Poker (Jacks or Better)
```

Jedes Spiel ist eine gekapselte IIFE und nutzt die gemeinsame `Casino`-API
aus `main.js`: `placeBet(einsatz, spiel)` zieht den Einsatz ab und startet
eine Runde, `settle(auszahlung)` schließt sie ab und aktualisiert die Statistik.

---

> ⚠️ **Hinweis:** Dieser Simulator dient ausschließlich der Unterhaltung.
> Es wird kein echtes Geld eingesetzt oder ausgezahlt.
