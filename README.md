# Schleifental GP

Ein kleines 3D-Kartspiel fuer den Browser: eine Abfahrt vom Gipfel ins Tal,
3,4 Kilometer, 210 Meter Gefaelle, allein gegen die Uhr. Bewusst schlicht in
der Grafik (Flat Shading, Vertexfarben, keine Texturen) - die Strecke soll
Spass machen, nicht der Renderer.

Ein Lauf hat Anfang und Ende. Im Ziel wird die Zeit gestoppt, die Bestzeit
gespeichert, und nach sechs Sekunden beginnt die Abfahrt von vorn.

## Spielen

Doppelklick auf `index.html` genuegt - kein Build, keine Abhaengigkeiten zum
Installieren. Alternativ ueber einen lokalen Server:

```sh
python3 -m http.server 8000     # danach http://localhost:8000
```

### Steuerung

| Taste | Wirkung |
| --- | --- |
| `W` / `Pfeil hoch` | Gas |
| `S` / `Pfeil runter` | Bremse, rueckwaerts |
| `A` `D` / `Pfeil links` `rechts` | Lenken |
| `Leertaste` | Drift halten, kurz tippen = Sprung |
| `C` | Kamera (Verfolger / weit / Cockpit) |
| `R` | Zurueck zum letzten Abschnitt |
| `K` | KI faehrt fuer dich |
| `M` | Ton an/aus |
| `P` | Pause |

Auf Touchgeraeten erscheinen Schaltflaechen am Bildschirmrand.

**Mini-Turbo:** In der Kurve `Leertaste` halten und weiter lenken - die Funken
werden weiss, orange, blau. Beim Loslassen gibt es Schub, je laenger der Drift,
desto mehr. Geladen wird nur, solange wirklich eingelenkt wird. Die orangen
Streifen auf der Fahrbahn geben ebenfalls Turbo.

## Die Strecke

| Anteil | Abschnitt |
| --- | --- |
| 0 % | Startrampe auf 210 Metern, ueber den Wolken |
| 13 % | Sprunghuegel in der Steilabfahrt |
| 19 % | **Korkenzieher** - volle Rolle um die Fahrtrichtung |
| 36 % | **Erster Looping**, 44 Meter hoch |
| 49 % | **Sprung ueber die Schlucht** - unter 110 km/h landest du darin |
| 55 % | **Wandritt** am Felsen, Fahrbahn 78 Grad gekippt |
| 66 % | **Zweiter Looping**, 38 Meter |
| 76 % | **Spiralturm** eine volle Umdrehung abwaerts |
| 100 % | Ziel im Tal |

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/track.js` | Streckengeometrie: Spline, Loopings, Korkenzieher, Schlucht |
| `src/world.js` | Fahrbahn-Mesh, Randsteine, Leitplanken, Berg, Landschaft |
| `src/kart.js` | Kart-Modell, Fahrphysik, Autopilot zum Vergleich |
| `src/brain.js` | neuronales Netz des KI-Fahrers (ohne Bibliothek) |
| `src/brainweights.js` | trainierte Gewichte, erzeugt von `ai/train.js` |
| `src/hud.js` | Anzeige, Minimap, Sound |
| `src/game.js` | Szene, Laufablauf, Kamera, Eingabe |
| `ai/train.js` | Training des KI-Fahrers (Evolutionsstrategie) |
| `ai/analyse.js` | vermisst den Fahrstil und vergleicht mit dem Autopiloten |
| `tools/build-artifact.py` | baut alles zu einer einzelnen HTML-Datei zusammen |

### Wie die Strecke entsteht

Grundlage ist eine offene Catmull-Rom-Spline durch 29 Kontrollpunkte
(x, Hoehe, z). Sie wird gleichmaessig nach Bogenlaenge abgetastet; aus der
horizontalen Kruemmung ergibt sich die Ueberhoehung der Kurven. In diese
Abtastung werden die Kunststuecke analytisch eingesetzt:

* **Loopings** sind keine Kreise, sondern Tropfenformen wie bei Achterbahnen:
  der Tangentenwinkel laeuft mit `phi'(x) = 1 - c * cos(2*pi*x)` durch 360
  Grad, unten also weit und oben eng. Ein Kreis-Looping muesste sich selbst
  schneiden - jede 360-Grad-Schleife in einer Ebene tut das. Deshalb bekommt
  der Looping zusaetzlich einen seitlichen Versatz, sodass auf- und
  absteigender Ast mit rund fuenf Metern Luft aneinander vorbeilaufen. Im
  Looping ist die Fahrbahn ausserdem schmaler.
* **Korkenzieher und Wandritt** sind zusaetzliche Rollen um die Fahrtrichtung,
  die ueber die Laenge sanft ein- und ausgeblendet werden - einmal volle
  Umdrehung, einmal bis 78 Grad und zurueck.
* **Der Spiralturm** steckt direkt in den Kontrollpunkten. Auf einer Abfahrt
  darf sich die Bahn ueber sich selbst hinwegschrauben, weil sie dabei faellt -
  auf einer Rundstrecke ginge das nicht.
* **Die Schlucht** hat keine Fahrbahn. Ueber der Luecke folgt die Bahn einer
  Wurfparabel mit der Abwaertskruemmung `g / v²`. Wer mit dem Auslegungstempo
  ankommt, fliegt ihr genau entlang; wer langsamer ist, sackt darunter weg und
  stuerzt ab. Davor und dahinter nimmt die Fahrbahn die Absprungneigung sanft
  an, sonst gaebe es an der Kante einen Knick, der das Kart nach unten drueckt.

Ergebnis ist eine Kette aus rund 2000 "Frames": Position, Tangente, Up-Vektor,
Seitenvektor, Fahrbahnbreite und Bogenlaenge. Mesh, Physik, Kamera und Minimap
arbeiten anschliessend nur noch damit.

### Wie das Fahren funktioniert

Die Physik rechnet streckenrelativ statt in Weltkoordinaten: Bogenlaenge `s`,
Querversatz `x`, Kurswinkel `phi` zur Fahrbahn und beim Sprung die Hoehe `h`
ueber der Fahrbahn. Dadurch bleiben Loopings und Ueberkopf-Passagen stabil,
ohne dass Kollisionserkennung noetig waere. Die Schwerkraft wirkt trotzdem
echt:

* Sie bremst bergauf und beschleunigt bergab (`-g * sin(Steigung)`), weshalb
  man mit zu wenig Tempo im Looping wieder herausrollt.
* In ueberhoehten Kurven zieht sie zur Innenseite.
* Eine Anpresskraft haelt das Kart auch ueber Kopf auf der Bahn.
* Abgehoben wird, wenn eine Kuppe schneller wegfaellt als die Schwerkraft
  zieht (`v² * Kruemmung > g`) - daraus ergeben sich die Spruenge von selbst.

Der Kurswinkel ist auf gut 30 Grad begrenzt und wird mit steigendem Tempo
kleiner; die Lenkung wird ausserdem weich nachgefuehrt, weil eine Tastatur nur
0 und 1 kennt. Im Drift kommt ein rein optischer Schraegstand dazu, damit es
quer aussieht, ohne dass das Kart quer faehrt.

## Der KI-Fahrer

Mit `K` uebernimmt ein neuronales Netz das Kart. Es ist von Hand geschrieben,
ohne Bibliothek: `src/brain.js` enthaelt ein flaches Zahlenfeld und zwei
Schleifen, mehr braucht es nicht.

```
18 Eingaenge  ->  16 verdeckte Neuronen  ->  3 Ausgaenge     (355 Zahlen)
```

Das Netz sieht dieselbe Welt wie ein Mensch und bedient dieselben Tasten:

| Eingaben | |
| --- | --- |
| Tempo, Querversatz, Kurswinkel, seitliches Rutschen | wo bin ich, wie stehe ich |
| in der Luft, Turbo aktiv | Zustand |
| Kruemmung bei 12, 25, 45, 70, 105, 150 m voraus | wie scharf wird die naechste Kurve |
| Steigung bei 10, 45, 90 m voraus | Berg, Tal, Looping |
| Vertikalkruemmung bei 20 und 60 m voraus | Kuppe, Looping oder Schlucht |
| Fahrbahnbreite bei 40 m voraus | im Looping wird es eng |

| Ausgaben | |
| --- | --- |
| Lenkung | -1 bis 1 |
| Pedal | positiv Gas, negativ Bremse |
| Drift | ab 0,3 gedrueckt |

### Training

`ai/train.js` ist eine Evolutionsstrategie, ebenfalls von Hand: kein Gradient,
kein Rueckwaertsdurchlauf. 96 Gewichtssaetze fahren die Strecke in der echten
Spielphysik ohne Grafik (rund 450 000 Physikschritte je Sekunde), die besten
werden behalten und mit gaussschem Rauschen leicht veraendert weitervererbt.
Die Streuung faellt ueber die Generationen; wenn 18 Generationen lang nichts
besser wird, wird sie wieder angehoben.

Bewertet wird die zurueckgelegte Strecke in fester Zeit, abzueglich 25 Punkte
je Sekunde an der Leitplanke und 400 Punkte je Absturz in die Schlucht, plus
600 Punkte fuer das Erreichen des Ziels. Gestartet wird an drei Stellen der
Abfahrt, damit das Netz die ganze Strecke lernt und nicht nur den Anfang.

```sh
node ai/train.js --gen 300 --pop 96 --seed 11   # schreibt src/brainweights.js
node ai/train.js --gen 200 --from               # von vorhandenen Gewichten aus
node ai/analyse.js                              # Fahrstil vermessen
```

## Drittanbieter

[three.js](https://threejs.org) r128 (MIT). Die Seite laedt die Bibliothek vom
CDN und faellt auf die mitgelieferte Kopie in `vendor/` zurueck, wenn kein Netz
verfuegbar ist.
