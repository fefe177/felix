"""Tests for the tool system: file tools, terminal tools and the registry.

No dangerous commands are executed; the blocklist test verifies the command is
rejected *before* it would run. Network access is not involved.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import structlog

from localpilot.config.schema import AppConfig
from localpilot.llm.messages import ToolCall
from localpilot.logging.setup import EventBus
from localpilot.tools import ToolContext, ToolManager, get_builtin_tools


@pytest.fixture
def ctx(tmp_path: Path) -> ToolContext:
    """A tool context whose workdir is an isolated temporary directory."""

    return ToolContext(
        config=AppConfig(),
        logger=structlog.get_logger("test"),
        event_bus=EventBus(),
        workdir=tmp_path,
    )


@pytest.fixture
def manager() -> ToolManager:
    """A tool manager loaded with the six built-in tools."""

    return ToolManager(get_builtin_tools())


def _call(name: str, **arguments: object) -> ToolCall:
    return ToolCall(id="test", name=name, arguments=dict(arguments))


async def test_file_write_read_roundtrip(manager: ToolManager, ctx: ToolContext) -> None:
    written = await manager.execute(
        _call("file_write", path="sub/hello.txt", content="hallo welt"), ctx
    )
    assert written.ok, written.error
    assert (ctx.workdir / "sub" / "hello.txt").read_text(encoding="utf-8") == "hallo welt"

    read = await manager.execute(_call("file_read", path="sub/hello.txt"), ctx)
    assert read.ok, read.error
    assert read.output == "hallo welt"


async def test_file_write_outside_workdir_blocked(
    manager: ToolManager, ctx: ToolContext, tmp_path: Path
) -> None:
    outside = tmp_path.parent / "localpilot_outside.txt"
    result = await manager.execute(
        _call("file_write", path=str(outside), content="nope"), ctx
    )
    assert result.ok is False
    assert "ausserhalb" in (result.error or "").lower()
    assert not outside.exists()


async def test_file_write_no_overwrite(manager: ToolManager, ctx: ToolContext) -> None:
    await manager.execute(_call("file_write", path="a.txt", content="one"), ctx)
    again = await manager.execute(_call("file_write", path="a.txt", content="two"), ctx)
    assert again.ok is False
    assert "existiert bereits" in (again.error or "").lower()

    forced = await manager.execute(
        _call("file_write", path="a.txt", content="two", overwrite=True), ctx
    )
    assert forced.ok, forced.error
    assert (ctx.workdir / "a.txt").read_text(encoding="utf-8") == "two"


async def test_dir_create_and_list(manager: ToolManager, ctx: ToolContext) -> None:
    created = await manager.execute(_call("dir_create", path="mydir"), ctx)
    assert created.ok, created.error
    assert (ctx.workdir / "mydir").is_dir()

    await manager.execute(_call("file_write", path="mydir/file.txt", content="abc"), ctx)
    listing = await manager.execute(_call("file_list", path="mydir"), ctx)
    assert listing.ok, listing.error
    entries = {entry["name"]: entry for entry in listing.output}
    assert "file.txt" in entries
    assert entries["file.txt"]["is_dir"] is False
    assert entries["file.txt"]["size"] == 3


async def test_run_command_echo(manager: ToolManager, ctx: ToolContext) -> None:
    result = await manager.execute(_call("run_command", command="echo hallo"), ctx)
    assert result.ok, result.error
    assert "hallo" in result.output["stdout"]
    assert result.output["exit_code"] == 0


async def test_run_command_blocklist(manager: ToolManager, ctx: ToolContext) -> None:
    result = await manager.execute(_call("run_command", command="shutdown now"), ctx)
    assert result.ok is False
    assert "blockiert" in (result.error or "").lower()


async def test_run_command_timeout(manager: ToolManager, ctx: ToolContext) -> None:
    result = await manager.execute(
        _call("run_command", command="sleep 5", timeout_s=1), ctx
    )
    assert result.ok is False
    assert "zeitlimit" in (result.error or "").lower()


async def test_run_python_code(manager: ToolManager, ctx: ToolContext) -> None:
    result = await manager.execute(_call("run_python", code="print(2 + 2)"), ctx)
    assert result.ok, result.error
    assert "4" in result.output["stdout"]


async def test_run_python_requires_one_source(manager: ToolManager, ctx: ToolContext) -> None:
    neither = await manager.execute(_call("run_python"), ctx)
    assert neither.ok is False
    both = await manager.execute(_call("run_python", code="print(1)", file="x.py"), ctx)
    assert both.ok is False


async def test_unknown_tool(manager: ToolManager, ctx: ToolContext) -> None:
    result = await manager.execute(_call("does_not_exist"), ctx)
    assert result.ok is False
    assert "unbekannt" in (result.error or "").lower()


async def test_invalid_arguments(manager: ToolManager, ctx: ToolContext) -> None:
    result = await manager.execute(_call("file_read"), ctx)  # missing required 'path'
    assert result.ok is False
    assert "path" in (result.error or "")


def test_get_specs_covers_all_tools(manager: ToolManager) -> None:
    specs = manager.get_specs()
    names = {spec["function"]["name"] for spec in specs}
    assert {
        "file_read",
        "file_write",
        "file_list",
        "dir_create",
        "run_command",
        "run_python",
    } <= names
    for spec in specs:
        assert spec["type"] == "function"
        assert "parameters" in spec["function"]


async def test_tool_call_emits_event(manager: ToolManager, ctx: ToolContext) -> None:
    queue = ctx.event_bus.subscribe()
    await manager.execute(_call("dir_create", path="emitted"), ctx)
    event = queue.get_nowait()
    assert event["type"] == "tool_call"
    assert event["tool_name"] == "dir_create"
    assert event["ok"] is True
    assert "duration_ms" in event
