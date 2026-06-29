#!/usr/bin/env python3
"""jsonpeek — JSON hübsch anzeigen und per Punkt-Pfad abfragen.

Beispiele:
    jsonpeek.py data.json                  # komplett, eingerückt
    jsonpeek.py data.json users.0.name     # Wert an diesem Pfad
    jsonpeek.py data.json --keys           # Top-Level-Schlüssel
    cat data.json | jsonpeek.py -          # von stdin lesen
"""
import argparse
import json
import sys


class PathError(Exception):
    """Pfad konnte im JSON nicht aufgelöst werden."""


def parse_path(path):
    """Zerlege 'users.0.name' in ['users', 0, 'name'].

    Numerische Segmente werden zu int (Listenindex), der Rest bleibt str.
    """
    if path == "":
        return []
    segments = []
    for part in path.split("."):
        if part.lstrip("-").isdigit():
            segments.append(int(part))
        else:
            segments.append(part)
    return segments


def resolve_path(data, segments):
    """Folge segments durch verschachtelte dicts/lists."""
    current = data
    for seg in segments:
        if isinstance(seg, int):
            if not isinstance(current, list):
                raise PathError(f"Index [{seg}] auf Nicht-Liste angewendet")
            try:
                current = current[seg]
            except IndexError:
                raise PathError(f"Index {seg} außerhalb des Bereichs")
        else:
            if not isinstance(current, dict):
                raise PathError(f"Schlüssel '{seg}' auf Nicht-Objekt angewendet")
            if seg not in current:
                raise PathError(f"Schlüssel '{seg}' nicht gefunden")
            current = current[seg]
    return current


def format_value(value, indent=2):
    """Gib value als String zurück: Strings roh, alles andere als JSON."""
    if isinstance(value, str):
        return value
    return json.dumps(value, indent=indent, ensure_ascii=False, sort_keys=False)


def load_json(source):
    """Lade JSON aus Datei oder von stdin ('-')."""
    if source == "-":
        text = sys.stdin.read()
    else:
        with open(source, "r", encoding="utf-8") as f:
            text = f.read()
    return json.loads(text)


def build_parser():
    p = argparse.ArgumentParser(description="JSON anzeigen und abfragen.")
    p.add_argument("file", help="JSON-Datei oder '-' für stdin")
    p.add_argument("path", nargs="?", default="", help="Punkt-Pfad, z.B. users.0.name")
    p.add_argument("--keys", action="store_true", help="nur die Schlüssel auf dieser Ebene auflisten")
    p.add_argument("--indent", type=int, default=2, help="Einrückung (Standard: 2)")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)

    try:
        data = load_json(args.file)
    except FileNotFoundError:
        print(f"Fehler: Datei '{args.file}' nicht gefunden", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"Fehler: ungültiges JSON ({exc})", file=sys.stderr)
        return 1

    try:
        value = resolve_path(data, parse_path(args.path))
    except PathError as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 1

    if args.keys:
        if isinstance(value, dict):
            for key in value:
                print(key)
        elif isinstance(value, list):
            for i in range(len(value)):
                print(i)
        else:
            print(f"Fehler: Wert hat keine Schlüssel (Typ {type(value).__name__})", file=sys.stderr)
            return 1
        return 0

    print(format_value(value, args.indent))
    return 0


if __name__ == "__main__":
    sys.exit(main())
