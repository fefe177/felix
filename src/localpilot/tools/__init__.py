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
from localpilot.tools.browser_tools import (
    BrowserClickTool,
    BrowserExtractLinksTool,
    BrowserGetTextTool,
    BrowserGotoTool,
    BrowserOpenTool,
    BrowserSearchTool,
    BrowserTypeTool,
)
from localpilot.tools.decorators import ToolRegistry, builtin_tools
from localpilot.tools.desktop_tools import (
    DesktopActivateWindowTool,
    DesktopClickTool,
    DesktopDoubleClickTool,
    DesktopMoveTool,
    DesktopPressTool,
    DesktopScrollTool,
    DesktopTypeTool,
)
from localpilot.tools.file_tools import (
    DirCreateTool,
    FileListTool,
    FileReadTool,
    FileWriteTool,
)
from localpilot.tools.registry import ToolManager
from localpilot.tools.terminal_tools import RunCommandTool, RunPythonTool
from localpilot.tools.vision_tools import (
    VisionDescribeTool,
    VisionFindTool,
    VisionOcrTool,
    VisionScreenshotTool,
)


def get_builtin_tools() -> list[Tool]:
    """Return the six built-in tools (file and terminal) as a fresh list."""

    return builtin_tools.tools()


__all__ = [
    "BrowserClickTool",
    "BrowserExtractLinksTool",
    "BrowserGetTextTool",
    "BrowserGotoTool",
    "BrowserOpenTool",
    "BrowserSearchTool",
    "BrowserTypeTool",
    "DesktopActivateWindowTool",
    "DesktopClickTool",
    "DesktopDoubleClickTool",
    "DesktopMoveTool",
    "DesktopPressTool",
    "DesktopScrollTool",
    "DesktopTypeTool",
    "DirCreateTool",
    "FileListTool",
    "FileReadTool",
    "FileWriteTool",
    "RunCommandTool",
    "RunPythonTool",
    "SafetyGate",
    "VisionDescribeTool",
    "VisionFindTool",
    "VisionOcrTool",
    "VisionScreenshotTool",
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
