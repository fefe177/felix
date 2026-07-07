"""
PC-Programm: Mausbewegungen erfassen und an den Arduino schicken.

Ablauf:
- Das Programm beobachtet, wie sich deine Maus auf dem PC bewegt.
- Es rechnet die Bewegung in x/y-Schritte um.
- Diese Schritte werden an den Arduino geschickt (Format "x,y").
- Der Arduino (Leonardo/Micro/Pro Micro) bewegt damit den Mauszeiger.

Damit kannst du z. B. die Mausbewegung von einem PC auf einen zweiten
PC uebertragen, an dem der Arduino als Maus angesteckt ist.

Vorbereitung (einmalig):
    pip install pyserial pynput

Port anpassen: siehe PORT unten (z. B. "COM3").
Baudrate 115200 muss mit dem Arduino-Sketch uebereinstimmen.

Starten:
    python maus_senden.py
Beenden:
    Strg + C
"""

import serial
import time
from pynput import mouse   # zum Mitlesen der Mausbewegung

# ----------------------------------------------------------------------
# HIER ANPASSEN
# ----------------------------------------------------------------------
PORT = "COM3"        # <-- deinen Port eintragen (Arduino IDE -> Werkzeuge -> Port)
BAUDRATE = 115200    # muss mit Serial.begin(115200) im Sketch uebereinstimmen
# ----------------------------------------------------------------------


def main():
    # Verbindung zum Arduino aufbauen.
    try:
        arduino = serial.Serial(PORT, BAUDRATE, timeout=1)
    except serial.SerialException:
        print(f"Konnte den Port '{PORT}' nicht oeffnen.")
        print("Pruefe: richtiger Port? Arduino angesteckt? Serieller Monitor "
              "geschlossen?")
        return

    # Dem Arduino kurz Zeit zum Neustart geben.
    time.sleep(2)
    print("Verbunden. Bewege die Maus. Beenden mit Strg + C.")

    # Letzte bekannte Mausposition, um die Bewegung (Delta) zu berechnen.
    letzte_position = {"x": None, "y": None}

    def bei_bewegung(x, y):
        # Beim allerersten Aufruf nur Startposition merken.
        if letzte_position["x"] is None:
            letzte_position["x"] = x
            letzte_position["y"] = y
            return

        # Wie weit hat sich die Maus seit dem letzten Mal bewegt?
        dx = x - letzte_position["x"]
        dy = y - letzte_position["y"]
        letzte_position["x"] = x
        letzte_position["y"] = y

        # Nur senden, wenn sich wirklich etwas bewegt hat.
        if dx != 0 or dy != 0:
            arduino.write(f"{dx},{dy}\n".encode())

    def bei_klick(x, y, taste, gedrueckt):
        # Nur beim Loslassen senden (ein Klick = einmal).
        if not gedrueckt:
            if taste == mouse.Button.left:
                arduino.write(b"L\n")
            elif taste == mouse.Button.right:
                arduino.write(b"R\n")

    # Maus-"Lauscher" starten und laufen lassen, bis Strg + C.
    listener = mouse.Listener(on_move=bei_bewegung, on_click=bei_klick)
    listener.start()

    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nBeendet.")
    finally:
        listener.stop()
        arduino.close()
        print("Verbindung geschlossen.")


if __name__ == "__main__":
    main()
