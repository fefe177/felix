# Schleifental GP

Ein kleines 3D-Kartrennen fuer den Browser: eine Stuntstrecke mit zwei
senkrechten Loopings, einem Korkenzieher, drei Sprunghuegeln und 44 Metern
Hoehenunterschied. Bewusst schlicht in der Grafik (Flat Shading, Vertexfarben,
keine Texturen) - die Strecke soll Spass machen, nicht der Renderer.

## Spielen

Doppelklick auf `index.html` genuegt - es gibt keinen Build-Schritt und keine
Abhaengigkeiten zum Installieren. Alternativ ueber einen lokalen Server:

```sh
python3 -m http.server 8000     # danach http://localhost:8000
```

`index.html?runden=1` startet ein kurzes Rennen ueber eine Runde (1 bis 9).

### Steuerung

| Taste | Wirkung |
| --- | --- |
| `W` / `Pfeil hoch` | Gas |
| `S` / `Pfeil runter` | Bremse, rueckwaerts |
| `A` `D` / `Pfeil links` `rechts` | Lenken |
| `Leertaste` | Drift halten, kurz tippen = Sprung |
| `C` | Kamera (Verfolger / weit / Cockpit) |
| `R` | Zurueck auf die Strecke |
| `K` | KI faehrt fuer dich |
| `M` | Ton an/aus |
| `P` | Pause |

Auf Touchgeraeten erscheinen Schaltflaechen am Bildschirmrand.

**Mini-Turbo:** In der Kurve `Leertaste` halten und lenken - die Funken werden
weiss, orange, blau. Beim Loslassen gibt es Schub, je laenger der Drift, desto
mehr. Die orangen Felder auf der Fahrbahn geben ebenfalls Turbo; eines liegt
kurz vor dem grossen Looping.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/track.js` | Streckengeometrie: Spline, Loopings, Korkenzieher, Sprunghuegel |
| `src/world.js` | Fahrbahn-Mesh, Randsteine, Leitplanken, Pfeiler, Landschaft |
| `src/kart.js` | Kart-Modell, Fahrphysik, Autopilot der Gegner |
| `src/brain.js` | neuronales Netz des KI-Fahrers (ohne Bibliothek) |
| `src/brainweights.js` | trainierte Gewichte, erzeugt von `ai/train.js` |
| `src/hud.js` | Anzeige, Minimap, Sound |
| `src/game.js` | Szene, Rennlogik, Kamera, Eingabe |
| `ai/train.js` | Training des KI-Fahrers (Evolutionsstrategie) |
| `ai/analyse.js` | vermisst den Fahrstil und vergleicht mit dem Autopiloten |
| `tools/build-artifact.py` | baut alles zu einer einzelnen HTML-Datei zusammen |

### Wie die Strecke entsteht

Die Basisrunde ist eine geschlossene Catmull-Rom-Spline aus 16 Kontrollpunkten
(Winkel, Radius, Hoehe). Sie wird gleichmaessig nach Bogenlaenge abgetastet;
aus der horizontalen Kruemmung ergibt sich die Ueberhoehung der Kurven.

In diese Abtastung werden die Kunststuecke analytisch eingesetzt:

* **Loopings** sind keine Kreise, sondern Tropfenformen wie bei Achterbahnen:
  der Tangentenwinkel laeuft mit `phi'(x) = 1 - c * cos(2*pi*x)` durch 360
  Grad, unten also weit und oben eng. Ein Kreis-Looping muesste sich selbst
  schneiden - jede 360-Grad-Schleife in einer Ebene tut das. Deshalb bekommt
  der Looping zusaetzlich einen seitlichen Versatz, sodass auf- und
  absteigender Ast mit rund vier Metern Luft aneinander vorbeilaufen. Im
  Looping ist die Fahrbahn ausserdem schmaler.
* **Korkenzieher** ist eine zusaetzliche Rolle um die Fahrtrichtung, die ueber
  die Laenge sanft ein- und ausgeblendet wird.
* **Sprunghuegel** sind Hoehenbeulen auf der Basisrunde. Ob das Kart abhebt,
  entscheidet die Physik selbst (siehe unten).

Ergebnis ist ein Ring aus rund 1200 "Frames": Position, Tangente, Up-Vektor,
Seitenvektor, Fahrbahnbreite und Bogenlaenge. Mesh, Physik, Kamera, Gegner und
Minimap arbeiten anschliessend nur noch auf diesen Frames.

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
  zieht (`v^2 * Kruemmung > g`) - daraus ergeben sich die Spruenge von selbst.

Die drei Gegner fahren mit demselben Fahrmodell, gesteuert von einem
Pure-Pursuit-Autopiloten mit Wunschtempo aus der Kruemmung voraus und leichtem
Gummiband. Eine Runde faehrt der Autopilot in rund 45 Sekunden.

## Der KI-Fahrer

Im Feld faehrt **NEURA** mit - ein neuronales Netz, das sich die Strecke
selbst beigebracht hat. Mit `K` uebernimmt es dein Kart, dann kannst du
zuschauen.

Es ist von Hand geschrieben, ohne Bibliothek: `src/brain.js` enthaelt ein
flaches Zahlenfeld und zwei Schleifen, mehr braucht es nicht.

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
| Vertikalkruemmung bei 20 und 60 m voraus | Kuppe oder Looping |
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
je Sekunde an der Leitplanke. Gestartet wird an drei Stellen der Runde, damit
das Netz die ganze Strecke lernt und nicht nur den Anfang.

```sh
node ai/train.js --gen 300 --pop 96 --seed 7     # schreibt src/brainweights.js
node ai/train.js --gen 200 --from                # von vorhandenen Gewichten aus
node ai/analyse.js                               # Fahrstil vermessen
```

Ein Durchlauf ueber 300 Generationen dauert rund fuenf Minuten.

### Was dabei herauskam

| | KI-Fahrer | Autopilot (handgeschrieben) |
| --- | --- | --- |
| beste Runde | **33,62 s** | 43,58 s |
| Schnitt | 196 km/h | 151 km/h |
| Anteil mit Turbo | 42 % | 17 % |
| Turbos je Runde | 12 | 5 |
| Anteil im Drift | 64 % | 0 % |
| Plankenkontakt je Runde | 0,00 s | 1,47 s |

Die KI gewinnt nicht durch hoehere Hoechstgeschwindigkeit - die ist fuer alle
gleich -, sondern durch Fahrtechnik: Sie faehrt zwei Drittel der Runde im
Drift und holt sich so sieben Mini-Turbos zusaetzlich zu den fuenf
Turbofeldern, waehrend sie die Leitplanke gar nicht mehr beruehrt. Genau das
tun gute Spieler auch.

Zwei Balancefehler hat das Training nebenbei aufgedeckt: der Motor schob auch
oberhalb der Hoechstgeschwindigkeit weiter, und der Mini-Turbo liess sich auf
der Geraden endlos nachladen. Die KI fuhr damit 30-Sekunden-Runden mit
273 km/h. Beides ist im Fahrmodell behoben.

## Drittanbieter

[three.js](https://threejs.org) r128 (MIT). Die Seite laedt die Bibliothek vom
CDN und faellt auf die mitgelieferte Kopie in `vendor/` zurueck, wenn kein Netz
verfuegbar ist.
