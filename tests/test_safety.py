"""Tests for the safety gate's per-mode, per-risk decisions."""

from __future__ import annotations

from pydantic import BaseModel

from localpilot.agent.safety import RiskLevel, SafetyGate, classify_tool
from localpilot.config.schema import AppConfig


class _Args(BaseModel):
    """A trivial args model; the gate decides on the tool name and mode only."""


def _gate(mode: str, confirm: object | None = None) -> SafetyGate:
    config = AppConfig()
    config.safety.mode = mode  # type: ignore[assignment]
    return SafetyGate(config, confirm)  # type: ignore[arg-type]


def test_classification_defaults_to_dangerous() -> None:
    assert classify_tool("file_read") is RiskLevel.READ_ONLY
    assert classify_tool("file_write") is RiskLevel.WRITE
    assert classify_tool("run_command") is RiskLevel.DANGEROUS
    assert classify_tool("totally_unknown_tool") is RiskLevel.DANGEROUS


def test_safe_mode_allows_only_read_only() -> None:
    gate = _gate("safe")
    assert gate("file_read", _Args()) is True
    assert gate("file_write", _Args()) is False
    assert gate("run_command", _Args()) is False


def test_balanced_mode_allows_writes_but_not_dangerous() -> None:
    gate = _gate("balanced")
    assert gate("file_read", _Args()) is True
    assert gate("file_write", _Args()) is True
    assert gate("desktop_click", _Args()) is True
    assert gate("run_command", _Args()) is False


def test_autonomous_mode_allows_everything() -> None:
    gate = _gate("autonomous")
    assert gate("file_read", _Args()) is True
    assert gate("file_write", _Args()) is True
    assert gate("run_command", _Args()) is True
    assert gate("totally_unknown_tool", _Args()) is True


def test_confirmation_callback_can_allow_dangerous() -> None:
    recorded: list[str] = []

    def confirm(tool_name: str, args: BaseModel, reason: str) -> bool:
        recorded.append(tool_name)
        return True

    gate = _gate("balanced", confirm)
    assert gate("run_command", _Args()) is True
    assert recorded == ["run_command"]


def test_confirmation_callback_can_deny() -> None:
    gate = _gate("safe", lambda name, args, reason: False)
    assert gate("file_write", _Args()) is False
