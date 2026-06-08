"""The safety gate: deciding whether a tool call may proceed.

This is the real implementation that was deferred from Phase 2. It classifies
each tool by risk and decides based on the configured safety mode:

* ``safe``       - only read-only tools run automatically; everything that
  changes state needs confirmation.
* ``balanced``   - read-only and ordinary write tools run automatically; only
  high-risk tools (shell/Python execution) need confirmation.
* ``autonomous`` - everything runs without per-call confirmation.

When confirmation is required, an optional callback is consulted; if no callback
is provided, the call is denied (the safe default). Static guardrails - the
command blocklist and the workdir write restriction - are enforced inside the
tools themselves and always apply, regardless of mode.

:class:`SafetyGate` is callable with the ``(tool_name, args) -> bool`` signature
expected by :data:`localpilot.tools.base.SafetyGate`.
"""

from __future__ import annotations

from collections.abc import Callable
from enum import StrEnum

from pydantic import BaseModel

from localpilot.config.schema import AppConfig

#: Confirmation callback: ``(tool_name, args, reason) -> allow``.
ConfirmationCallback = Callable[[str, BaseModel, str], bool]


class RiskLevel(StrEnum):
    """How risky a tool is, used to gate it against the safety mode."""

    READ_ONLY = "read_only"
    WRITE = "write"
    DANGEROUS = "dangerous"


#: Risk classification for the built-in tools. Unknown tools are treated as
#: :attr:`RiskLevel.DANGEROUS` (the conservative default).
TOOL_RISK: dict[str, RiskLevel] = {
    # Read-only.
    "file_read": RiskLevel.READ_ONLY,
    "file_list": RiskLevel.READ_ONLY,
    "browser_get_text": RiskLevel.READ_ONLY,
    "browser_extract_links": RiskLevel.READ_ONLY,
    "browser_search": RiskLevel.READ_ONLY,
    "vision_screenshot": RiskLevel.READ_ONLY,
    "vision_describe": RiskLevel.READ_ONLY,
    "vision_ocr": RiskLevel.READ_ONLY,
    "vision_find": RiskLevel.READ_ONLY,
    # Control tools handled by the loop; harmless if they reach the gate.
    "finish": RiskLevel.READ_ONLY,
    "ask_user": RiskLevel.READ_ONLY,
    # State-changing but ordinary.
    "file_write": RiskLevel.WRITE,
    "dir_create": RiskLevel.WRITE,
    "browser_open": RiskLevel.WRITE,
    "browser_goto": RiskLevel.WRITE,
    "browser_click": RiskLevel.WRITE,
    "browser_type": RiskLevel.WRITE,
    "desktop_move": RiskLevel.WRITE,
    "desktop_click": RiskLevel.WRITE,
    "desktop_double_click": RiskLevel.WRITE,
    "desktop_scroll": RiskLevel.WRITE,
    "desktop_type": RiskLevel.WRITE,
    "desktop_press": RiskLevel.WRITE,
    "desktop_activate_window": RiskLevel.WRITE,
    # High-risk.
    "run_command": RiskLevel.DANGEROUS,
    "run_python": RiskLevel.DANGEROUS,
}

#: For each safety mode, the highest risk level that runs without confirmation.
_AUTO_ALLOW_UP_TO: dict[str, RiskLevel] = {
    "safe": RiskLevel.READ_ONLY,
    "balanced": RiskLevel.WRITE,
    "autonomous": RiskLevel.DANGEROUS,
}

_RISK_ORDER: dict[RiskLevel, int] = {
    RiskLevel.READ_ONLY: 0,
    RiskLevel.WRITE: 1,
    RiskLevel.DANGEROUS: 2,
}


def classify_tool(tool_name: str) -> RiskLevel:
    """Return the risk level for ``tool_name`` (unknown tools are dangerous)."""

    return TOOL_RISK.get(tool_name, RiskLevel.DANGEROUS)


class SafetyGate:
    """Policy object deciding whether a validated tool call may run."""

    def __init__(self, config: AppConfig, confirm: ConfirmationCallback | None = None) -> None:
        """Build the gate from the app config and an optional confirm callback."""

        self._config = config
        self._confirm = confirm

    def __call__(self, tool_name: str, args: BaseModel) -> bool:
        """Return ``True`` if the call may proceed under the current mode."""

        mode = self._config.safety.mode
        risk = classify_tool(tool_name)
        threshold = _AUTO_ALLOW_UP_TO.get(mode, RiskLevel.READ_ONLY)
        if _RISK_ORDER[risk] <= _RISK_ORDER[threshold]:
            return True
        if self._confirm is None:
            return False
        reason = f"Tool '{tool_name}' ist als '{risk}' eingestuft und erfordert eine Bestaetigung."
        return self._confirm(tool_name, args, reason)
