"""Desktop (GUI) automation controller wrapping PyAutoGUI and PyGetWindow.

These libraries are synchronous and require a real display; on Windows 11 (the
target) that is the desktop session. They are imported **lazily** so this module
can be imported on headless systems (e.g. CI) without a display, where importing
``pyautogui``/``pygetwindow`` would fail. Backends may also be injected for
testing.

Every public method is asynchronous and runs the blocking PyAutoGUI call in a
worker thread via :func:`asyncio.to_thread`, keeping the event loop responsive.
"""

from __future__ import annotations

import asyncio
from typing import Any, Literal

from localpilot.config.schema import DesktopConfig

#: Global pause floor (seconds) applied between PyAutoGUI actions.
_MIN_PAUSE_S = 0.05

MouseButton = Literal["left", "middle", "right"]


class DesktopError(Exception):
    """Raised when a desktop operation fails (e.g. window not found)."""


def _load_pyautogui() -> Any:
    """Import and return the ``pyautogui`` module (lazy, display-dependent)."""

    import pyautogui

    return pyautogui


def _load_pygetwindow() -> Any:
    """Import and return the ``pygetwindow`` module (lazy, platform-dependent)."""

    import pygetwindow

    return pygetwindow


class DesktopController:
    """Encapsulate PyAutoGUI mouse/keyboard control and window activation."""

    def __init__(
        self,
        config: DesktopConfig,
        *,
        gui: Any | None = None,
        window_backend: Any | None = None,
    ) -> None:
        """Store config and optional injected backends (imported lazily otherwise)."""

        self._config = config
        self._gui = gui
        self._windows = window_backend
        self._configured = False

    @property
    def gui(self) -> Any:
        """The PyAutoGUI backend, imported and configured on first access."""

        if self._gui is None:
            self._gui = _load_pyautogui()
        self._ensure_configured()
        return self._gui

    @property
    def windows(self) -> Any:
        """The PyGetWindow backend, imported on first access."""

        if self._windows is None:
            self._windows = _load_pygetwindow()
        return self._windows

    def _ensure_configured(self) -> None:
        """Apply FAILSAFE and PAUSE settings to the GUI backend once."""

        if self._configured or self._gui is None:
            return
        self._gui.FAILSAFE = self._config.failsafe
        self._gui.PAUSE = max(_MIN_PAUSE_S, self._config.move_duration_s)
        self._configured = True

    async def screen_size(self) -> tuple[int, int]:
        """Return the primary screen size as ``(width, height)``."""

        return await asyncio.to_thread(self._screen_size)

    def _screen_size(self) -> tuple[int, int]:
        size = self.gui.size()
        return int(size[0]), int(size[1])

    async def move(self, x: int, y: int) -> None:
        """Move the mouse cursor to ``(x, y)``."""

        await asyncio.to_thread(self._move, x, y)

    def _move(self, x: int, y: int) -> None:
        self.gui.moveTo(x, y, duration=self._config.move_duration_s)

    async def click(
        self, x: int, y: int, button: MouseButton = "left", clicks: int = 1
    ) -> None:
        """Click at ``(x, y)`` with the given button and click count."""

        await asyncio.to_thread(self._click, x, y, button, clicks)

    def _click(self, x: int, y: int, button: MouseButton, clicks: int) -> None:
        self.gui.click(x=x, y=y, button=button, clicks=clicks)

    async def double_click(self, x: int, y: int) -> None:
        """Double-click at ``(x, y)``."""

        await asyncio.to_thread(self._double_click, x, y)

    def _double_click(self, x: int, y: int) -> None:
        self.gui.doubleClick(x=x, y=y)

    async def scroll(self, amount: int) -> None:
        """Scroll vertically by ``amount`` (positive up, negative down)."""

        await asyncio.to_thread(self._scroll, amount)

    def _scroll(self, amount: int) -> None:
        self.gui.scroll(amount)

    async def type_text(self, text: str, interval: float = 0.0) -> None:
        """Type ``text`` with an optional per-character ``interval`` (seconds)."""

        await asyncio.to_thread(self._type_text, text, interval)

    def _type_text(self, text: str, interval: float) -> None:
        self.gui.write(text, interval=interval)

    async def press(self, keys: list[str]) -> None:
        """Press a single key or a hotkey combination (e.g. ``["ctrl", "c"]``)."""

        if not keys:
            raise DesktopError("Es wurde keine Taste angegeben.")
        await asyncio.to_thread(self._press, keys)

    def _press(self, keys: list[str]) -> None:
        if len(keys) == 1:
            self.gui.press(keys[0])
        else:
            self.gui.hotkey(*keys)

    async def activate_window(self, title_substring: str) -> str:
        """Focus the first window whose title contains ``title_substring``.

        Returns the activated window's title, or raises :class:`DesktopError`
        if no matching window exists.
        """

        return await asyncio.to_thread(self._activate_window, title_substring)

    def _activate_window(self, title_substring: str) -> str:
        needle = title_substring.lower()
        matches = [
            window
            for window in self.windows.getAllWindows()
            if needle in (getattr(window, "title", "") or "").lower()
        ]
        if not matches:
            raise DesktopError(
                f"Kein Fenster mit Titel-Teilstring '{title_substring}' gefunden."
            )
        window = matches[0]
        window.activate()
        return str(getattr(window, "title", ""))
