"""
PC-Programm zum Senden von Daten an den Arduino.

Was macht dieses Programm?
- Es verbindet sich mit dem Arduino ueber den USB-/COM-Port.
- Du tippst Text ein, druckst Enter, und der Text geht an den Arduino.
- Die Antwort des Arduino wird direkt angezeigt.

Vorbereitung (einmalig):
1. Python installieren (von python.org), falls noch nicht vorhanden.
2. Die Bibliothek "pyserial" installieren. Dafuer im Terminal / in der
   Eingabeaufforderung eingeben:
       pip install pyserial

Port herausfinden:
- Windows: In der Arduino IDE unter "Werkzeuge -> Port" steht z. B. "COM3".
           Dann unten PORT = "COM3" eintragen.
- Mac:     Meist etwas wie "/dev/cu.usbmodemXXXX".
- Linux:   Meist "/dev/ttyUSB0" oder "/dev/ttyACM0".

Starten:
    python senden.py

Beenden:
    "exit" eingeben und Enter druecken, oder Strg + C.
"""

import serial   # kommt aus dem Paket "pyserial"
import time

# ----------------------------------------------------------------------
# HIER ANPASSEN: Port und Baudrate
# ----------------------------------------------------------------------
PORT = "COM3"        # <-- an deinen Port anpassen (siehe Kommentar oben)
BAUDRATE = 9600      # muss mit Serial.begin(9600) im Arduino uebereinstimmen
# ----------------------------------------------------------------------


def main():
    # Verbindung zum Arduino aufbauen.
    try:
        arduino = serial.Serial(PORT, BAUDRATE, timeout=1)
    except serial.SerialException:
        print(f"Konnte den Port '{PORT}' nicht oeffnen.")
        print("Pruefe: richtiger Port? Arduino angesteckt? Serieller Monitor "
              "in der Arduino IDE geschlossen?")
        return

    # Dem Arduino kurz Zeit geben, sich neu zu starten (passiert beim Verbinden).
    time.sleep(2)

    print("Verbunden mit dem Arduino auf", PORT)
    print("Tippe etwas ein und druecke Enter. Mit 'exit' beenden.\n")

    # Eventuelle Begruessung des Arduino ausgeben.
    while arduino.in_waiting > 0:
        print("Arduino:", arduino.readline().decode(errors="ignore").strip())

    try:
        while True:
            # Eingabe vom Benutzer holen.
            text = input("Du: ")

            if text.lower() == "exit":
                break

            # Text an den Arduino schicken. "\n" markiert das Ende der Nachricht.
            arduino.write((text + "\n").encode())

            # Kurz warten, damit der Arduino antworten kann.
            time.sleep(0.1)

            # Alle Antwortzeilen des Arduino ausgeben.
            while arduino.in_waiting > 0:
                antwort = arduino.readline().decode(errors="ignore").strip()
                if antwort:
                    print("Arduino:", antwort)

    except KeyboardInterrupt:
        print("\nBeendet.")
    finally:
        arduino.close()
        print("Verbindung geschlossen.")


if __name__ == "__main__":
    main()
