"""Screen capture helpers backed by ``mss`` and Pillow.

Capturing requires a real display (the Windows 11 desktop session); on a
headless host ``mss`` raises when grabbing the screen. These functions return
Pillow images so the OCR, VLM and element modules can operate on them uniformly.
"""

from __future__ import annotations

import base64
import io
import tempfile
from pathlib import Path

import mss
from PIL import Image


def capture_screen() -> Image.Image:
    """Capture the primary monitor and return it as an RGB :class:`PIL.Image`."""

    with mss.mss() as sct:
        # monitors[0] is the virtual "all monitors" area; [1] is the primary.
        shot = sct.grab(sct.monitors[1])
    return Image.frombytes("RGB", shot.size, shot.rgb)


def capture_region(x: int, y: int, w: int, h: int) -> Image.Image:
    """Capture a rectangular region and return it as an RGB :class:`PIL.Image`."""

    region = {"left": x, "top": y, "width": w, "height": h}
    with mss.mss() as sct:
        shot = sct.grab(region)
    return Image.frombytes("RGB", shot.size, shot.rgb)


def save_temp(img: Image.Image) -> Path:
    """Save ``img`` as a PNG in a temporary file and return its path."""

    with tempfile.NamedTemporaryFile(
        prefix="localpilot_screenshot_", suffix=".png", delete=False
    ) as handle:
        path = Path(handle.name)
    img.save(path, format="PNG")
    return path


def to_base64_png(img: Image.Image) -> str:
    """Encode ``img`` as a base64 PNG string (no data-URL prefix)."""

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")
