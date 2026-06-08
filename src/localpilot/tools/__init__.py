"""Tool system: foundation, registry and the built-in file/terminal tools.

Importing this package imports the built-in tool modules, whose classes register
themselves with :data:`builtin_tools` at definition time.
"""

from __future__ import annotations

from localpilot.tools.base import (
    SafetyGate,
    Tool,
    ToolContext,
    ToolResult,
    build_tool_spec,
    is_within,
    resolve_path,
)
from localpilot.tools.decorators import ToolRegistry, builtin_tools
from localpilot.tools.file_tools import (
    DirCreateTool,
    FileListTool,
    FileReadTool,
    FileWriteTool,
)
from localpilot.tools.registry import ToolManager
from localpilot.tools.terminal_tools import RunCommandTool, RunPythonTool


def get_builtin_tools() -> list[Tool]:
    """Return the six built-in tools (file and terminal) as a fresh list."""

    return builtin_tools.tools()


__all__ = [
    "DirCreateTool",
    "FileListTool",
    "FileReadTool",
    "FileWriteTool",
    "RunCommandTool",
    "RunPythonTool",
    "SafetyGate",
    "Tool",
    "ToolContext",
    "ToolManager",
    "ToolRegistry",
    "ToolResult",
    "build_tool_spec",
    "builtin_tools",
    "get_builtin_tools",
    "is_within",
    "resolve_path",
]
