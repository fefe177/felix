"""Tests for the memory system against a temporary SQLite file."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest_asyncio

from localpilot.config.schema import LLMConfig, MemoryConfig
from localpilot.memory.db import Database
from localpilot.memory.long_term import LongTermMemory
from localpilot.memory.short_term import ShortTermMemory
from localpilot.memory.vector import VectorMemory


@pytest_asyncio.fixture
async def ltm(tmp_path: Path) -> AsyncIterator[LongTermMemory]:
    """A LongTermMemory over a freshly-initialised temporary database."""

    db = Database(str(tmp_path / "memory.db"))
    await db.connect()
    await db.init_schema()
    try:
        yield LongTermMemory(db)
    finally:
        await db.close()


async def test_task_with_ordered_steps(ltm: LongTermMemory) -> None:
    task_id = await ltm.create_task(goal="Open the app", safety_mode="balanced")

    await ltm.add_step(
        task_id, 0, "think first", "file_write", {"path": "a.txt"}, {"ok": True}, True
    )
    await ltm.add_step(
        task_id, 1, "then this", "run_command", {"command": "echo hi"}, {"stdout": "hi"}, True
    )

    bundle = await ltm.get_task_with_steps(task_id)
    assert bundle is not None
    assert bundle["task"]["goal"] == "Open the app"
    assert bundle["task"]["safety_mode"] == "balanced"
    steps = bundle["steps"]
    assert [step["idx"] for step in steps] == [0, 1]
    assert steps[0]["tool"] == "file_write"
    assert steps[0]["arguments"] == {"path": "a.txt"}
    assert steps[1]["result"] == {"stdout": "hi"}
    assert steps[0]["ok"] is True


async def test_task_result_and_error(ltm: LongTermMemory) -> None:
    task_id = await ltm.create_task("goal", "safe")
    await ltm.set_task_result(task_id, "done")
    task = await ltm.get_task(task_id)
    assert task is not None
    assert task.result == "done"
    assert task.status == "completed"

    other = await ltm.create_task("g2", "safe")
    await ltm.set_task_error(other, "boom")
    failed = await ltm.get_task(other)
    assert failed is not None
    assert failed.error == "boom"
    assert failed.status == "failed"


async def test_preferences_roundtrip(ltm: LongTermMemory) -> None:
    assert await ltm.get_preference("missing") is None
    await ltm.set_preference("theme", "dark")
    await ltm.set_preference("lang", "de")
    assert await ltm.get_preference("theme") == "dark"

    # Updating an existing key overwrites it.
    await ltm.set_preference("theme", "light")
    assert await ltm.get_preference("theme") == "light"

    assert await ltm.all_preferences() == {"lang": "de", "theme": "light"}


async def test_strategies_sorted_by_success_rate(ltm: LongTermMemory) -> None:
    reliable = await ltm.record_strategy("login flow", "log in reliably")
    flaky = await ltm.record_strategy("login retry", "retry login")

    for _ in range(3):
        await ltm.bump_strategy_success(reliable)
    await ltm.bump_strategy_success(flaky)
    await ltm.bump_strategy_fail(flaky)

    results = await ltm.find_strategies("login")
    assert [record.id for record in results] == [reliable, flaky]
    assert results[0].success_rate == 1.0
    assert results[1].success_rate == 0.5

    # Non-matching query returns nothing.
    assert await ltm.find_strategies("logout") == []


async def test_log_error_is_retrievable(ltm: LongTermMemory) -> None:
    task_id = await ltm.create_task("goal", "balanced")
    step_id = await ltm.add_step(task_id, 0, None, "run_command", {}, None, False)
    await ltm.log_error(task_id, step_id, "ToolError", "it failed", "Traceback ...")

    errors = await ltm.get_errors(task_id)
    assert len(errors) == 1
    assert errors[0].kind == "ToolError"
    assert errors[0].message == "it failed"
    assert errors[0].step_id == step_id


async def test_recent_tasks_newest_first(ltm: LongTermMemory) -> None:
    first = await ltm.create_task("first", "safe")
    second = await ltm.create_task("second", "safe")
    recent = await ltm.get_recent_tasks(limit=10)
    ids = [task.id for task in recent]
    assert first in ids and second in ids
    assert len(recent) == 2


def test_short_term_respects_limit_and_summarises() -> None:
    stm = ShortTermMemory(max_history=3)
    stm.set_goal("Find the login button")
    stm.scratchpad["attempts"] = 2
    for index in range(5):
        stm.add_observation(f"observation {index}")
    stm.add_action_result("desktop_click", True, "clicked at (10, 20)")

    # History is bounded: only the last 3 entries are retained.
    assert len(stm.recent(10)) == 3

    text = stm.as_context_text()
    assert "Find the login button" in text
    assert "attempts=2" in text
    assert "observation 0" not in text  # evicted by the limit
    assert "desktop_click" in text
    assert text.count("- ") == 3


def test_vector_memory_disabled_is_noop() -> None:
    config = MemoryConfig(vector_enabled=False)
    vector = VectorMemory(Database(":memory:"), config, LLMConfig())
    assert vector.enabled is False
    assert vector.available is False
    assert "deaktiviert" in vector.status().lower()


async def test_vector_memory_disabled_methods_are_safe() -> None:
    config = MemoryConfig(vector_enabled=False)
    vector = VectorMemory(Database(":memory:"), config, LLMConfig())
    assert await vector.add("hello") is None
    assert await vector.search("hello") == []
