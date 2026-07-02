# 🏰 Turm-Verteidigung

Ein vollständiges Tower-Defense-Spiel im Browser — reines HTML5/JavaScript, keine Installation, keine Abhängigkeiten.

## Spielen

Einfach die Datei `index.html` im Browser öffnen — fertig.

Alternativ mit lokalem Server:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Spielprinzip

Gegner laufen in Wellen über den Pfad von links nach rechts. Baue Türme auf die freien Grasfelder, um sie aufzuhalten, bevor sie das Ziel erreichen. Überstehe alle **20 Wellen** — danach geht es optional im Endlosmodus weiter.

## Türme

| Turm | Kosten | Stärke |
|---|---|---|
| 🏹 Bogenturm | 💰 50 | Schnell und günstig, Einzelziel |
| 💣 Kanone | 💰 100 | Flächenschaden, langsames Feuer |
| ❄️ Frostturm | 💰 70 | Verlangsamt Gegner |
| ⚡ Blitzturm | 💰 150 | Hohe Reichweite und hoher Schaden |

Jeder Turm kann **zweimal aufgewertet** (mehr Schaden, Reichweite, Feuerrate) oder für 70 % des investierten Golds **verkauft** werden.

## Gegner

- **Normal** — Standardgegner
- **Flink** (gelb) — schnell, aber schwach
- **Panzer** (grün) — langsam, viele Lebenspunkte, kostet 2 Leben
- **Boss** (lila, mit Krone) — alle 5 Wellen, sehr zäh, kostet 5 Leben

Die Lebenspunkte der Gegner steigen mit jeder Welle.

## Steuerung

- **Turm bauen:** Turm im Shop anklicken (oder Tasten `1`–`4`), dann auf ein freies Feld klicken
- **Aufwerten/Verkaufen:** platzierten Turm anklicken
- **Abbrechen:** `Esc` oder Rechtsklick
- **Welle starten:** Button oben (oder `Enter`) — früher Start bringt Bonus-Gold!
- **Pause:** `Leertaste` oder ⏸-Button
- **Geschwindigkeit:** 1×/2×/3× umschaltbar
- **Ton:** 🔊-Button (Soundeffekte per WebAudio)

Funktioniert mit Maus und Touch (Desktop, Tablet, Handy).
