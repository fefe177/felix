"""Tests for the multi-agent orchestrator, driven by a marker-aware mock LLM.

The mock branches on the prompt: planner/verify requests get canned answers, and
each role is recognised by the ``[[ROLE:<name>]]`` marker its suffix embeds. The
script makes the executor's first attempt at step 2 fail (reading a missing
file), which must activate the debug role and lead to a successful retry once the
debug hint is present. No real model, network, browser or display is used.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path
from typing import Any

import pytest_asyncio

from localpilot.agent.loop import AgentLoop
from localpilot.agent.prompts import PLANNER_MARKER, VERIFY_MARKER
from localpilot.config.schema import AppConfig
from localpilot.container import Container
from localpilot.llm.base import LLMResponse
from localpilot.llm.messages import Message
from localpilot.multiagent.orchestrator import Orchestrator, OrchestratorResult


def _content(message: Message) -> str:
    if isinstance(message.content, str):
        return message.content
    return " ".join(str(part) for part in message.content)


class _MultiAgentLLM:
    """A role-aware fake LLM producing a deterministic multi-agent run."""

    def __init__(self) -> None:
        self.role_calls: list[str] = []

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        text = "\n".join(_content(message) for message in messages)

        if PLANNER_MARKER in text:
            return LLMResponse(
                text=(
                    '[{"idx": 0, "description": "Recherchiere Informationen im Web"},'
                    ' {"idx": 1, "description": "Schreibe das Ergebnis in out.txt"}]'
                )
            )
        if VERIFY_MARKER in text:
            return LLMResponse(text='{"success": false, "reason": "weiter", "next_hint": ""}')

        if "[[ROLE:research]]" in text:
            self.role_calls.append("research")
            return LLMResponse(
                text='{"tool": "finish", "arguments": {"summary": "Recherche: Antwort ist 42"}}'
            )
        if "[[ROLE:debug]]" in text:
            self.role_calls.append("debug")
            return LLMResponse(
                text='{"tool": "finish", "arguments": '
                '{"summary": "DEBUG_HINT: lege die Datei direkt an"}}'
            )
        if "[[ROLE:executor]]" in text:
            self.role_calls.append("executor")
            if "DEBUG_HINT" in text:
                return LLMResponse(
                    text=(
                        '{"actions": ['
                        '{"tool": "file_write", "arguments": {"path": "out.txt", "content": "42"}},'
                        ' {"tool": "finish", "arguments": {"summary": "geschrieben"}}]}'
                    )
                )
            return LLMResponse(
                text='{"tool": "file_read", "arguments": {"path": "missing.txt"}}'
            )

        return LLMResponse(text='{"tool": "finish", "arguments": {"summary": "auto"}}')


RunOrchestrator = Callable[..., Awaitable[tuple[Container, OrchestratorResult, _MultiAgentLLM]]]


@pytest_asyncio.fixture
async def run_orchestrator(tmp_path: Path) -> AsyncIterator[RunOrchestrator]:
    """Yield a helper that builds a container and runs the orchestrator once."""

    containers: list[Container] = []

    async def _run(goal: str) -> tuple[Container, OrchestratorResult, _MultiAgentLLM]:
        config = AppConfig()
        config.terminal.workdir = str(tmp_path)
        config.memory.db_path = str(tmp_path / f"mem_{len(containers)}.db")
        config.agent.max_iterations = 3  # the failing executor exhausts quickly
        config.safety.mode = "autonomous"  # type: ignore[assignment]
        llm = _MultiAgentLLM()
        container = Container(config)
        container._llm_client = llm
        await container.startup()
        containers.append(container)
        queue = container.event_bus.subscribe()
        container._event_queue = queue  # type: ignore[attr-defined]
        orchestrator = container.create_runner(True)
        assert isinstance(orchestrator, Orchestrator)
        result = await orchestrator.run(goal, "autonomous")
        return container, result, llm

    try:
        yield _run
    finally:
        for container in containers:
            await container.shutdown()


def _drain_event_types(container: Container) -> list[str]:
    queue = container._event_queue  # type: ignore[attr-defined]
    types: list[str] = []
    while not queue.empty():
        types.append(queue.get_nowait().get("type"))
    return types


async def test_roles_selected_and_debug_recovers(
    run_orchestrator: RunOrchestrator, tmp_path: Path
) -> None:
    container, result, llm = await run_orchestrator(
        "Finde Infos und schreibe sie in out.txt"
    )

    assert isinstance(result, OrchestratorResult)
    assert result.status == "completed"
    # The executor eventually wrote the file (after the debug-driven retry).
    assert (tmp_path / "out.txt").read_text(encoding="utf-8") == "42"

    # The research role handled step 0; the executor and debug roles were used.
    assert "research" in llm.role_calls
    assert "executor" in llm.role_calls
    assert "debug" in llm.role_calls

    event_types = _drain_event_types(container)
    assert "orchestrator_start" in event_types
    assert "role_switch" in event_types
    assert "debug_hint" in event_types
    assert "orchestrator_finish" in event_types


async def test_research_role_cannot_use_write_tools(
    run_orchestrator: RunOrchestrator,
) -> None:
    """The research role's tool manager must exclude write/terminal tools."""

    container, _, _ = await run_orchestrator("Recherchiere etwas")
    orchestrator = container.create_runner(True)
    assert isinstance(orchestrator, Orchestrator)

    research_tools = orchestrator._role_tools(orchestrator._research)
    names = {spec["function"]["name"] for spec in research_tools.get_specs()}
    assert "browser_search" in names
    assert "file_read" in names
    assert "file_write" not in names
    assert "run_command" not in names


async def test_single_agent_is_default(tmp_path: Path) -> None:
    """With multi_agent disabled, the runner is the single-agent AgentLoop."""

    config = AppConfig()
    config.memory.db_path = str(tmp_path / "mem.db")
    assert config.multi_agent is False
    container = Container(config)
    container._llm_client = _MultiAgentLLM()
    await container.startup()
    try:
        runner = container.create_runner(config.multi_agent)
        assert isinstance(runner, AgentLoop)
        assert not isinstance(runner, Orchestrator)
    finally:
        await container.shutdown()
