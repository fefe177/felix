"""Vision tools: screenshot, describe, OCR and text-element finding.

These wrap the :mod:`localpilot.vision` modules. CPU-heavy work (screen capture,
OCR) runs in a worker thread via :func:`asyncio.to_thread`; the VLM call is
already asynchronous. Outputs are kept compact (text is truncated, only a small
thumbnail preview is returned).
"""

from __future__ import annotations

import asyncio

from pydantic import BaseModel, Field

from localpilot.tools.base import ToolContext, ToolResult
from localpilot.tools.decorators import builtin_tools
from localpilot.vision import capture
from localpilot.vision.elements import find_element_by_text
from localpilot.vision.ocr import ocr_image
from localpilot.vision.vlm import describe_image

#: Maximum OCR text length returned by ``vision_ocr``.
_MAX_OCR_CHARS = 4_000
#: Maximum edge length (pixels) of the screenshot preview thumbnail.
_PREVIEW_MAX_PX = 256


def _make_preview(img: object) -> str:
    """Return a small base64 PNG thumbnail of ``img`` to keep outputs compact."""

    from PIL import Image

    assert isinstance(img, Image.Image)
    thumbnail = img.copy()
    thumbnail.thumbnail((_PREVIEW_MAX_PX, _PREVIEW_MAX_PX))
    return capture.to_base64_png(thumbnail)


class VisionScreenshotArgs(BaseModel):
    """Arguments for :class:`VisionScreenshotTool` (none)."""


@builtin_tools.register
class VisionScreenshotTool:
    """Capture the screen, save it and return its path plus a small preview."""

    name = "vision_screenshot"
    description = "Take a screenshot, save it to a temp file and return its path."
    args_model: type[BaseModel] = VisionScreenshotArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, VisionScreenshotArgs)
        img = await asyncio.to_thread(capture.capture_screen)
        path = await asyncio.to_thread(capture.save_temp, img)
        await ctx.event_bus.publish({"type": "screenshot", "path": str(path)})
        preview = await asyncio.to_thread(_make_preview, img)
        return ToolResult(
            ok=True,
            output={
                "path": str(path),
                "width": img.width,
                "height": img.height,
                "preview_included": True,
                "preview_base64": preview,
            },
            meta={"path": str(path)},
        )


class VisionDescribeArgs(BaseModel):
    """Arguments for :class:`VisionDescribeTool`."""

    prompt: str | None = Field(
        default=None,
        description="Optional instruction; defaults to a structured screen description.",
    )


@builtin_tools.register
class VisionDescribeTool:
    """Capture the screen and describe it with the vision model."""

    name = "vision_describe"
    description = "Take a screenshot and return a textual description from the vision model."
    args_model: type[BaseModel] = VisionDescribeArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, VisionDescribeArgs)
        client = ctx.llm_client
        if client is None:
            return ToolResult(ok=False, error="LLM-Client ist nicht verfuegbar.")
        img = await asyncio.to_thread(capture.capture_screen)
        description = await describe_image(client, ctx.config.vision, img, args.prompt)
        return ToolResult(ok=True, output=description)


class VisionOcrArgs(BaseModel):
    """Arguments for :class:`VisionOcrTool`."""

    max_chars: int = Field(
        default=_MAX_OCR_CHARS,
        ge=1,
        description="Maximum number of characters of OCR text to return.",
    )


@builtin_tools.register
class VisionOcrTool:
    """Capture the screen and return its recognised text and box count."""

    name = "vision_ocr"
    description = "Take a screenshot, run OCR and return the recognised text (truncated)."
    args_model: type[BaseModel] = VisionOcrArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, VisionOcrArgs)
        img = await asyncio.to_thread(capture.capture_screen)
        boxes = await asyncio.to_thread(ocr_image, img)
        text = "\n".join(box.text for box in boxes)
        return ToolResult(
            ok=True,
            output={
                "text": text[: args.max_chars],
                "box_count": len(boxes),
                "truncated": len(text) > args.max_chars,
            },
        )


class VisionFindArgs(BaseModel):
    """Arguments for :class:`VisionFindTool`."""

    query: str = Field(description="The on-screen text to locate.")


@builtin_tools.register
class VisionFindTool:
    """Find on-screen text and return click coordinates (for ``desktop_click``)."""

    name = "vision_find"
    description = "Find on-screen text by query and return its centre coordinates."
    args_model: type[BaseModel] = VisionFindArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, VisionFindArgs)
        img = await asyncio.to_thread(capture.capture_screen)
        match = await asyncio.to_thread(find_element_by_text, img, args.query)
        if match is None:
            return ToolResult(ok=False, error=f"Kein Textelement gefunden fuer: {args.query}")
        return ToolResult(
            ok=True,
            output={
                "text": match.text,
                "x": match.center[0],
                "y": match.center[1],
                "score": round(match.score, 3),
                "box": list(match.box),
            },
        )
