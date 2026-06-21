"""Autonomous daemon: the self-directed, long-running agent loop.

:class:`AutonomousDaemon` wraps the existing :class:`~localpilot.agent.loop.AgentLoop`
in continuous-run mode. On every cycle it:

1. Checks the STOP sentinel file and an internal stop event.
2. Enforces a per-hour rate limit and a consecutive-failure back-off.
3. Lets :class:`~localpilot.autonomy.missions.MissionSelector` (LLM) choose the
   next mission.
4. Lets :class:`~localpilot.autonomy.goalgen.GoalGenerator` (LLM) propose a
   concrete goal.
5. Runs the :class:`~localpilot.agent.loop.AgentLoop` in ``autonomous`` mode
   (no confirmation provider, so no prompts).
6. Optionally calls :func:`~localpilot.autonomy.reflection.reflect` to learn.
7. Sleeps for ``idle_interval_s`` before the next cycle.

Safety features always active (even in autonomous mode):

- STOP sentinel file: create ``<stop_file>`` to halt the daemon gracefully.
- Hard command blocklist: enforced by :class:`~localpilot.agent.safety.SafetyGate`.
- Write restriction to ``mission_root``: enforced by the safety gate.
- Rate limit: at most ``max_tasks_per_hour`` tasks per rolling hour.
- Failure back-off: pause after ``max_consecutive_failures`` failures in a row.
- Per-task bounds: ``agent.max_iterations`` caps each task.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any

import structlog

from localpilot.agent.loop import AgentRunResult
from localpilot.autonomy.goalgen import GoalGenerator
from localpilot.autonomy.missions import BUILTIN_MISSIONS, MissionSelector
from localpilot.autonomy.reflection import reflect
from localpilot.multiagent.orchestrator import OrchestratorResult

if TYPE_CHECKING:
    from localpilot.container import Container

#: Union of the two possible run result types.
AnyRunResult = AgentRunResult | OrchestratorResult

_logger = structlog.get_logger("localpilot.autonomy.daemon")


class AutonomousDaemon:
    """Self-directed, long-running daemon that picks and executes its own goals."""

    def __init__(
        self,
        container: Container,
        *,
        on_event: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        """Wire the daemon from the container.

        Args:
            container: The application DI container (must be started).
            on_event: Optional synchronous callback called for every daemon event.
        """

        cfg = container.config.daemon
        self._container = container
        self._cfg = cfg
        self._memory = container.memory
        self._llm = container.llm_client
        self._event_bus = container.event_bus
        self._on_event = on_event
        self._stop_event = asyncio.Event()

        # Timestamps (monotonic) of task completions in the last hour.
        self._task_timestamps: deque[float] = deque()
        self._consecutive_failures = 0

        self._selector = MissionSelector(self._llm, list(cfg.missions) or None)
        self._goalgen = GoalGenerator(self._llm, cfg.mission_root)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run_forever(self) -> None:
        """Run missions continuously until a stop condition is met."""

        _logger.info("daemon_start", mission_root=self._cfg.mission_root)
        await self._emit("daemon_start", mission_root=self._cfg.mission_root)

        while not self._should_stop():
            if self._consecutive_failures >= self._cfg.max_consecutive_failures:
                _logger.warning(
                    "daemon_backoff", consecutive_failures=self._consecutive_failures
                )
                await self._emit("daemon_backoff", failures=self._consecutive_failures)
                self._consecutive_failures = 0
                await self._interruptible_sleep(self._cfg.idle_interval_s * 5)
                continue

            if self._rate_limited():
                await self._interruptible_sleep(30)
                continue

            result = await self.run_once()
            if result is not None:
                await self._interruptible_sleep(self._cfg.idle_interval_s)

        _logger.info("daemon_stop")
        await self._emit("daemon_stop")

    async def run_once(self, mission_name: str | None = None) -> AnyRunResult | None:
        """Run one mission cycle and return the result.

        Args:
            mission_name: Force a specific mission; ``None`` lets the LLM choose.

        Returns:
            The :class:`~localpilot.agent.loop.AgentRunResult`, or ``None`` when
            the daemon was stopped before the task could start.
        """

        if self._should_stop():
            return None

        recent = await self._memory.get_recent_tasks(10)
        recent_summaries = [f"{t.goal} ({t.status})" for t in recent]

        if mission_name and mission_name in BUILTIN_MISSIONS:
            mission = BUILTIN_MISSIONS[mission_name]
        else:
            mission = await self._selector.choose(recent_summaries)

        goal = await self._goalgen.next_goal(mission, self._memory)
        _logger.info("daemon_pick", mission=mission.name, goal=goal)
        await self._emit("daemon_pick", mission=mission.name, goal=goal)

        runner = self._container.create_runner(
            multi_agent=self._container.config.multi_agent,
            confirmation_provider=None,  # autonomous: no per-action prompts
        )
        try:
            result = await runner.run(goal, "autonomous")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            _logger.error("daemon_task_error", error=str(exc))
            await self._emit("daemon_task_error", error=str(exc))
            self._consecutive_failures += 1
            return None

        self._record_outcome(result)

        if self._cfg.reflect:
            try:
                await reflect(result.task_id, goal, result, self._memory, self._llm)
            except Exception as exc:  # noqa: BLE001
                _logger.warning("daemon_reflect_error", error=str(exc))

        await self._emit(
            "daemon_task_done",
            task_id=result.task_id,
            mission=mission.name,
            goal=goal,
            status=result.status,
        )
        return result

    def request_stop(self) -> None:
        """Signal the daemon to stop after the current task finishes."""

        self._stop_event.set()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _should_stop(self) -> bool:
        """Return ``True`` if the STOP file exists or a stop was requested."""

        if self._stop_event.is_set():
            return True
        stop_path = Path(self._cfg.stop_file).expanduser().resolve()
        return stop_path.exists()

    def _rate_limited(self) -> bool:
        """Return ``True`` if adding another task would exceed the hourly cap."""

        now = time.monotonic()
        cutoff = now - 3600.0
        while self._task_timestamps and self._task_timestamps[0] < cutoff:
            self._task_timestamps.popleft()
        return len(self._task_timestamps) >= self._cfg.max_tasks_per_hour

    def _record_outcome(self, result: AnyRunResult) -> None:
        """Update the rate-limit ring buffer and failure streak counter."""

        self._task_timestamps.append(time.monotonic())
        if result.status == "completed":
            self._consecutive_failures = 0
        else:
            self._consecutive_failures += 1

    async def _interruptible_sleep(self, seconds: float) -> None:
        """Sleep in small chunks so STOP checks remain responsive."""

        deadline = time.monotonic() + seconds
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or self._should_stop():
                return
            await asyncio.sleep(min(5.0, remaining))

    async def _emit(self, event_type: str, **fields: Any) -> None:
        """Publish a daemon event on the bus and optionally invoke the callback."""

        event = {"type": event_type, **fields}
        await self._event_bus.publish(event)
        if self._on_event is not None:
            self._on_event(event)
