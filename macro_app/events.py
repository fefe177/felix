"""Serialisierung von Tastatur- und Maus-Ereignissen.

Wandelt pynput-Objekte in einfache Dictionaries (JSON-tauglich) um und
wieder zurück, damit Makros gespeichert und geladen werden können.
"""

from pynput import keyboard, mouse


def key_to_dict(key):
    """Wandelt einen pynput-Key in ein serialisierbares Dictionary um."""
    if isinstance(key, keyboard.Key):
        # Spezialtaste (z. B. Key.space, Key.enter)
        return {"kind": "special", "name": key.name}
    if isinstance(key, keyboard.KeyCode):
        if key.char is not None:
            return {"kind": "char", "char": key.char}
        return {"kind": "vk", "vk": key.vk}
    # Fallback
    return {"kind": "special", "name": str(key)}


def dict_to_key(data):
    """Wandelt ein gespeichertes Dictionary zurück in einen pynput-Key."""
    kind = data.get("kind")
    if kind == "special":
        return getattr(keyboard.Key, data["name"])
    if kind == "char":
        return keyboard.KeyCode.from_char(data["char"])
    if kind == "vk":
        return keyboard.KeyCode.from_vk(data["vk"])
    raise ValueError(f"Unbekannter Key-Eintrag: {data!r}")


def button_to_str(button):
    """Maustaste -> String ('left', 'right', 'middle')."""
    return button.name


def str_to_button(name):
    """String -> pynput-Maustaste."""
    return getattr(mouse.Button, name)
