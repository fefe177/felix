"""Grafische Oberfläche (tkinter) für den Makro Recorder."""

import os
import queue
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from pynput import keyboard

from .player import MacroPlayer
from .recorder import MacroRecorder
from .storage import load_macro, save_macro

ACCENT_OK = "#2d7d46"
ACCENT_BUSY = "#c0392b"


class MacroApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Makro Recorder")
        self.root.geometry("470x560")
        self.root.minsize(440, 520)

        self.recorder = MacroRecorder()
        self.player = MacroPlayer()
        self.events = []
        self.current_name = "Unbenannt"

        # Ereignisse aus Listener-/Player-Threads werden über diese Queue
        # in den tkinter-Hauptthread übergeben.
        self._ui_queue = queue.Queue()
        self._progress = None
        self._abort_listener = None

        self._build_ui()
        self._poll_queue()
        self._update_state()

    # ------------------------------------------------------------------ UI
    def _build_ui(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        ttk.Label(self.root, text="🎬  Makro Recorder",
                  font=("Helvetica", 17, "bold")).pack(pady=(16, 2))
        ttk.Label(self.root,
                  text="Maus & Tastatur aufnehmen und abspielen").pack()

        self.status_var = tk.StringVar(value="Bereit")
        self.status_lbl = ttk.Label(self.root, textvariable=self.status_var,
                                     font=("Helvetica", 12, "bold"),
                                     foreground=ACCENT_OK)
        self.status_lbl.pack(pady=(16, 2))

        self.count_var = tk.StringVar(value="0 Ereignisse")
        ttk.Label(self.root, textvariable=self.count_var).pack()

        # Steuerung
        controls = ttk.Frame(self.root)
        controls.pack(pady=16)
        self.record_btn = ttk.Button(controls, text="●  Aufnehmen",
                                      width=16, command=self.toggle_record)
        self.record_btn.grid(row=0, column=0, padx=6)
        self.play_btn = ttk.Button(controls, text="▶  Abspielen",
                                   width=16, command=self.toggle_play)
        self.play_btn.grid(row=0, column=1, padx=6)

        # Optionen
        options = ttk.LabelFrame(self.root, text="Optionen")
        options.pack(fill="x", padx=18, pady=8)
        options.columnconfigure(1, weight=1)

        ttk.Label(options, text="Wiederholungen (0 = endlos):").grid(
            row=0, column=0, sticky="w", padx=8, pady=8)
        self.repeat_var = tk.IntVar(value=1)
        ttk.Spinbox(options, from_=0, to=99999, width=8,
                    textvariable=self.repeat_var).grid(
            row=0, column=1, sticky="e", padx=8)

        ttk.Label(options, text="Geschwindigkeit:").grid(
            row=1, column=0, sticky="w", padx=8, pady=8)
        self.speed_var = tk.DoubleVar(value=1.0)
        speed_row = ttk.Frame(options)
        speed_row.grid(row=1, column=1, sticky="ew", padx=8)
        speed_row.columnconfigure(0, weight=1)
        self.speed_lbl_var = tk.StringVar(value="1.00×")
        scale = ttk.Scale(speed_row, from_=0.25, to=4.0,
                          variable=self.speed_var, orient="horizontal",
                          command=self._on_speed_change)
        scale.grid(row=0, column=0, sticky="ew")
        ttk.Label(speed_row, textvariable=self.speed_lbl_var,
                  width=6).grid(row=0, column=1, padx=(6, 0))

        self.moves_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(options, text="Mausbewegungen aufnehmen",
                        variable=self.moves_var).grid(
            row=2, column=0, columnspan=2, sticky="w", padx=8, pady=(4, 8))

        # Dateien
        files = ttk.Frame(self.root)
        files.pack(pady=12)
        ttk.Button(files, text="💾  Speichern", width=16,
                   command=self.save).grid(row=0, column=0, padx=6)
        ttk.Button(files, text="📂  Laden", width=16,
                   command=self.load).grid(row=0, column=1, padx=6)

        ttk.Label(self.root,
                  text="Tipp: ESC beendet Aufnahme und Wiedergabe.",
                  foreground="#888").pack(side="bottom", pady=12)

    def _on_speed_change(self, value):
        self.speed_lbl_var.set(f"{float(value):.2f}×")

    # -------------------------------------------------------------- Aufnahme
    def toggle_record(self):
        if self.recorder.recording:
            self.recorder.stop()
            return
        if self.player.playing:
            return
        self.recorder.record_moves = self.moves_var.get()
        self.events = []
        self.recorder.start(on_stop=self._on_record_stop)
        self._set_status("Aufnahme läuft…  (ESC zum Beenden)", ACCENT_BUSY)
        self._update_state()

    def _on_record_stop(self):
        # Läuft im Listener-Thread -> in den UI-Thread verschieben.
        self._ui_queue.put(self._after_record_stop)

    def _after_record_stop(self):
        self.events = list(self.recorder.events)
        self._set_status("Aufnahme beendet.", ACCENT_OK)
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
            self.events,
            speed=self.speed_var.get(),
            repeat=self.repeat_var.get(),
            on_progress=self._on_progress,
            on_finish=self._on_play_finish,
        )
        self._set_status("Wiedergabe läuft…  (ESC zum Stoppen)", ACCENT_BUSY)
        self._update_state()

    def _on_progress(self, loop, index, total):
        self._progress = (loop, index, total)

    def _on_play_finish(self):
        self._ui_queue.put(self._after_play_finish)

    def _after_play_finish(self):
        self._stop_abort_listener()
        self._progress = None
        self._set_status("Wiedergabe beendet.", ACCENT_OK)
        self._update_state()

    def _start_abort_listener(self):
        """Globaler ESC-Listener als Not-Aus während der Wiedergabe."""
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
            initialfile="makro.json",
        )
        if not path:
            return
        name = os.path.splitext(os.path.basename(path))[0]
        save_macro(path, self.events, name=name)
        self.current_name = name
        self._set_status(f"Gespeichert: {name}", ACCENT_OK)

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
            f"Geladen: {self.current_name}  ({len(self.events)} Ereignisse)",
            ACCENT_OK)

    # -------------------------------------------------------------- Zustand
    def _update_state(self):
        recording = self.recorder.recording
        playing = self.player.playing
        if recording:
            self.record_btn.config(text="■  Stopp", state="normal")
            self.play_btn.config(state="disabled")
        elif playing:
            self.play_btn.config(text="■  Stopp", state="normal")
            self.record_btn.config(state="disabled")
        else:
            self.record_btn.config(text="●  Aufnehmen", state="normal")
            self.play_btn.config(
                text="▶  Abspielen",
                state=("normal" if self.events else "disabled"))
        if not playing:
            self.count_var.set(f"{len(self.events)} Ereignisse")

    def _set_status(self, text, color=ACCENT_OK):
        self.status_var.set(text)
        self.status_lbl.config(foreground=color)

    def _poll_queue(self):
        try:
            while True:
                self._ui_queue.get_nowait()()
        except queue.Empty:
            pass
        if self.player.playing and self._progress is not None:
            loop, index, total = self._progress
            self.count_var.set(
                f"Wiedergabe – Durchlauf {loop}, Ereignis {index}/{total}")
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
