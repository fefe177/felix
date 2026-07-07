"""Moderne, cleane Oberfläche (CustomTkinter) für den Makro Recorder."""

import os
import queue
from tkinter import filedialog, messagebox

import customtkinter as ctk
from pynput import keyboard

from .player import MacroPlayer
from .recorder import MacroRecorder
from .storage import load_macro, save_macro

# ----------------------------------------------------------------- Farben
BG = "#141416"
CARD = "#1d1d21"
FIELD = "#27272e"
TEXT = "#f2f2f5"
MUTED = "#8c8c96"
BORDER = "#33333c"

RED = "#e5484d"
RED_HOVER = "#d13840"
GREEN = "#2fa572"
GREEN_HOVER = "#26895f"
GHOST_HOVER = "#27272e"

STATUS_IDLE = "#4dd08a"
STATUS_BUSY = "#ff6b6b"

ctk.set_appearance_mode("dark")


class MacroApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Makro Recorder")
        self.root.geometry("440x660")
        self.root.minsize(420, 620)
        self.root.configure(fg_color=BG)

        self.recorder = MacroRecorder()
        self.player = MacroPlayer()
        self.events = []
        self.current_name = "Unbenannt"

        self._ui_queue = queue.Queue()
        self._progress = None
        self._abort_listener = None

        self._build_ui()
        self._poll_queue()
        self._update_state()

    # ------------------------------------------------------------------ UI
    def _build_ui(self):
        wrap = ctk.CTkFrame(self.root, fg_color="transparent")
        wrap.pack(fill="both", expand=True, padx=22, pady=22)

        # --- Kopf ---
        ctk.CTkLabel(
            wrap, text="Makro Recorder",
            font=ctk.CTkFont(size=24, weight="bold"), text_color=TEXT,
        ).pack(anchor="w")
        ctk.CTkLabel(
            wrap, text="Maus & Tastatur aufnehmen und abspielen",
            font=ctk.CTkFont(size=13), text_color=MUTED,
        ).pack(anchor="w", pady=(2, 0))

        # --- Status-Karte ---
        status = ctk.CTkFrame(wrap, fg_color=CARD, corner_radius=14)
        status.pack(fill="x", pady=(18, 0))
        inner = ctk.CTkFrame(status, fg_color="transparent")
        inner.pack(fill="x", padx=18, pady=16)

        self.dot = ctk.CTkLabel(inner, text="●", font=ctk.CTkFont(size=16),
                                text_color=STATUS_IDLE, width=16)
        self.dot.pack(side="left")
        text_col = ctk.CTkFrame(inner, fg_color="transparent")
        text_col.pack(side="left", padx=(10, 0), fill="x", expand=True)
        self.status_var = ctk.StringVar(value="Bereit")
        ctk.CTkLabel(text_col, textvariable=self.status_var, anchor="w",
                     font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=TEXT).pack(anchor="w", fill="x")
        self.count_var = ctk.StringVar(value="0 Ereignisse")
        ctk.CTkLabel(text_col, textvariable=self.count_var, anchor="w",
                     font=ctk.CTkFont(size=12),
                     text_color=MUTED).pack(anchor="w", fill="x")

        # --- Haupt-Buttons ---
        buttons = ctk.CTkFrame(wrap, fg_color="transparent")
        buttons.pack(fill="x", pady=(16, 0))
        buttons.columnconfigure(0, weight=1)
        buttons.columnconfigure(1, weight=1)

        self.record_btn = ctk.CTkButton(
            buttons, text="Aufnehmen", command=self.toggle_record,
            height=50, corner_radius=12, fg_color=RED, hover_color=RED_HOVER,
            font=ctk.CTkFont(size=15, weight="bold"), text_color="#ffffff",
        )
        self.record_btn.grid(row=0, column=0, sticky="ew", padx=(0, 6))

        self.play_btn = ctk.CTkButton(
            buttons, text="Abspielen", command=self.toggle_play,
            height=50, corner_radius=12, fg_color=GREEN,
            hover_color=GREEN_HOVER,
            font=ctk.CTkFont(size=15, weight="bold"), text_color="#ffffff",
        )
        self.play_btn.grid(row=0, column=1, sticky="ew", padx=(6, 0))

        # --- Einstellungen ---
        settings = ctk.CTkFrame(wrap, fg_color=CARD, corner_radius=14)
        settings.pack(fill="x", pady=(16, 0))
        pad = ctk.CTkFrame(settings, fg_color="transparent")
        pad.pack(fill="x", padx=18, pady=16)
        pad.columnconfigure(0, weight=1)

        # Wiederholungen
        rep_row = ctk.CTkFrame(pad, fg_color="transparent")
        rep_row.pack(fill="x")
        rep_row.columnconfigure(0, weight=1)
        ctk.CTkLabel(rep_row, text="Wiederholungen",
                     font=ctk.CTkFont(size=14), text_color=TEXT,
                     anchor="w").grid(row=0, column=0, sticky="w")
        self.repeat_entry = ctk.CTkEntry(
            rep_row, width=72, height=34, justify="center",
            corner_radius=8, fg_color=FIELD, border_color=BORDER,
            border_width=1, font=ctk.CTkFont(size=14))
        self.repeat_entry.insert(0, "1")
        self.repeat_entry.grid(row=0, column=1, sticky="e")
        ctk.CTkLabel(pad, text="0 = endlos wiederholen",
                     font=ctk.CTkFont(size=11), text_color=MUTED,
                     anchor="w").pack(anchor="w", pady=(4, 0))

        _sep(pad)

        # Geschwindigkeit
        speed_head = ctk.CTkFrame(pad, fg_color="transparent")
        speed_head.pack(fill="x")
        speed_head.columnconfigure(0, weight=1)
        ctk.CTkLabel(speed_head, text="Geschwindigkeit",
                     font=ctk.CTkFont(size=14), text_color=TEXT,
                     anchor="w").grid(row=0, column=0, sticky="w")
        self.speed_lbl_var = ctk.StringVar(value="1.00×")
        ctk.CTkLabel(speed_head, textvariable=self.speed_lbl_var,
                     font=ctk.CTkFont(size=14, weight="bold"),
                     text_color=TEXT).grid(row=0, column=1, sticky="e")
        self.speed_var = ctk.DoubleVar(value=1.0)
        ctk.CTkSlider(pad, from_=0.25, to=4.0, variable=self.speed_var,
                      command=self._on_speed_change,
                      height=18, progress_color=GREEN).pack(
            fill="x", pady=(10, 0))

        _sep(pad)

        # Mausbewegungen
        move_row = ctk.CTkFrame(pad, fg_color="transparent")
        move_row.pack(fill="x")
        move_row.columnconfigure(0, weight=1)
        ctk.CTkLabel(move_row, text="Mausbewegungen aufnehmen",
                     font=ctk.CTkFont(size=14), text_color=TEXT,
                     anchor="w").grid(row=0, column=0, sticky="w")
        self.moves_switch = ctk.CTkSwitch(
            move_row, text="", width=44, progress_color=GREEN,
            command=None)
        self.moves_switch.select()
        self.moves_switch.grid(row=0, column=1, sticky="e")

        # --- Datei-Buttons ---
        files = ctk.CTkFrame(wrap, fg_color="transparent")
        files.pack(fill="x", pady=(16, 0))
        files.columnconfigure(0, weight=1)
        files.columnconfigure(1, weight=1)
        self.save_btn = ctk.CTkButton(
            files, text="Speichern", command=self.save, height=42,
            corner_radius=10, fg_color="transparent", hover_color=GHOST_HOVER,
            border_width=1, border_color=BORDER, text_color=TEXT,
            font=ctk.CTkFont(size=13))
        self.save_btn.grid(row=0, column=0, sticky="ew", padx=(0, 6))
        self.load_btn = ctk.CTkButton(
            files, text="Laden", command=self.load, height=42,
            corner_radius=10, fg_color="transparent", hover_color=GHOST_HOVER,
            border_width=1, border_color=BORDER, text_color=TEXT,
            font=ctk.CTkFont(size=13))
        self.load_btn.grid(row=0, column=1, sticky="ew", padx=(6, 0))

        # --- Fußzeile ---
        ctk.CTkLabel(
            wrap, text="ESC  beendet Aufnahme und Wiedergabe",
            font=ctk.CTkFont(size=12), text_color=MUTED,
        ).pack(side="bottom", pady=(18, 0))

    def _on_speed_change(self, value):
        self.speed_lbl_var.set(f"{float(value):.2f}×")

    # -------------------------------------------------------------- Aufnahme
    def toggle_record(self):
        if self.recorder.recording:
            self.recorder.stop()
            return
        if self.player.playing:
            return
        self.recorder.record_moves = bool(self.moves_switch.get())
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
            self.events,
            speed=self.speed_var.get(),
            repeat=self._repeat_value(),
            on_progress=self._on_progress,
            on_finish=self._on_play_finish,
        )
        self._set_status("Wiedergabe läuft …  (ESC stoppt)", STATUS_BUSY)
        self._update_state()

    def _repeat_value(self):
        try:
            return max(0, int(self.repeat_entry.get()))
        except (ValueError, TypeError):
            return 1

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
            initialfile="makro.json",
        )
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
            self.record_btn.configure(text="Stopp", state="normal")
            self.play_btn.configure(state="disabled")
        elif playing:
            self.play_btn.configure(text="Stopp", state="normal")
            self.record_btn.configure(state="disabled")
        else:
            self.record_btn.configure(text="Aufnehmen", state="normal")
            self.play_btn.configure(
                text="Abspielen",
                state=("normal" if self.events else "disabled"))
        self._toggle_files(not (recording or playing))
        if not playing:
            self.count_var.set(f"{len(self.events)} Ereignisse")

    def _toggle_files(self, enabled):
        state = "normal" if enabled else "disabled"
        self.save_btn.configure(state=state)
        self.load_btn.configure(state=state)

    def _set_status(self, text, color=STATUS_IDLE):
        self.status_var.set(text)
        self.dot.configure(text_color=color)

    def _poll_queue(self):
        try:
            while True:
                self._ui_queue.get_nowait()()
        except queue.Empty:
            pass
        if self.player.playing and self._progress is not None:
            loop, index, total = self._progress
            self.count_var.set(
                f"Durchlauf {loop} · Ereignis {index}/{total}")
        self.root.after(50, self._poll_queue)

    def on_close(self):
        self.recorder.stop()
        self.player.stop()
        self._stop_abort_listener()
        self.root.destroy()


def _sep(parent):
    """Dünne Trennlinie zwischen Einstellungs-Zeilen."""
    ctk.CTkFrame(parent, height=1, fg_color=BORDER).pack(
        fill="x", pady=14)


def main():
    root = ctk.CTk()
    app = MacroApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
