"""Agent roles for the multi-agent mode.

Each role carries a system-prompt suffix (appended to the shared system prompt)
and an allow-predicate that restricts which tools the role may use. The roles
are deliberately thin: they describe *who* is acting and *with which tools*;
the actual reasoning and tool execution are handled by the reused
:class:`~localpilot.agent.loop.AgentLoop`.

A stable ``[[ROLE:<name>]]`` marker is embedded in each suffix so observers
(and tests) can identify the active role from the prompt.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class AgentRole(Protocol):
    """A role: a name, a prompt suffix and an allowed-tool predicate."""

    name: str

    def system_suffix(self) -> str:
        """Return the role-specific text appended to the system prompt."""
        ...

    def allows(self, tool_name: str) -> bool:
        """Return ``True`` if this role may use the named tool."""
        ...


def _marker(name: str) -> str:
    """Return the stable role marker embedded in a role's prompt suffix."""

    return f"[[ROLE:{name}]]"


class PlannerAgent:
    """Plans and reasons; may read but never performs destructive actions."""

    name = "planner"
    _allowed = frozenset(
        {"file_read", "file_list", "browser_get_text", "browser_extract_links", "browser_search"}
    )

    def system_suffix(self) -> str:
        return (
            f"{_marker(self.name)} Rolle: Planer. Du denkst und planst. Du darfst nur "
            "lesende Recherche-Tools nutzen, niemals schreibende, Terminal- oder "
            "Desktop-Aktionen."
        )

    def allows(self, tool_name: str) -> bool:
        return tool_name in self._allowed or tool_name.startswith("vision_")


class ExecutorAgent:
    """Executes plan steps using any tool (subject to the safety gate)."""

    name = "executor"

    def system_suffix(self) -> str:
        return (
            f"{_marker(self.name)} Rolle: Ausfuehrender. Du setzt den aktuellen Schritt "
            "konkret um und nutzt dafuer die noetigen Tools. Beende den Schritt mit finish."
        )

    def allows(self, tool_name: str) -> bool:
        return True


class DebugAgent:
    """Activated on failure: reads terminal/logs/files and proposes a fix."""

    name = "debug"
    _allowed = frozenset({"file_read", "file_list", "run_command"})

    def system_suffix(self) -> str:
        return (
            f"{_marker(self.name)} Rolle: Debugger. Ein vorheriger Schritt ist "
            "fehlgeschlagen. Du darfst Terminal, Logs und Dateien LESEN, analysierst die "
            "Ursache und schliesst mit finish ab, dessen summary eine kurze, konkrete "
            "Korrekturanweisung enthaelt."
        )

    def allows(self, tool_name: str) -> bool:
        return tool_name in self._allowed


class ResearchAgent:
    """Gathers information via browser, vision and search."""

    name = "research"

    def system_suffix(self) -> str:
        return (
            f"{_marker(self.name)} Rolle: Rechercheur. Du sammelst Informationen ueber "
            "Browser, Suche und Vision und fasst die Erkenntnisse in der finish-summary "
            "zusammen."
        )

    def allows(self, tool_name: str) -> bool:
        return (
            tool_name.startswith("browser_")
            or tool_name.startswith("vision_")
            or tool_name in {"file_read", "file_list"}
        )
