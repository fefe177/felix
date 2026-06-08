"""Tests for the agent loop, driven by a scripted (fake) LLM.

The scripted LLM inspects the prompt: planner and verify requests (recognised by
their markers) get canned answers, so the supplied script only needs to list the
think-phase tool calls. No real model, network, browser or display is used;
tools, memory (a temp SQLite file) and the container wiring are real.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path
from typing import Any

import pytest_asyncio

from localpilot.agent.loop import AgentRunResult
from localpilot.agent.prompts import PLANNER_MARKER, VERIFY_MARKER
from localpilot.config.schema import AppConfig
from localpilot.container import Container
from localpilot.llm.base import LLMResponse
from localpilot.llm.messages import Message


def _content(message: Message) -> str:
    if isinstance(message.content, str):
        return message.content
    return " ".join(str(part) for part in message.content)


class _ScriptedLLM:
    """Fake LLM: canned plan/verify answers; scripted think-phase tool calls."""

    def __init__(
        self,
        tool_responses: list[str],
        *,
        repeat_last: bool = False,
        plan: str = '[{"idx": 0, "description": "Erledige das Ziel"}]',
        verify: str = '{"success": true, "reason": "ok", "next_hint": ""}',
    ) -> None:
        self._tool_responses = list(tool_responses)
        self._repeat_last = repeat_last
        self._last = tool_responses[-1] if tool_responses else ""
        self._plan = plan
        self._verify = verify
        self.think_calls = 0

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        text = "\n".join(_content(message) for message in messages)
        if PLANNER_MARKER in text:
            return LLMResponse(text=self._plan)
        if VERIFY_MARKER in text:
            return LLMResponse(text=self._verify)
        self.think_calls += 1
        if self._tool_responses:
            return LLMResponse(text=self._tool_responses.pop(0))
        if self._repeat_last and self._last:
            return LLMResponse(text=self._last)
        return LLMResponse(text='{"tool": "finish", "arguments": {"summary": "auto"}}')


class _FakeProvider:
    """A confirmation provider returning a fixed answer and recording prompts."""

    def __init__(self, answer: bool) -> None:
        self._answer = answer
        self.prompts: list[str] = []

    async def confirm(self, prompt: str) -> bool:
        self.prompts.append(prompt)
        return self._answer


RunAgent = Callable[..., Awaitable[tuple[Container, AgentRunResult]]]


@pytest_asyncio.fixture
async def run_agent(tmp_path: Path) -> AsyncIterator[RunAgent]:
    """Yield a helper that builds a wired container and runs the agent once."""

    containers: list[Container] = []

    async def _run(
        script: list[str],
        goal: str,
        *,
        mode: str = "autonomous",
        provider: Any = None,
        max_iterations: int = 8,
        repeat_last: bool = False,
    ) -> tuple[Container, AgentRunResult]:
        config = AppConfig()
        config.terminal.workdir = str(tmp_path)
        config.memory.db_path = str(tmp_path / f"mem_{len(containers)}.db")
        config.agent.max_iterations = max_iterations
        config.safety.mode = mode  # type: ignore[assignment]
        container = Container(config)
        container._llm_client = _ScriptedLLM(script, repeat_last=repeat_last)  # inject fake LLM
        await container.startup()
        containers.append(container)
        loop = container.create_agent_loop(provider)
        result = await loop.run(goal, mode)
        return container, result

    try:
        yield _run
    finally:
        for container in containers:
            await container.shutdown()


async def test_loop_executes_tools_in_order_and_finishes(
    run_agent: RunAgent, tmp_path: Path
) -> None:
    container, result = await run_agent(
        [
            '{"tool": "file_write", "arguments": {"path": "out.txt", "content": "hallo"}}',
            '{"tool": "file_read", "arguments": {"path": "out.txt"}}',
            '{"tool": "finish", "arguments": {"summary": "erledigt"}}',
        ],
        "Schreibe und lies out.txt",
    )

    assert isinstance(result, AgentRunResult)
    assert result.status == "completed"
    assert result.summary == "erledigt"
    assert (tmp_path / "out.txt").read_text(encoding="utf-8") == "hallo"

    bundle = await container.memory.get_task_with_steps(result.task_id)
    assert bundle is not None
    assert [step["tool"] for step in bundle["steps"]] == ["file_write", "file_read"]
    assert bundle["task"]["status"] == "completed"

    # The successful run is learned as a strategy.
    strategies = await container.memory.find_strategies("Schreibe")
    assert len(strategies) >= 1


async def test_balanced_confirmation_denied_blocks_action(
    run_agent: RunAgent, tmp_path: Path
) -> None:
    provider = _FakeProvider(answer=False)
    _, result = await run_agent(
        [
            '{"tool": "file_write", "arguments": {"path": "out.txt", "content": "hallo"}}',
            '{"tool": "finish", "arguments": {"summary": "ok"}}',
        ],
        "Schreibe out.txt",
        mode="balanced",
        provider=provider,
    )

    assert result.status == "completed"
    assert not (tmp_path / "out.txt").exists()
    assert provider.prompts  # confirmation was requested


async def test_balanced_confirmation_granted_runs_action(
    run_agent: RunAgent, tmp_path: Path
) -> None:
    provider = _FakeProvider(answer=True)
    _, result = await run_agent(
        [
            '{"tool": "file_write", "arguments": {"path": "out.txt", "content": "hallo"}}',
            '{"tool": "finish", "arguments": {"summary": "ok"}}',
        ],
        "Schreibe out.txt",
        mode="balanced",
        provider=provider,
    )

    assert result.status == "completed"
    assert (tmp_path / "out.txt").read_text(encoding="utf-8") == "hallo"


async def test_autonomous_blocklist_blocks_command(run_agent: RunAgent) -> None:
    container, result = await run_agent(
        [
            '{"tool": "run_command", "arguments": {"command": "shutdown -h now"}}',
            '{"tool": "finish", "arguments": {"summary": "fertig"}}',
        ],
        "Fahre das System herunter",
    )

    assert result.status == "completed"
    bundle = await container.memory.get_task_with_steps(result.task_id)
    assert bundle is not None
    first = bundle["steps"][0]
    assert first["tool"] == "run_command"
    assert first["ok"] is False
    assert "sicherheitsregel" in first["result"]["error"].lower()
    errors = await container.memory.get_errors(result.task_id)
    assert len(errors) >= 1


async def test_parse_repair_recovers(run_agent: RunAgent, tmp_path: Path) -> None:
    _, result = await run_agent(
        [
            "Das ist leider kein gueltiges JSON.",
            '{"tool": "file_write", "arguments": {"path": "r.txt", "content": "x"}}',
            '{"tool": "finish", "arguments": {"summary": "ok nach Reparatur"}}',
        ],
        "Repariere dich",
    )

    assert result.status == "completed"
    assert result.summary == "ok nach Reparatur"
    assert (tmp_path / "r.txt").read_text(encoding="utf-8") == "x"


async def test_ask_user_without_provider_needs_input(run_agent: RunAgent) -> None:
    _, result = await run_agent(
        ['{"tool": "ask_user", "arguments": {"question": "Welche Datei?"}}'],
        "Unklare Aufgabe",
    )

    assert result.status == "needs_input"
    assert result.question == "Welche Datei?"


async def test_loop_stops_at_max_iterations(run_agent: RunAgent) -> None:
    # file_list never finishes; the loop must stop after max_iterations.
    container, result = await run_agent(
        ['{"tool": "file_list", "arguments": {"path": "."}}'],
        "Endlosschleife",
        max_iterations=3,
        repeat_last=True,
    )

    assert result.status == "failed"
    bundle = await container.memory.get_task_with_steps(result.task_id)
    assert bundle is not None
    assert len(bundle["steps"]) == 3
