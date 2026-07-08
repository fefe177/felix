"""
PC-Programm: Mausbewegungen erfassen und an den Arduino schicken.

Ablauf:
- Das Programm beobachtet, wie sich deine Maus auf dem PC bewegt.
- Es rechnet die Bewegung in x/y-Schritte um.
- Diese Schritte werden an den Arduino geschickt (Format "x,y").
- Der Arduino (Leonardo/Micro/Pro Micro) bewegt damit den Mauszeiger.

Damit kannst du z. B. die Mausbewegung von einem PC auf einen zweiten
PC uebertragen, an dem der Arduino als Maus angesteckt ist.

!!! WICHTIG: ZWEI PCs verwenden !!!
Wenn der Arduino im SELBEN PC steckt, auf dem dieses Programm laeuft,
entsteht eine Endlosschleife: Der Arduino bewegt den Zeiger -> das
Programm sieht die Bewegung -> schickt sie erneut -> usw. Die Maus
"rast" dann davon. Nutze also einen zweiten PC fuer den Arduino, oder
teste zuerst mit kleiner EMPFINDLICHKEIT und der Hand am Stecker.

Vorbereitung (einmalig):
    pip install pyserial pynput

Port anpassen: siehe PORT unten (z. B. "COM3").
Baudrate 115200 muss mit dem Arduino-Sketch uebereinstimmen.

Starten:
    python maus_senden.py
Beenden:
    Strg + C
"""

import threading
import time

import serial
from pynput import mouse   # zum Mitlesen der Mausbewegung

# ----------------------------------------------------------------------
# HIER ANPASSEN
# ----------------------------------------------------------------------
PORT = "COM3"        # <-- deinen Port eintragen (Arduino IDE -> Werkzeuge -> Port)
BAUDRATE = 115200    # muss mit Serial.begin(115200) im Sketch uebereinstimmen

# Empfindlichkeit / Geschwindigkeit der Maus:
#   1.0 = gleich schnell wie auf dem PC
#   2.0 = doppelt so schnell (empfindlicher)
#   0.5 = halb so schnell (praeziser/langsamer)
EMPFINDLICHKEIT = 1.0
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

    # Die Callbacks laufen in einem eigenen Thread. Damit das Senden dort
    # sauber und ohne Absturz laeuft, sichern wir es mit einem Schloss ab
    # und einem "laeuft"-Schalter, der beim Beenden auf False geht.
    sende_sperre = threading.Lock()
    laeuft = True

    def sende(daten: bytes):
        # Nach dem Beenden nichts mehr schreiben (Port kann zu sein).
        if not laeuft:
            return
        try:
            with sende_sperre:
                arduino.write(daten)
        except serial.SerialException:
            pass  # z. B. wenn der Port gerade geschlossen wird

    # Letzte bekannte Mausposition, um die Bewegung (Delta) zu berechnen.
    letzte_position = {"x": None, "y": None}

    # Uebrig gebliebene Nachkommastellen der Empfindlichkeit merken,
    # damit langsame Bewegungen nicht verloren gehen (kein Drift).
    rest = {"x": 0.0, "y": 0.0}

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

        # Mit der Empfindlichkeit skalieren und den Rest von vorhin dazu.
        gesamt_x = dx * EMPFINDLICHKEIT + rest["x"]
        gesamt_y = dy * EMPFINDLICHKEIT + rest["y"]

        # Ganzzahligen Anteil senden, Nachkommastellen fuer spaeter merken.
        schritt_x = int(gesamt_x)   # schneidet Richtung Null ab
        schritt_y = int(gesamt_y)
        rest["x"] = gesamt_x - schritt_x
        rest["y"] = gesamt_y - schritt_y

        if schritt_x != 0 or schritt_y != 0:
            sende(f"{schritt_x},{schritt_y}\n".encode())

    def bei_klick(x, y, taste, gedrueckt):
        # Druecken UND Loslassen getrennt senden.
        # Dadurch klappt der normale Klick, der Doppelklick (zwei Klicks
        # hintereinander) UND das Ziehen (Halten + Bewegen + Loslassen).
        if taste == mouse.Button.left:
            sende(b"PL\n" if gedrueckt else b"RL\n")
        elif taste == mouse.Button.right:
            sende(b"PR\n" if gedrueckt else b"RR\n")
        elif taste == mouse.Button.middle:
            sende(b"PM\n" if gedrueckt else b"RM\n")

    def bei_scrollen(x, y, dx, dy):
        # dy: positiv = hoch, negativ = runter. An den Arduino als "S,n".
        n = int(round(dy))
        if n != 0:
            sende(f"S,{n}\n".encode())

    # Maus-"Lauscher" starten und laufen lassen, bis Strg + C.
    listener = mouse.Listener(
        on_move=bei_bewegung,
        on_click=bei_klick,
        on_scroll=bei_scrollen,
    )
    listener.start()

    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nBeendet.")
    finally:
        laeuft = False        # ab jetzt sendet kein Callback mehr
        listener.stop()
        with sende_sperre:    # warten, bis ein evtl. laufendes Senden fertig ist
            arduino.close()
        print("Verbindung geschlossen.")


if __name__ == "__main__":
    main()
