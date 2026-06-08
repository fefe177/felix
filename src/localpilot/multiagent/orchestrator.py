"""The multi-agent orchestrator.

The :class:`Orchestrator` coordinates role-specialised agents over one shared
plan, long-term memory, short-term memory and event bus. It does **not**
re-implement any tool or reasoning logic: each step is executed by a reused
:class:`~localpilot.agent.loop.AgentLoop` configured with the chosen role's
prompt suffix and restricted tool set.

Flow:

1. The planner role produces the plan (via :class:`~localpilot.agent.planner.Planner`).
2. For each step the orchestrator picks a role (research keywords -> research,
   otherwise executor) and runs it.
3. If a step fails, the debug role analyses it, its hint is fed into a bounded
   number of executor retries.

Every role switch is published on the event bus so a future GUI can show it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from localpilot.agent.loop import AgentLoop, AgentRunResult
from localpilot.agent.planner import Planner
from localpilot.agent.safety import ConfirmationProvider
from localpilot.agent.state import AgentState, PlanStep
from localpilot.memory.short_term import ShortTermMemory
from localpilot.multiagent.roles import (
    AgentRole,
    DebugAgent,
    ExecutorAgent,
    PlannerAgent,
    ResearchAgent,
)
from localpilot.tools import ToolManager, get_builtin_tools

if TYPE_CHECKING:
    from localpilot.container import Container

#: Keywords in a step description that route it to the research role.
_RESEARCH_KEYWORDS = (
    "recherch",
    "suche",
    "such ",
    "browser",
    "web",
    "internet",
    "google",
    "information",
    "finde heraus",
    "nachschlagen",
    "website",
    "online",
)


@dataclass
class OrchestratorResult:
    """The outcome of a multi-agent run (mirrors ``AgentRunResult`` fields)."""

    task_id: str
    status: str
    summary: str
    state: AgentState
    question: str | None = None


class Orchestrator:
    """Coordinates role-specialised agents over one shared plan."""

    def __init__(
        self,
        container: Container,
        confirmation_provider: ConfirmationProvider | None = None,
        *,
        max_retries: int = 2,
    ) -> None:
        """Wire shared services from ``container`` and instantiate the roles."""

        self._container = container
        self._confirm = confirmation_provider
        self._llm = container.llm_client
        self._memory = container.memory
        self._event_bus = container.event_bus
        self._logger = container.logger
        self._config = container.config
        self._planner = Planner(self._llm)
        self._planner_role = PlannerAgent()
        self._executor = ExecutorAgent()
        self._research = ResearchAgent()
        self._debug = DebugAgent()
        self._max_retries = max_retries

    async def run(self, goal: str, safety_mode: str) -> OrchestratorResult:
        """Plan the goal and drive each step through the appropriate role."""

        self._config.safety.mode = safety_mode  # type: ignore[assignment]
        task_id = await self._memory.create_task(goal, safety_mode)
        state = AgentState(task_id=task_id, goal=goal, safety_mode=safety_mode)
        short_term = ShortTermMemory()
        short_term.set_goal(goal)
        await self._emit("orchestrator_start", task_id=task_id, goal=goal, safety_mode=safety_mode)

        await self._emit("role_switch", task_id=task_id, role=self._planner_role.name, phase="plan")
        state.plan = await self._planner.make_plan(goal, self._memory)
        await self._emit(
            "orchestrator_plan", task_id=task_id, plan=[step.model_dump() for step in state.plan]
        )

        for step in state.plan:
            role = self._choose_role(step)
            await self._emit("role_switch", task_id=task_id, step=step.idx, role=role.name)
            outcome = await self._execute_step(step, role, safety_mode, short_term)
            if outcome.status != "completed":
                outcome = await self._recover(task_id, step, safety_mode, short_term, outcome)
            step.done = outcome.status == "completed"
            short_term.add_observation(
                f"Schritt {step.idx} ({role.name}) -> {outcome.status}: {outcome.summary}"
            )

        return await self._finalise(task_id, state)

    async def _finalise(self, task_id: str, state: AgentState) -> OrchestratorResult:
        """Set the final task status from whether every step completed."""

        if all(step.done for step in state.plan):
            summary = "Alle Plan-Schritte wurden erfolgreich abgeschlossen."
            state.status = "completed"
            await self._memory.set_task_result(task_id, summary)
        else:
            done = sum(step.done for step in state.plan)
            summary = f"Nur {done}/{len(state.plan)} Schritte abgeschlossen."
            state.status = "failed"
            await self._memory.set_task_error(task_id, summary)
        await self._emit("orchestrator_finish", task_id=task_id, status=state.status)
        return OrchestratorResult(task_id, state.status, summary, state)

    async def _execute_step(
        self,
        step: PlanStep,
        role: AgentRole,
        safety_mode: str,
        short_term: ShortTermMemory,
        hint: str = "",
    ) -> AgentRunResult:
        """Run one plan step via a reused AgentLoop configured for ``role``."""

        loop = AgentLoop(
            self._container,
            self._confirm,
            tool_manager=self._role_tools(role),
            system_prompt_suffix=role.system_suffix(),
            enable_planning=False,
            short_term=short_term,
        )
        subgoal = step.description if not hint else f"{step.description}\nDebug-Hinweis: {hint}"
        return await loop.run(subgoal, safety_mode)

    async def _recover(
        self,
        task_id: str,
        step: PlanStep,
        safety_mode: str,
        short_term: ShortTermMemory,
        failed: AgentRunResult,
    ) -> AgentRunResult:
        """Run the debug role, then retry the step with the executor (bounded)."""

        last_status = failed.summary
        for attempt in range(self._max_retries):
            await self._emit(
                "role_switch",
                task_id=task_id,
                step=step.idx,
                role=self._debug.name,
                attempt=attempt,
            )
            debug_goal = (
                f"Analysiere den Fehler bei Schritt '{step.description}'. "
                f"Letzter Status: {last_status}. Nenne eine kurze, konkrete Korrektur."
            )
            debug_result = await self._execute_role_goal(
                self._debug, debug_goal, safety_mode, short_term
            )
            hint = debug_result.summary or "Versuche es erneut."
            await self._emit("debug_hint", task_id=task_id, step=step.idx, hint=hint)

            await self._emit(
                "role_switch",
                task_id=task_id,
                step=step.idx,
                role=self._executor.name,
                attempt=attempt,
            )
            retry = await self._execute_step(
                step, self._executor, safety_mode, short_term, hint=hint
            )
            if retry.status == "completed":
                return retry
            last_status = retry.summary
        return failed

    async def _execute_role_goal(
        self, role: AgentRole, goal: str, safety_mode: str, short_term: ShortTermMemory
    ) -> AgentRunResult:
        """Run an arbitrary sub-goal under ``role`` (used by the debug phase)."""

        loop = AgentLoop(
            self._container,
            self._confirm,
            tool_manager=self._role_tools(role),
            system_prompt_suffix=role.system_suffix(),
            enable_planning=False,
            short_term=short_term,
        )
        return await loop.run(goal, safety_mode)

    def _choose_role(self, step: PlanStep) -> AgentRole:
        """Pick the research role for research-flavoured steps, else the executor."""

        text = step.description.lower()
        if any(keyword in text for keyword in _RESEARCH_KEYWORDS):
            return self._research
        return self._executor

    def _role_tools(self, role: AgentRole) -> ToolManager:
        """Build a tool manager restricted to the tools the role may use."""

        return ToolManager([tool for tool in get_builtin_tools() if role.allows(tool.name)])

    async def _emit(self, event_type: str, **fields: Any) -> None:
        """Log and publish an orchestrator event on the event bus."""

        self._logger.info(event_type, **fields)
        await self._event_bus.publish({"type": event_type, **fields})
