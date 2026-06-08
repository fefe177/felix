"""Thin tool wrappers around the shared :class:`DesktopController`.

Coordinates are validated against the current screen size before any movement,
so out-of-bounds requests fail cleanly. The controller is held by the container
and provided via :class:`~localpilot.tools.base.ToolContext`.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from localpilot.desktop.controller import DesktopController, DesktopError, MouseButton
from localpilot.tools.base import ToolContext, ToolResult
from localpilot.tools.decorators import builtin_tools


def _require_desktop(ctx: ToolContext) -> DesktopController | None:
    """Return the desktop controller from ``ctx`` if present."""

    return ctx.desktop_controller


def _no_desktop() -> ToolResult:
    """Build the standard 'no desktop available' failure result."""

    return ToolResult(ok=False, error="Desktop-Controller ist nicht verfuegbar.")


async def _validate_coords(controller: DesktopController, x: int, y: int) -> str | None:
    """Return an error message if ``(x, y)`` is off-screen, else ``None``."""

    width, height = await controller.screen_size()
    if not (0 <= x < width and 0 <= y < height):
        return f"Koordinaten ({x}, {y}) liegen ausserhalb des Bildschirms {width}x{height}."
    return None


class DesktopMoveArgs(BaseModel):
    """Arguments for :class:`DesktopMoveTool`."""

    x: int = Field(description="Target X coordinate in pixels.")
    y: int = Field(description="Target Y coordinate in pixels.")


@builtin_tools.register
class DesktopMoveTool:
    """Move the mouse cursor to a validated screen coordinate."""

    name = "desktop_move"
    description = "Move the mouse cursor to (x, y)."
    args_model: type[BaseModel] = DesktopMoveArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, DesktopMoveArgs)
        controller = _require_desktop(ctx)
        if controller is None:
            return _no_desktop()
        error = await _validate_coords(controller, args.x, args.y)
        if error is not None:
            return ToolResult(ok=False, error=error)
        await controller.move(args.x, args.y)
        return ToolResult(ok=True, output=f"Maus bewegt nach ({args.x}, {args.y}).")


class DesktopClickArgs(BaseModel):
    """Arguments for :class:`DesktopClickTool`."""

    x: int = Field(description="X coordinate in pixels.")
    y: int = Field(description="Y coordinate in pixels.")
    button: MouseButton = Field(default="left", description="Mouse button to use.")
    clicks: int = Field(default=1, ge=1, description="Number of clicks.")


@builtin_tools.register
class DesktopClickTool:
    """Click at a validated screen coordinate."""

    name = "desktop_click"
    description = "Click at (x, y) with a given button and click count."
    args_model: type[BaseModel] = DesktopClickArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, DesktopClickArgs)
        controller = _require_desktop(ctx)
        if controller is None:
            return _no_desktop()
        error = await _validate_coords(controller, args.x, args.y)
        if error is not None:
            return ToolResult(ok=False, error=error)
        await controller.click(args.x, args.y, button=args.button, clicks=args.clicks)
        return ToolResult(
            ok=True,
            output=f"{args.clicks}x {args.button}-Klick bei ({args.x}, {args.y}).",
        )


class DesktopDoubleClickArgs(BaseModel):
    """Arguments for :class:`DesktopDoubleClickTool`."""

    x: int = Field(description="X coordinate in pixels.")
    y: int = Field(description="Y coordinate in pixels.")


@builtin_tools.register
class DesktopDoubleClickTool:
    """Double-click at a validated screen coordinate."""

    name = "desktop_double_click"
    description = "Double-click at (x, y)."
    args_model: type[BaseModel] = DesktopDoubleClickArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, DesktopDoubleClickArgs)
        controller = _require_desktop(ctx)
        if controller is None:
            return _no_desktop()
        error = await _validate_coords(controller, args.x, args.y)
        if error is not None:
            return ToolResult(ok=False, error=error)
        await controller.double_click(args.x, args.y)
        return ToolResult(ok=True, output=f"Doppelklick bei ({args.x}, {args.y}).")


class DesktopScrollArgs(BaseModel):
    """Arguments for :class:`DesktopScrollTool`."""

    amount: int = Field(description="Scroll amount (positive up, negative down).")


@builtin_tools.register
class DesktopScrollTool:
    """Scroll the active window vertically."""

    name = "desktop_scroll"
    description = "Scroll vertically by an amount (positive up, negative down)."
    args_model: type[BaseModel] = DesktopScrollArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, DesktopScrollArgs)
        controller = _require_desktop(ctx)
        if controller is None:
            return _no_desktop()
        await controller.scroll(args.amount)
        return ToolResult(ok=True, output=f"Gescrollt um {args.amount}.")


class DesktopTypeArgs(BaseModel):
    """Arguments for :class:`DesktopTypeTool`."""

    text: str = Field(description="Text to type.")
    interval: float = Field(default=0.0, ge=0.0, description="Delay per character (seconds).")


@builtin_tools.register
class DesktopTypeTool:
    """Type text via the keyboard."""

    name = "desktop_type"
    description = "Type text using the keyboard."
    args_model: type[BaseModel] = DesktopTypeArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, DesktopTypeArgs)
        controller = _require_desktop(ctx)
        if controller is None:
            return _no_desktop()
        await controller.type_text(args.text, interval=args.interval)
        return ToolResult(ok=True, output=f"{len(args.text)} Zeichen getippt.")


class DesktopPressArgs(BaseModel):
    """Arguments for :class:`DesktopPressTool`."""

    keys: list[str] = Field(
        min_length=1,
        description="Keys to press; multiple keys form a hotkey (e.g. ['ctrl', 'c']).",
    )


@builtin_tools.register
class DesktopPressTool:
    """Press a key or a hotkey combination."""

    name = "desktop_press"
    description = "Press a single key or a hotkey combination."
    args_model: type[BaseModel] = DesktopPressArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, DesktopPressArgs)
        controller = _require_desktop(ctx)
        if controller is None:
            return _no_desktop()
        try:
            await controller.press(args.keys)
        except DesktopError as exc:
            return ToolResult(ok=False, error=str(exc))
        return ToolResult(ok=True, output=f"Tasten gedrueckt: {'+'.join(args.keys)}.")


class DesktopActivateWindowArgs(BaseModel):
    """Arguments for :class:`DesktopActivateWindowTool`."""

    title_substring: str = Field(description="Substring matched against window titles.")


@builtin_tools.register
class DesktopActivateWindowTool:
    """Activate (focus) a window whose title contains a substring."""

    name = "desktop_activate_window"
    description = "Focus the first window whose title contains the given substring."
    args_model: type[BaseModel] = DesktopActivateWindowArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, DesktopActivateWindowArgs)
        controller = _require_desktop(ctx)
        if controller is None:
            return _no_desktop()
        try:
            title = await controller.activate_window(args.title_substring)
        except DesktopError as exc:
            return ToolResult(ok=False, error=str(exc))
        return ToolResult(ok=True, output=f"Fenster aktiviert: {title}")
