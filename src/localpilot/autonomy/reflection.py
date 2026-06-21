"""Reflection and learning for the autonomous daemon.

After each task :func:`reflect` asks the LLM what worked and what to do
differently. The lesson is persisted as a strategy (reinforced on success,
penalised on failure) and as a timestamped journal entry stored in preferences.
"""

from __future__ import annotations

import datetime
from typing import TYPE_CHECKING, Any

import structlog

from localpilot.llm.messages import Message, Role
from localpilot.llm.parsing import first_json_value

if TYPE_CHECKING:
    from localpilot.agent.loop import AgentRunResult
    from localpilot.llm.base import LLMClient
    from localpilot.memory.long_term import LongTermMemory
    from localpilot.multiagent.orchestrator import OrchestratorResult

_logger = structlog.get_logger("localpilot.autonomy.reflection")


async def reflect(
    task_id: str,
    goal: str,
    result: AgentRunResult | OrchestratorResult,
    memory: LongTermMemory,
    llm: LLMClient,
) -> None:
    """Reflect on a completed task and persist the lesson.

    Asks the LLM for a structured reflection, then:
    - records/reinforces a strategy based on success or failure;
    - appends a timestamped journal entry as a preference key.
    """

    prompt = (
        f"Task: {goal}\n"
        f"Status: {result.status}\n"
        f"Summary: {result.summary}\n\n"
        "Briefly reflect on this task.\n"
        "Reply ONLY with JSON:\n"
        '{"worked": "<what went well>", '
        '"didnt_work": "<what did not work>", '
        '"lesson": "<one short lesson>", '
        '"next_hint": "<tip for the next similar task>"}'
    )
    reflection: dict[str, str] = {}
    try:
        response = await llm.chat(
            [
                Message(role=Role.SYSTEM, content="Reflect on the completed task."),
                Message(role=Role.USER, content=prompt),
            ]
        )
        parsed: Any = first_json_value(response.text)
        if isinstance(parsed, dict):
            reflection = {k: str(v) for k, v in parsed.items()}
    except Exception:  # noqa: BLE001
        _logger.warning("reflection_llm_failed", task_id=task_id)

    lesson = reflection.get("lesson", "").strip() or f"Task '{goal[:60]}': {result.status}"
    pattern = goal[:80]

    existing = await memory.find_strategies(pattern)
    if existing:
        if result.status == "completed":
            await memory.bump_strategy_success(existing[0].id)
        else:
            await memory.bump_strategy_fail(existing[0].id)
    else:
        await memory.record_strategy(pattern, lesson[:200])

    ts = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    journal_entry = (
        f"[{ts}] {goal[:80]} | {result.status} | {lesson[:150]}"
    )
    if reflection.get("next_hint"):
        journal_entry += f" | hint: {reflection['next_hint'][:100]}"
    await memory.set_preference(f"journal:{ts}", journal_entry)
    _logger.info("reflection_done", task_id=task_id, status=result.status, lesson=lesson[:80])
