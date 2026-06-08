"""A small dependency container for LocalPilot.

The :class:`Container` owns the validated :class:`AppConfig` and lazily
constructs shared, cross-cutting services. In Phase 0 the only services are the
structured logger and the in-process :class:`EventBus`; later phases will add
lazy properties for the LLM client, tool registry, memory store and so on.

Lazy initialisation is done with plain attributes — no external dependency
injection framework is used.
"""

from __future__ import annotations

import structlog

from localpilot.config.schema import AppConfig
from localpilot.logging.setup import EventBus


class Container:
    """Holds application configuration and lazily created shared services."""

    def __init__(self, config: AppConfig) -> None:
        """Create a container around an already-validated configuration."""

        self._config = config
        self._logger: structlog.stdlib.BoundLogger | None = None
        self._event_bus: EventBus | None = None

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
