"""Thin tool wrappers around the shared :class:`BrowserController`.

The controller is held by the container as a lazily-started singleton and passed
in via :class:`~localpilot.tools.base.ToolContext`. These wrappers keep outputs
compact (no giant HTML dumps) and translate :class:`BrowserError` into failed
:class:`ToolResult` values rather than raising.
"""

from __future__ import annotations

import urllib.parse

from pydantic import BaseModel, Field

from localpilot.browser.controller import BrowserController, BrowserError
from localpilot.tools.base import ToolContext, ToolResult
from localpilot.tools.decorators import builtin_tools

#: Cap on returned page text so results stay compact for the model.
_MAX_TEXT_CHARS = 5_000
#: Cap on the number of links returned by extraction/search.
_MAX_LINKS = 100
_MAX_SEARCH_RESULTS = 10


def _require_browser(ctx: ToolContext) -> BrowserController | None:
    """Return the browser controller from ``ctx`` if present."""

    return ctx.browser_controller


def _no_browser() -> ToolResult:
    """Build the standard 'no browser available' failure result."""

    return ToolResult(ok=False, error="Browser-Controller ist nicht verfuegbar.")


def _truncate(text: str, limit: int = _MAX_TEXT_CHARS) -> str:
    """Truncate ``text`` to ``limit`` characters, noting the omission."""

    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n...[abgeschnitten, {len(text) - limit} weitere Zeichen]"


class BrowserGotoArgs(BaseModel):
    """Arguments for navigation tools."""

    url: str = Field(description="The URL to navigate to.")


async def _goto(ctx: ToolContext, url: str) -> ToolResult:
    """Navigate to ``url`` and return the resulting URL and title."""

    controller = _require_browser(ctx)
    if controller is None:
        return _no_browser()
    try:
        final_url = await controller.goto(url)
        title = await controller.get_title()
    except BrowserError as exc:
        return ToolResult(ok=False, error=str(exc))
    return ToolResult(ok=True, output={"url": final_url, "title": title})


@builtin_tools.register
class BrowserOpenTool:
    """Open a URL in the browser (alias of ``browser_goto``)."""

    name = "browser_open"
    description = "Open a URL in the browser and return its final URL and title."
    args_model: type[BaseModel] = BrowserGotoArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, BrowserGotoArgs)
        return await _goto(ctx, args.url)


@builtin_tools.register
class BrowserGotoTool:
    """Navigate the browser to a URL."""

    name = "browser_goto"
    description = "Navigate the browser to a URL and return its final URL and title."
    args_model: type[BaseModel] = BrowserGotoArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, BrowserGotoArgs)
        return await _goto(ctx, args.url)


class BrowserGetTextArgs(BaseModel):
    """Arguments for :class:`BrowserGetTextTool`."""

    selector: str | None = Field(
        default=None,
        description="CSS selector to read; omit to read the whole page text.",
    )


@builtin_tools.register
class BrowserGetTextTool:
    """Read visible text from the page (optionally scoped to a selector)."""

    name = "browser_get_text"
    description = "Read visible text from the current page or a CSS selector."
    args_model: type[BaseModel] = BrowserGetTextArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, BrowserGetTextArgs)
        controller = _require_browser(ctx)
        if controller is None:
            return _no_browser()
        try:
            text = await controller.get_text(args.selector)
        except BrowserError as exc:
            return ToolResult(ok=False, error=str(exc))
        return ToolResult(ok=True, output=_truncate(text), meta={"selector": args.selector})


class BrowserClickArgs(BaseModel):
    """Arguments for :class:`BrowserClickTool`."""

    selector: str = Field(description="CSS selector of the element to click.")


@builtin_tools.register
class BrowserClickTool:
    """Click an element identified by a CSS selector."""

    name = "browser_click"
    description = "Click the first element matching a CSS selector."
    args_model: type[BaseModel] = BrowserClickArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, BrowserClickArgs)
        controller = _require_browser(ctx)
        if controller is None:
            return _no_browser()
        try:
            await controller.click(args.selector)
            url = await controller.get_url()
        except BrowserError as exc:
            return ToolResult(ok=False, error=str(exc))
        return ToolResult(ok=True, output={"clicked": args.selector, "url": url})


class BrowserTypeArgs(BaseModel):
    """Arguments for :class:`BrowserTypeTool`."""

    selector: str = Field(description="CSS selector of the input field.")
    text: str = Field(description="Text to type into the field.")
    submit: bool = Field(default=False, description="Press Enter after typing if True.")


@builtin_tools.register
class BrowserTypeTool:
    """Type text into an input field, optionally submitting it."""

    name = "browser_type"
    description = "Type text into an input field identified by a CSS selector."
    args_model: type[BaseModel] = BrowserTypeArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, BrowserTypeArgs)
        controller = _require_browser(ctx)
        if controller is None:
            return _no_browser()
        try:
            await controller.type(args.selector, args.text, submit=args.submit)
        except BrowserError as exc:
            return ToolResult(ok=False, error=str(exc))
        return ToolResult(
            ok=True,
            output={"selector": args.selector, "submitted": args.submit},
        )


class BrowserExtractLinksArgs(BaseModel):
    """Arguments for :class:`BrowserExtractLinksTool` (none)."""


@builtin_tools.register
class BrowserExtractLinksTool:
    """Extract the page's links as a compact list of ``{text, href}``."""

    name = "browser_extract_links"
    description = "Extract up to 100 links from the current page as {text, href}."
    args_model: type[BaseModel] = BrowserExtractLinksArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, BrowserExtractLinksArgs)
        controller = _require_browser(ctx)
        if controller is None:
            return _no_browser()
        try:
            links = await controller.get_links()
        except BrowserError as exc:
            return ToolResult(ok=False, error=str(exc))
        items = [{"text": text, "href": href} for text, href in links[:_MAX_LINKS]]
        return ToolResult(ok=True, output=items, meta={"count": len(items)})


class BrowserSearchArgs(BaseModel):
    """Arguments for :class:`BrowserSearchTool`."""

    query: str = Field(description="The search query.")


@builtin_tools.register
class BrowserSearchTool:
    """Run a Google search and extract result titles and links.

    Uses a robust ``a:has(h3)`` selector for result anchors and falls back to
    the page's visible text when the layout does not match.
    """

    name = "browser_search"
    description = "Search the web via Google and return result titles and links."
    args_model: type[BaseModel] = BrowserSearchArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        assert isinstance(args, BrowserSearchArgs)
        controller = _require_browser(ctx)
        if controller is None:
            return _no_browser()

        url = "https://www.google.com/search?q=" + urllib.parse.quote_plus(args.query)
        try:
            await controller.goto(url)
            results = await self._extract_results(controller)
            if results:
                return ToolResult(
                    ok=True,
                    output={"query": args.query, "results": results},
                    meta={"count": len(results)},
                )
            text = await controller.get_text(None)
        except BrowserError as exc:
            return ToolResult(ok=False, error=str(exc))
        return ToolResult(
            ok=True,
            output={"query": args.query, "results": [], "text": _truncate(text, 2_000)},
            meta={"fallback": True},
        )

    @staticmethod
    async def _extract_results(controller: BrowserController) -> list[dict[str, str]]:
        """Extract result anchors (title + href) with a robust selector."""

        anchors = controller.page.locator("a:has(h3)")
        try:
            count = await anchors.count()
        except BrowserError:
            return []
        results: list[dict[str, str]] = []
        for index in range(min(count, _MAX_SEARCH_RESULTS)):
            anchor = anchors.nth(index)
            href = await anchor.get_attribute("href")
            title = (await anchor.locator("h3").first.inner_text()).strip()
            if href and title:
                results.append({"title": title, "href": href})
        return results
