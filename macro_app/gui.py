"""Oberfläche im Apple-Design (helle, cleane iOS/macOS-Anmutung).

Die Optik wird als Bild komponiert (siehe :mod:`macro_app.render`) und auf
einem Canvas gezeichnet. Zusätzliche Profi-Funktionen: globale Hotkeys,
Countdown vor der Wiedergabe und Pause zwischen den Durchläufen.
Aufnahme-/Wiedergabe-Logik liegt in :mod:`recorder` und :mod:`player`.
"""

import os
import queue
import tkinter as tk
from tkinter import filedialog, font as tkfont, messagebox

from PIL import ImageTk
from pynput import keyboard

from . import render
from .player import MacroPlayer
from .recorder import MacroRecorder
from .storage import load_macro, save_macro

W, H = 460, 732
COUNTDOWN_SECONDS = 3

# Apple-Systemfarben (helles Erscheinungsbild)
BG_FALLBACK = "#f2f2f7"
LABEL = "#1c1c1e"
SECONDARY = "#8e8e93"
SEP = "#e5e5ea"
BLUE = (0, 122, 255)
BLUE_DARK = (0, 105, 224)
BLUE_HEX = "#007aff"
RED = (255, 59, 48)
RED_DARK = (214, 47, 39)
GRAY_FILL = (199, 199, 204)
WHITE = (255, 255, 255)
CARD_BORDER = (0, 0, 0, 18)

STATUS_IDLE = "#34c759"
STATUS_BUSY = "#ff9500"

# Layout
STATUS_BOX = (24, 100, 436, 176)
REC_BOX = (24, 196, 224, 250)
PLAY_BOX = (236, 196, 436, 250)
SET_BOX = (24, 274, 436, 588)
SAVE_BOX = (24, 612, 224, 658)
LOAD_BOX = (236, 612, 436, 658)

REP_STEP = (318, 289, 412, 319)
PAUSE_STEP = (318, 345, 412, 375)
SLIDER_Y = 448
SLIDER_X1, SLIDER_X2 = 48, 412


def _center(box):
    return (box[0] + box[2]) // 2, (box[1] + box[3]) // 2


def _pick_font(root):
    available = set(tkfont.families(root))
    for name in ("SF Pro Text", "SF Pro Display", ".AppleSystemUIFont",
                 "Helvetica Neue", "Segoe UI", "Arial"):
        if name in available:
            return name
    return "Helvetica"


class GButton:
    """Anklickbarer Button (Bild + Beschriftung) auf dem Canvas."""

    def __init__(self, canvas, box, images, label, command, font,
                 text_color=LABEL, disabled_color=SECONDARY):
        self.canvas = canvas
        self.images = images
        self.command = command
        self.text_color = text_color
        self.disabled_color = disabled_color
        self.enabled = True
        self.cx, self.cy = _center(box)
        self.tag = f"btn-{id(self)}"
        self.img = canvas.create_image(self.cx, self.cy,
                                       image=images["normal"], tags=self.tag)
        self.text = canvas.create_text(self.cx, self.cy, text=label,
                                       fill=text_color, font=font,
                                       tags=self.tag)
        canvas.tag_bind(self.tag, "<Button-1>", self._click)
        canvas.tag_bind(self.tag, "<Enter>", self._enter)
        canvas.tag_bind(self.tag, "<Leave>", self._leave)

    def _click(self, _event):
        if self.enabled:
            self.command()

    def _enter(self, _event):
        if self.enabled:
            self.canvas.itemconfig(self.img, image=self.images["hover"])
            self.canvas.config(cursor="hand2")

    def _leave(self, _event):
        self.canvas.itemconfig(self.img, image=self.images["normal"])
        self.canvas.config(cursor="")

    def set_label(self, text):
        self.canvas.itemconfig(self.text, text=text)

    def set_enabled(self, enabled):
        self.enabled = enabled
        self.canvas.itemconfig(
            self.img, image=self.images["normal" if enabled else "dim"])
        self.canvas.itemconfig(
            self.text, fill=self.text_color if enabled else self.disabled_color)


class MacroApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Makro Recorder")
        self.root.geometry(f"{W}x{H}")
        self.root.resizable(False, False)
        self.root.configure(bg=BG_FALLBACK)

        self.font = _pick_font(root)
        self.recorder = MacroRecorder()
        self.player = MacroPlayer()
        self.events = []
        self.current_name = "Unbenannt"
        self.repeat = 1
        self.pause_seconds = 0
        self.speed = 1.0
        self.record_moves = True
        self.countdown_on = False

        self._ui_queue = queue.Queue()
        self._progress = None
        self._abort_listener = None
        self._hotkeys = None
        self._counting = False
        self._count_after = None
        self._imgs = []

        self._build_ui()
        self._start_hotkeys()
        self._poll_queue()
        self._update_state()

    # ------------------------------------------------------------------ UI
    def _tk(self, pil_image):
        img = ImageTk.PhotoImage(pil_image)
        self._imgs.append(img)
        return img

    def _f(self, size, weight="normal"):
        return (self.font, size, weight)

    def _build_ui(self):
        canvas = tk.Canvas(self.root, width=W, height=H,
                           highlightthickness=0, bd=0)
        canvas.pack(fill="both", expand=True)
        self.canvas = canvas

        bg = render.make_background(W, H)
        self._paste_card(bg, STATUS_BOX, 18)
        self._paste_card(bg, SET_BOX, 18)
        self.bg_img = self._tk(bg)
        canvas.create_image(0, 0, image=self.bg_img, anchor="nw")

        # Kopfzeile
        canvas.create_text(24, 44, text="Makro Recorder", anchor="w",
                           fill=LABEL, font=self._f(28, "bold"))
        canvas.create_text(24, 76, text="Maus & Tastatur aufnehmen "
                           "und abspielen", anchor="w", fill=SECONDARY,
                           font=self._f(13))

        # Status-Karte
        self.dot = canvas.create_oval(46, 132, 58, 144, fill=STATUS_IDLE,
                                      outline="")
        self.status_id = canvas.create_text(
            72, 130, text="Bereit", anchor="w", fill=LABEL,
            font=self._f(15, "bold"))
        self.count_id = canvas.create_text(
            72, 152, text="0 Ereignisse", anchor="w", fill=SECONDARY,
            font=self._f(12))

        # Haupt-Buttons
        self.record_btn = GButton(
            canvas, REC_BOX, self._btn_imgs(REC_BOX, RED, RED_DARK, 14),
            "Aufnehmen", self.toggle_record, self._f(15, "bold"),
            text_color="#ffffff", disabled_color="#f3f3f3")
        self.play_btn = GButton(
            canvas, PLAY_BOX, self._btn_imgs(PLAY_BOX, BLUE, BLUE_DARK, 14),
            "Abspielen", self.toggle_play, self._f(15, "bold"),
            text_color="#ffffff", disabled_color="#f3f3f3")

        # Einstellungen – Beschriftungen
        canvas.create_text(48, 304, text="Wiederholungen", anchor="w",
                           fill=LABEL, font=self._f(14))
        self._separator(336)
        canvas.create_text(48, 360, text="Pause zwischen Läufen", anchor="w",
                           fill=LABEL, font=self._f(14))
        self._separator(392)
        canvas.create_text(48, 416, text="Geschwindigkeit", anchor="w",
                           fill=LABEL, font=self._f(14))
        self.speed_id = canvas.create_text(412, 416, text="1.00×", anchor="e",
                                           fill=SECONDARY, font=self._f(14))
        self._separator(480)
        canvas.create_text(48, 504, text="Countdown vor Start (3 s)",
                           anchor="w", fill=LABEL, font=self._f(14))
        self._separator(536)
        canvas.create_text(48, 560, text="Mausbewegungen aufnehmen",
                           anchor="w", fill=LABEL, font=self._f(14))

        # Stepper (Wiederholungen + Pause)
        self.step_img = self._tk(render.stepper_bg())
        self._make_stepper(REP_STEP, self._step_repeat)
        self.repeat_id = canvas.create_text(300, 304, text="1", anchor="e",
                                            fill=SECONDARY, font=self._f(14))
        self._make_stepper(PAUSE_STEP, self._step_pause)
        self.pause_id = canvas.create_text(300, 360, text="0 s", anchor="e",
                                           fill=SECONDARY, font=self._f(14))

        # Slider
        self._build_slider()

        # Umschalter (Countdown + Mausbewegungen)
        self.switch_on = self._tk(render.apple_switch(True))
        self.switch_off = self._tk(render.apple_switch(False))
        self.countdown_id = canvas.create_image(412, 504, image=self.switch_off,
                                                anchor="e")
        self._bind_switch(self.countdown_id, self._toggle_countdown)
        self.moves_id = canvas.create_image(412, 560, image=self.switch_on,
                                            anchor="e")
        self._bind_switch(self.moves_id, self._toggle_moves)

        # Datei-Buttons
        self.save_btn = GButton(
            canvas, SAVE_BOX, self._btn_imgs(SAVE_BOX, WHITE, (242, 242, 247),
                                             12, border=CARD_BORDER),
            "Speichern", self.save, self._f(14), text_color=BLUE_HEX)
        self.load_btn = GButton(
            canvas, LOAD_BOX, self._btn_imgs(LOAD_BOX, WHITE, (242, 242, 247),
                                             12, border=CARD_BORDER),
            "Laden", self.load, self._f(14), text_color=BLUE_HEX)

        # Fußzeile – Hotkeys
        canvas.create_text(
            W // 2, 694,
            text="F9  Aufnehmen      F10  Abspielen      ESC  Stopp",
            fill=SECONDARY, font=self._f(12))

    def _paste_card(self, bg, box, radius):
        w, h = box[2] - box[0], box[3] - box[1]
        tile, pad = render.make_pill(w, h, radius, WHITE, border=CARD_BORDER)
        bg.paste(tile, (box[0] - pad, box[1] - pad), tile)

    def _btn_imgs(self, box, fill, fill_hover, radius, border=None):
        w, h = box[2] - box[0], box[3] - box[1]
        normal, _ = render.make_pill(w, h, radius, fill, border=border)
        hover, _ = render.make_pill(w, h, radius, fill_hover, border=border)
        dim, _ = render.make_pill(w, h, radius, GRAY_FILL, border=border)
        return {"normal": self._tk(normal), "hover": self._tk(hover),
                "dim": self._tk(dim)}

    def _separator(self, y):
        self.canvas.create_line(48, y, 412, y, fill=SEP, width=1)

    def _make_stepper(self, box, command):
        cx, cy = _center(box)
        sid = self.canvas.create_image(cx, cy, image=self.step_img)
        self.canvas.create_text(cx - 23, cy, text="−", fill=BLUE_HEX,
                                font=self._f(20))
        self.canvas.create_text(cx + 23, cy, text="+", fill=BLUE_HEX,
                                font=self._f(20))
        self.canvas.tag_bind(sid, "<Button-1>",
                             lambda e, c=cx: command(e.x < c))
        self.canvas.tag_bind(sid, "<Enter>",
                             lambda e: self.canvas.config(cursor="hand2"))
        self.canvas.tag_bind(sid, "<Leave>",
                             lambda e: self.canvas.config(cursor=""))

    def _bind_switch(self, item, command):
        self.canvas.tag_bind(item, "<Button-1>", command)
        self.canvas.tag_bind(item, "<Enter>",
                             lambda e: self.canvas.config(cursor="hand2"))
        self.canvas.tag_bind(item, "<Leave>",
                             lambda e: self.canvas.config(cursor=""))

    def _build_slider(self):
        c = self.canvas
        c.create_line(SLIDER_X1, SLIDER_Y, SLIDER_X2, SLIDER_Y,
                      fill=SEP, width=4, capstyle="round")
        kx = self._speed_to_x(self.speed)
        self.prog = c.create_line(SLIDER_X1, SLIDER_Y, kx, SLIDER_Y,
                                  fill=BLUE_HEX, width=4, capstyle="round")
        knob, _ = render.make_pill(24, 24, 12, WHITE, pad=8, shadow_alpha=55,
                                   shadow_blur=6, shadow_dy=1,
                                   border=(0, 0, 0, 25))
        self.knob_img = self._tk(knob)
        self.knob = c.create_image(kx, SLIDER_Y, image=self.knob_img)
        c.tag_bind(self.knob, "<Enter>", lambda e: c.config(cursor="hand2"))
        c.tag_bind(self.knob, "<Leave>", lambda e: c.config(cursor=""))
        c.tag_bind(self.knob, "<B1-Motion>", self._slider_drag)
        c.tag_bind(self.knob, "<Button-1>", self._slider_drag)

    def _speed_to_x(self, speed):
        t = (speed - 0.25) / (4.0 - 0.25)
        return int(SLIDER_X1 + t * (SLIDER_X2 - SLIDER_X1))

    def _slider_drag(self, event):
        x = max(SLIDER_X1, min(SLIDER_X2, event.x))
        t = (x - SLIDER_X1) / (SLIDER_X2 - SLIDER_X1)
        self.speed = round(0.25 + t * (4.0 - 0.25), 2)
        self.canvas.coords(self.knob, x, SLIDER_Y)
        self.canvas.coords(self.prog, SLIDER_X1, SLIDER_Y, x, SLIDER_Y)
        self.canvas.itemconfig(self.speed_id, text=f"{self.speed:.2f}×")

    # ---------------------------------------------------------- Stepper etc.
    def _step_repeat(self, minus):
        self.repeat = max(0, self.repeat - 1) if minus else self.repeat + 1
        text = "∞" if self.repeat == 0 else str(self.repeat)
        self.canvas.itemconfig(self.repeat_id, text=text)

    def _step_pause(self, minus):
        self.pause_seconds = (max(0, self.pause_seconds - 1) if minus
                              else self.pause_seconds + 1)
        self.canvas.itemconfig(self.pause_id, text=f"{self.pause_seconds} s")

    def _toggle_countdown(self, _event):
        self.countdown_on = not self.countdown_on
        self.canvas.itemconfig(
            self.countdown_id,
            image=self.switch_on if self.countdown_on else self.switch_off)

    def _toggle_moves(self, _event):
        self.record_moves = not self.record_moves
        self.canvas.itemconfig(
            self.moves_id,
            image=self.switch_on if self.record_moves else self.switch_off)

    # --------------------------------------------------------- Hotkeys/Panik
    def _start_hotkeys(self):
        self._hotkeys = keyboard.GlobalHotKeys({
            "<f9>": lambda: self._ui_queue.put(self.toggle_record),
            "<f10>": lambda: self._ui_queue.put(self.toggle_play),
            "<esc>": lambda: self._ui_queue.put(self._global_stop),
        })
        self._hotkeys.start()

    def _global_stop(self):
        if self._counting:
            self._cancel_countdown()
        self.player.stop()
        self.recorder.stop()

    # -------------------------------------------------------------- Aufnahme
    def toggle_record(self):
        if self.recorder.recording:
            self.recorder.stop()
            return
        if self.player.playing or self._counting:
            return
        self.recorder.record_moves = self.record_moves
        self.events = []
        self.recorder.start(on_stop=self._on_record_stop)
        self._set_status("Aufnahme läuft …  (F9 / ESC beendet)", STATUS_BUSY)
        self._update_state()

    def _on_record_stop(self):
        self._ui_queue.put(self._after_record_stop)

    def _after_record_stop(self):
        self.events = list(self.recorder.events)
        self._set_status("Aufnahme beendet", STATUS_IDLE)
        self._update_state()

    # ------------------------------------------------------------ Wiedergabe
    def toggle_play(self):
        if self.player.playing:
            self.player.stop()
            return
        if self._counting:
            self._cancel_countdown()
            return
        if self.recorder.recording:
            return
        if not self.events:
            messagebox.showinfo(
                "Kein Makro",
                "Es wurde noch nichts aufgenommen oder geladen.")
            return
        if self.countdown_on:
            self._begin_countdown(COUNTDOWN_SECONDS)
        else:
            self._start_playback()

    def _begin_countdown(self, seconds):
        self._counting = True
        self._set_status(f"Wiedergabe startet in {seconds} …", STATUS_BUSY)
        self._update_state()
        self._count_after = self.root.after(
            1000, lambda: self._tick(seconds - 1))

    def _tick(self, seconds):
        if not self._counting:
            return
        if seconds <= 0:
            self._counting = False
            self._start_playback()
            return
        self._set_status(f"Wiedergabe startet in {seconds} …", STATUS_BUSY)
        self._count_after = self.root.after(
            1000, lambda: self._tick(seconds - 1))

    def _cancel_countdown(self):
        self._counting = False
        if self._count_after is not None:
            self.root.after_cancel(self._count_after)
            self._count_after = None
        self._set_status("Bereit", STATUS_IDLE)
        self._update_state()

    def _start_playback(self):
        self._start_abort_listener()
        self.player.play(
            self.events, speed=self.speed, repeat=self.repeat,
            repeat_delay=self.pause_seconds, on_progress=self._on_progress,
            on_finish=self._on_play_finish)
        self._set_status("Wiedergabe läuft …  (ESC stoppt)", STATUS_BUSY)
        self._update_state()

    def _on_progress(self, loop, index, total):
        self._progress = (loop, index, total)

    def _on_play_finish(self):
        self._ui_queue.put(self._after_play_finish)

    def _after_play_finish(self):
        self._stop_abort_listener()
        self._progress = None
        self._set_status("Wiedergabe beendet", STATUS_IDLE)
        self._update_state()

    def _start_abort_listener(self):
        def on_press(key):
            if key == keyboard.Key.esc:
                self.player.stop()
                return False
            return None
        self._abort_listener = keyboard.Listener(on_press=on_press)
        self._abort_listener.start()

    def _stop_abort_listener(self):
        if self._abort_listener is not None:
            self._abort_listener.stop()
            self._abort_listener = None

    # ------------------------------------------------------------- Dateien
    def save(self):
        if not self.events:
            messagebox.showinfo("Nichts zu speichern",
                                "Es wurde noch nichts aufgenommen.")
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("Makro-Dateien", "*.json"), ("Alle Dateien", "*.*")],
            initialfile="makro.json")
        if not path:
            return
        name = os.path.splitext(os.path.basename(path))[0]
        save_macro(path, self.events, name=name)
        self.current_name = name
        self._set_status(f"Gespeichert: {name}", STATUS_IDLE)

    def load(self):
        path = filedialog.askopenfilename(
            filetypes=[("Makro-Dateien", "*.json"), ("Alle Dateien", "*.*")])
        if not path:
            return
        try:
            data = load_macro(path)
        except Exception as error:  # noqa: BLE001 - dem Nutzer anzeigen
            messagebox.showerror("Fehler",
                                 f"Konnte Datei nicht laden:\n{error}")
            return
        self.events = data.get("events", [])
        self.current_name = data.get("name", os.path.basename(path))
        self._update_state()
        self._set_status(f"Geladen: {self.current_name}", STATUS_IDLE)

    # -------------------------------------------------------------- Zustand
    def _events_summary(self):
        events = self.events
        if not events:
            return "0 Ereignisse"
        clicks = sum(1 for e in events
                     if e["type"] == "click" and e.get("pressed"))
        keys = sum(1 for e in events if e["type"] == "key_press")
        moves = sum(1 for e in events if e["type"] == "move")
        scrolls = sum(1 for e in events if e["type"] == "scroll")
        parts = []
        if clicks:
            parts.append(f"{clicks} Klick{'s' if clicks != 1 else ''}")
        if keys:
            parts.append(f"{keys} Taste{'n' if keys != 1 else ''}")
        if moves:
            parts.append(f"{moves} Bewegung{'en' if moves != 1 else ''}")
        if scrolls:
            parts.append(f"{scrolls}× Scrollen")
        return "  ·  ".join(parts) if parts else f"{len(events)} Ereignisse"

    def _update_state(self):
        recording = self.recorder.recording
        playing = self.player.playing
        counting = self._counting
        if recording:
            self.record_btn.set_label("Stopp")
            self.record_btn.set_enabled(True)
            self.play_btn.set_enabled(False)
        elif playing:
            self.play_btn.set_label("Stopp")
            self.play_btn.set_enabled(True)
            self.record_btn.set_enabled(False)
        elif counting:
            self.play_btn.set_label("Abbrechen")
            self.play_btn.set_enabled(True)
            self.record_btn.set_enabled(False)
        else:
            self.record_btn.set_label("Aufnehmen")
            self.play_btn.set_label("Abspielen")
            self.record_btn.set_enabled(True)
            self.play_btn.set_enabled(bool(self.events))
        busy = recording or playing or counting
        self.save_btn.set_enabled(not busy)
        self.load_btn.set_enabled(not busy)
        if not playing:
            self.canvas.itemconfig(self.count_id, text=self._events_summary())

    def _set_status(self, text, color=STATUS_IDLE):
        self.canvas.itemconfig(self.status_id, text=text)
        self.canvas.itemconfig(self.dot, fill=color)

    def _poll_queue(self):
        try:
            while True:
                self._ui_queue.get_nowait()()
        except queue.Empty:
            pass
        if self.player.playing and self._progress is not None:
            loop, index, total = self._progress
            self.canvas.itemconfig(
                self.count_id,
                text=f"Durchlauf {loop} · Ereignis {index}/{total}")
        self.root.after(50, self._poll_queue)

    def on_close(self):
        if self._hotkeys is not None:
            self._hotkeys.stop()
        self.recorder.stop()
        self.player.stop()
        self._stop_abort_listener()
        self.root.destroy()


def main():
    root = tk.Tk()
    app = MacroApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
