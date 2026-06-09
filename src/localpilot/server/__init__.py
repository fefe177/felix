"""HTTP/WebSocket control server for LocalPilot (consumed by the GUI later)."""

from __future__ import annotations

from localpilot.server.app import create_app

__all__ = ["create_app"]
