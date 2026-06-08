"""Tool-system foundation: result, context, protocol and spec generation.

This module defines the stable contract every tool implements:

* :class:`ToolResult` - the structured outcome of running a tool.
* :class:`ToolContext` - the runtime services and policy handed to a tool.
* :class:`Tool` - a structural :class:`typing.Protocol` for tools.
* :func:`build_tool_spec` - derives an OpenAI tool spec from a tool's args model.

It also provides small path helpers shared by the file and terminal tools.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

import structlog
from pydantic import BaseModel, Field

from localpilot.config.schema import AppConfig
from localpilot.logging.setup import EventBus

if TYPE_CHECKING:
    from localpilot.browser.controller import BrowserController
    from localpilot.desktop.controller import DesktopController
    from localpilot.llm.base import LLMClient


class ToolResult(BaseModel):
    """The structured result of executing a tool.

    Attributes:
        ok: Whether the tool succeeded.
        output: The successful payload (tool-specific shape) or ``None``.
        error: A human/model-readable error message when ``ok`` is ``False``.
        meta: Auxiliary metadata (paths, exit codes, tracebacks, ...).
    """

    ok: bool
    output: Any = None
    error: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


#: A safety gate decides whether a validated tool call may proceed. The real
#: implementation arrives in Phase 6; until then a permissive default is used.
SafetyGate = Callable[[str, BaseModel], bool]


def _always_allow(tool_name: str, args: BaseModel) -> bool:
    """Permissive default safety gate that allows every tool call."""

    return True


@dataclass
class ToolContext:
    """Runtime services and policy passed to every tool invocation.

    Attributes:
        config: The full application configuration.
        logger: A structured logger.
        event_bus: The in-process event bus for streaming tool activity.
        workdir: The resolved working directory for relative paths/commands.
        safety_gate: Callback consulted before a tool runs (Phase 6 wires in
            the real policy; the default permits everything).
        browser_controller: The shared browser controller, if available.
        desktop_controller: The shared desktop controller, if available.
        llm_client: The shared LLM client, used by vision description, if available.
    """

    config: AppConfig
    logger: structlog.stdlib.BoundLogger
    event_bus: EventBus
    workdir: Path
    safety_gate: SafetyGate = field(default=_always_allow)
    browser_controller: BrowserController | None = None
    desktop_controller: DesktopController | None = None
    llm_client: LLMClient | None = None


@runtime_checkable
class Tool(Protocol):
    """Structural protocol implemented by every tool.

    Concrete tools expose ``name``, ``description`` and an ``args_model`` and
    implement an asynchronous ``run``. ``run`` accepts a :class:`BaseModel`
    (the registry validates raw arguments into ``args_model`` first) and returns
    a :class:`ToolResult`.
    """

    name: str
    description: str
    args_model: type[BaseModel]

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        """Execute the tool against validated ``args`` and return a result."""
        ...


def build_tool_spec(tool: Tool) -> dict[str, Any]:
    """Build an OpenAI tool spec (JSON schema) from a tool's args model.

    Args:
        tool: The tool whose ``args_model`` describes its parameters.

    Returns:
        An OpenAI ``{"type": "function", "function": {...}}`` specification.
    """

    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.args_model.model_json_schema(),
        },
    }


def resolve_path(workdir: Path, raw: str) -> Path:
    """Resolve ``raw`` against ``workdir`` (absolute paths are kept as-is)."""

    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = workdir / candidate
    return candidate.resolve()


def is_within(path: Path, root: Path) -> bool:
    """Return ``True`` if ``path`` is inside ``root`` (both resolved)."""

    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True
