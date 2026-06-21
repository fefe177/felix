"""Server runtime: the run manager, confirmation provider and shared context.

These objects live on ``app.state`` for the lifetime of the FastAPI app and tie
the HTTP/WebSocket layer to the agent:

* :class:`WebUIConfirmationProvider` - a :class:`ConfirmationProvider` whose
  ``confirm`` publishes a ``confirmation_request`` event and then waits for a
  decision delivered via ``POST /api/confirm``.
* :class:`AgentRunManager` - runs at most one agent run at a time as a background
  task, exposes its id and supports cooperative cancellation.
* :class:`DaemonManager` - starts and stops the :class:`AutonomousDaemon` as a
  background task; exactly one daemon may run at a time.
* :class:`ServerContext` - bundles the container, run manager, daemon manager
  and confirmation provider.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from localpilot.logging.setup import EventBus

if TYPE_CHECKING:
    from localpilot.container import Container


class RunConflictError(RuntimeError):
    """Raised when a run is requested while another is still active."""


class WebUIConfirmationProvider:
    """Confirmation provider backed by the HTTP ``/api/confirm`` endpoint."""

    def __init__(self, event_bus: EventBus) -> None:
        """Store the event bus used to announce pending confirmations."""

        self._event_bus = event_bus
        self._pending: asyncio.Future[bool] | None = None

    async def confirm(self, prompt: str) -> bool:
        """Publish a confirmation request and await the decision from the UI."""

        loop = asyncio.get_running_loop()
        future: asyncio.Future[bool] = loop.create_future()
        self._pending = future
        await self._event_bus.publish({"type": "confirmation_request", "prompt": prompt})
        try:
            return await future
        finally:
            self._pending = None

    def resolve(self, decision: bool) -> bool:
        """Resolve a pending confirmation; return ``True`` if one was waiting."""

        if self._pending is None or self._pending.done():
            return False
        self._pending.set_result(decision)
        return True


class DaemonManager:
    """Starts and stops the AutonomousDaemon as a background asyncio task."""

    def __init__(self, container: Container) -> None:
        """Store the container; the daemon is created lazily on first start."""

        self._container = container
        self._task: asyncio.Task[None] | None = None

    @property
    def active(self) -> bool:
        """Whether the daemon is currently running."""

        return self._task is not None and not self._task.done()

    async def start(self) -> bool:
        """Start the daemon in the background; return ``False`` if already running."""

        if self.active:
            return False
        daemon = self._container.create_daemon()
        self._daemon = daemon
        self._container.config.safety.mode = "autonomous"
        self._task = asyncio.create_task(daemon.run_forever())
        return True

    async def stop(self) -> bool:
        """Signal the daemon to stop and cancel the background task."""

        if not self.active or self._task is None:
            return False
        if hasattr(self, "_daemon"):
            self._daemon.request_stop()
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        return True

    async def shutdown(self) -> None:
        """Cancel the daemon on server shutdown."""

        await self.stop()


@dataclass
class ServerContext:
    """Shared, app-lifetime objects exposed to the routes via ``app.state``."""

    container: Container
    run_manager: AgentRunManager
    confirm_provider: WebUIConfirmationProvider
    daemon_manager: DaemonManager


class AgentRunManager:
    """Runs a single agent run in the background with cooperative cancellation."""

    def __init__(
        self, container: Container, confirmation_provider: WebUIConfirmationProvider
    ) -> None:
        """Store the container and the confirmation provider used for runs."""

        self._container = container
        self._confirm = confirmation_provider
        self._task: asyncio.Task[None] | None = None
        self._task_id: str | None = None

    @property
    def active(self) -> bool:
        """Whether a run is currently in progress."""

        return self._task is not None and not self._task.done()

    @property
    def current_task_id(self) -> str | None:
        """The id of the active run, or ``None`` if idle."""

        return self._task_id if self.active else None

    async def start(self, goal: str, safety_mode: str, multi_agent: bool) -> str:
        """Start a run in the background and return its task id.

        Raises:
            RunConflictError: If a run is already active.
        """

        if self.active:
            raise RunConflictError("Es laeuft bereits ein Agentenlauf.")
        runner = self._container.create_runner(multi_agent, self._confirm)
        queue = self._container.event_bus.subscribe()
        self._task = asyncio.create_task(self._run(runner, goal, safety_mode))
        try:
            self._task_id = await self._await_task_id(queue)
        finally:
            self._container.event_bus.unsubscribe(queue)
        return self._task_id

    async def _run(self, runner: Any, goal: str, safety_mode: str) -> None:
        """Execute the runner and publish a terminal event (except on cancel)."""

        try:
            result = await runner.run(goal, safety_mode)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - report any run failure as an event
            await self._container.event_bus.publish(
                {"type": "run_error", "task_id": self._task_id, "error": str(exc)}
            )
            return
        await self._container.event_bus.publish(
            {"type": "run_finished", "task_id": result.task_id, "status": result.status}
        )

    async def _await_task_id(self, queue: asyncio.Queue[Any], timeout: float = 15.0) -> str:
        """Wait for the run's start event to learn its task id."""

        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise RunConflictError("Der Agentenlauf wurde nicht rechtzeitig gestartet.")
            try:
                event = await asyncio.wait_for(queue.get(), timeout=remaining)
            except TimeoutError as exc:
                raise RunConflictError(
                    "Der Agentenlauf wurde nicht rechtzeitig gestartet."
                ) from exc
            if event.get("type") in {"agent_start", "orchestrator_start"}:
                return str(event["task_id"])
            if self._task is not None and self._task.done():
                exception = self._task.exception()
                if exception is not None:
                    raise exception
                raise RunConflictError("Der Lauf endete ohne Start-Ereignis.")

    async def cancel(self) -> bool:
        """Cancel the active run cooperatively; return whether one was cancelled."""

        if not self.active or self._task is None:
            return False
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        return True

    async def shutdown(self) -> None:
        """Cancel any active run (used during app shutdown)."""

        await self.cancel()
