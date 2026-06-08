"""Screen vision package: capture, OCR, VLM description and element finding."""

from __future__ import annotations

from localpilot.vision.capture import (
    capture_region,
    capture_screen,
    save_temp,
    to_base64_png,
)
from localpilot.vision.elements import (
    ElementMatch,
    TextElement,
    find_element_by_text,
    find_text_elements,
)
from localpilot.vision.ocr import OCRBox, full_text, ocr_available, ocr_image
from localpilot.vision.vlm import DEFAULT_VISION_PROMPT, describe_image

__all__ = [
    "DEFAULT_VISION_PROMPT",
    "ElementMatch",
    "OCRBox",
    "TextElement",
    "capture_region",
    "capture_screen",
    "describe_image",
    "find_element_by_text",
    "find_text_elements",
    "full_text",
    "ocr_available",
    "ocr_image",
    "save_temp",
    "to_base64_png",
]
