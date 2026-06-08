"""Pragmatic, OCR-based element detection.

This module is deliberately **heuristic and text-based**. It uses OCR to locate
on-screen text and treats each recognised line as a potential click target. It
does **not** perform pixel-accurate UI/button segmentation and has no special
UI model: an icon-only button without a text label cannot be found, and matching
is by text similarity only. It is meant as a lightweight bridge from "click on
the button labelled X" to :func:`desktop_click` coordinates.
"""

from __future__ import annotations

from dataclasses import dataclass

from PIL import Image

from localpilot.vision.ocr import ocr_image


@dataclass(frozen=True)
class TextElement:
    """A recognised on-screen text element and its click target."""

    text: str
    center: tuple[int, int]
    box: tuple[int, int, int, int]
    confidence: float


@dataclass(frozen=True)
class ElementMatch:
    """The best text match for a query, with a similarity ``score`` in ``[0, 1]``."""

    text: str
    center: tuple[int, int]
    box: tuple[int, int, int, int]
    score: float


def find_text_elements(img: Image.Image) -> list[TextElement]:
    """Return every recognised text line as a clickable :class:`TextElement`."""

    return [
        TextElement(text=box.text, center=box.center, box=box.box, confidence=box.confidence)
        for box in ocr_image(img)
    ]


def find_element_by_text(img: Image.Image, query: str) -> ElementMatch | None:
    """Find the on-screen text element best matching ``query``.

    Matching is case-insensitive and substring/token based (see
    :func:`_match_score`). Returns the best match, or ``None`` if nothing scores
    above zero.
    """

    needle = query.lower().strip()
    best: TextElement | None = None
    best_score = 0.0
    for element in find_text_elements(img):
        score = _match_score(needle, element.text.lower().strip())
        if score > best_score:
            best_score = score
            best = element
    if best is None or best_score <= 0.0:
        return None
    return ElementMatch(text=best.text, center=best.center, box=best.box, score=best_score)


def _match_score(query: str, text: str) -> float:
    """Score the similarity between ``query`` and ``text`` in ``[0, 1]``.

    The heuristic rewards exact and substring matches, then falls back to a
    token-overlap (Jaccard) ratio for partial matches.
    """

    if not query or not text:
        return 0.0
    if query == text:
        return 1.0
    if query in text:
        return 0.9
    if text in query:
        return 0.7
    query_tokens = set(query.split())
    text_tokens = set(text.split())
    if not query_tokens or not text_tokens:
        return 0.0
    overlap = query_tokens & text_tokens
    if not overlap:
        return 0.0
    jaccard = len(overlap) / len(query_tokens | text_tokens)
    return round(0.6 * jaccard, 4)
