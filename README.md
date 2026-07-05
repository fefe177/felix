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

## Spiele

| Spiel | Beschreibung | Auszahlung |
|-------|--------------|------------|
| 🎰 **Slots** | Drei Walzen, sechs Symbole. | 2 Gleiche ×2 · 3 Gleiche ×8 · 3× 7️⃣ ×20 |
| 🎡 **Roulette** | Europäisch (0–36, eine grüne Null). | Einfache Chancen ×2 · Volle Zahl ×36 |
| 🃏 **Blackjack** | Gegen den Dealer (steht bei 17). | Gewinn ×2 · Blackjack 3:2 · Push = Einsatz zurück |
| 🎲 **Dice** | Over/Under mit einstellbarem Ziel (1–100). | Dynamisch, 1 % Hausvorteil |

## Features

- 💰 **Gemeinsames Guthaben** über alle Spiele (Start: 1.000 Credits)
- 💾 **Automatisches Speichern** im `localStorage` – bleibt nach dem Neuladen erhalten
- ↻ **Reset-Button** setzt das Guthaben zurück
- 📱 **Responsives Neon-Design**, funktioniert auf Desktop & Mobil
- 🛡️ Einsätze werden validiert (keine negativen oder zu hohen Einsätze)

## Projektstruktur

```
index.html          # Aufbau & alle Screens
css/styles.css      # Neon-Theme
js/main.js          # Guthaben, Navigation, Speicherung (Modul "Casino")
js/slots.js         # Slots
js/roulette.js      # Roulette
js/blackjack.js     # Blackjack
js/dice.js          # Dice
```

Jedes Spiel ist eine gekapselte IIFE und nutzt die gemeinsame `Casino`-API
(`placeBet`, `payout`, `refund`) aus `main.js`.

---

> ⚠️ **Hinweis:** Dieser Simulator dient ausschließlich der Unterhaltung.
> Es wird kein echtes Geld eingesetzt oder ausgezahlt.
