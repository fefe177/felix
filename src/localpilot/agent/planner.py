"""The planner: turning a goal into a list of plan steps.

:class:`Planner` queries long-term memory for relevant strategies, asks the LLM
for a numbered step list and parses the result defensively (reusing the same
JSON extraction approach as the tool-call parser). If parsing yields nothing, it
falls back to a single generic step so the loop can always proceed.
"""

from __future__ import annotations

from typing import Any

from localpilot.agent.prompts import planner_prompt
from localpilot.agent.state import PlanStep
from localpilot.llm.base import LLMClient
from localpilot.llm.messages import Message, Role
from localpilot.llm.parsing import first_json_value
from localpilot.memory.long_term import LongTermMemory

#: Description used when the model fails to produce a usable plan.
_FALLBACK_DESCRIPTION = "Ziel direkt bearbeiten"


class Planner:
    """Builds an initial plan for a goal using the LLM and past strategies."""

    def __init__(self, llm_client: LLMClient) -> None:
        """Store the LLM client used for planning."""

        self._llm = llm_client

    async def make_plan(self, goal: str, memory: LongTermMemory) -> list[PlanStep]:
        """Return a plan for ``goal``, falling back to a single generic step."""

        strategies = await memory.find_strategies(goal[:80])
        known = [
            f"{strategy.pattern}: {strategy.description or ''} "
            f"(Erfolge {strategy.success_count}, Fehler {strategy.fail_count})"
            for strategy in strategies[:5]
        ]
        response = await self._llm.chat(
            [
                Message(role=Role.SYSTEM, content="Du bist ein praeziser Planer."),
                Message(role=Role.USER, content=planner_prompt(goal, known)),
            ]
        )
        steps = _parse_plan(response.text)
        if not steps:
            return [PlanStep(idx=0, description=_FALLBACK_DESCRIPTION)]
        return steps


def _parse_plan(text: str) -> list[PlanStep]:
    """Parse a planner response into ``PlanStep`` objects (best effort)."""

    value = first_json_value(text)
    items: list[Any] | None = None
    if isinstance(value, list):
        items = value
    elif isinstance(value, dict):
        for key in ("plan", "steps", "actions"):
            candidate = value.get(key)
            if isinstance(candidate, list):
                items = candidate
                break
    if not items:
        return []

    steps: list[PlanStep] = []
    for index, item in enumerate(items):
        if isinstance(item, dict):
            description = str(
                item.get("description") or item.get("step") or item.get("task") or ""
            ).strip()
        else:
            description = str(item).strip()
        if description:
            steps.append(PlanStep(idx=index, description=description))
    return steps
