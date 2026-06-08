"""Browser controller and tool tests.

The Chromium-backed tests run against controlled HTML set via ``page.set_content``
and ``data:`` URLs - never against the live internet, which would be flaky. They
are skipped with a clear message when the Playwright Chromium browser is not
installed (run ``playwright install chromium``).

The ``browser_search`` URL-construction test uses a fake controller and needs no
browser, so it always runs.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
import structlog

from localpilot.config.schema import AppConfig, BrowserConfig
from localpilot.llm.messages import ToolCall
from localpilot.logging.setup import EventBus
from localpilot.tools import ToolContext, ToolManager, get_builtin_tools


def _chromium_available() -> bool:
    """Return True if the Playwright Chromium executable is installed."""

    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            return Path(playwright.chromium.executable_path).exists()
    except Exception:
        return False


requires_chromium = pytest.mark.skipif(
    not _chromium_available(),
    reason="Playwright Chromium is not installed; run 'playwright install chromium'.",
)

_HTML = """
<!DOCTYPE html>
<html>
  <head><title>Testseite</title></head>
  <body>
    <h1 id="title">Hallo Test</h1>
    <p class="msg">Erster Absatz</p>
    <a href="https://example.com/a">Link A</a>
    <a href="https://example.com/b">Link B</a>
    <input id="inp" />
    <button id="btn"
      onclick="document.getElementById('out').textContent='clicked'">Klick</button>
    <div id="out"></div>
  </body>
</html>
"""


@pytest_asyncio.fixture
async def controller() -> Any:
    """A started headless Chromium controller, stopped after the test."""

    from localpilot.browser.controller import BrowserController

    ctrl = BrowserController(BrowserConfig(headless=True))
    await ctrl.start()
    try:
        yield ctrl
    finally:
        await ctrl.stop()


@requires_chromium
async def test_get_text_whole_page_and_selector(controller: Any) -> None:
    await controller.page.set_content(_HTML)
    whole = await controller.get_text(None)
    assert "Hallo Test" in whole
    assert "Erster Absatz" in whole
    assert await controller.get_text("#title") == "Hallo Test"
    assert await controller.get_title() == "Testseite"


@requires_chromium
async def test_get_links(controller: Any) -> None:
    await controller.page.set_content(_HTML)
    links = await controller.get_links()
    assert ("Link A", "https://example.com/a") in links
    assert ("Link B", "https://example.com/b") in links


@requires_chromium
async def test_click_updates_dom(controller: Any) -> None:
    await controller.page.set_content(_HTML)
    await controller.click("#btn")
    assert await controller.get_text("#out") == "clicked"


@requires_chromium
async def test_type_into_input(controller: Any) -> None:
    await controller.page.set_content(_HTML)
    await controller.type("#inp", "hallo welt")
    assert await controller.page.input_value("#inp") == "hallo welt"


@requires_chromium
async def test_goto_data_url(controller: Any) -> None:
    url = await controller.goto("data:text/html,<h1>Data Page</h1>")
    assert url.startswith("data:")
    assert "Data Page" in await controller.get_text(None)


@requires_chromium
async def test_missing_selector_raises_clear_error(controller: Any) -> None:
    from localpilot.browser.controller import BrowserError

    await controller.page.set_content(_HTML)
    with pytest.raises(BrowserError):
        await controller.wait_for("#does-not-exist", timeout_ms=300)


@requires_chromium
async def test_browser_get_text_tool(controller: Any, tmp_path: Path) -> None:
    await controller.page.set_content(_HTML)
    ctx = ToolContext(
        config=AppConfig(),
        logger=structlog.get_logger("test"),
        event_bus=EventBus(),
        workdir=tmp_path,
        browser_controller=controller,
    )
    manager = ToolManager(get_builtin_tools())
    result = await manager.execute(
        ToolCall(id="1", name="browser_get_text", arguments={"selector": "#title"}), ctx
    )
    assert result.ok, result.error
    assert result.output == "Hallo Test"


class _FakeController:
    """Records the URL passed to goto and returns canned fallback text."""

    def __init__(self) -> None:
        self.last_url: str | None = None

    async def goto(self, url: str) -> str:
        self.last_url = url
        return url

    async def get_title(self) -> str:
        return "Google"

    async def get_text(self, selector: str | None = None) -> str:
        return "Fallback-Text der Ergebnisseite"


async def test_browser_search_builds_google_url(tmp_path: Path) -> None:
    """browser_search constructs a Google query URL and falls back to text."""

    from localpilot.tools.browser_tools import BrowserSearchTool

    fake = _FakeController()
    ctx = ToolContext(
        config=AppConfig(),
        logger=structlog.get_logger("test"),
        event_bus=EventBus(),
        workdir=tmp_path,
        browser_controller=fake,  # type: ignore[arg-type]
    )

    tool = BrowserSearchTool()

    async def _no_results(controller: Any) -> list[dict[str, str]]:
        return []

    tool._extract_results = _no_results  # type: ignore[method-assign]

    result = await tool.run(tool.args_model.model_validate({"query": "hallo welt"}), ctx)

    assert result.ok, result.error
    assert fake.last_url == "https://www.google.com/search?q=hallo+welt"
    assert result.output["results"] == []
    assert "Fallback-Text" in result.output["text"]
