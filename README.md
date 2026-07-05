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
| 🚗 Garage | 💰 140 | nur Boden | Schickt regelmäßig ein **Kampffahrzeug** den Pfad entlang (bis **Stufe 5** ausbaubar) |
| ⛏️ Goldmine | 💰 100 | nur Boden | Kämpft nicht, erzeugt nach jeder Welle Gold |

### 🚗 Die Garage

Die Garage baut alle 30 Sekunden ein Fahrzeug, das den Gegnern auf dem Pfad **entgegenfährt** und sie rammt (beide Seiten nehmen dabei Schaden). Wird das Fahrzeug zerstört, explodiert es mit Flächenschaden. Jede Ausbaustufe **verkürzt die Wartezeit und erhöht die Lebenspunkte**:

| Stufe | Fahrzeug | Nachschub | Besonderes |
|---|---|---|---|
| 1 | Holzkarre | alle 30 s | rammt |
| 2 | Gepanzerter Wagen | alle 26 s | mehr LP |
| 3 | Wagen **mit Schütze** | alle 22 s | ein Mensch an Bord schießt auf Gegner |
| 4 | **Panzer** | alle 18 s | Kanone statt Gewehr, deutlich zäher |
| 5 | **Gold-Panzer** mit Banner | alle 14 s | 💣 **Bombenabwurf** alle 4 s (Flächenschaden) |

## ⛰️ Anhöhen & Bauvorschau

Auf der Karte gibt es **14 erhöhte Plateaus**. Schwere Türme (Kanone, Giftkessel, Goldmine) brauchen ebenen Boden, Fernkämpfer (Blitzturm, Wachturm) kommen **nur auf Anhöhen** — dafür bekommt **jeder** Turm auf einer Anhöhe **+10 % Reichweite** (bessere Sicht).

Beim Bauen nimmst du den Turm „in die Hand": Ein **durchsichtiger Geister-Turm** folgt dem Mauszeiger über das Spielfeld, das Feld darunter leuchtet grün (bebaubar) oder rot. Passt das Gelände nicht, erklärt eine Meldung kurz warum („Nur auf Anhöhen ⛰️") — die Auswahl bleibt dabei in der Hand.

Jeder Turm kann **zweimal aufgewertet** (mehr Schaden, Reichweite, Feuerrate) oder für 70 % des investierten Golds **verkauft** werden. **Jede Ausbaustufe hat ihr eigenes 3D-Modell** — die Türme werden sichtbar größer und prächtiger:

- **Bogenturm:** Holzwarte mit Eckpfosten, Geländer, Pfeilköcher und Ballista mit Bogenarmen → Fahne, Laterne und Goldband → Steinturm mit Zinnen und Goldwimpel
- **Kanone:** Blockgeschütz mit Kugelstapel und Nieten → Panzerschilde und Goldring → Doppelrohr mit Goldkappen
- **Frostturm:** Frostschrein mit Eissäulen, Schneekappen und blauer Leuchte → kreisende Eissplitter → Eiszacken-Kranz
- **Blitzturm:** gestufter Obsidian-Sockel, Purpursäule, Goldantenne mit Zauberwürfel → Ecksäulen mit Funken → kreisende Orbs
- **Wachturm:** Kanzel mit Sichtschlitzen ringsum, Stufendach und Laterne → Wappenschild → Steinfestung mit Zinnen
- **Mörser:** Sandsackring, Granaten-Regal und schweres 45°-Rohr mit Rohrbändern → Goldmündung → mehr Munition
- **Giftturm:** Hexenküche — Kessel am Galgen mit Kette, Pilz → Flaschenbord mit Tränken → Schädel-Trophäe
- **Garage:** Halle mit Torrahmen, Rampe, Werkzeugkiste → Stein, Zahnrad-Schild und Schornstein → Panzersperren, Antenne, Banner und Scheinwerfer
- **Goldmine:** Stolleneingang mit Stützbalken, Lore voller Gold und Spitzhacke → Laterne → leuchtender Riesen-Nugget

Beim Feuern gibt es Rückstoß-Animationen (Armbrust und Kanonenrohr zucken zurück, Kristall und Energiekugel pulsieren), und abends leuchten die Laternen der Türme.

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

Jeder Gegner (und jedes Fahrzeug) trägt seine **Lebenspunkte als Zahl** über dem Kopf — grün bei voller Gesundheit, gelb, dann rot; **blau**, solange ein Schild den Schaden schluckt.

- **Normal** (rot) — Standardgegner
- **Flink** (gelb, mit Heckflossen) — schnell, aber schwach
- **Panzer** (grün, mit Stahlhelm) — langsam, viele Lebenspunkte, kostet 2 Leben
- **Spalter** (orange, mit zwei Knubbeln) — ab Welle 6; **zerplatzt beim Tod in zwei flinke Splitterlinge** — Flächenschaden lohnt sich
- **Schildträger** (grau, mit Steinplatte) — ab Welle 9; sein **Schild blockt Schaden UND Frost/Gift**, bis er krachend zerbricht
- **Beschwörer** (violett, mit Zauberhut und Geister-Orbs) — jede 10. Welle; ruft alle paar Sekunden zwei Diener direkt auf den Pfad! Schnell ausschalten, sonst wächst die Welle immer weiter
- **Heiler** (weiß, mit rotem Kreuz) — ab Welle 7; heilt alle 3 Sekunden verletzte Gegner im Umkreis (grüner Heil-Ring). Zuerst ausschalten, sonst kämpfst du gegen regenerierende Panzer!

### 👑 Drei Bosse mit eigenen Fähigkeiten

Alle 5 Wellen kommt ein Boss — aber nie derselbe:

| Welle | Boss | Fähigkeit |
|---|---|---|
| 5 | 👑 **Panzerkönig** (lila, Goldkrone) | **Wut:** Unter halber Gesundheit rennt er plötzlich fast doppelt so schnell! |
| 10 | ❄️ **Eiskönigin** (eisblau, Zackenkrone) | **Frost-Nova:** Friert alle 5 Sekunden die Türme in ihrer Nähe ein — eingefrorene Türme stecken im Eisblock und schießen nicht |
| 15 | 👻 **Schattenfürst** (dunkel, Kapuze) | **Körperlos:** Verblasst immer wieder für 2 Sekunden — dann ist er unverwundbar, Türme ignorieren ihn und Schüsse gehen durch ihn hindurch |
| 20 | **Alle drei auf einmal!** | Das große Finale |

Jede Karte hat ihren eigenen Wellen-Charakter: In der **Schlucht** stürmen deutlich mehr Flinke, auf den **Serpentinen** rollen Panzerkolonnen an. Alle Gegner mit Werten und Taktik-Tipps stehen im **Gegner-Lexikon** (📖-Button oben).

Die Lebenspunkte der Gegner steigen mit jeder Welle. Getroffene Gegner blitzen kurz auf, und der Wellen-Button warnt vor Bosswellen (⚠️). Deine **beste Welle** wird im Browser gespeichert und am Spielende zusammen mit den Abschüssen angezeigt.

## 🖥️ Vollbild-Oberfläche

Das Spiel füllt **immer den ganzen Bildschirm** — alle Leisten schweben halbdurchsichtig über dem 3D-Bild:

- **Oben links:** Gold, Leben, Welle und alle Spiel-Buttons (Pause, Tempo, Ton, Musik, Erfolge 🏆, Gegner-Lexikon 📖, Neustart, **Vollbild ⛶**)
- **Oben rechts:** Kartenwahl und die Wellen-Vorschau
- **Unten:** die Turmleiste — jeder Turm wird dort als **echtes 3D-Modell-Bild** angezeigt (beim Start einmal aus den Originalmodellen gerendert). Zu teure Türme werden grau.
- Der ⛶-Button schaltet zusätzlich in den **Browser-Vollbildmodus** (ohne Adressleiste)

## 🎯 Zielpriorität

Jeder Kampfturm lässt sich einstellen, **wen er zuerst angreift** (Turm anklicken): **Vorderster** (Standard), **Stärkster** (z. B. für Wachturm/Mörser gegen Panzer) oder **Schwächster** (Restetöter). Die Wahl wird mitgespeichert.

## Steuerung

- **Turm bauen:** Turm in der Leiste unten anklicken (oder Tasten `1`–`9`) — der Geister-Turm hängt am Zeiger — dann aufs Feld klicken (Gelände-Regel beachten!)
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
- **Minecraft-Look:** Alle Oberflächen nutzen prozedurale 16×16-Pixel-Texturen mit Nearest-Filter (Gras, Erde, Trampelpfad, Stein, Bruchstein, Holz, Laub, Golderz, Obsidian …) — und die ganze Welt ist aus Würfeln gebaut: Grasblock-Anhöhen mit Erdkante, Klötzchen-Bäume, gestufte Blockberge mit Schneeplatten, flache Wolken, Obsidian-Portale mit leuchtender Füllung, Würfel-Türme und Block-Mobs mit Pixel-Augen
- **Tagesverlauf:** Mit jeder Welle wandert die Sonne tiefer — das Finale ab Welle 15 wird im goldvioletten Abendlicht mit langen Schatten geschlagen
- **Wetter:** Über der Schlucht-Karte fällt Dauerregen unter grauem Himmel
- **Wucht-Effekte:** Screenshake bei Kanonen-/Mörser-Explosionen und beim Fall großer Gegner, Explosionsringe — und ein buntes **Sieg-Feuerwerk** nach Welle 20
- Spiellogik läuft in 2D-Pfadkoordinaten, die 3D-Szene ist die Darstellung darüber — Turm-Platzierung per Raycasting auf das Spielfeld
- Alle Modelle (Türme, Gegner, Bäume, Portale) sind prozedural aus Three.js-Grundkörpern gebaut, es werden keine externen Assets geladen
