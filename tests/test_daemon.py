"""Tests for the autonomous daemon (Phase 11).

All tests use a mock LLM (no network) and a temporary SQLite database.
Verified behaviours:
- STOP sentinel file halts the daemon before the next task.
- Per-hour rate limit caps the number of tasks that are run.
- Reflection after a completed task writes a strategy to memory.
- Back-off kicks in after max_consecutive_failures in a row.
- run_once respects a forced mission name.
- MissionSelector falls back to the first allowed mission on LLM parse error.
- GoalGenerator falls back to the built-in goal on LLM parse error.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from localpilot.agent.loop import AgentRunResult
from localpilot.agent.state import AgentState
from localpilot.autonomy.daemon import AutonomousDaemon
from localpilot.autonomy.goalgen import GoalGenerator
from localpilot.autonomy.missions import BUILTIN_MISSIONS, MissionSelector
from localpilot.autonomy.reflection import reflect
from localpilot.config.schema import AppConfig
from localpilot.container import Container
from localpilot.llm.base import LLMResponse
from localpilot.llm.messages import Message

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


class _FinishLLM:
    """Scripted LLM: every think call returns a finish tool call."""

    def __init__(self, finish_summary: str = "erledigt") -> None:
        self._summary = finish_summary
        # planner + verify + think responses
        self._responses: dict[str, str] = {}

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        **_: Any,
    ) -> LLMResponse:
        from localpilot.agent.prompts import PLANNER_MARKER, VERIFY_MARKER

        text = "\n".join(
            m.content if isinstance(m.content, str) else "" for m in messages
        )
        if PLANNER_MARKER in text:
            return LLMResponse(text='[{"idx": 0, "description": "do it"}]')
        if VERIFY_MARKER in text:
            return LLMResponse(text='{"success": true, "reason": "ok", "next_hint": ""}')
        return LLMResponse(
            text=f'{{"tool": "finish", "arguments": {{"summary": "{self._summary}"}}}}'
        )


class _MissionGoalLLM(_FinishLLM):
    """Extends _FinishLLM to handle mission-selector and goal-gen prompts."""

    def __init__(
        self,
        mission: str = "organize",
        goal: str = "test goal",
        finish_summary: str = "erledigt",
    ) -> None:
        super().__init__(finish_summary)
        self._mission = mission
        self._goal = goal

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        **_: Any,
    ) -> LLMResponse:
        combined = "\n".join(
            m.content if isinstance(m.content, str) else "" for m in messages
        )
        if "Available missions" in combined or "Waehle die naechste Mission" in combined:
            return LLMResponse(text=f'{{"mission": "{self._mission}"}}')
        if "Propose EXACTLY ONE" in combined or "Formuliere EIN" in combined:
            return LLMResponse(text=f'{{"goal": "{self._goal}"}}')
        if "Reflect on the completed" in combined or "Reflektiere" in combined:
            return LLMResponse(
                text='{"worked": "ok", "didnt_work": "", "lesson": "test lesson", "next_hint": ""}'
            )
        return await super().chat(messages, tools)


async def _make_container(tmp_path: Path, llm: Any | None = None) -> Container:
    config = AppConfig()
    config.terminal.workdir = str(tmp_path)
    config.memory.db_path = str(tmp_path / "test.db")
    config.daemon.mission_root = str(tmp_path)
    config.daemon.stop_file = str(tmp_path / "STOP")
    config.daemon.idle_interval_s = 0  # no sleep in tests
    config.daemon.reflect = True
    container = Container(config)
    if llm is not None:
        container._llm_client = llm  # inject mock
    await container.startup()
    return container


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_once_completes_task(tmp_path: Path) -> None:
    """run_once returns a completed AgentRunResult with the mock LLM."""

    llm = _MissionGoalLLM(goal="organise the workspace")
    container = await _make_container(tmp_path, llm)
    try:
        d = container.create_daemon()
        result = await d.run_once()
        assert result is not None
        assert result.status == "completed"
    finally:
        await container.shutdown()


@pytest.mark.asyncio
async def test_stop_file_prevents_run(tmp_path: Path) -> None:
    """run_once returns None immediately when the STOP file exists."""

    container = await _make_container(tmp_path, _MissionGoalLLM())
    stop = Path(container.config.daemon.stop_file)
    stop.touch()
    try:
        d = container.create_daemon()
        result = await d.run_once()
        assert result is None
    finally:
        stop.unlink(missing_ok=True)
        await container.shutdown()


@pytest.mark.asyncio
async def test_rate_limit_caps_tasks(tmp_path: Path) -> None:
    """After max_tasks_per_hour tasks the daemon enters rate-limited mode."""

    llm = _MissionGoalLLM()
    container = await _make_container(tmp_path, llm)
    container.config.daemon.max_tasks_per_hour = 2
    try:
        d = container.create_daemon()
        # Run the limit.
        for _ in range(2):
            await d.run_once()
        # Now the daemon should be rate-limited.
        assert d._rate_limited()
    finally:
        await container.shutdown()


@pytest.mark.asyncio
async def test_reflection_writes_strategy(tmp_path: Path) -> None:
    """After a completed task reflection persists a strategy and a journal entry."""

    llm = _MissionGoalLLM(goal="improve the docs")
    container = await _make_container(tmp_path, llm)
    try:
        state = AgentState(task_id="t1", goal="improve the docs", safety_mode="autonomous")
        fake_result = AgentRunResult(
            task_id="t1",
            status="completed",
            summary="docs improved",
            state=state,
        )
        await reflect("t1", "improve the docs", fake_result, container.memory, llm)

        strategies = await container.memory.find_strategies("improve the docs")
        assert len(strategies) >= 1

        prefs = await container.memory.all_preferences()
        journal_keys = [k for k in prefs if k.startswith("journal:")]
        assert journal_keys, "Expected at least one journal entry"
    finally:
        await container.shutdown()


@pytest.mark.asyncio
async def test_backoff_after_consecutive_failures(tmp_path: Path) -> None:
    """Consecutive failures increment the counter, triggering back-off state."""

    class _FailLLM(_MissionGoalLLM):
        async def chat(self, messages: list[Message], **kwargs: Any) -> LLMResponse:
            combined = "\n".join(
                m.content if isinstance(m.content, str) else "" for m in messages
            )
            if "Available missions" in combined:
                return LLMResponse(text='{"mission": "organize"}')
            if "Propose EXACTLY ONE" in combined:
                return LLMResponse(text='{"goal": "do something"}')
            if "Reflect" in combined or "Reflektiere" in combined:
                return LLMResponse(
                    text='{"worked":"","didnt_work":"all","lesson":"fail","next_hint":""}'
                )
            from localpilot.agent.prompts import PLANNER_MARKER, VERIFY_MARKER

            if PLANNER_MARKER in combined:
                return LLMResponse(text='[{"idx": 0, "description": "step"}]')
            if VERIFY_MARKER in combined:
                return LLMResponse(text='{"success": false, "reason": "fail", "next_hint": ""}')
            # Never finish → loop exhausts max_iterations → status=failed
            return LLMResponse(text='{"tool": "file_list", "arguments": {"path": "."}}')

    container = await _make_container(tmp_path, _FailLLM())
    container.config.agent.max_iterations = 2
    container.config.daemon.max_consecutive_failures = 2
    try:
        d = container.create_daemon()
        # Two failing tasks.
        for _ in range(2):
            result = await d.run_once()
            assert result is not None
            assert result.status == "failed"
        # Back-off should now be triggered on the next loop iteration.
        assert d._consecutive_failures >= 2
    finally:
        await container.shutdown()


@pytest.mark.asyncio
async def test_forced_mission_name(tmp_path: Path) -> None:
    """run_once with mission_name='research' uses the research mission."""

    events: list[dict[str, Any]] = []
    llm = _MissionGoalLLM(mission="organize", goal="research something")
    container = await _make_container(tmp_path, llm)
    try:
        d = AutonomousDaemon(container, on_event=events.append)
        result = await d.run_once(mission_name="research")
        assert result is not None
        picks = [e for e in events if e["type"] == "daemon_pick"]
        assert picks, "Expected a daemon_pick event"
        assert picks[0]["mission"] == "research"
    finally:
        await container.shutdown()


@pytest.mark.asyncio
async def test_mission_selector_fallback_on_bad_json(tmp_path: Path) -> None:
    """MissionSelector returns the first allowed mission when the LLM returns garbage."""

    class _BadLLM:
        async def chat(self, messages: list[Message], **_: Any) -> LLMResponse:
            return LLMResponse(text="not json at all")

    selector = MissionSelector(_BadLLM(), ["research", "code"])  # type: ignore[arg-type]
    mission = await selector.choose([])
    assert mission.name == "research"


@pytest.mark.asyncio
async def test_goal_generator_fallback_on_bad_json(tmp_path: Path) -> None:
    """GoalGenerator returns the built-in fallback when the LLM returns garbage."""

    class _BadLLM:
        async def chat(self, messages: list[Message], **_: Any) -> LLMResponse:
            return LLMResponse(text="definitely not json")

    container = await _make_container(tmp_path, _BadLLM())
    try:
        gen = GoalGenerator(_BadLLM(), str(tmp_path))  # type: ignore[arg-type]
        goal = await gen.next_goal(BUILTIN_MISSIONS["organize"], container.memory)
        # Should return a non-empty fallback string.
        assert len(goal) > 10
    finally:
        await container.shutdown()


@pytest.mark.asyncio
async def test_daemon_config_defaults() -> None:
    """DaemonConfig has the expected defaults."""

    from localpilot.config.schema import DaemonConfig

    cfg = DaemonConfig()
    assert cfg.idle_interval_s == 60
    assert cfg.max_tasks_per_hour == 20
    assert cfg.max_consecutive_failures == 5
    assert "organize" in cfg.missions
    assert cfg.reflect is True
    assert cfg.research_browser is True
