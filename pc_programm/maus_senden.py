"""
PC-Programm: Maus UND Tastatur erfassen und an den Arduino schicken.

Ablauf:
- Das Programm beobachtet Maus- und Tastatureingaben auf dem PC.
- Es schickt sie an den Arduino (Leonardo/Micro/Pro Micro).
- Der Arduino gibt sich als USB-Maus + USB-Tastatur aus und fuehrt
  alles auf dem angeschlossenen PC aus.

Damit kannst du einen zweiten PC fernsteuern.

!!! WICHTIG: ZWEI PCs verwenden !!!
Wenn der Arduino im SELBEN PC steckt, auf dem dieses Programm laeuft,
entsteht eine Endlosschleife: Der Arduino bewegt den Zeiger -> das
Programm sieht die Bewegung -> schickt sie erneut -> die Maus "rast"
davon. Nutze also einen zweiten PC fuer den Arduino.

!!! Hinweis zur Tastatur !!!
Der Arduino nutzt das US-Tastaturlayout. Auf einem deutschen Ziel-PC
koennen daher z/y vertauscht und Sonderzeichen (@, umlaute) falsch
sein. Buchstaben, Zahlen, Enter, Pfeile usw. funktionieren normal.
Unter macOS braucht das Mitlesen der Tastatur ausserdem die
Bedienungshilfen-Berechtigung.

Vorbereitung (einmalig):
    pip install pyserial pynput

Starten:
    python maus_senden.py
Beenden:
    Strg + C  (beim Beenden werden alle Tasten sicher losgelassen)
"""

import threading
import time

import serial
from pynput import mouse, keyboard   # zum Mitlesen von Maus und Tastatur

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

# Bewegungs-Glaettung (macht ruckelige Bewegungen weicher):
#   0.0 = aus (1:1, direkt - meistens am besten)
#   0.7 = deutlich weicher, aber etwas traeger
# Werte zwischen 0.0 und 0.9 sind sinnvoll.
GLAETTUNG = 0.0

# Soll auch die Tastatur weitergeleitet werden?
TASTATUR_WEITERLEITEN = True
# ----------------------------------------------------------------------


# Sondertasten -> Code der Arduino-Keyboard-Bibliothek.
# (Umschalt/Shift wird bewusst NICHT weitergeleitet: Grossbuchstaben und
#  Sonderzeichen kommen als fertiges Zeichen an, der Arduino setzt Shift
#  dann selbst - so gibt es kein doppeltes Shift.)
SONDERTASTEN = {
    keyboard.Key.enter: 176,
    keyboard.Key.esc: 177,
    keyboard.Key.backspace: 178,
    keyboard.Key.tab: 179,
    keyboard.Key.space: 32,
    keyboard.Key.caps_lock: 193,
    keyboard.Key.up: 218,
    keyboard.Key.down: 217,
    keyboard.Key.left: 216,
    keyboard.Key.right: 215,
    keyboard.Key.insert: 209,
    keyboard.Key.delete: 212,
    keyboard.Key.home: 210,
    keyboard.Key.end: 213,
    keyboard.Key.page_up: 211,
    keyboard.Key.page_down: 214,
    keyboard.Key.ctrl_l: 128, keyboard.Key.ctrl_r: 132,
    keyboard.Key.alt_l: 130, keyboard.Key.alt_r: 134,
    keyboard.Key.cmd: 131, keyboard.Key.cmd_r: 135,
    keyboard.Key.f1: 194, keyboard.Key.f2: 195, keyboard.Key.f3: 196,
    keyboard.Key.f4: 197, keyboard.Key.f5: 198, keyboard.Key.f6: 199,
    keyboard.Key.f7: 200, keyboard.Key.f8: 201, keyboard.Key.f9: 202,
    keyboard.Key.f10: 203, keyboard.Key.f11: 204, keyboard.Key.f12: 205,
}


def taste_zu_code(key):
    """Wandelt eine gedrueckte Taste in den Zahlencode fuer den Arduino um.
    Gibt None zurueck, wenn die Taste nicht weitergeleitet werden soll."""
    if key in SONDERTASTEN:
        return SONDERTASTEN[key]

    zeichen = getattr(key, "char", None)
    if zeichen is None or len(zeichen) != 1:
        return None

    code = ord(zeichen)
    if 1 <= code <= 26:        # Strg+Buchstabe -> Steuerzeichen zurueck zu a..z
        code += 96
    if 32 <= code <= 126:      # nur normale ASCII-Zeichen
        return code
    return None


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
    print("Verbunden. Steuere Maus/Tastatur. Beenden mit Strg + C.")

    # Die Callbacks laufen in eigenen Threads. Damit das Senden dort sauber
    # laeuft, sichern wir es mit einem Schloss ab und einem "laeuft"-Schalter.
    sende_sperre = threading.Lock()
    laeuft = True

    def sende(daten: bytes):
        if not laeuft:
            return
        try:
            with sende_sperre:
                arduino.write(daten)
        except serial.SerialException:
            pass

    # ---------------- Maus: Bewegung ----------------
    letzte_position = {"x": None, "y": None}
    # Gesammelte, noch nicht gesendete Bewegung (mit Glaettung).
    ziel = {"x": 0.0, "y": 0.0}
    bewegungs_sperre = threading.Lock()

    def bei_bewegung(x, y):
        if letzte_position["x"] is None:
            letzte_position["x"] = x
            letzte_position["y"] = y
            return
        dx = (x - letzte_position["x"]) * EMPFINDLICHKEIT
        dy = (y - letzte_position["y"]) * EMPFINDLICHKEIT
        letzte_position["x"] = x
        letzte_position["y"] = y
        # Bewegung nur sammeln; das Senden macht die Bewegungs-Schleife.
        with bewegungs_sperre:
            ziel["x"] += dx
            ziel["y"] += dy

    def bewegungs_schleife():
        # Laeuft ~125x pro Sekunde und schickt die gesammelte Bewegung.
        rest = {"x": 0.0, "y": 0.0}
        anteil = 1.0 - GLAETTUNG   # wie viel der offenen Bewegung pro Takt
        while laeuft:
            time.sleep(0.008)
            with bewegungs_sperre:
                bx = ziel["x"] * anteil
                by = ziel["y"] * anteil
                ziel["x"] -= bx
                ziel["y"] -= by
            # ganzzahlig senden, Nachkommastellen fuer spaeter merken
            gx = bx + rest["x"]
            gy = by + rest["y"]
            sx = int(gx)
            sy = int(gy)
            rest["x"] = gx - sx
            rest["y"] = gy - sy
            if sx != 0 or sy != 0:
                sende(f"{sx},{sy}\n".encode())

    # ---------------- Maus: Klicks / Scrollen ----------------
    def bei_klick(x, y, taste, gedrueckt):
        if taste == mouse.Button.left:
            sende(b"PL\n" if gedrueckt else b"RL\n")
        elif taste == mouse.Button.right:
            sende(b"PR\n" if gedrueckt else b"RR\n")
        elif taste == mouse.Button.middle:
            sende(b"PM\n" if gedrueckt else b"RM\n")

    def bei_scrollen(x, y, dx, dy):
        n = int(round(dy))
        if n != 0:
            sende(f"S,{n}\n".encode())

    # ---------------- Tastatur ----------------
    def bei_taste_druck(key):
        code = taste_zu_code(key)
        if code is not None:
            sende(f"KD,{code}\n".encode())

    def bei_taste_los(key):
        code = taste_zu_code(key)
        if code is not None:
            sende(f"KU,{code}\n".encode())

    # ---------------- Alles starten ----------------
    maus_listener = mouse.Listener(
        on_move=bei_bewegung,
        on_click=bei_klick,
        on_scroll=bei_scrollen,
    )
    maus_listener.start()

    tastatur_listener = None
    if TASTATUR_WEITERLEITEN:
        tastatur_listener = keyboard.Listener(
            on_press=bei_taste_druck,
            on_release=bei_taste_los,
        )
        tastatur_listener.start()

    bewegungs_thread = threading.Thread(target=bewegungs_schleife, daemon=True)
    bewegungs_thread.start()

    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nBeendet.")
    finally:
        sende(b"KX\n")        # Sicherheit: alle Tasten/Maustasten loslassen
        time.sleep(0.05)
        laeuft = False        # ab jetzt sendet nichts mehr
        maus_listener.stop()
        if tastatur_listener is not None:
            tastatur_listener.stop()
        bewegungs_thread.join(timeout=1)
        with sende_sperre:
            arduino.close()
        print("Verbindung geschlossen.")


if __name__ == "__main__":
    main()
