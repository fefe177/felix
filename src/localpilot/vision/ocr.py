"""OCR wrapper around ``rapidocr-onnxruntime``.

The ONNX OCR engine is expensive to construct, so it is initialised lazily and
cached for the process. :func:`ocr_image` returns structured :class:`OCRBox`
results (text, confidence, bounding box and centre); :func:`full_text` joins the
recognised lines into a single string.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image

_engine: Any | None = None


@dataclass(frozen=True)
class OCRBox:
    """A single OCR result.

    Attributes:
        text: The recognised text.
        confidence: The engine's confidence in ``[0, 1]``.
        box: Axis-aligned bounding box as ``(x1, y1, x2, y2)``.
        center: The box centre as ``(cx, cy)``, handy for clicking.
    """

    text: str
    confidence: float
    box: tuple[int, int, int, int]
    center: tuple[int, int]


def _engine_instance() -> Any:
    """Return the cached RapidOCR engine, constructing it on first use."""

    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR

        _engine = RapidOCR()
    return _engine


def ocr_available() -> bool:
    """Return ``True`` if the OCR engine can be initialised on this machine."""

    try:
        _engine_instance()
    except Exception:
        return False
    return True


def ocr_image(img: Image.Image) -> list[OCRBox]:
    """Run OCR on ``img`` and return the recognised boxes.

    Args:
        img: The image to analyse.

    Returns:
        A list of :class:`OCRBox`; empty if nothing was recognised.
    """

    engine = _engine_instance()
    array = np.asarray(img.convert("RGB"))
    result, _ = engine(array)
    boxes: list[OCRBox] = []
    if not result:
        return boxes
    for entry in result:
        points = entry[0]
        text = str(entry[1])
        confidence = float(entry[2])
        xs = [float(point[0]) for point in points]
        ys = [float(point[1]) for point in points]
        x1, y1, x2, y2 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
        center = ((x1 + x2) // 2, (y1 + y2) // 2)
        boxes.append(OCRBox(text=text, confidence=confidence, box=(x1, y1, x2, y2), center=center))
    return boxes


def full_text(img: Image.Image) -> str:
    """Return all recognised text in ``img`` joined by newlines."""

    return "\n".join(box.text for box in ocr_image(img))
