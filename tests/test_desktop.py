"""Desktop controller and tool tests.

These tests never move the real mouse or touch a real display: PyAutoGUI and
PyGetWindow do not even import on a headless CI box. Instead we inject a fake GUI
backend into :class:`DesktopController` (for ``screen_size``) and use a fake
controller for the tool wrappers (for coordinate validation and window
activation). This keeps the tests safe and deterministic everywhere.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import structlog

from localpilot.config.schema import AppConfig, DesktopConfig
from localpilot.desktop.controller import DesktopController, DesktopError
from localpilot.llm.messages import ToolCall
from localpilot.logging.setup import EventBus
from localpilot.tools import ToolContext, ToolManager, get_builtin_tools


def _fake_gui(width: int = 1920, height: int = 1080) -> SimpleNamespace:
    """A stand-in for the pyautogui module exposing only what we use."""

    return SimpleNamespace(size=lambda: (width, height), FAILSAFE=True, PAUSE=0.0)


async def test_screen_size_returns_plausible_values() -> None:
    controller = DesktopController(DesktopConfig(), gui=_fake_gui(1920, 1080))
    width, height = await controller.screen_size()
    assert width == 1920
    assert height == 1080
    assert width > 0 and height > 0


def test_failsafe_and_pause_applied() -> None:
    gui = _fake_gui()
    controller = DesktopController(DesktopConfig(failsafe=True, move_duration_s=0.2), gui=gui)
    _ = controller.gui  # accessing the property applies the configuration
    assert gui.FAILSAFE is True
    assert gui.PAUSE == 0.2


class _FakeDesktop:
    """A fake desktop controller recording calls for the tool tests."""

    def __init__(self, *, width: int = 1920, height: int = 1080) -> None:
        self._size = (width, height)
        self.moved: tuple[int, int] | None = None
        self.clicked: tuple[int, int, str, int] | None = None

    async def screen_size(self) -> tuple[int, int]:
        return self._size

    async def move(self, x: int, y: int) -> None:
        self.moved = (x, y)

    async def click(self, x: int, y: int, button: str = "left", clicks: int = 1) -> None:
        self.clicked = (x, y, button, clicks)

    async def activate_window(self, title_substring: str) -> str:
        raise DesktopError(f"Kein Fenster mit Titel-Teilstring '{title_substring}' gefunden.")


def _ctx(desktop: _FakeDesktop, tmp_path: Path) -> ToolContext:
    return ToolContext(
        config=AppConfig(),
        logger=structlog.get_logger("test"),
        event_bus=EventBus(),
        workdir=tmp_path,
        desktop_controller=desktop,  # type: ignore[arg-type]
    )


async def test_desktop_move_rejects_offscreen(tmp_path: Path) -> None:
    desktop = _FakeDesktop()
    manager = ToolManager(get_builtin_tools())
    result = await manager.execute(
        ToolCall(id="1", name="desktop_move", arguments={"x": 99999, "y": 10}),
        _ctx(desktop, tmp_path),
    )
    assert result.ok is False
    assert "ausserhalb" in (result.error or "").lower()
    assert desktop.moved is None


async def test_desktop_move_accepts_valid(tmp_path: Path) -> None:
    desktop = _FakeDesktop()
    manager = ToolManager(get_builtin_tools())
    result = await manager.execute(
        ToolCall(id="1", name="desktop_move", arguments={"x": 100, "y": 200}),
        _ctx(desktop, tmp_path),
    )
    assert result.ok, result.error
    assert desktop.moved == (100, 200)


async def test_desktop_click_records_button(tmp_path: Path) -> None:
    desktop = _FakeDesktop()
    manager = ToolManager(get_builtin_tools())
    result = await manager.execute(
        ToolCall(
            id="1",
            name="desktop_click",
            arguments={"x": 5, "y": 5, "button": "right", "clicks": 2},
        ),
        _ctx(desktop, tmp_path),
    )
    assert result.ok, result.error
    assert desktop.clicked == (5, 5, "right", 2)


async def test_desktop_activate_window_not_found(tmp_path: Path) -> None:
    desktop = _FakeDesktop()
    manager = ToolManager(get_builtin_tools())
    result = await manager.execute(
        ToolCall(
            id="1",
            name="desktop_activate_window",
            arguments={"title_substring": "Nichtvorhanden"},
        ),
        _ctx(desktop, tmp_path),
    )
    assert result.ok is False
    assert "kein fenster" in (result.error or "").lower()


async def test_desktop_unavailable_controller(tmp_path: Path) -> None:
    """With no desktop controller attached, the tool fails cleanly."""

    ctx = ToolContext(
        config=AppConfig(),
        logger=structlog.get_logger("test"),
        event_bus=EventBus(),
        workdir=tmp_path,
    )
    manager = ToolManager(get_builtin_tools())
    result = await manager.execute(
        ToolCall(id="1", name="desktop_move", arguments={"x": 1, "y": 1}), ctx
    )
    assert result.ok is False
    assert "nicht verfuegbar" in (result.error or "").lower()
