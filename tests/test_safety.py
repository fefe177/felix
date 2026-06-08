"""Tests for the safety gate's authorisation decisions."""

from __future__ import annotations

from pathlib import Path

import structlog

from localpilot.agent.safety import SafetyGate
from localpilot.config.schema import AppConfig
from localpilot.logging.setup import EventBus
from localpilot.tools.base import ToolContext


def _ctx(tmp_path: Path, config: AppConfig) -> ToolContext:
    return ToolContext(
        config=config,
        logger=structlog.get_logger("test"),
        event_bus=EventBus(),
        workdir=tmp_path,
    )


def _config(mode: str) -> AppConfig:
    config = AppConfig()
    config.safety.mode = mode  # type: ignore[assignment]
    return config


async def test_safe_mode_requires_confirmation_for_everything(tmp_path: Path) -> None:
    config = _config("safe")
    gate = SafetyGate(config)
    ctx = _ctx(tmp_path, config)

    read = await gate.authorize("file_read", {"path": "a.txt"}, ctx)
    assert read.allow is True
    assert read.needs_confirmation is True


async def test_balanced_mode_distinguishes_risk(tmp_path: Path) -> None:
    config = _config("balanced")
    gate = SafetyGate(config)
    ctx = _ctx(tmp_path, config)

    read = await gate.authorize("file_read", {"path": "a.txt"}, ctx)
    assert read.allow is True and read.needs_confirmation is False

    browse = await gate.authorize("browser_get_text", {}, ctx)
    assert browse.needs_confirmation is False

    write = await gate.authorize("file_write", {"path": "a.txt", "content": "x"}, ctx)
    assert write.allow is True and write.needs_confirmation is True

    shell = await gate.authorize("run_command", {"command": "echo hi"}, ctx)
    assert shell.needs_confirmation is True


async def test_autonomous_allows_ordinary_actions(tmp_path: Path) -> None:
    config = _config("autonomous")
    gate = SafetyGate(config)
    ctx = _ctx(tmp_path, config)

    decision = await gate.authorize("run_command", {"command": "echo hi"}, ctx)
    assert decision.allow is True
    assert decision.needs_confirmation is False


async def test_autonomous_blocks_blocklisted_command(tmp_path: Path) -> None:
    config = _config("autonomous")
    gate = SafetyGate(config)
    ctx = _ctx(tmp_path, config)

    decision = await gate.authorize("run_command", {"command": "shutdown now"}, ctx)
    assert decision.allow is False
    assert "gesperrt" in decision.reason.lower()


async def test_autonomous_blocks_write_outside_workdir(tmp_path: Path) -> None:
    config = _config("autonomous")
    gate = SafetyGate(config)
    ctx = _ctx(tmp_path, config)

    outside = str(tmp_path.parent / "evil.txt")
    decision = await gate.authorize("file_write", {"path": outside, "content": "x"}, ctx)
    assert decision.allow is False
    assert "arbeitsverzeichnis" in decision.reason.lower()


def test_static_guard_denies_hard_violations(tmp_path: Path) -> None:
    config = _config("autonomous")
    gate = SafetyGate(config)

    from localpilot.tools.terminal_tools import RunCommandArgs

    ok = gate.static_guard("run_command", RunCommandArgs(command="echo hi"), tmp_path)
    blocked = gate.static_guard("run_command", RunCommandArgs(command="rm -rf /"), tmp_path)
    assert ok is True
    assert blocked is False
