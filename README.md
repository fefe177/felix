# 🏰 Turm-Verteidigung 3D

Ein vollständiges Tower-Defense-Spiel im Browser mit echter **3D-Ansicht** (WebGL/Three.js) — Licht, Schatten, drehbare Kamera und detaillierte 3D-Turmmodelle. Keine Installation nötig; Three.js liegt lokal unter `vendor/` bei, das Spiel läuft also auch offline.

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
| 🏹 Bogenturm | 💰 50 | Schnell und günstig, Einzelziel — Holzturm mit drehbarer Armbrust |
| 💣 Kanone | 💰 100 | Flächenschaden, langsames Feuer — Stahlkuppel mit schwenkbarem Rohr |
| ❄️ Frostturm | 💰 70 | Verlangsamt Gegner — rotierender Eiskristall |
| ⚡ Blitzturm | 💰 150 | Hohe Reichweite und hoher Schaden — Obelisk mit schwebender Energiekugel |

Jeder Turm kann **zweimal aufgewertet** (mehr Schaden, Reichweite, Feuerrate — sichtbar an goldenen Ringen am Sockel) oder für 70 % des investierten Golds **verkauft** werden.

## Gegner

- **Normal** — Standardgegner
- **Flink** (gelb) — schnell, aber schwach
- **Panzer** (grün) — langsam, viele Lebenspunkte, kostet 2 Leben
- **Boss** (lila, mit Krone) — alle 5 Wellen, sehr zäh, kostet 5 Leben

Die Lebenspunkte der Gegner steigen mit jeder Welle.

## Steuerung

- **Turm bauen:** Turm im Shop anklicken (oder Tasten `1`–`4`), dann auf ein freies Feld klicken
- **Aufwerten/Verkaufen:** platzierten Turm anklicken
- **Kamera drehen:** rechte Maustaste gedrückt halten und ziehen
- **Zoom:** Mausrad · **Kamera zurücksetzen:** `R`
- **Abbrechen:** `Esc` oder kurzer Rechtsklick
- **Welle starten:** Button oben (oder `Enter`) — früher Start bringt Bonus-Gold!
- **Pause:** `Leertaste` oder ⏸-Button
- **Geschwindigkeit:** 1×/2×/3× umschaltbar
- **Ton:** 🔊-Button (Soundeffekte per WebAudio)

Funktioniert mit Maus und Touch (Desktop, Tablet, Handy).

## Technik

- **Three.js r128** (lokal in `vendor/`, kein CDN) mit Echtzeitschatten, Hemisphären- und Sonnenlicht sowie Nebel
- Spiellogik läuft in 2D-Pfadkoordinaten, die 3D-Szene ist die Darstellung darüber — Turm-Platzierung per Raycasting auf das Spielfeld
- Alle Modelle (Türme, Gegner, Bäume, Portale) sind prozedural aus Three.js-Grundkörpern gebaut, es werden keine externen Assets geladen
