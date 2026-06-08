"""Asynchronous browser controller built on Playwright (Chromium).

:class:`BrowserController` owns a single Playwright instance, browser, context
and page. Lifecycle methods are idempotent and guarded by a lock so concurrent
callers cannot start or stop the browser twice. Navigation and query helpers use
the configured timeouts and turn Playwright failures (missing selectors,
navigation errors, timeouts) into clear :class:`BrowserError` exceptions instead
of hanging.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from playwright.async_api import (
    Error as PlaywrightError,
)
from playwright.async_api import (
    TimeoutError as PlaywrightTimeoutError,
)
from playwright.async_api import (
    async_playwright,
)

from localpilot.config.schema import BrowserConfig

if TYPE_CHECKING:
    from playwright.async_api import Browser, BrowserContext, Page, Playwright


class BrowserError(Exception):
    """Raised for any browser operation that fails or times out."""


class BrowserController:
    """Manage a Chromium browser and expose high-level page operations."""

    def __init__(self, config: BrowserConfig) -> None:
        """Store configuration; the browser is started lazily via :meth:`start`."""

        self._config = config
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._lock = asyncio.Lock()

    @property
    def page(self) -> Page:
        """The current page, or raise if the browser is not started."""

        if self._page is None:
            raise BrowserError("Browser ist nicht gestartet.")
        return self._page

    async def start(self) -> None:
        """Start Playwright, Chromium, a context and a page (idempotent)."""

        async with self._lock:
            if self._page is not None:
                return
            try:
                self._playwright = await async_playwright().start()
                self._browser = await self._playwright.chromium.launch(
                    headless=self._config.headless
                )
                self._context = await self._browser.new_context()
                self._context.set_default_timeout(float(self._config.default_timeout_ms))
                self._page = await self._context.new_page()
            except PlaywrightError as exc:
                await self._teardown()
                raise BrowserError(f"Browser konnte nicht gestartet werden: {exc}") from exc

    async def stop(self) -> None:
        """Stop the page, context, browser and Playwright (idempotent)."""

        async with self._lock:
            await self._teardown()

    async def _teardown(self) -> None:
        """Close whatever is open and reset all handles to ``None``."""

        if self._page is not None:
            await self._page.close()
            self._page = None
        if self._context is not None:
            await self._context.close()
            self._context = None
        if self._browser is not None:
            await self._browser.close()
            self._browser = None
        if self._playwright is not None:
            await self._playwright.stop()
            self._playwright = None

    async def _ensure_page(self) -> Page:
        """Return the page, starting the browser on first use."""

        if self._page is None:
            await self.start()
        if self._page is None:  # pragma: no cover - start() raises on failure
            raise BrowserError("Browser-Seite ist nicht verfuegbar.")
        return self._page

    async def goto(self, url: str) -> str:
        """Navigate to ``url`` and return the resulting URL."""

        page = await self._ensure_page()
        try:
            await page.goto(url, wait_until="domcontentloaded")
        except PlaywrightError as exc:
            raise BrowserError(f"Navigation zu {url} fehlgeschlagen: {exc}") from exc
        return page.url

    async def get_url(self) -> str:
        """Return the current page URL."""

        page = await self._ensure_page()
        return page.url

    async def get_title(self) -> str:
        """Return the current page title."""

        page = await self._ensure_page()
        return await page.title()

    async def get_text(self, selector: str | None = None) -> str:
        """Return visible text for ``selector`` (or the whole page if ``None``)."""

        page = await self._ensure_page()
        if selector is None:
            return await page.inner_text("body")
        locator = page.locator(selector).first
        try:
            await locator.wait_for(state="visible", timeout=float(self._config.default_timeout_ms))
            return await locator.inner_text()
        except PlaywrightTimeoutError as exc:
            raise BrowserError(f"Selektor nicht gefunden: {selector}") from exc

    async def click(self, selector: str) -> None:
        """Click the first element matching ``selector``."""

        page = await self._ensure_page()
        try:
            await page.click(selector, timeout=float(self._config.default_timeout_ms))
        except PlaywrightTimeoutError as exc:
            raise BrowserError(f"Element nicht klickbar oder nicht gefunden: {selector}") from exc

    async def type(self, selector: str, text: str, submit: bool = False) -> None:
        """Fill ``selector`` with ``text``; press Enter afterwards if ``submit``."""

        page = await self._ensure_page()
        try:
            await page.fill(selector, text, timeout=float(self._config.default_timeout_ms))
            if submit:
                await page.press(selector, "Enter")
        except PlaywrightTimeoutError as exc:
            raise BrowserError(f"Eingabefeld nicht gefunden: {selector}") from exc

    async def get_links(self) -> list[tuple[str, str]]:
        """Return ``(text, href)`` pairs for every anchor with an ``href``."""

        page = await self._ensure_page()
        anchors = page.locator("a[href]")
        count = await anchors.count()
        links: list[tuple[str, str]] = []
        for index in range(count):
            anchor = anchors.nth(index)
            href = await anchor.get_attribute("href")
            if not href:
                continue
            text = (await anchor.inner_text()).strip()
            links.append((text, href))
        return links

    async def screenshot_bytes(self) -> bytes:
        """Return a PNG screenshot of the current page as bytes."""

        page = await self._ensure_page()
        return await page.screenshot(type="png")

    async def wait_for(self, selector: str, timeout_ms: int | None = None) -> None:
        """Wait until ``selector`` becomes visible, or raise on timeout."""

        page = await self._ensure_page()
        timeout = float(timeout_ms if timeout_ms is not None else self._config.default_timeout_ms)
        try:
            await page.locator(selector).first.wait_for(state="visible", timeout=timeout)
        except PlaywrightTimeoutError as exc:
            raise BrowserError(f"Timeout beim Warten auf Selektor: {selector}") from exc
