#!/usr/bin/env python3
"""dirstat — finde die größten Dateien und Ordner in einem Verzeichnis.

Beispiele:
    dirstat.py                 # aktuelles Verzeichnis, Top 10
    dirstat.py ~/Downloads -n 20
    dirstat.py / --dirs        # größte Ordner statt Dateien
"""
import argparse
import os
import sys


def human_size(num_bytes):
    """Formatiere Bytes als menschenlesbare Größe (z.B. 1.5 MB)."""
    step = 1024.0
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if abs(num_bytes) < step:
            if unit == "B":
                return f"{int(num_bytes)} {unit}"
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= step
    return f"{num_bytes:.1f} EB"


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


def largest_files(root, n):
    """Die n größten Dateien als Liste von (pfad, größe), absteigend."""
    files = list(iter_files(root))
    files.sort(key=lambda item: item[1], reverse=True)
    return files[:n]


def dir_sizes(root):
    """Gesamtgröße je direktem Unterordner von root."""
    sizes = {}
    for entry in os.scandir(root):
        if entry.is_dir(follow_symlinks=False):
            total = sum(size for _p, size in iter_files(entry.path))
            sizes[entry.path] = total
    return sizes


def largest_dirs(root, n):
    """Die n größten direkten Unterordner, absteigend."""
    items = sorted(dir_sizes(root).items(), key=lambda kv: kv[1], reverse=True)
    return items[:n]


def build_parser():
    parser = argparse.ArgumentParser(
        description="Finde die größten Dateien oder Ordner in einem Verzeichnis."
    )
    parser.add_argument("path", nargs="?", default=".", help="Startverzeichnis (Standard: .)")
    parser.add_argument("-n", "--number", type=int, default=10, help="Anzahl Einträge (Standard: 10)")
    parser.add_argument("--dirs", action="store_true", help="größte Unterordner statt Dateien zeigen")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    root = os.path.abspath(os.path.expanduser(args.path))
    if not os.path.isdir(root):
        print(f"Fehler: '{args.path}' ist kein Verzeichnis", file=sys.stderr)
        return 1

    if args.dirs:
        results = largest_dirs(root, args.number)
        label = "Ordner"
    else:
        results = largest_files(root, args.number)
        label = "Dateien"

    if not results:
        print(f"Keine {label} gefunden in {root}")
        return 0

    width = max(len(human_size(size)) for _p, size in results)
    print(f"Größte {label} in {root}:")
    for path, size in results:
        print(f"  {human_size(size):>{width}}  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
