# Arduino <-> PC Kommunikation

Ein kleines Projekt, mit dem du **Daten von deinem PC an einen Arduino schicken**
kannst. Der Arduino empfängt die Daten und **gibt sie wieder zurück** (sogenanntes
"Echo"). Die Verbindung läuft ganz normal über das **USB-Kabel**.

> Das Ganze nennt man **serielle Kommunikation** (englisch: *serial communication*).
> "Seriell" heißt einfach: Die Daten werden Zeichen für Zeichen nacheinander
> über das USB-Kabel geschickt.

## Was ist drin?

| Ordner            | Datei                 | Wofür?                                        |
|-------------------|-----------------------|-----------------------------------------------|
| `arduino_sketch/` | `arduino_sketch.ino`  | Läuft auf dem **Arduino**                     |
| `pc_programm/`    | `senden.py`           | Läuft auf dem **PC** (sendet Text)            |

## Was du brauchst

- Einen Arduino (z. B. Arduino Uno) + USB-Kabel
- Die **Arduino IDE** (kostenlos: https://www.arduino.cc/en/software)
- **Python** auf dem PC (kostenlos: https://www.python.org)
- Die Python-Bibliothek **pyserial**

## Schritt für Schritt

### 1. Sketch auf den Arduino laden

1. Arduino IDE öffnen.
2. Datei `arduino_sketch/arduino_sketch.ino` öffnen.
3. Oben unter **Werkzeuge**:
   - das richtige **Board** wählen (z. B. "Arduino Uno"),
   - den richtigen **Port** wählen (z. B. `COM3` unter Windows).
4. Auf den **Pfeil** (Hochladen) klicken und warten, bis "Hochladen abgeschlossen"
   erscheint.

### 2a. Schneller Test – ganz ohne PC-Programm

Du kannst sofort testen, ob alles funktioniert:

1. In der Arduino IDE oben rechts auf das **Lupen-Symbol** klicken
   ("Serieller Monitor").
2. Unten rechts die **Baudrate auf 9600** stellen.
3. Oben Text eintippen, auf **Senden** klicken.
4. Der Arduino antwortet mit: `Du hast gesendet: ...`

### 2b. Mit dem Python-Programm senden

Wenn du lieber vom PC aus mit einem eigenen Programm sendest:

1. **pyserial installieren** – im Terminal / in der Eingabeaufforderung:

   ```
   pip install pyserial
   ```

2. In der Datei `pc_programm/senden.py` oben den **Port anpassen**:

   ```python
   PORT = "COM3"      # <-- deinen Port eintragen
   ```

   - **Windows:** z. B. `COM3` (steht in der Arduino IDE unter Werkzeuge → Port)
   - **Mac:** z. B. `/dev/cu.usbmodemXXXX`
   - **Linux:** z. B. `/dev/ttyUSB0` oder `/dev/ttyACM0`

3. **Wichtig:** Den Seriellen Monitor in der Arduino IDE **schließen**
   (sonst ist der Port belegt und Python kommt nicht dran).

4. Programm starten:

   ```
   python senden.py
   ```

5. Text eintippen, Enter drücken – der Arduino antwortet. Mit `exit` beenden.

## Beispiel

```
Du: Hallo Arduino
Arduino: Du hast gesendet: Hallo Arduino
```

Beim Empfangen blinkt außerdem kurz die eingebaute **LED** auf dem Arduino.

## Häufige Probleme

| Problem                                | Lösung                                                       |
|----------------------------------------|-------------------------------------------------------------|
| "Konnte Port nicht öffnen"             | Seriellen Monitor schließen; richtigen Port eintragen.      |
| Nur wirre Zeichen kommen an            | Baudrate muss überall **9600** sein.                        |
| Keine Antwort                          | Wurde der Sketch wirklich hochgeladen? Richtiges Board?     |
| `pip` nicht gefunden                   | Python neu installieren und "Add to PATH" anhaken.          |

---

## Zusatz: Mausbewegungen senden (Arduino als USB-Maus)

Wenn der Arduino **den echten Mauszeiger bewegen** soll, gibt es dafür
eigene Dateien:

| Ordner            | Datei                | Wofür?                                          |
|-------------------|----------------------|-------------------------------------------------|
| `arduino_maus/`   | `arduino_maus.ino`   | Arduino spielt USB-Maus, führt Bewegungen aus   |
| `pc_programm/`    | `maus_senden.py`     | Erfasst deine Mausbewegung und schickt sie hin  |

### Wichtig: passendes Board

Sich als USB-Maus auszugeben, geht **nur** mit diesen Boards
(Chip ATmega32u4):

- Arduino **Leonardo**
- Arduino **Micro**
- Arduino **Pro Micro**

Ein **Uno / Nano / Mega** kann das **nicht** ohne Weiteres.

> ⚠️ **Zwei PCs verwenden!** Steckt der Arduino im **selben** PC, auf dem
> `maus_senden.py` läuft, entsteht eine Endlosschleife: Der Arduino bewegt
> den Zeiger → das Programm sieht die Bewegung → schickt sie erneut → die
> Maus „rast" davon. Nutze den Arduino also an einem **zweiten** PC.

### So funktioniert es

1. Sketch `arduino_maus/arduino_maus.ino` hochladen
   (unter Werkzeuge das Board **Leonardo** o. ä. wählen).
2. Zusätzliche Bibliothek installieren:

   ```
   pip install pyserial pynput
   ```

3. In `pc_programm/maus_senden.py` oben den **Port** eintragen
   und beachten: Baudrate ist hier **115200** (nicht 9600).
4. Starten:

   ```
   python maus_senden.py
   ```

5. Bewege die Maus – der Arduino gibt die Bewegung als USB-Maus aus.
   Beenden mit **Strg + C**.

### Befehls-Format (was der Arduino versteht)

- `x,y`  → Bewegung (z. B. `10,-5` = 10 nach rechts, 5 nach oben)
- `S,n`  → Scrollen (z. B. `S,-3` = 3 nach unten scrollen)
- `L`    → kurzer Linksklick
- `R`    → kurzer Rechtsklick
- `M`    → kurzer Klick mittlere Taste (Mausrad-Klick)
- `DL`   → Doppelklick links
- `PL` / `RL` → linke Taste **halten** / **loslassen** (fürs Ziehen)
- `PR` / `RR` → rechte Taste halten / loslassen
- `PM` / `RM` → mittlere Taste halten / loslassen

**Ziehen (Drag)** = `PL` → mehrere `x,y` → `RL`. Das PC-Programm macht das
automatisch, wenn du mit gedrückter Maustaste ziehst. **Scrollen** und
**Doppelklicks** werden ebenfalls automatisch mit übertragen.

### Einstellungen in `maus_senden.py`

Oben in der Datei kannst du anpassen:

```python
EMPFINDLICHKEIT = 1.0        # Geschwindigkeit der Maus
GLAETTUNG = 0.0             # Bewegungs-Glättung
TASTATUR_WEITERLEITEN = True # Tastatur mit übertragen?
```

- **EMPFINDLICHKEIT:** `1.0` = wie dein PC, `2.0` = doppelt so schnell,
  `0.5` = langsamer/präziser.
- **GLAETTUNG:** `0.0` = aus (1:1, direkt – meist am besten). Werte bis
  `0.9` machen ruckelige Bewegungen weicher, dafür etwas träger.
- **TASTATUR_WEITERLEITEN:** `True` = Tastendrücke werden mitgeschickt.

### Tastatur

Wenn `TASTATUR_WEITERLEITEN = True` ist, gibt der Arduino auch Tastendrücke
aus. Befehle, die der Arduino dafür versteht:

- `KD,c` → Taste mit Code `c` **drücken** (z. B. `KD,97` = `a`, `KD,176` = Enter)
- `KU,c` → Taste **loslassen**
- `KX`   → **alle** Tasten/Maustasten loslassen (Sicherheit; wird beim
  Beenden automatisch gesendet)

> ⚠️ **US-Layout:** Der Arduino nutzt intern das US-Tastaturlayout. Auf einem
> deutschen Ziel-PC können `z`/`y` vertauscht und Sonderzeichen (`@`, `ä ö ü`)
> falsch sein. Buchstaben, Zahlen, Enter, Pfeile usw. funktionieren normal.
> Unter macOS braucht das Mitlesen der Tastatur die Berechtigung
> „Bedienungshilfen".

### Verzögerung

Für Mausbewegungen wird die schnelle Baudrate **115200** genutzt und auf
feste Wartezeiten verzichtet, damit die Bewegung flüssig ist (nur wenige
Millisekunden Verzögerung).
