"""FastAPI application factory and lifecycle for LocalPilot.

:func:`create_app` builds the app, enables CORS for the Vite dev server, mounts
the REST and WebSocket routers and manages the lifecycle: on startup it builds
(or adopts) a :class:`~localpilot.container.Container`, initialises memory and
attaches a :class:`WebUIConfirmationProvider`; on shutdown it cancels any run and
closes the browser and database. A logging handler bridges the application logger
to the event bus so log lines also stream over ``/ws/events``.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from localpilot.config.loader import load_config
from localpilot.config.schema import AppConfig
from localpilot.container import Container
from localpilot.logging.setup import EventBus, configure_logging
from localpilot.server.routes import router as api_router
from localpilot.server.runtime import AgentRunManager, ServerContext, WebUIConfirmationProvider
from localpilot.server.websocket import router as ws_router

#: Origin of the Vite dev server that the GUI will run on.
_DEV_ORIGIN = "http://localhost:5173"
#: Logger whose records are mirrored onto the event bus.
_APP_LOGGER_NAME = "localpilot"


class EventBusLogHandler(logging.Handler):
    """Logging handler that mirrors log records onto the event bus as events."""

    def __init__(self, event_bus: EventBus, loop: asyncio.AbstractEventLoop) -> None:
        """Store the event bus and the loop on which to schedule publishes."""

        super().__init__()
        self._event_bus = event_bus
        self._loop = loop

    def emit(self, record: logging.LogRecord) -> None:
        """Schedule publication of a ``log`` event (thread-safe, best effort)."""

        try:
            event = {
                "type": "log",
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            }
            self._loop.call_soon_threadsafe(self._schedule, event)
        except RuntimeError:
            pass

    def _schedule(self, event: dict[str, str]) -> None:
        if not self._loop.is_closed():
            self._loop.create_task(self._event_bus.publish(event))


def _make_lifespan(
    config: AppConfig | None, container: Container | None
) -> object:
    """Build the FastAPI lifespan context manager for the given config/container."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app_config = config if config is not None else load_config(None)
        configure_logging(app_config.log_level)
        active_container = container if container is not None else Container(app_config)
        await active_container.startup()

        confirm_provider = WebUIConfirmationProvider(active_container.event_bus)
        run_manager = AgentRunManager(active_container, confirm_provider)

        loop = asyncio.get_running_loop()
        handler = EventBusLogHandler(active_container.event_bus, loop)
        app_logger = logging.getLogger(_APP_LOGGER_NAME)
        app_logger.addHandler(handler)

        app.state.context = ServerContext(
            container=active_container,
            run_manager=run_manager,
            confirm_provider=confirm_provider,
        )
        try:
            yield
        finally:
            app_logger.removeHandler(handler)
            await run_manager.shutdown()
            await active_container.shutdown()

    return lifespan


def create_app(
    config: AppConfig | None = None, container: Container | None = None
) -> FastAPI:
    """Create the FastAPI app.

    Args:
        config: Configuration to use; loaded from defaults when ``None``.
        container: An existing container to adopt (used by tests to inject a
            mock LLM); a new one is built from ``config`` when ``None``.

    Returns:
        The configured :class:`fastapi.FastAPI` application.
    """

    app = FastAPI(
        title="LocalPilot",
        description="Local autonomous desktop agent - control API.",
        lifespan=_make_lifespan(config, container),  # type: ignore[arg-type]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[_DEV_ORIGIN],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    app.include_router(ws_router)
    return app
