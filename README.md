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
| 🎯 Wachturm | 💰 120 | **Betretbar!** Selbst zielen und schießen in der Ego-Ansicht |
| ☠️ Giftturm | 💰 90 | Vergiftet Gegner — Schaden über Zeit (brodelnder Kessel) |
| ⛏️ Goldmine | 💰 100 | Kämpft nicht, erzeugt nach jeder Welle Gold |

Jeder Turm kann **zweimal aufgewertet** (mehr Schaden, Reichweite, Feuerrate) oder für 70 % des investierten Golds **verkauft** werden. **Jede Ausbaustufe hat ihr eigenes 3D-Modell** — die Türme werden sichtbar größer und prächtiger:

- **Bogenturm:** Holzwarte → Turm mit Fahne und Goldband → Steinturm mit Zinnen, Goldwimpel und Ballista
- **Kanone:** Kuppelgeschütz → gepanzert mit Goldring und längerem Rohr → Doppelrohr mit Goldkappe
- **Frostturm:** Eiskristall → kreisende Eissplitter → Eiszacken-Kranz und Lichtring
- **Blitzturm:** Obelisk mit Energiekugel → Ecksäulen und mehr Goldringe → kreisende Funken-Orbs

Beim Feuern gibt es Rückstoß-Animationen (Armbrust und Kanonenrohr zucken zurück, Kristall und Energiekugel pulsieren).

## 🛠️ Ausrüstung

Jeder Kampfturm kann zusätzlich **einen** Gegenstand tragen (Turm anklicken → „Ausrüsten"):

| Gegenstand | Kosten | Wirkung |
|---|---|---|
| 🔭 Zielfernrohr | 💰 60 | +25 % Reichweite |
| ⚙️ Schnelllader | 💰 80 | +30 % Feuerrate |
| 💥 Schwere Munition | 💰 100 | +35 % Schaden (wirkt auch auf den manuellen Wachturm-Schuss) |

Ausgerüstete Türme tragen ein schwebendes, farbiges Abzeichen. Die Ausrüstung bleibt beim Aufwerten erhalten und zählt beim Verkauf zum Erstattungswert.

## ⚖️ Balance

Die Wellen sind per automatischer Simulation ausbalanciert: Ein schwacher Ausbau (8 Türme) scheitert um Welle 15, ein solider Ausbau (11 gut platzierte, aufgewertete Türme) gewinnt knapp mit halben Leben, ein voller Ausbau (18 Türme) schafft es souverän. Das Gold bleibt dabei bis in die Endphase knapp — wer aufhört zu investieren, wird überrannt. Goldminen lohnen sich, wenn sie früh gebaut werden (amortisiert nach ~7 Wellen).

## 🎯 Der Wachturm — selbst schießen!

Der Wachturm ist etwas Besonderes: Man kann ihn **betreten und selbst steuern**.

- **Betreten:** Wachturm anklicken → im Panel auf „🎯 Betreten &amp; steuern" klicken
- **Drinnen:** Ego-Ansicht aus der Turmkabine — Maus zielt, **Klick schießt** (starker Einzelschuss), **Mausrad zoomt** wie ein Zielfernrohr
- **Verlassen:** `Esc`, Rechtsklick oder der „Verlassen"-Button
- **Automatik-Modus:** Ohne Spieler schießt der Wachturm von allein, aber **nur in einem schmalen Sektor** (±29°, als blauer Kreisausschnitt sichtbar). Die Richtung des Sektors ist die Blickrichtung, in der du den Turm verlassen hast — du entscheidest also, welchen Pfadabschnitt er bewacht!
- Der manuelle Schuss macht deutlich mehr Schaden als die Automatik und wird pro Ausbaustufe stärker.

## Gegner

- **Normal** (rot) — Standardgegner
- **Flink** (gelb, mit Heckflossen) — schnell, aber schwach
- **Panzer** (grün, mit Stahlhelm) — langsam, viele Lebenspunkte, kostet 2 Leben
- **Boss** (lila, mit Krone) — alle 5 Wellen, sehr zäh, kostet 5 Leben

Die Lebenspunkte der Gegner steigen mit jeder Welle. Getroffene Gegner blitzen kurz auf, und der Wellen-Button warnt vor Bosswellen (⚠️). Deine **beste Welle** wird im Browser gespeichert und am Spielende zusammen mit den Abschüssen angezeigt.

## Steuerung

- **Turm bauen:** Turm im Shop anklicken (oder Tasten `1`–`7`), dann auf ein beliebiges freies Grasfeld klicken (alle 226 Felder außer dem Pfad sind bebaubar)
- **Aufwerten/Verkaufen:** platzierten Turm anklicken
- **Kamera drehen:** rechte Maustaste gedrückt halten und ziehen
- **Zoom:** Mausrad · **Kamera zurücksetzen:** `R`
- **Abbrechen:** `Esc` oder kurzer Rechtsklick
- **Welle starten:** Button oben (oder `Enter`) — früher Start bringt Bonus-Gold!
- **Pause:** `Leertaste` oder ⏸-Button
- **Geschwindigkeit:** 1×/2×/3× umschaltbar
- **Ton:** 🔊-Button (Soundeffekte per WebAudio)

**Touch (Tablet/Handy):** Antippen baut/wählt aus, **zwei Finger ziehen** dreht die Kamera, **Pinch** zoomt. Im Wachturm: ein Finger zielt, Tippen schießt, Pinch zoomt.

## Technik

- **Three.js r128** (lokal in `vendor/`, kein CDN) mit Echtzeitschatten, Hemisphären- und Sonnenlicht sowie Nebel
- Spiellogik läuft in 2D-Pfadkoordinaten, die 3D-Szene ist die Darstellung darüber — Turm-Platzierung per Raycasting auf das Spielfeld
- Alle Modelle (Türme, Gegner, Bäume, Portale) sind prozedural aus Three.js-Grundkörpern gebaut, es werden keine externen Assets geladen
