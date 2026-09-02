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
| `src/hud.js` | Anzeige, Minimap, Sound |
| `src/game.js` | Szene, Rennlogik, Kamera, Eingabe |
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

## Drittanbieter

[three.js](https://threejs.org) r128 (MIT). Die Seite laedt die Bibliothek vom
CDN und faellt auf die mitgelieferte Kopie in `vendor/` zurueck, wenn kein Netz
verfuegbar ist.
