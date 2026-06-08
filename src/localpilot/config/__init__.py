"""Configuration package: schema definitions and loading logic."""

from __future__ import annotations

from localpilot.config.loader import load_config
from localpilot.config.schema import AppConfig

__all__ = ["AppConfig", "load_config"]
