"""Glas-Oberfläche (Frosted Glass / Apple-Look) für den Makro Recorder.

Die Optik wird als Bild komponiert (siehe :mod:`macro_app.glass`) und auf
einem Canvas gezeichnet, sodass Text und Bedienelemente wirklich durch das
Glas scheinen. Aufnahme-/Wiedergabe-Logik liegt unverändert in
:mod:`recorder` und :mod:`player`.
"""

import os
import platform
import queue
import tkinter as tk
from tkinter import filedialog, messagebox

from PIL import ImageTk
from pynput import keyboard

from . import glass
from .player import MacroPlayer
from .recorder import MacroRecorder
from .storage import load_macro, save_macro

W, H = 460, 660
FONT = "Segoe UI" if platform.system() == "Windows" else "DejaVu Sans"

TEXT = "#f4f4f8"
MUTED = "#a6a6b4"
DISABLED = "#7d7d8a"

RED = (232, 70, 78)
GREEN = (46, 178, 120)
GREEN_HEX = "#2eb278"
STATUS_IDLE = "#54e39a"
STATUS_BUSY = "#ff7a7a"

# Layout (feste Fenstergröße für exakte Glas-Kompositionen)
STATUS_BOX = (24, 96, 436, 176)
REC_BOX = (24, 196, 224, 252)
PLAY_BOX = (236, 196, 436, 252)
SET_BOX = (24, 272, 436, 500)
SAVE_BOX = (24, 520, 224, 566)
LOAD_BOX = (236, 520, 436, 566)

MINUS_BOX = (300, 289, 330, 319)
PLUS_BOX = (382, 289, 412, 319)
SLIDER_Y = 412
SLIDER_X1, SLIDER_X2 = 48, 412


def _center(box):
    return (box[0] + box[2]) // 2, (box[1] + box[3]) // 2


class GButton:
    """Ein anklickbarer Glas-Button (Bild + Beschriftung) auf dem Canvas."""

    def __init__(self, canvas, box, images, label, command,
                 font, text_color=TEXT):
        self.canvas = canvas
        self.images = images
        self.command = command
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
        key = "normal" if enabled else self.images.get("dim") and "dim"
        self.canvas.itemconfig(self.img, image=self.images[key or "normal"])
        self.canvas.itemconfig(self.text,
                               fill=TEXT if enabled else DISABLED)


class MacroApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Makro Recorder")
        self.root.geometry(f"{W}x{H}")
        self.root.resizable(False, False)

        self.recorder = MacroRecorder()
        self.player = MacroPlayer()
        self.events = []
        self.current_name = "Unbenannt"
        self.repeat = 1
        self.speed = 1.0
        self.record_moves = True

        self._ui_queue = queue.Queue()
        self._progress = None
        self._abort_listener = None
        self._imgs = []  # Referenzen halten (sonst Garbage Collection)

        self._build_ui()
        self._poll_queue()
        self._update_state()

    # ------------------------------------------------------------------ UI
    def _tk(self, pil_image):
        img = ImageTk.PhotoImage(pil_image)
        self._imgs.append(img)
        return img

    def _build_ui(self):
        canvas = tk.Canvas(self.root, width=W, height=H,
                           highlightthickness=0, bd=0)
        canvas.pack(fill="both", expand=True)
        self.canvas = canvas

        # Hintergrund + Glas-Karten komponieren
        wall = glass.make_wallpaper(W, H)
        status_card = glass.glass_tile(wall, STATUS_BOX, radius=18,
                                       tint_alpha=26, gloss=60, blur=16)
        settings_card = glass.glass_tile(wall, SET_BOX, radius=22,
                                         tint_alpha=26, gloss=55, blur=16)
        final = wall.convert("RGBA")
        final.alpha_composite(status_card, (STATUS_BOX[0], STATUS_BOX[1]))
        final.alpha_composite(settings_card, (SET_BOX[0], SET_BOX[1]))

        self.bg_img = self._tk(final.convert("RGB"))
        canvas.create_image(0, 0, image=self.bg_img, anchor="nw")

        # Kopfzeile
        canvas.create_text(24, 40, text="Makro Recorder", anchor="w",
                           fill=TEXT, font=(FONT, 26, "bold"))
        canvas.create_text(24, 70, text="Maus & Tastatur aufnehmen "
                           "und abspielen", anchor="w", fill=MUTED,
                           font=(FONT, 13))

        # Status-Karte
        self.dot = canvas.create_oval(46, 130, 58, 142, fill=STATUS_IDLE,
                                      outline="")
        self.status_id = canvas.create_text(
            72, 128, text="Bereit", anchor="w", fill=TEXT,
            font=(FONT, 15, "bold"))
        self.count_id = canvas.create_text(
            72, 150, text="0 Ereignisse", anchor="w", fill=MUTED,
            font=(FONT, 12))

        # Haupt-Buttons
        self.record_btn = GButton(
            canvas, REC_BOX,
            self._button_imgs(final, REC_BOX, RED, 16, 150),
            "Aufnehmen", self.toggle_record, (FONT, 15, "bold"))
        self.play_btn = GButton(
            canvas, PLAY_BOX,
            self._button_imgs(final, PLAY_BOX, GREEN, 16, 150),
            "Abspielen", self.toggle_play, (FONT, 15, "bold"))

        # Einstellungen – Beschriftungen
        canvas.create_text(48, 304, text="Wiederholungen", anchor="w",
                           fill=TEXT, font=(FONT, 14))
        canvas.create_text(48, 332, text="0 = endlos", anchor="w",
                           fill=MUTED, font=(FONT, 11))
        self._separator(356)
        canvas.create_text(48, 380, text="Geschwindigkeit", anchor="w",
                           fill=TEXT, font=(FONT, 14))
        self.speed_id = canvas.create_text(412, 380, text="1.00×", anchor="e",
                                           fill=TEXT, font=(FONT, 14, "bold"))
        self._separator(444)
        canvas.create_text(48, 470, text="Mausbewegungen aufnehmen",
                           anchor="w", fill=TEXT, font=(FONT, 14))

        # Stepper (Wiederholungen)
        step_imgs = self._button_imgs(final, MINUS_BOX, (255, 255, 255),
                                      9, 34, gloss=40, hover_add=26)
        plus_imgs = self._button_imgs(final, PLUS_BOX, (255, 255, 255),
                                      9, 34, gloss=40, hover_add=26)
        GButton(canvas, MINUS_BOX, step_imgs, "−",
                self._dec_repeat, (FONT, 18, "bold"))
        GButton(canvas, PLUS_BOX, plus_imgs, "+",
                self._inc_repeat, (FONT, 18, "bold"))
        self.repeat_id = canvas.create_text(356, 304, text="1", fill=TEXT,
                                            font=(FONT, 15, "bold"))

        # Geschwindigkeits-Slider
        self._build_slider()

        # Umschalter Mausbewegungen
        self.switch_on = self._tk(glass.switch_img(True))
        self.switch_off = self._tk(glass.switch_img(False))
        self.switch_id = canvas.create_image(412, 470, image=self.switch_on,
                                             anchor="e")
        canvas.tag_bind(self.switch_id, "<Button-1>", self._toggle_moves)
        canvas.tag_bind(self.switch_id, "<Enter>",
                        lambda e: canvas.config(cursor="hand2"))
        canvas.tag_bind(self.switch_id, "<Leave>",
                        lambda e: canvas.config(cursor=""))

        # Datei-Buttons
        self.save_btn = GButton(
            canvas, SAVE_BOX,
            self._button_imgs(final, SAVE_BOX, (255, 255, 255), 14, 24,
                              gloss=40, hover_add=22),
            "Speichern", self.save, (FONT, 13))
        self.load_btn = GButton(
            canvas, LOAD_BOX,
            self._button_imgs(final, LOAD_BOX, (255, 255, 255), 14, 24,
                              gloss=40, hover_add=22),
            "Laden", self.load, (FONT, 13))

        # Fußzeile
        canvas.create_text(W // 2, 616,
                           text="ESC  beendet Aufnahme und Wiedergabe",
                           fill=MUTED, font=(FONT, 12))

    def _button_imgs(self, source, box, tint, radius, alpha,
                     gloss=90, hover_add=40):
        normal = glass.glass_tile(source, box, radius=radius, tint=tint,
                                  tint_alpha=alpha, gloss=gloss, blur=12)
        hover = glass.glass_tile(source, box, radius=radius, tint=tint,
                                 tint_alpha=min(alpha + hover_add, 255),
                                 gloss=min(gloss + 20, 130), blur=12)
        dim = glass.glass_tile(source, box, radius=radius, tint=(20, 20, 26),
                               tint_alpha=150, gloss=20, border=40, blur=12)
        return {"normal": self._tk(normal), "hover": self._tk(hover),
                "dim": self._tk(dim)}

    def _separator(self, y):
        self.canvas.create_line(48, y, 412, y, fill="#5a5a68", width=1)

    def _build_slider(self):
        c = self.canvas
        c.create_line(SLIDER_X1, SLIDER_Y, SLIDER_X2, SLIDER_Y,
                      fill="#4a4a58", width=6, capstyle="round")
        kx = self._speed_to_x(self.speed)
        self.prog = c.create_line(SLIDER_X1, SLIDER_Y, kx, SLIDER_Y,
                                  fill=GREEN_HEX, width=6, capstyle="round")
        self.knob = c.create_oval(kx - 11, SLIDER_Y - 11, kx + 11,
                                  SLIDER_Y + 11, fill="#ffffff",
                                  outline=GREEN_HEX, width=2)
        for target in (self.knob,):
            c.tag_bind(target, "<Enter>",
                       lambda e: c.config(cursor="hand2"))
            c.tag_bind(target, "<Leave>", lambda e: c.config(cursor=""))
        c.tag_bind(self.knob, "<B1-Motion>", self._slider_drag)
        c.tag_bind(self.knob, "<Button-1>", self._slider_drag)

    def _speed_to_x(self, speed):
        t = (speed - 0.25) / (4.0 - 0.25)
        return int(SLIDER_X1 + t * (SLIDER_X2 - SLIDER_X1))

    def _slider_drag(self, event):
        x = max(SLIDER_X1, min(SLIDER_X2, event.x))
        t = (x - SLIDER_X1) / (SLIDER_X2 - SLIDER_X1)
        self.speed = round(0.25 + t * (4.0 - 0.25), 2)
        self.canvas.coords(self.knob, x - 11, SLIDER_Y - 11, x + 11,
                           SLIDER_Y + 11)
        self.canvas.coords(self.prog, SLIDER_X1, SLIDER_Y, x, SLIDER_Y)
        self.canvas.itemconfig(self.speed_id, text=f"{self.speed:.2f}×")

    # ---------------------------------------------------------- Stepper etc.
    def _inc_repeat(self):
        self.repeat += 1
        self._refresh_repeat()

    def _dec_repeat(self):
        self.repeat = max(0, self.repeat - 1)
        self._refresh_repeat()

    def _refresh_repeat(self):
        text = "∞" if self.repeat == 0 else str(self.repeat)
        self.canvas.itemconfig(self.repeat_id, text=text)

    def _toggle_moves(self, _event):
        self.record_moves = not self.record_moves
        self.canvas.itemconfig(
            self.switch_id,
            image=self.switch_on if self.record_moves else self.switch_off)

    # -------------------------------------------------------------- Aufnahme
    def toggle_record(self):
        if self.recorder.recording:
            self.recorder.stop()
            return
        if self.player.playing:
            return
        self.recorder.record_moves = self.record_moves
        self.events = []
        self.recorder.start(on_stop=self._on_record_stop)
        self._set_status("Aufnahme läuft …  (ESC beendet)", STATUS_BUSY)
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
        if self.recorder.recording:
            return
        if not self.events:
            messagebox.showinfo(
                "Kein Makro",
                "Es wurde noch nichts aufgenommen oder geladen.")
            return
        self._start_abort_listener()
        self.player.play(
            self.events, speed=self.speed, repeat=self.repeat,
            on_progress=self._on_progress, on_finish=self._on_play_finish)
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
        self._set_status(
            f"Geladen: {self.current_name}  ·  {len(self.events)} Ereignisse",
            STATUS_IDLE)

    # -------------------------------------------------------------- Zustand
    def _update_state(self):
        recording = self.recorder.recording
        playing = self.player.playing
        if recording:
            self.record_btn.set_label("Stopp")
            self.record_btn.set_enabled(True)
            self.play_btn.set_enabled(False)
        elif playing:
            self.play_btn.set_label("Stopp")
            self.play_btn.set_enabled(True)
            self.record_btn.set_enabled(False)
        else:
            self.record_btn.set_label("Aufnehmen")
            self.play_btn.set_label("Abspielen")
            self.record_btn.set_enabled(True)
            self.play_btn.set_enabled(bool(self.events))
        busy = recording or playing
        self.save_btn.set_enabled(not busy)
        self.load_btn.set_enabled(not busy)
        if not playing:
            self.canvas.itemconfig(self.count_id,
                                   text=f"{len(self.events)} Ereignisse")

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
