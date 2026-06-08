"""Logging package: structlog setup and a lightweight in-process event bus."""

from __future__ import annotations

from localpilot.logging.setup import EventBus, configure_logging

__all__ = ["EventBus", "configure_logging"]
