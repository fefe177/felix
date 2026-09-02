# Schleifental GP oeffnen (Anweisung zum Weitergeben)

Das Spiel ist fertig und muss **nicht** programmiert werden. Aufgabe ist nur:
oeffnen und das Rennen mit der KI starten.

## Woher

Entweder das Repository:

```sh
git clone -b claude/mario-kart-3d-track-fhygk5 https://github.com/fefe177/felix.git
cd felix
```

Oder die mitgelieferte Einzeldatei `schleifental-gp.html` - die enthaelt das
komplette Spiel und braucht sonst nichts.

## Oeffnen

Kein Build, keine Installation, keine Abhaengigkeiten. `index.html` im Browser
oeffnen:

```sh
xdg-open index.html      # Linux
open index.html          # macOS
start index.html         # Windows
```

Falls der Browser lokale Dateien blockiert, stattdessen kurz ausliefern:

```sh
python3 -m http.server 8000
# dann http://localhost:8000 aufrufen
```

`index.html?runden=1` startet ein kurzes Rennen ueber eine Runde statt drei.

Die Seite laedt three.js r128 vom CDN und faellt automatisch auf die
mitgelieferte Kopie in `vendor/three.min.js` zurueck, wenn kein Netz da ist.
Sie laeuft also auch offline.

## Das Rennen mit der KI starten

1. Auf **"Rennen starten"** klicken
2. Countdown abwarten (3, 2, 1, Los)
3. **`K`** druecken - ein neuronales Netz uebernimmt das Kart, oben erscheint
   "KI faehrt". Nochmal `K` gibt die Kontrolle zurueck.

Das violette Kart **NEURA** faehrt ohnehin immer mit; es ist dasselbe Netz als
Gegner. Fuer eine reine KI-Vorfuehrung genuegen also Schritt 1, 2 und 3.

Weitere Tasten: `W A S D` oder Pfeile fahren, `Leertaste` Drift, `C` Kamera,
`R` zuruecksetzen, `M` Ton, `P` Pause.

## Ohne Bildschirm

Wer keinen Browser starten kann, laesst die KI im Terminal fahren (nur Node.js,
keine Pakete noetig):

```sh
node ai/analyse.js
```

Das misst drei Runden des KI-Fahrers und vergleicht sie mit dem
handgeschriebenen Autopiloten. Erwartete Ausgabe: beste Runde rund 33,6 s
gegenueber 43,6 s, kein Plankenkontakt.

Neu trainieren (rund fuenf Minuten, ueberschreibt `src/brainweights.js`):

```sh
node ai/train.js --gen 300 --pop 96 --seed 7
```

## Hinweis

Der Artifact-Link auf claude.ai ist privat und nur fuer den Besitzer des
Kontos zu oeffnen - eine andere KI kann ihn nicht laden. Sie braucht das
Repository oder die Einzeldatei.
