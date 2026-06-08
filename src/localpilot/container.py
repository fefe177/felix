"""A small dependency container for LocalPilot.

The :class:`Container` owns the validated :class:`AppConfig` and lazily
constructs shared, cross-cutting services. In Phase 0 the only services are the
structured logger and the in-process :class:`EventBus`; later phases will add
lazy properties for the LLM client, tool registry, memory store and so on.

Lazy initialisation is done with plain attributes — no external dependency
injection framework is used.
"""

from __future__ import annotations

from pathlib import Path

import structlog

from localpilot.agent.loop import AgentLoop
from localpilot.agent.safety import ConfirmationProvider, SafetyGate
from localpilot.browser.controller import BrowserController
from localpilot.config.schema import AppConfig
from localpilot.desktop.controller import DesktopController
from localpilot.llm.base import LLMClient
from localpilot.llm.openai_compatible import OpenAICompatibleClient
from localpilot.logging.setup import EventBus
from localpilot.memory.db import Database
from localpilot.memory.long_term import LongTermMemory
from localpilot.multiagent.orchestrator import Orchestrator
from localpilot.tools import ToolContext, ToolManager, get_builtin_tools


class Container:
    """Holds application configuration and lazily created shared services."""

    def __init__(self, config: AppConfig) -> None:
        """Create a container around an already-validated configuration."""

        self._config = config
        self._logger: structlog.stdlib.BoundLogger | None = None
        self._event_bus: EventBus | None = None
        self._llm_client: LLMClient | None = None
        self._tool_manager: ToolManager | None = None
        self._tool_context: ToolContext | None = None
        self._browser_controller: BrowserController | None = None
        self._desktop_controller: DesktopController | None = None
        self._database: Database | None = None
        self._memory: LongTermMemory | None = None
        self._safety_gate: SafetyGate | None = None

    @property
    def config(self) -> AppConfig:
        """The validated application configuration."""

        return self._config

    @property
    def logger(self) -> structlog.stdlib.BoundLogger:
        """A lazily created structlog logger bound to the application name."""

        if self._logger is None:
            self._logger = structlog.get_logger("localpilot")
        return self._logger

    @property
    def event_bus(self) -> EventBus:
        """The lazily created in-process event bus."""

        if self._event_bus is None:
            self._event_bus = EventBus()
        return self._event_bus

    @property
    def llm_client(self) -> LLMClient:
        """The lazily created LLM client, built from ``config.llm``."""

        if self._llm_client is None:
            self._llm_client = OpenAICompatibleClient(self._config.llm)
        return self._llm_client

    @property
    def browser_controller(self) -> BrowserController:
        """The lazily created browser controller (started on first use)."""

        if self._browser_controller is None:
            self._browser_controller = BrowserController(self._config.browser)
        return self._browser_controller

    @property
    def desktop_controller(self) -> DesktopController:
        """The lazily created desktop controller (backends imported on first use)."""

        if self._desktop_controller is None:
            self._desktop_controller = DesktopController(self._config.desktop)
        return self._desktop_controller

    @property
    def safety_gate(self) -> SafetyGate:
        """The lazily created safety gate enforcing the configured safety mode."""

        if self._safety_gate is None:
            self._safety_gate = SafetyGate(self._config)
        return self._safety_gate

    @property
    def tool_manager(self) -> ToolManager:
        """The lazily created tool manager holding the built-in tools."""

        if self._tool_manager is None:
            self._tool_manager = ToolManager(get_builtin_tools())
        return self._tool_manager

    @property
    def tool_context(self) -> ToolContext:
        """The lazily created tool context, built from the configuration.

        The working directory (from ``config.terminal.workdir``) is resolved and
        created if missing so tools and subprocesses have a valid ``cwd``. The
        browser and desktop controllers and the LLM client (used by the vision
        tools) are attached; each underlying service initialises lazily. The
        real :class:`SafetyGate` enforces the configured safety mode.
        """

        if self._tool_context is None:
            workdir = Path(self._config.terminal.workdir).resolve()
            workdir.mkdir(parents=True, exist_ok=True)
            gate = self.safety_gate
            self._tool_context = ToolContext(
                config=self._config,
                logger=self.logger,
                event_bus=self.event_bus,
                workdir=workdir,
                safety_gate=lambda name, args: gate.static_guard(name, args, workdir),
                browser_controller=self.browser_controller,
                desktop_controller=self.desktop_controller,
                llm_client=self.llm_client,
            )
        return self._tool_context

    @property
    def database(self) -> Database:
        """The lazily created memory database (connected during :meth:`startup`)."""

        if self._database is None:
            self._database = Database(self._config.memory.db_path)
        return self._database

    @property
    def memory(self) -> LongTermMemory:
        """The lazily created long-term memory over the database."""

        if self._memory is None:
            self._memory = LongTermMemory(self.database)
        return self._memory

    def create_agent_loop(
        self, confirmation_provider: ConfirmationProvider | None = None
    ) -> AgentLoop:
        """Build an :class:`AgentLoop` wired from this container's services.

        Requires :meth:`startup` to have been called so the memory database is
        connected.
        """

        return AgentLoop(self, confirmation_provider)

    def create_runner(
        self,
        multi_agent: bool,
        confirmation_provider: ConfirmationProvider | None = None,
    ) -> AgentLoop | Orchestrator:
        """Build the runner for a goal: the orchestrator if ``multi_agent`` is set.

        Both returned objects expose ``run(goal, safety_mode)``; the default
        (single-agent) path is the :class:`AgentLoop`.
        """

        if multi_agent:
            return Orchestrator(self, confirmation_provider)
        return AgentLoop(self, confirmation_provider)

    async def startup(self) -> None:
        """Connect the database and initialise the schema (idempotent)."""

        await self.database.connect()
        await self.database.init_schema()

    async def shutdown(self) -> None:
        """Release shared resources: stop the browser and close the database.

        Safe to call even when nothing was started; resources are only touched
        if they were created.
        """

        if self._browser_controller is not None:
            await self._browser_controller.stop()
        if self._database is not None:
            await self._database.close()
