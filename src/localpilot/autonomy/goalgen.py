"""Goal generation for the autonomous daemon.

:class:`GoalGenerator` asks the LLM to propose one concrete, safe goal for the
current mission, using recent task history and stored strategies to avoid
repeating itself.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog

from localpilot.llm.messages import Message, Role
from localpilot.llm.parsing import first_json_value

if TYPE_CHECKING:
    from localpilot.autonomy.missions import Mission
    from localpilot.llm.base import LLMClient
    from localpilot.memory.long_term import LongTermMemory

_logger = structlog.get_logger("localpilot.autonomy.goalgen")

#: Safe fallback goals per mission, used when the LLM fails.
_FALLBACK_GOALS: dict[str, str] = {
    "organize": (
        "List all files in the workspace and create or update an INDEX.md that "
        "briefly describes each file or folder."
    ),
    "research": (
        "Write a short note about a useful Python library into "
        "workspace/research/notes.md."
    ),
    "code": (
        "Find a Python file in the workspace and add or improve its module "
        "docstring."
    ),
}


class GoalGenerator:
    """Generates one concrete autonomous goal per mission cycle."""

    def __init__(self, llm: LLMClient, mission_root: str) -> None:
        """Store the LLM client and the sandbox root path."""

        self._llm = llm
        self._mission_root = mission_root

    async def next_goal(self, mission: Mission, memory: LongTermMemory) -> str:
        """Propose the next concrete goal; return a safe fallback on LLM error."""

        recent = await memory.get_recent_tasks(10)
        recent_text = (
            "\n".join(f"- {t.goal}" for t in recent)
            if recent
            else "(no previous goals)"
        )
        strategies = await memory.find_strategies("")
        strat_text = (
            "\n".join(
                f"- {s.pattern[:60]}: successes={s.success_count}, failures={s.fail_count}"
                for s in strategies[:5]
            )
            if strategies
            else "(no strategies yet)"
        )
        prompt = (
            f"You are an autonomous agent with mission '{mission.name}'.\n"
            f"Description: {mission.description}\n\n"
            f"Sandbox directory: {self._mission_root}\n\n"
            f"Recent goals (do NOT repeat these):\n{recent_text}\n\n"
            f"Known strategies:\n{strat_text}\n\n"
            f"Hint: {mission.goal_hint}\n\n"
            "Propose EXACTLY ONE concrete, safe goal for this mission. "
            "It must be achievable inside the sandbox directory and must not "
            "modify anything outside it.\n"
            'Reply ONLY with: {"goal": "<concrete goal>"}'
        )
        try:
            response = await self._llm.chat(
                [
                    Message(role=Role.SYSTEM, content="Propose an autonomous goal."),
                    Message(role=Role.USER, content=prompt),
                ]
            )
            parsed: Any = first_json_value(response.text)
            if isinstance(parsed, dict):
                goal = str(parsed.get("goal", "")).strip()
                if len(goal) > 5:
                    return goal
        except Exception:  # noqa: BLE001
            _logger.warning("goalgen_fallback", mission=mission.name)
        return _FALLBACK_GOALS.get(
            mission.name,
            f"Carry out a useful task for mission '{mission.name}'.",
        )
