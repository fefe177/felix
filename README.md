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

## 🗺️ Karten

Über die Leiste oben wählst du eine von **drei Karten** (die Wahl wird gespeichert; Wechsel startet das Spiel neu):

| Karte | Schwierigkeit | Charakter |
|---|---|---|
| 🌿 Wiese | Normal | Klassische Doppelschleife mit langem Pfad |
| 🐍 Serpentinen | Leicht | Enges Auf und Ab — Türme zwischen den Korridoren treffen mehrfach |
| ⛰️ Schlucht | Schwer | Kurzer, direkter Pfad — wenig Zeit zum Schießen! |

Dazu gibt es einen **Musik-Button** (🎵) mit einem kleinen Chiptune-Loop als Hintergrundmusik. Die **beste Welle wird pro Karte gespeichert** und direkt am Kartenknopf angezeigt (★).

## 💾 Speichern & Fortsetzen

Das Spiel **speichert automatisch nach jeder geschafften Welle** (und bei jedem Bau/Upgrade in der Baupause). Wer den Browser schließt, macht beim nächsten Öffnen genau dort weiter — mit allen Türmen, Stufen, Ausrüstungen, Gold und Leben. Der ↺-Button oben startet bewusst neu (mit Rückfrage), Niederlage oder Sieg leeren den Spielstand.

## Türme

| Turm | Kosten | Gelände | Stärke |
|---|---|---|---|
| 🏹 Bogenturm | 💰 50 | überall | Schnell und günstig, Einzelziel — Holzturm mit drehbarer Armbrust |
| 💣 Kanone | 💰 100 | nur Boden | Flächenschaden, langsames Feuer — Stahlkuppel mit schwenkbarem Rohr |
| ❄️ Frostturm | 💰 70 | überall | Verlangsamt Gegner — rotierender Eiskristall |
| ⚡ Blitzturm | 💰 150 | ⛰️ nur Anhöhe | Hohe Reichweite und hoher Schaden — Obelisk mit schwebender Energiekugel |
| 🎯 Wachturm | 💰 120 | ⛰️ nur Anhöhe | **Betretbar!** Selbst zielen und schießen in der Ego-Ansicht |
| 💥 Mörser | 💰 160 | nur Boden | **Betretbar!** Artillerie — Granaten fliegen im hohen Bogen und explodieren mit Flächenschaden |
| ☠️ Giftturm | 💰 90 | nur Boden | Vergiftet Gegner — Schaden über Zeit (brodelnder Kessel) |
| ⛏️ Goldmine | 💰 100 | nur Boden | Kämpft nicht, erzeugt nach jeder Welle Gold |

## ⛰️ Anhöhen & Bauvorschau

Auf der Karte gibt es **14 erhöhte Plateaus**. Schwere Türme (Kanone, Giftkessel, Goldmine) brauchen ebenen Boden, Fernkämpfer (Blitzturm, Wachturm) kommen **nur auf Anhöhen** — dafür bekommt **jeder** Turm auf einer Anhöhe **+10 % Reichweite** (bessere Sicht).

Beim Bauen nimmst du den Turm „in die Hand": Ein **durchsichtiger Geister-Turm** folgt dem Mauszeiger über das Spielfeld, das Feld darunter leuchtet grün (bebaubar) oder rot. Passt das Gelände nicht, erklärt eine Meldung kurz warum („Nur auf Anhöhen ⛰️") — die Auswahl bleibt dabei in der Hand.

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

## 🏅 Erfolge

Über den 🏆-Button oben rechts öffnet sich die Erfolge-Liste (dauerhaft im Browser gespeichert):

- 🏆 **Sieger** — alle 20 Wellen überstanden
- 💎 **Makellos** — Sieg ohne ein einziges verlorenes Leben
- 🎯 **Scharfschütze** — 15 Gegner selbst im Wachturm abgeschossen
- ⛏️ **Goldmagnat** — 3 Goldminen gleichzeitig besitzen
- 🛠️ **Vollausbau** — ein Turm auf Stufe 3 mit Ausrüstung
- 🌊 **Marathon** — Welle 25 im Endlosmodus erreicht

## ⚖️ Balance

Die Wellen sind per automatischer Simulation ausbalanciert: Ein schwacher Ausbau (8 Türme) scheitert um Welle 15, ein solider Ausbau (11 gut platzierte, aufgewertete Türme) gewinnt knapp mit halben Leben, ein voller Ausbau (18 Türme) schafft es souverän. Das Gold bleibt dabei bis in die Endphase knapp — wer aufhört zu investieren, wird überrannt. Goldminen lohnen sich, wenn sie früh gebaut werden (amortisiert nach ~7 Wellen).

## 🎯 Betretbare Türme — selbst schießen!

Zwei Türme kann man **betreten und selbst steuern** (Turm anklicken → „🎯 Betreten &amp; steuern"):

- **Wachturm** (Anhöhe): Ego-Ansicht aus der Kabine — Maus zielt, **Klick feuert einen präzisen Einzelschuss** aufs Fadenkreuz, Mausrad zoomt wie ein Zielfernrohr.
- **Mörser** (Boden): Sitzposition hinter dem Rohr — du zielst auf einen **Bodenpunkt**, die Granate fliegt im hohen Bogen dorthin und **explodiert mit Flächenschaden**. Ideal gegen Gegnergruppen!
- **Verlassen:** `Esc`, Rechtsklick oder der „Verlassen"-Button.
- **Automatik-Modus:** Ohne Spieler schießen beide von allein, aber **nur in einem schmalen Sektor** (blauer Kreisausschnitt). Die Richtung ist die Blickrichtung, in der du den Turm verlassen hast — du entscheidest, welchen Pfadabschnitt er bewacht!
- Der manuelle Schuss macht deutlich mehr Schaden als die Automatik und wird pro Ausbaustufe stärker.

## Gegner

- **Normal** (rot) — Standardgegner
- **Flink** (gelb, mit Heckflossen) — schnell, aber schwach
- **Panzer** (grün, mit Stahlhelm) — langsam, viele Lebenspunkte, kostet 2 Leben
- **Boss** (lila, mit Krone) — alle 5 Wellen, sehr zäh, kostet 5 Leben
- **Beschwörer** (violett, mit Zauberhut und Geister-Orbs) — jede 10. Welle; ruft alle paar Sekunden zwei Diener direkt auf den Pfad! Schnell ausschalten, sonst wächst die Welle immer weiter
- **Heiler** (weiß, mit rotem Kreuz) — ab Welle 7; heilt alle 3 Sekunden verletzte Gegner im Umkreis (grüner Heil-Ring). Zuerst ausschalten, sonst kämpfst du gegen regenerierende Panzer!

Jede Karte hat ihren eigenen Wellen-Charakter: In der **Schlucht** stürmen deutlich mehr Flinke, auf den **Serpentinen** rollen Panzerkolonnen an.

Die Lebenspunkte der Gegner steigen mit jeder Welle. Getroffene Gegner blitzen kurz auf, und der Wellen-Button warnt vor Bosswellen (⚠️). Deine **beste Welle** wird im Browser gespeichert und am Spielende zusammen mit den Abschüssen angezeigt.

## Steuerung

- **Turm bauen:** Turm in der Leiste unten anklicken (oder Tasten `1`–`8`) — der Geister-Turm hängt am Zeiger — dann aufs Feld klicken (Gelände-Regel beachten!)
- **Wellen-Vorschau:** Über dem Spielfeld steht immer, was die nächste Welle bringt (z. B. „24 Gegner — 6 Flinke · 5 Panzer · 2 Heiler")
- **Aufwerten/Verkaufen:** platzierten Turm anklicken
- **Kamera drehen:** rechte Maustaste gedrückt halten und ziehen
- **Zoom:** Mausrad · **Kamera zurücksetzen:** `R`
- **Abbrechen:** `Esc` oder kurzer Rechtsklick
- **Welle starten:** Button oben (oder `Enter`) — früher Start bringt Bonus-Gold!
- **Pause:** `Leertaste` oder ⏸-Button
- **Geschwindigkeit:** 1×/2×/3× umschaltbar
- **Ton:** 🔊-Button (Soundeffekte per WebAudio) · **Musik:** 🎵-Button
- **Karte wechseln:** Kartenleiste über dem Spielfeld

**Touch (Tablet/Handy):** Antippen baut/wählt aus, **zwei Finger ziehen** dreht die Kamera, **Pinch** zoomt. Im Wachturm: ein Finger zielt, Tippen schießt, Pinch zoomt.

## Technik

- **Three.js r128** (lokal in `vendor/`, kein CDN) mit Echtzeitschatten, Hemisphären- und Sonnenlicht sowie Nebel
- **Tageslicht-Szenerie:** Himmelskuppel mit Shader-Farbverlauf, treibende Low-Poly-Wolken, Gras mit verstreuten Büscheln und Blumen, dreifarbiges Pfadpflaster, zweistufige Tannen und pulsierende Start-/Zielportale
- Spiellogik läuft in 2D-Pfadkoordinaten, die 3D-Szene ist die Darstellung darüber — Turm-Platzierung per Raycasting auf das Spielfeld
- Alle Modelle (Türme, Gegner, Bäume, Portale) sind prozedural aus Three.js-Grundkörpern gebaut, es werden keine externen Assets geladen
