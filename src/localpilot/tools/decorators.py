"""A lightweight tool registration mechanism.

:class:`ToolRegistry` collects tool instances keyed by name. Its :meth:`register`
method is a class decorator: it instantiates the decorated tool class and stores
the instance, returning the class unchanged so it can still be used directly.

A module-level :data:`builtin_tools` registry is used by the built-in tool
modules; tests can create their own isolated registries.
"""

from __future__ import annotations

from typing import TypeVar

from localpilot.tools.base import Tool

ToolT = TypeVar("ToolT", bound=Tool)


class ToolRegistry:
    """An ordered, name-keyed collection of tool instances."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool_cls: type[ToolT]) -> type[ToolT]:
        """Instantiate ``tool_cls`` and register it, returning the class.

        Registering a name that already exists overwrites the previous entry,
        keeping repeated imports idempotent.
        """

        instance = tool_cls()
        self._tools[instance.name] = instance
        return tool_cls

    def get(self, name: str) -> Tool | None:
        """Return the registered tool for ``name``, or ``None``."""

        return self._tools.get(name)

    def tools(self) -> list[Tool]:
        """Return all registered tools in registration order."""

        return list(self._tools.values())


#: Shared registry that the built-in file and terminal tools register into.
builtin_tools = ToolRegistry()
