"""Speichern und Laden von Makros als JSON-Datei."""

import json
import os
from datetime import datetime


def save_macro(path, events, name=None):
    """Speichert die Ereignisliste als JSON-Datei."""
    data = {
        "name": name or os.path.splitext(os.path.basename(path))[0],
        "created": datetime.now().isoformat(timespec="seconds"),
        "event_count": len(events),
        "events": events,
    }
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)
    return data


def load_macro(path):
    """Lädt ein Makro aus einer JSON-Datei.

    Unterstützt sowohl das volle Format (Dictionary mit ``events``) als auch
    eine einfache Liste von Ereignissen.
    """
    with open(path, encoding="utf-8") as file:
        data = json.load(file)
    if isinstance(data, list):
        return {"name": os.path.basename(path), "events": data}
    if "events" not in data:
        raise ValueError("Datei enthält kein gültiges Makro (keine 'events').")
    return data
