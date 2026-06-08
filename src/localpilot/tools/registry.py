"""The :class:`ToolManager`: validation, safety gating and execution.

The manager owns the available tools, produces OpenAI tool specs for the LLM
call and executes a :class:`~localpilot.llm.messages.ToolCall` end to end:
look up the tool, validate its arguments, consult the safety gate, run it and
report every invocation on the event bus. A tool that raises never crashes the
caller - the exception is captured into a failed :class:`ToolResult`.
"""

from __future__ import annotations

import time
import traceback
from collections.abc import Iterable
from typing import Any

from pydantic import ValidationError

from localpilot.llm.messages import ToolCall
from localpilot.tools.base import Tool, ToolContext, ToolResult, build_tool_spec


def _format_validation_error(exc: ValidationError) -> str:
    """Render a pydantic validation error into a compact, readable string."""

    parts: list[str] = []
    for error in exc.errors():
        location = ".".join(str(item) for item in error["loc"])
        message = error["msg"]
        parts.append(f"{location}: {message}" if location else message)
    return "; ".join(parts)


class ToolManager:
    """Holds the registered tools and executes tool calls safely."""

    def __init__(self, tools: Iterable[Tool]) -> None:
        """Index ``tools`` by name (later registrations win on collision)."""

        self._tools: dict[str, Tool] = {tool.name: tool for tool in tools}

    def get(self, name: str) -> Tool | None:
        """Return the tool registered under ``name``, or ``None``."""

        return self._tools.get(name)

    def get_specs(self) -> list[dict[str, Any]]:
        """Return OpenAI tool specs for every registered tool."""

        return [build_tool_spec(tool) for tool in self._tools.values()]

    async def execute(self, tool_call: ToolCall, ctx: ToolContext) -> ToolResult:
        """Validate, gate and run ``tool_call``, returning a :class:`ToolResult`.

        Failures (unknown tool, invalid arguments, blocked call, or a raised
        exception) are returned as ``ok=False`` results with messages suitable
        for feeding back to the model, never as exceptions.
        """

        tool = self._tools.get(tool_call.name)
        if tool is None:
            available = ", ".join(sorted(self._tools)) or "(keine)"
            return ToolResult(
                ok=False,
                error=(
                    f"Unbekanntes Tool '{tool_call.name}'. "
                    f"Verfuegbare Tools: {available}."
                ),
            )

        try:
            args = tool.args_model.model_validate(tool_call.arguments)
        except ValidationError as exc:
            return ToolResult(
                ok=False,
                error=(
                    f"Ungueltige Argumente fuer '{tool.name}': "
                    f"{_format_validation_error(exc)}"
                ),
            )

        if not ctx.safety_gate(tool.name, args):
            return ToolResult(
                ok=False,
                error=f"Tool '{tool.name}' wurde vom Safety-Gate blockiert.",
            )

        start = time.perf_counter()
        try:
            result = await tool.run(args, ctx)
        except Exception as exc:  # noqa: BLE001 - a tool must never crash the caller
            result = ToolResult(
                ok=False,
                error=f"Tool '{tool.name}' hat eine Ausnahme ausgeloest: {exc}",
                meta={"traceback": traceback.format_exc()},
            )
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        await self._emit(ctx, tool.name, tool_call.arguments, result.ok, duration_ms)
        return result

    @staticmethod
    async def _emit(
        ctx: ToolContext,
        tool_name: str,
        args: dict[str, Any],
        ok: bool,
        duration_ms: float,
    ) -> None:
        """Log a tool invocation and publish it on the event bus."""

        ctx.logger.info(
            "tool_call",
            tool_name=tool_name,
            ok=ok,
            duration_ms=duration_ms,
        )
        await ctx.event_bus.publish(
            {
                "type": "tool_call",
                "tool_name": tool_name,
                "args": args,
                "ok": ok,
                "duration_ms": duration_ms,
            }
        )
