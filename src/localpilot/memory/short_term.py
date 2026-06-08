"""In-memory, per-task working memory.

:class:`ShortTermMemory` holds the current goal, a bounded history of
observations and action results, and a free-form scratchpad. It renders a
compact textual summary (:meth:`as_context_text`) suitable for inclusion in an
LLM prompt. It is transient and not persisted.
"""

from __future__ import annotations

from collections import deque
from typing import Any

#: Default maximum number of history entries retained.
DEFAULT_MAX_HISTORY = 20


class ShortTermMemory:
    """Bounded, in-process working memory for a single task."""

    def __init__(self, max_history: int = DEFAULT_MAX_HISTORY) -> None:
        """Create empty working memory with a bounded history length."""

        self._goal = ""
        self._history: deque[dict[str, Any]] = deque(maxlen=max_history)
        self.scratchpad: dict[str, Any] = {}

    @property
    def goal(self) -> str:
        """The current task goal."""

        return self._goal

    def set_goal(self, goal: str) -> None:
        """Set the current task goal."""

        self._goal = goal

    def add_observation(self, observation: str) -> None:
        """Record an observation (e.g. a perception or tool output summary)."""

        self._history.append({"type": "observation", "content": observation})

    def add_action_result(self, tool: str, ok: bool, summary: str) -> None:
        """Record the outcome of an action (a tool invocation)."""

        self._history.append({"type": "action", "tool": tool, "ok": ok, "summary": summary})

    def recent(self, n: int) -> list[dict[str, Any]]:
        """Return the ``n`` most recent history entries (empty if ``n <= 0``)."""

        if n <= 0:
            return []
        return list(self._history)[-n:]

    def as_context_text(self) -> str:
        """Render a compact summary of goal, scratchpad and recent history.

        The history is naturally bounded by ``max_history``, so the summary
        never grows without limit.
        """

        lines: list[str] = [f"Ziel: {self._goal}" if self._goal else "Ziel: (nicht gesetzt)"]
        if self.scratchpad:
            notes = ", ".join(f"{key}={value}" for key, value in self.scratchpad.items())
            lines.append(f"Notizen: {notes}")
        lines.append("Verlauf:")
        if not self._history:
            lines.append("- (leer)")
        for entry in self._history:
            if entry["type"] == "observation":
                lines.append(f"- Beobachtung: {entry['content']}")
            else:
                status = "ok" if entry["ok"] else "fehlgeschlagen"
                lines.append(f"- Aktion {entry['tool']} ({status}): {entry['summary']}")
        return "\n".join(lines)
