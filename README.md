# Schleifental GP

Ein kleines 3D-Kartspiel fuer den Browser: drei Abfahrten mit Anfang und Ende,
allein gegen die Uhr. Bewusst schlicht in der Grafik (Flat Shading,
Vertexfarben, keine Texturen) - die Strecken sollen Spass machen, nicht der
Renderer.

Im Ziel wird die Zeit gestoppt, die Bestzeit je Strecke gespeichert, und nach
sechs Sekunden beginnt der Lauf von vorn. Mit `Esc` geht es zur Streckenwahl.

| Strecke | Laenge | Grad | Was sie ausmacht |
| --- | --- | --- | --- |
| **Talfahrt** | 3,4 km | leicht | Vom Gipfel ins Tal. Korkenzieher, zwei Loopings, ein Sprung ueber die Schlucht, Wandritt, Spiralturm. |
| **Kraterrand** | 2,7 km | mittel | Spirale abwaerts in einen Vulkan. Schmalere Fahrbahn (6,8 m), drei Loopings, zwei Korkenzieher, zwei Schluchten. |
| **Wolkenpfad** | 3,8 km | schwer | Schmaler Grat ueber den Wolken, nur 6 m breit. Drei Loopings, drei Schluchten, zwei Wandritte bis 86 Grad, wenige Turbofelder. |

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
| `Esc` | Streckenwahl |
| `K` | KI faehrt fuer dich |
| `M` | Ton an/aus |
| `P` | Pause |

Auf Touchgeraeten erscheinen Schaltflaechen am Bildschirmrand.

**Mini-Turbo:** In der Kurve `Leertaste` halten und weiter lenken - die Funken
werden weiss, orange, blau. Beim Loslassen gibt es Schub, je laenger der Drift,
desto mehr. Geladen wird nur, solange wirklich eingelenkt wird. Die orangen
Streifen auf der Fahrbahn geben ebenfalls Turbo.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/courses.js` | die drei Strecken als Daten: Kontrollpunkte, Kunststuecke, Farbwelt |
| `src/track.js` | macht daraus Geometrie: Spline, Loopings, Korkenzieher, Schlucht |
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

Jede Strecke steht in `src/courses.js` als Liste von Kontrollpunkten
(x, Hoehe, z) plus den eingesetzten Kunststuecken und einer Farbwelt.
Grundlage ist eine offene Catmull-Rom-Spline durch diese Punkte. Sie wird gleichmaessig nach Bogenlaenge abgetastet; aus der
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
* **Spiralen** stecken direkt in den Kontrollpunkten - beim Kraterrand
  anderthalb Umdrehungen abwaerts in den Vulkan. Auf einer Abfahrt darf sich
  die Bahn ueber sich selbst hinwegschrauben, weil sie dabei faellt; auf einer
  Rundstrecke ginge das nicht.
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
ohne dass Kollisionserkennung noetig waere.

**Die Reifen haben eine Griffgrenze.** Aus Schwerkraft, Abtrieb (waechst mit
dem Quadrat des Tempos) und einer Mindestanpressung ergibt sich ein
Anpressdruck, daraus mit dem Reibwert die groesste Beschleunigung, die die
Reifen hergeben. Was laengs verbraucht wird, fehlt quer - der Reifenkreis:

```
aMax  = mu * (Schwerkraft entlang der Fahrbahnnormalen + Abtrieb)
aQuer = sqrt(aMax^2 - aLaengs^2)
omegaMax = aQuer / Tempo
```

`omega` ist die Drehrate der Fahrtrichtung in der Welt, und die Kruemmung der
Fahrbahn zaehlt mit: eine enge Kurve zu *halten* kostet genauso Grip wie
einzulenken. Reicht der Grip nicht, dreht das Kart weniger als gewollt und
schiebt nach aussen - das kostet zusaetzlich Tempo und ist am Schraegstand zu
sehen und an den Reifen zu hoeren. Gemessen ergibt das 2,6 g bei 54 km/h und
4,8 g bei 216 km/h, beim Vollbremsen nur noch 2,1 g. Auf dem Randstein sinkt
der Reibwert auf 55 Prozent, nach einer harten Landung kurz auf 70.

Damit haben Kurven ein Tempolimit (`v = sqrt(aMax * Radius)`), Bremsen vor der
Kurve lohnt sich, und Anbremsen bei gleichzeitigem Einlenken geht nur begrenzt.

Die Schwerkraft wirkt daneben weiter:

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

Das Kart selbst ist aus verjuengten Koerpern gebaut (`frustum()`), nicht aus
Kisten: Nasenkegel, Monocoque, Seitenkaesten mit Lufteinlass, Ueberrollbuegel
und Airbox, Motorhaube, Diffusor, Front- und Heckfluegel mit Endscheiben,
Auspuffrohre, Spiegel, Bremslichter, Raeder mit Felgen, Speichen und
Bremsscheiben, dazu ein Fahrer mit Helm, Visier und Armen am Lenkrad.

Was sich daran bewegt, ist **reine Darstellung** und beruehrt die Physik nicht:
die Raeder federn bei der Landung ein, die Karosserie nickt beim Beschleunigen
und Bremsen und legt sich im Drift, das Lenkrad dreht mit, der Kopf schaut in
die Kurve, die Bremslichter leuchten, und beim Turbo flackern zwei Flammen.
Deshalb bleiben trainierte Gewichte nach Aenderungen am Kart gueltig - die
Laufzeiten der KI sind auf die Hundertstel dieselben.

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

Jede Strecke bekommt eigene Gewichte; `src/brainweights.js` sammelt sie unter
der Strecken-Kennung.

```sh
node ai/train.js --course talfahrt --gen 300 --pop 96    # eine Strecke lernen
node ai/train.js --course wolkenpfad --gen 200 --from    # weitertrainieren
node ai/analyse.js [strecke]                             # Fahrstil vermessen
```

## Drittanbieter

[three.js](https://threejs.org) r128 (MIT). Die Seite laedt die Bibliothek vom
CDN und faellt auf die mitgelieferte Kopie in `vendor/` zurueck, wenn kein Netz
verfuegbar ist.
