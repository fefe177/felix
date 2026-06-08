"""The agent's working state for a single run.

:class:`AgentState` bundles everything that evolves during a run: the goal, the
plan (a list of :class:`PlanStep`), where the agent is in that plan, a compact
action history, a free-form scratchpad and the overall status. It is a Pydantic
model so it can be serialised for events and persistence.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PlanStep(BaseModel):
    """One step of the agent's plan."""

    idx: int
    description: str
    done: bool = False
    notes: str = ""


class AgentState(BaseModel):
    """Mutable state for one agent run."""

    task_id: str
    goal: str
    safety_mode: str
    plan: list[PlanStep] = Field(default_factory=list)
    current_step_index: int = 0
    history: list[dict[str, Any]] = Field(default_factory=list)
    status: str = "running"
    scratchpad: dict[str, Any] = Field(default_factory=dict)

    def current_step(self) -> PlanStep | None:
        """Return the plan step currently in focus, or ``None`` if past the end."""

        if 0 <= self.current_step_index < len(self.plan):
            return self.plan[self.current_step_index]
        return None

    def advance(self) -> None:
        """Move the focus to the next plan step (clamped to the plan length)."""

        self.current_step_index = min(self.current_step_index + 1, len(self.plan))
