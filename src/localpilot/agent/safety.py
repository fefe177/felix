"""The safety gate: authorising tool calls per safety mode.

This replaces the permissive Phase 2 placeholder. :class:`SafetyGate` decides,
per safety mode, whether a tool call is allowed and whether it first needs user
confirmation:

* ``safe``       - every action needs confirmation.
* ``balanced``   - read-only / browser / vision run without confirmation; writes,
  terminal and desktop actions need confirmation.
* ``autonomous`` - everything runs without confirmation, **but** hard guardrails
  still deny blocklisted shell commands and out-of-workdir writes.

The hard guardrails apply in every mode and are also exposed as a synchronous
:meth:`SafetyGate.static_guard` that the :class:`~localpilot.tools.registry.ToolManager`
uses as defence in depth.

Confirmation is obtained through a :class:`ConfirmationProvider`; the CLI
implementation prompts on the terminal, and a future GUI can implement the same
protocol over the event bus.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

import typer
from pydantic import BaseModel

from localpilot.config.schema import AppConfig
from localpilot.tools.base import ToolContext, is_within, resolve_path


@dataclass(frozen=True)
class Decision:
    """The outcome of authorising a tool call.

    Attributes:
        allow: Whether the call may run at all (``False`` = hard denial).
        needs_confirmation: Whether explicit confirmation is required first.
        reason: A human-readable explanation of the decision.
    """

    allow: bool
    needs_confirmation: bool
    reason: str


@runtime_checkable
class ConfirmationProvider(Protocol):
    """Something that can ask the user to confirm a risky action."""

    async def confirm(self, prompt: str) -> bool:
        """Return ``True`` if the user approves the action described by ``prompt``."""
        ...


class CLIConfirmationProvider:
    """A confirmation provider that prompts on the terminal via Typer/Rich."""

    async def confirm(self, prompt: str) -> bool:
        """Ask a yes/no question on the terminal without blocking the event loop."""

        return await asyncio.to_thread(lambda: typer.confirm(prompt, default=False))

    async def ask(self, question: str) -> str:
        """Ask a free-text question on the terminal (used for ``ask_user``)."""

        return await asyncio.to_thread(lambda: typer.prompt(question))


#: Tools that never change state and so run without confirmation in balanced mode.
_LOW_RISK_NAMES = frozenset({"file_read", "file_list", "finish", "ask_user"})


def _is_low_risk(tool_name: str) -> bool:
    """Return ``True`` for read-only, browser and vision tools."""

    return (
        tool_name in _LOW_RISK_NAMES
        or tool_name.startswith("browser_")
        or tool_name.startswith("vision_")
    )


def _as_dict(args: Any) -> dict[str, Any]:
    """Normalise tool arguments (a model or a mapping) into a plain dict."""

    if isinstance(args, BaseModel):
        return args.model_dump()
    if isinstance(args, dict):
        return args
    return {}


def _blocked_pattern(command: str, blocklist: list[str]) -> str | None:
    """Return the first blocklist pattern contained in ``command``, or ``None``."""

    lowered = command.lower()
    for pattern in blocklist:
        if pattern.lower() in lowered:
            return pattern
    return None


class SafetyGate:
    """Authorises tool calls according to the configured safety mode."""

    def __init__(self, config: AppConfig) -> None:
        """Build the gate from the application configuration."""

        self._config = config

    @property
    def config(self) -> AppConfig:
        """The configuration backing this gate (mode is read dynamically)."""

        return self._config

    async def authorize(
        self, tool_name: str, arguments: dict[str, Any], ctx: ToolContext
    ) -> Decision:
        """Decide whether ``tool_name`` with ``arguments`` may run under ``ctx``."""

        hard = self._hard_violation(tool_name, arguments, ctx.workdir)
        if hard is not None:
            return Decision(allow=False, needs_confirmation=False, reason=hard)

        mode = self._config.safety.mode
        if mode == "safe":
            return Decision(True, True, "SAFE-Modus: jede Aktion erfordert eine Bestaetigung.")
        if mode == "balanced":
            if _is_low_risk(tool_name):
                return Decision(
                    True, False, "BALANCED: lesende/Browser/Vision-Aktion ohne Bestaetigung."
                )
            return Decision(
                True, True, "BALANCED: schreibende/Terminal/Desktop-Aktion erfordert Bestaetigung."
            )
        return Decision(True, False, "AUTONOMOUS: erlaubt (statische Schutzregeln bleiben aktiv).")

    def static_guard(self, tool_name: str, args: Any, workdir: Path) -> bool:
        """Synchronous hard-rule check used by the tool manager (defence in depth)."""

        return self._hard_violation(tool_name, _as_dict(args), workdir) is None

    def _hard_violation(
        self, tool_name: str, arguments: dict[str, Any], workdir: Path
    ) -> str | None:
        """Return a denial reason for a hard-rule violation, else ``None``."""

        if tool_name == "run_command":
            command = str(arguments.get("command", ""))
            blocked = _blocked_pattern(command, self._config.terminal.command_blocklist)
            if blocked is not None:
                return f"Befehl enthaelt gesperrtes Muster '{blocked}'."

        restrict = self._config.safety.restrict_writes_to_workdir
        if tool_name in {"file_write", "dir_create"} and restrict:
            raw_path = arguments.get("path")
            if isinstance(raw_path, str) and raw_path:
                target = resolve_path(workdir, raw_path)
                if not is_within(target, workdir):
                    return "Schreibzugriff ausserhalb des Arbeitsverzeichnisses ist nicht erlaubt."

        return None
