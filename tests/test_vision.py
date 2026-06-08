"""Vision system tests: OCR, element finding and tool wiring.

Real OCR runs against a self-generated image (white background, black "Login"
text) - never against a real screen, which would need a display. OCR-dependent
tests are skipped with a clear message when the ONNX engine or a TrueType font is
unavailable. The VLM path is tested with a fake LLM client (no real model), and
screen capture is monkeypatched so nothing touches an actual display.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import structlog
from PIL import Image, ImageDraw, ImageFont

from localpilot.config.schema import AppConfig
from localpilot.llm.base import LLMResponse
from localpilot.llm.messages import Message
from localpilot.logging.setup import EventBus
from localpilot.tools import ToolContext, ToolManager, get_builtin_tools
from localpilot.vision.ocr import ocr_available


def _load_font(size: int = 48) -> ImageFont.FreeTypeFont | None:
    """Return a bold TrueType font if one is available, else ``None``."""

    for name in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return None


_FONT = _load_font()

requires_ocr = pytest.mark.skipif(
    _FONT is None or not ocr_available(),
    reason="OCR engine or a TrueType font is unavailable on this machine.",
)


def _login_image() -> Image.Image:
    """A 400x200 white image with black 'Login' text near (60, 70)."""

    img = Image.new("RGB", (400, 200), "white")
    draw = ImageDraw.Draw(img)
    draw.text((60, 70), "Login", fill="black", font=_FONT)
    return img


def _ctx(tmp_path: Path, **extra: Any) -> ToolContext:
    return ToolContext(
        config=AppConfig(),
        logger=structlog.get_logger("test"),
        event_bus=EventBus(),
        workdir=tmp_path,
        **extra,
    )


@requires_ocr
def test_ocr_finds_login_text() -> None:
    from localpilot.vision.ocr import full_text, ocr_image

    img = _login_image()
    boxes = ocr_image(img)
    assert any("login" in box.text.lower() for box in boxes)
    assert "login" in full_text(img).lower()


@requires_ocr
def test_find_element_by_text_returns_plausible_center() -> None:
    from localpilot.vision.elements import find_element_by_text

    img = _login_image()
    match = find_element_by_text(img, "login")
    assert match is not None
    cx, cy = match.center
    # The centre must lie inside the image and near the rendered text region.
    assert 0 < cx < 400 and 0 < cy < 200
    assert 40 <= cx <= 300 and 40 <= cy <= 160
    assert match.score > 0.0


def test_find_element_by_text_no_match_returns_none() -> None:
    """A blank image yields no recognised elements, hence no match."""

    if not ocr_available():
        pytest.skip("OCR engine is unavailable on this machine.")
    from localpilot.vision.elements import find_element_by_text

    blank = Image.new("RGB", (200, 120), "white")
    assert find_element_by_text(blank, "anything") is None


class _FakeVisionClient:
    """A fake LLM client capturing the messages and kwargs it receives."""

    def __init__(self, text: str = "Ein Login-Bildschirm mit einem Button.") -> None:
        self._text = text
        self.calls: list[tuple[list[Message], dict[str, Any]]] = []

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        self.calls.append((messages, kwargs))
        return LLMResponse(text=self._text)


async def test_vision_describe_tool_mocked(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """vision_describe sends an image_url part and the vision model name."""

    image = Image.new("RGB", (120, 80), "white")
    monkeypatch.setattr("localpilot.vision.capture.capture_screen", lambda: image)

    client = _FakeVisionClient()
    ctx = _ctx(tmp_path, llm_client=client)
    manager = ToolManager(get_builtin_tools())

    from localpilot.llm.messages import ToolCall

    result = await manager.execute(ToolCall(id="1", name="vision_describe", arguments={}), ctx)

    assert result.ok, result.error
    assert "Login" in result.output
    messages, kwargs = client.calls[0]
    content = messages[0].content
    assert isinstance(content, list)
    assert any(part.get("type") == "image_url" for part in content)
    assert kwargs.get("model") == AppConfig().vision.model


async def test_vision_describe_disabled(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """With vision disabled, describe_image returns a clear notice."""

    image = Image.new("RGB", (120, 80), "white")
    monkeypatch.setattr("localpilot.vision.capture.capture_screen", lambda: image)

    config = AppConfig()
    config.vision.enabled = False
    client = _FakeVisionClient()
    ctx = ToolContext(
        config=config,
        logger=structlog.get_logger("test"),
        event_bus=EventBus(),
        workdir=tmp_path,
        llm_client=client,
    )
    manager = ToolManager(get_builtin_tools())

    from localpilot.llm.messages import ToolCall

    result = await manager.execute(ToolCall(id="1", name="vision_describe", arguments={}), ctx)
    assert result.ok
    assert "deaktiviert" in result.output.lower()


async def test_vision_screenshot_tool(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """vision_screenshot saves a file, emits an event and returns a preview."""

    image = Image.new("RGB", (100, 80), "white")
    monkeypatch.setattr("localpilot.vision.capture.capture_screen", lambda: image)

    ctx = _ctx(tmp_path)
    queue = ctx.event_bus.subscribe()
    manager = ToolManager(get_builtin_tools())

    from localpilot.llm.messages import ToolCall

    result = await manager.execute(ToolCall(id="1", name="vision_screenshot", arguments={}), ctx)

    assert result.ok, result.error
    assert Path(result.output["path"]).exists()
    assert result.output["preview_included"] is True
    assert result.output["preview_base64"]
    event = queue.get_nowait()
    assert event["type"] == "screenshot"
    assert event["path"] == result.output["path"]


@requires_ocr
async def test_vision_ocr_tool_on_login_image(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Demonstrate vision_ocr end-to-end on the generated 'Login' image."""

    monkeypatch.setattr("localpilot.vision.capture.capture_screen", _login_image)

    ctx = _ctx(tmp_path)
    manager = ToolManager(get_builtin_tools())

    from localpilot.llm.messages import ToolCall

    result = await manager.execute(ToolCall(id="1", name="vision_ocr", arguments={}), ctx)

    assert result.ok, result.error
    assert "login" in result.output["text"].lower()
    assert result.output["box_count"] >= 1


@requires_ocr
async def test_vision_find_tool(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """vision_find returns click coordinates for on-screen text."""

    monkeypatch.setattr("localpilot.vision.capture.capture_screen", _login_image)

    ctx = _ctx(tmp_path)
    manager = ToolManager(get_builtin_tools())

    from localpilot.llm.messages import ToolCall

    result = await manager.execute(
        ToolCall(id="1", name="vision_find", arguments={"query": "login"}), ctx
    )

    assert result.ok, result.error
    assert "login" in result.output["text"].lower()
    assert 0 < result.output["x"] < 400
    assert 0 < result.output["y"] < 200
