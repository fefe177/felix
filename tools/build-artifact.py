#!/usr/bin/env python3
"""Baut aus index.html + style.css + src/*.js eine einzelne HTML-Datei.

Ziel ist eine Fassung ohne <html>/<head>/<body>, wie sie der Artifact-Host
erwartet: Titel, Styles und Skripte stehen direkt im Dokumentrumpf,
three.js kommt vom CDN.  Aufruf:  python3 tools/build-artifact.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
SCRIPTS = ["src/courses.js", "src/track.js", "src/world.js", "src/kart.js",
           "src/brain.js", "src/brainweights.js", "src/hud.js", "src/game.js"]


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    body = re.search(r"<!-- app:start -->(.*)<!-- app:end -->", html, re.S)
    if not body:
        raise SystemExit("Marker <!-- app:start --> / <!-- app:end --> fehlen in index.html")

    title = re.search(r"<title>(.*?)</title>", html, re.S).group(1)
    fonts = "\n".join(re.findall(r'<link rel="(?:preconnect|stylesheet)"[^>]*fonts\.[^>]*>', html))
    css = (ROOT / "style.css").read_text(encoding="utf-8")

    parts = [
        f"<title>{title}</title>",
        fonts,
        f"<style>\n{css}\n</style>",
        body.group(1).strip(),
        f'<script src="{CDN}"></script>',
    ]
    for name in SCRIPTS:
        parts.append("<script>\n" + (ROOT / name).read_text(encoding="utf-8") + "</script>")
    parts.append(
        "<script>\n"
        "  if (!window.THREE) document.getElementById('loadError').classList.add('is-on');\n"
        "</script>"
    )

    out = ROOT / "dist" / "schleifental-gp.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(parts) + "\n", encoding="utf-8")
    print(f"{out.relative_to(ROOT)}  ({out.stat().st_size / 1024:.0f} kB)")


if __name__ == "__main__":
    main()
