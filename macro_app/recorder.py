"""Nimmt Maus- und Tastatur-Ereignisse systemweit auf."""

import time

from pynput import keyboard, mouse

from .events import button_to_str, key_to_dict


class MacroRecorder:
    """Zeichnet Maus- und Tastatur-Ereignisse mit Zeitstempeln auf.

    Jedes Ereignis erhält einen relativen Zeitstempel ``t`` (Sekunden seit
    Aufnahmebeginn), damit die Wiedergabe das ursprüngliche Timing nachbildet.
    """

    def __init__(self, record_moves=True, move_interval=0.03,
                 stop_key=keyboard.Key.esc):
        self.record_moves = record_moves
        # Mausbewegungen werden gedrosselt, um nicht Tausende Ereignisse
        # pro Sekunde zu erzeugen.
        self.move_interval = move_interval
        self.stop_key = stop_key

        self.events = []
        self.recording = False

        self._start = 0.0
        self._last_move = 0.0
        self._mouse_listener = None
        self._keyboard_listener = None
        self._on_stop = None

    def _t(self):
        return round(time.time() - self._start, 4)

    def start(self, on_stop=None):
        """Startet die Aufnahme. ``on_stop`` wird beim Beenden aufgerufen.

        Achtung: ``on_stop`` läuft ggf. im Listener-Thread, nicht im
        Haupt-/GUI-Thread.
        """
        if self.recording:
            return
        self.events = []
        self._on_stop = on_stop
        self._start = time.time()
        self._last_move = 0.0
        self.recording = True

        self._mouse_listener = mouse.Listener(
            on_move=self._on_move,
            on_click=self._on_click,
            on_scroll=self._on_scroll,
        )
        self._keyboard_listener = keyboard.Listener(
            on_press=self._on_press,
            on_release=self._on_release,
        )
        self._mouse_listener.start()
        self._keyboard_listener.start()

    def stop(self):
        """Beendet die Aufnahme und ruft den on_stop-Callback auf."""
        if not self.recording:
            return
        self.recording = False
        if self._mouse_listener is not None:
            self._mouse_listener.stop()
            self._mouse_listener = None
        if self._keyboard_listener is not None:
            self._keyboard_listener.stop()
            self._keyboard_listener = None
        callback = self._on_stop
        self._on_stop = None
        if callback is not None:
            callback()

    # ------------------------------------------------------------------ Maus
    def _on_move(self, x, y):
        if not self.record_moves:
            return
        now = time.time()
        if now - self._last_move < self.move_interval:
            return
        self._last_move = now
        self.events.append({"t": self._t(), "type": "move", "x": x, "y": y})

    def _on_click(self, x, y, button, pressed):
        self.events.append({
            "t": self._t(),
            "type": "click",
            "x": x,
            "y": y,
            "button": button_to_str(button),
            "pressed": pressed,
        })

    def _on_scroll(self, x, y, dx, dy):
        self.events.append({
            "t": self._t(),
            "type": "scroll",
            "x": x,
            "y": y,
            "dx": dx,
            "dy": dy,
        })

    # -------------------------------------------------------------- Tastatur
    def _on_press(self, key):
        if key == self.stop_key:
            # Aufnahme beenden – die Stopp-Taste selbst nicht mitschneiden.
            self.stop()
            return False
        self.events.append({
            "t": self._t(),
            "type": "key_press",
            "key": key_to_dict(key),
        })

    def _on_release(self, key):
        if key == self.stop_key:
            return False
        self.events.append({
            "t": self._t(),
            "type": "key_release",
            "key": key_to_dict(key),
        })
