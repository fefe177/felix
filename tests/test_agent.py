"""Tests for the agent loop, driven by a scripted (fake) LLM client.

No real model or network is used: ``_ScriptedLLM`` returns predetermined
responses. Tools, memory (a temp SQLite file) and short-term memory are real.
The tool context uses the default permissive safety gate so these tests isolate
loop behaviour from safety policy (which is covered by ``test_safety.py``).
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path
from typing import Any

import pytest_asyncio
import structlog

from localpilot.agent.loop import Agent, AgentResult
from localpilot.config.schema import AppConfig
from localpilot.llm.base import LLMResponse
from localpilot.llm.messages import Message
from localpilot.logging.setup import EventBus
from localpilot.memory.db import Database
from localpilot.memory.long_term import LongTermMemory
from localpilot.tools import ToolContext, ToolManager, get_builtin_tools


class _ScriptedLLM:
    """A fake LLM client returning scripted response texts in order."""

    def __init__(self, responses: list[str], *, repeat_last: bool = False) -> None:
        self._responses = list(responses)
        self._repeat_last = repeat_last
        self._last = responses[-1] if responses else ""
        self.calls = 0

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        self.calls += 1
        if self._responses:
            text = self._responses.pop(0)
        elif self._repeat_last:
            text = self._last
        else:
            text = '{"tool": "finish", "arguments": {"summary": "fertig"}}'
        return LLMResponse(text=text)


MakeAgent = Callable[..., Awaitable[tuple[Agent, LongTermMemory]]]


@pytest_asyncio.fixture
async def make_agent(tmp_path: Path) -> AsyncIterator[MakeAgent]:
    """Yield a factory building agents over isolated temp databases."""

    databases: list[Database] = []

    async def _make(
        responses: list[str],
        *,
        repeat_last: bool = False,
        max_iterations: int = 6,
    ) -> tuple[Agent, LongTermMemory]:
        config = AppConfig()
        config.agent.max_iterations = max_iterations
        db = Database(str(tmp_path / f"mem_{len(databases)}.db"))
        await db.connect()
        await db.init_schema()
        databases.append(db)
        memory = LongTermMemory(db)
        ctx = ToolContext(
            config=config,
            logger=structlog.get_logger("test"),
            event_bus=EventBus(),
            workdir=tmp_path,
        )
        agent = Agent(
            llm_client=_ScriptedLLM(responses, repeat_last=repeat_last),
            tool_manager=ToolManager(get_builtin_tools()),
            tool_context=ctx,
            memory=memory,
            config=config,
            event_bus=ctx.event_bus,
            logger=structlog.get_logger("agent"),
        )
        return agent, memory

    try:
        yield _make
    finally:
        for db in databases:
            await db.close()


async def test_agent_completes_after_tool_then_finish(
    make_agent: MakeAgent, tmp_path: Path
) -> None:
    agent, memory = await make_agent(
        [
            '{"tool": "file_write", "arguments": {"path": "out.txt", "content": "hallo"}}',
            '{"tool": "finish", "arguments": {"summary": "Datei geschrieben."}}',
        ]
    )

    result = await agent.run("Schreibe out.txt")

    assert isinstance(result, AgentResult)
    assert result.status == "completed"
    assert result.summary == "Datei geschrieben."
    assert result.steps == 1
    assert (tmp_path / "out.txt").read_text(encoding="utf-8") == "hallo"

    bundle = await memory.get_task_with_steps(result.task_id)
    assert bundle is not None
    assert bundle["task"]["status"] == "completed"
    assert [step["tool"] for step in bundle["steps"]] == ["file_write"]
    assert bundle["steps"][0]["ok"] is True


async def test_agent_repairs_invalid_response(make_agent: MakeAgent) -> None:
    agent, _ = await make_agent(
        [
            "Das ist leider kein gueltiges JSON.",
            '{"tool": "finish", "arguments": {"summary": "ok nach Reparatur"}}',
        ]
    )

    result = await agent.run("Tu etwas")

    assert result.status == "completed"
    assert result.summary == "ok nach Reparatur"
    assert result.steps == 0


async def test_agent_fails_after_repeated_parse_errors(make_agent: MakeAgent) -> None:
    # max_repair_attempts defaults to 2, so the 3rd invalid response aborts.
    agent, memory = await make_agent(["kein json", "wieder nicht", "immer noch nicht"])

    result = await agent.run("Tu etwas")

    assert result.status == "failed"
    task = await memory.get_task(result.task_id)
    assert task is not None
    assert task.status == "failed"


async def test_agent_ask_user_returns_question(make_agent: MakeAgent) -> None:
    agent, memory = await make_agent(
        ['{"tool": "ask_user", "arguments": {"question": "Welche Datei?"}}']
    )

    result = await agent.run("Unklare Aufgabe")

    assert result.status == "needs_input"
    assert result.question == "Welche Datei?"
    task = await memory.get_task(result.task_id)
    assert task is not None
    assert task.status == "needs_input"


async def test_agent_stops_at_max_iterations(make_agent: MakeAgent) -> None:
    agent, memory = await make_agent(
        ['{"tool": "file_list", "arguments": {"path": "."}}'],
        repeat_last=True,
        max_iterations=4,
    )

    result = await agent.run("Endlosschleife")

    assert result.status == "failed"
    assert result.steps == 4
    bundle = await memory.get_task_with_steps(result.task_id)
    assert bundle is not None
    assert len(bundle["steps"]) == 4


async def test_agent_records_failed_step_error(make_agent: MakeAgent) -> None:
    """A failing tool is recorded as a step and an error, and the loop continues."""

    agent, memory = await make_agent(
        [
            '{"tool": "file_read", "arguments": {"path": "does_not_exist.txt"}}',
            '{"tool": "finish", "arguments": {"summary": "aufgegeben"}}',
        ]
    )

    result = await agent.run("Lies eine fehlende Datei")

    assert result.status == "completed"
    assert result.steps == 1
    errors = await memory.get_errors(result.task_id)
    assert len(errors) == 1
    assert errors[0].kind == "ToolError"
