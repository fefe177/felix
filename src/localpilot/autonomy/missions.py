"""Mission definitions and selector for the autonomous daemon.

Each mission is a named activity the daemon can choose: organising files,
researching and collecting knowledge, or working on code/projects.
:class:`MissionSelector` asks the LLM to pick the best mission given recent
task history.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import structlog

from localpilot.llm.messages import Message, Role
from localpilot.llm.parsing import first_json_value

if TYPE_CHECKING:
    from localpilot.llm.base import LLMClient

_logger = structlog.get_logger("localpilot.autonomy.missions")


@dataclass(frozen=True)
class Mission:
    """A named activity the daemon can pursue."""

    name: str
    description: str
    goal_hint: str


#: Built-in missions the daemon may choose from.
BUILTIN_MISSIONS: dict[str, Mission] = {
    "organize": Mission(
        name="organize",
        description=(
            "Tidy, sort and deduplicate files in the workspace. "
            "Maintain notes and a brief index of what is there."
        ),
        goal_hint=(
            "Choose a concrete file-organisation task in the workspace: "
            "rename, sort into sub-folders, delete duplicates, or update an index file."
        ),
    ),
    "research": Mission(
        name="research",
        description=(
            "Browse the web or read local notes to collect useful knowledge. "
            "Summarise findings into Markdown notes in the workspace."
        ),
        goal_hint=(
            "Choose a concrete research topic that would benefit the user's projects. "
            "Browse and write a short summary note in the workspace/research/ folder."
        ),
    ),
    "code": Mission(
        name="code",
        description=(
            "Work on a project in the workspace: improve code, write documentation, "
            "fix obvious bugs, or add small helpful features."
        ),
        goal_hint=(
            "Find a project in the workspace and choose one small, concrete improvement: "
            "fix a bug, add a docstring, refactor a function, or write a test."
        ),
    ),
}


class MissionSelector:
    """Asks the LLM to choose the next mission given recent task history."""

    def __init__(
        self,
        llm: LLMClient,
        allowed: list[str] | None = None,
    ) -> None:
        """Create a selector restricted to the given mission names (all by default)."""

        self._llm = llm
        self._allowed: list[str] = allowed or list(BUILTIN_MISSIONS)

    async def choose(self, recent_task_summaries: list[str]) -> Mission:
        """Ask the LLM which mission to run next; fall back to the first allowed one."""

        missions = [BUILTIN_MISSIONS[n] for n in self._allowed if n in BUILTIN_MISSIONS]
        if not missions:
            missions = list(BUILTIN_MISSIONS.values())

        options_text = "\n".join(f'- "{m.name}": {m.description}' for m in missions)
        recent_text = (
            "\n".join(f"- {s}" for s in recent_task_summaries[-5:])
            if recent_task_summaries
            else "(no previous tasks)"
        )
        prompt = (
            "You are an autonomous agent choosing your next mission.\n\n"
            f"Available missions:\n{options_text}\n\n"
            f"Recent tasks:\n{recent_text}\n\n"
            'Reply ONLY with a JSON object: {"mission": "<name>"}\n'
            "Choose the mission that is most useful right now."
        )
        try:
            response = await self._llm.chat(
                [
                    Message(role=Role.SYSTEM, content="Choose the next mission."),
                    Message(role=Role.USER, content=prompt),
                ]
            )
            parsed: Any = first_json_value(response.text)
            if isinstance(parsed, dict):
                name = str(parsed.get("mission", "")).strip()
                if name in BUILTIN_MISSIONS and name in self._allowed:
                    return BUILTIN_MISSIONS[name]
        except Exception:  # noqa: BLE001
            _logger.warning("mission_selector_fallback")
        return missions[0]
