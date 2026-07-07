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
