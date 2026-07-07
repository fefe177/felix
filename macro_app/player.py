"""Spielt aufgenommene Makros ab (systemweit)."""

import threading
import time

from pynput import keyboard, mouse

from .events import dict_to_key, str_to_button


class MacroPlayer:
    """Spielt eine Liste aufgenommener Ereignisse ab.

    Die Wiedergabe läuft in einem Hintergrund-Thread und kann jederzeit
    über :meth:`stop` abgebrochen werden.
    """

    def __init__(self):
        self._stop = threading.Event()
        self._thread = None
        self.playing = False
        self._mouse = mouse.Controller()
        self._keyboard = keyboard.Controller()

    def play(self, events, speed=1.0, repeat=1,
             on_progress=None, on_finish=None):
        """Startet die Wiedergabe.

        :param speed:  Geschwindigkeitsfaktor (>1 schneller, <1 langsamer).
        :param repeat: Anzahl Durchläufe, 0 bedeutet endlos.
        """
        if self.playing:
            return
        self._stop.clear()
        self.playing = True
        self._thread = threading.Thread(
            target=self._run,
            args=(list(events), speed, repeat, on_progress, on_finish),
            daemon=True,
        )
        self._thread.start()

    def stop(self):
        """Bricht die Wiedergabe ab."""
        self._stop.set()

    def _sleep(self, seconds):
        """Unterbrechbarer Schlaf – reagiert schnell auf stop()."""
        end = time.time() + seconds
        while not self._stop.is_set():
            remaining = end - time.time()
            if remaining <= 0:
                return
            time.sleep(min(remaining, 0.02))

    def _run(self, events, speed, repeat, on_progress, on_finish):
        try:
            speed = max(float(speed), 0.01)
            loop = 0
            while not self._stop.is_set() and (repeat == 0 or loop < repeat):
                prev_t = 0.0
                for index, event in enumerate(events):
                    if self._stop.is_set():
                        break
                    delay = (event.get("t", 0.0) - prev_t) / speed
                    prev_t = event.get("t", 0.0)
                    if delay > 0:
                        self._sleep(delay)
                    if self._stop.is_set():
                        break
                    self._dispatch(event)
                    if on_progress is not None:
                        on_progress(loop + 1, index + 1, len(events))
                loop += 1
        finally:
            self.playing = False
            if on_finish is not None:
                on_finish()

    def _dispatch(self, event):
        etype = event["type"]
        if etype == "move":
            self._mouse.position = (event["x"], event["y"])
        elif etype == "click":
            self._mouse.position = (event["x"], event["y"])
            button = str_to_button(event["button"])
            if event["pressed"]:
                self._mouse.press(button)
            else:
                self._mouse.release(button)
        elif etype == "scroll":
            self._mouse.position = (event["x"], event["y"])
            self._mouse.scroll(event["dx"], event["dy"])
        elif etype == "key_press":
            self._keyboard.press(dict_to_key(event["key"]))
        elif etype == "key_release":
            self._keyboard.release(dict_to_key(event["key"]))
