"""Structured logging configuration and an in-process event bus.

:func:`configure_logging` wires up ``structlog`` on top of the standard library
logging module with two handlers running simultaneously:

* a colourful, human-friendly console renderer on ``stdout``;
* a machine-readable JSON renderer appended to ``logs/localpilot.jsonl``.

:class:`EventBus` is a tiny ``asyncio``-based publish/subscribe helper used to
stream agent activity. The agent loop and tools publish structured events to it,
and the control server forwards them (plus bridged log lines) to GUI clients
over ``/ws/events``.
"""

from __future__ import annotations

import logging
import sys
from asyncio import Queue
from pathlib import Path
from typing import Any

import structlog

_LOG_DIR = Path("logs")
_JSON_LOG_FILE = "localpilot.jsonl"


def configure_logging(level: str = "INFO") -> None:
    """Configure ``structlog`` and the standard library root logger.

    Args:
        level: The minimum log level name (e.g. ``"INFO"``, ``"DEBUG"``).

    The function is idempotent: existing root handlers are cleared so repeated
    calls (for instance from tests) do not duplicate output.
    """

    _LOG_DIR.mkdir(parents=True, exist_ok=True)

    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    console_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer(colors=True),
        ],
    )
    json_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)

    file_handler = logging.FileHandler(_LOG_DIR / _JSON_LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(json_formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    root_logger.setLevel(level.upper())


class EventBus:
    """A minimal in-process publish/subscribe bus built on :class:`asyncio.Queue`.

    Each subscriber receives its own queue; published events are fan-out
    delivered to every active subscriber. This is groundwork for streaming
    agent events to a future GUI and is not yet connected to anything.
    """

    def __init__(self) -> None:
        self._subscribers: list[Queue[Any]] = []

    def subscribe(self) -> Queue[Any]:
        """Register a new subscriber and return its dedicated event queue."""

        queue: Queue[Any] = Queue()
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: Queue[Any]) -> None:
        """Remove a previously registered subscriber queue.

        Unknown queues are ignored so callers need not track subscription state
        defensively.
        """

        try:
            self._subscribers.remove(queue)
        except ValueError:
            pass

    async def publish(self, event: Any) -> None:
        """Deliver ``event`` to every currently subscribed queue."""

        for queue in list(self._subscribers):
            await queue.put(event)
