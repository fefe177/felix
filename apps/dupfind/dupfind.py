#!/usr/bin/env python3
"""dupfind — finde doppelte Dateien anhand ihres Inhalts.

Vergleicht Dateien zuerst nach Größe, dann nach SHA-256-Hash, sodass nur
wirklich inhaltsgleiche Dateien als Duplikate gemeldet werden.

Beispiele:
    dupfind.py ~/Downloads            # Duplikate auflisten
    dupfind.py . --min-size 1024      # nur Dateien ab 1 KB
    dupfind.py . --json               # maschinenlesbare Ausgabe
"""
import argparse
import hashlib
import json
import os
import sys
from collections import defaultdict


def iter_files(root):
    """Liefere (pfad, größe) für jede normale Datei unter root."""
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            path = os.path.join(dirpath, name)
            try:
                if os.path.islink(path):
                    continue
                yield path, os.path.getsize(path)
            except OSError:
                continue


def hash_file(path, chunk_size=65536):
    """SHA-256-Hash einer Datei, in Blöcken gelesen (speicherschonend)."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()


def find_duplicates(root, min_size=1):
    """Finde inhaltsgleiche Dateigruppen.

    Gibt eine Liste von Gruppen zurück; jede Gruppe ist eine Liste von
    Pfaden mit identischem Inhalt (mindestens 2 Einträge). Nach Größe
    der Dateien absteigend sortiert.
    """
    by_size = defaultdict(list)
    for path, size in iter_files(root):
        if size >= min_size:
            by_size[size].append(path)

    groups = []
    for size, paths in by_size.items():
        if len(paths) < 2:
            continue  # eindeutige Größe -> kein Duplikat möglich
        by_hash = defaultdict(list)
        for path in paths:
            try:
                by_hash[hash_file(path)].append(path)
            except OSError:
                continue
        for digest_paths in by_hash.values():
            if len(digest_paths) >= 2:
                groups.append((size, sorted(digest_paths)))

    groups.sort(key=lambda item: item[0], reverse=True)
    return [paths for _size, paths in groups]


def human_size(num_bytes):
    step = 1024.0
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < step:
            if unit == "B":
                return f"{int(num_bytes)} {unit}"
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= step
    return f"{num_bytes:.1f} PB"


def wasted_bytes(groups):
    """Verschwendeter Platz: alles außer je einer Kopie pro Gruppe."""
    total = 0
    for paths in groups:
        if not paths:
            continue
        try:
            size = os.path.getsize(paths[0])
        except OSError:
            continue
        total += size * (len(paths) - 1)
    return total


def build_parser():
    p = argparse.ArgumentParser(description="Finde doppelte Dateien anhand des Inhalts.")
    p.add_argument("path", nargs="?", default=".", help="Startverzeichnis (Standard: .)")
    p.add_argument("--min-size", type=int, default=1, help="nur Dateien ab dieser Größe in Bytes")
    p.add_argument("--json", action="store_true", help="Ausgabe als JSON")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    root = os.path.abspath(os.path.expanduser(args.path))
    if not os.path.isdir(root):
        print(f"Fehler: '{args.path}' ist kein Verzeichnis", file=sys.stderr)
        return 1

    groups = find_duplicates(root, args.min_size)

    if args.json:
        print(json.dumps({"groups": groups}, indent=2, ensure_ascii=False))
        return 0

    if not groups:
        print("Keine Duplikate gefunden.")
        return 0

    for i, paths in enumerate(groups, 1):
        try:
            size = human_size(os.path.getsize(paths[0]))
        except OSError:
            size = "?"
        print(f"Gruppe {i} ({len(paths)}x, je {size}):")
        for path in paths:
            print(f"  {path}")
    print(f"\nVerschwendeter Platz: {human_size(wasted_bytes(groups))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
