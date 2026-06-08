"""File-system tools: read, write, list and create directories.

Design note on async: filesystem calls are blocking. Rather than add an extra
dependency (``aiofiles`` is not part of the project), each tool wraps its
blocking work in :func:`asyncio.to_thread`. This keeps the event loop
responsive, needs no new dependency and stays easy to read and test.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from localpilot.tools.base import (
    ToolContext,
    ToolResult,
    is_within,
    resolve_path,
)
from localpilot.tools.decorators import builtin_tools

#: Default cap on how many bytes :class:`FileReadTool` returns.
DEFAULT_MAX_READ_BYTES = 1_000_000


def _decode(data: bytes) -> str:
    """Decode bytes as UTF-8, falling back to latin-1 with replacement."""

    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1", errors="replace")


class FileReadArgs(BaseModel):
    """Arguments for :class:`FileReadTool`."""

    path: str = Field(description="Path to the file (relative to the workdir or absolute).")
    max_bytes: int = Field(
        default=DEFAULT_MAX_READ_BYTES,
        ge=1,
        description="Maximum number of bytes to read before truncating.",
    )


@builtin_tools.register
class FileReadTool:
    """Read a text file, with an encoding fallback and a size limit."""

    name = "file_read"
    description = "Read the contents of a text file (UTF-8 with fallback, size-limited)."
    args_model: type[BaseModel] = FileReadArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        """Read the file at ``args.path`` and return its decoded text."""

        assert isinstance(args, FileReadArgs)
        path = resolve_path(ctx.workdir, args.path)
        if not path.exists():
            return ToolResult(ok=False, error=f"Datei nicht gefunden: {path}")
        if not path.is_file():
            return ToolResult(ok=False, error=f"Kein regulaerer Dateipfad: {path}")

        data = await asyncio.to_thread(path.read_bytes)
        truncated = len(data) > args.max_bytes
        if truncated:
            data = data[: args.max_bytes]
        return ToolResult(
            ok=True,
            output=_decode(data),
            meta={"path": str(path), "bytes": len(data), "truncated": truncated},
        )


class FileWriteArgs(BaseModel):
    """Arguments for :class:`FileWriteTool`."""

    path: str = Field(description="Destination path (relative to the workdir or absolute).")
    content: str = Field(description="Text content to write.")
    overwrite: bool = Field(default=False, description="Overwrite an existing file if True.")


@builtin_tools.register
class FileWriteTool:
    """Write text to a file, honouring the workdir write restriction."""

    name = "file_write"
    description = "Write text to a file, creating parent directories as needed."
    args_model: type[BaseModel] = FileWriteArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        """Write ``args.content`` to ``args.path`` under the active policy."""

        assert isinstance(args, FileWriteArgs)
        path = resolve_path(ctx.workdir, args.path)
        if ctx.config.safety.restrict_writes_to_workdir and not is_within(path, ctx.workdir):
            return ToolResult(
                ok=False,
                error=(
                    "Schreibzugriff ausserhalb des Arbeitsverzeichnisses ist nicht "
                    f"erlaubt: {path}"
                ),
            )
        if path.exists() and not args.overwrite:
            return ToolResult(
                ok=False,
                error=f"Datei existiert bereits (overwrite=false): {path}",
            )

        await asyncio.to_thread(_write_text, path, args.content)
        return ToolResult(
            ok=True,
            output=f"{len(args.content)} Zeichen geschrieben.",
            meta={"path": str(path)},
        )


def _write_text(path: Path, content: str) -> None:
    """Create parent directories and write ``content`` as UTF-8."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class FileListArgs(BaseModel):
    """Arguments for :class:`FileListTool`."""

    path: str = Field(default=".", description="Directory to list (relative or absolute).")


@builtin_tools.register
class FileListTool:
    """List the entries of a directory."""

    name = "file_list"
    description = "List a directory's entries as (name, is_dir, size)."
    args_model: type[BaseModel] = FileListArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        """List the directory at ``args.path``."""

        assert isinstance(args, FileListArgs)
        path = resolve_path(ctx.workdir, args.path)
        if not path.exists():
            return ToolResult(ok=False, error=f"Verzeichnis nicht gefunden: {path}")
        if not path.is_dir():
            return ToolResult(ok=False, error=f"Kein Verzeichnis: {path}")

        entries = await asyncio.to_thread(_list_dir, path)
        return ToolResult(
            ok=True,
            output=entries,
            meta={"path": str(path), "count": len(entries)},
        )


def _list_dir(path: Path) -> list[dict[str, Any]]:
    """Return sorted entry descriptors for ``path``."""

    entries: list[dict[str, Any]] = []
    for child in sorted(path.iterdir(), key=lambda item: item.name):
        is_dir = child.is_dir()
        try:
            size = 0 if is_dir else child.stat().st_size
        except OSError:
            size = 0
        entries.append({"name": child.name, "is_dir": is_dir, "size": size})
    return entries


class DirCreateArgs(BaseModel):
    """Arguments for :class:`DirCreateTool`."""

    path: str = Field(description="Directory path to create (relative or absolute).")


@builtin_tools.register
class DirCreateTool:
    """Create a directory (including parents), honouring the write restriction."""

    name = "dir_create"
    description = "Create a directory, including any missing parent directories."
    args_model: type[BaseModel] = DirCreateArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        """Create the directory at ``args.path`` under the active policy."""

        assert isinstance(args, DirCreateArgs)
        path = resolve_path(ctx.workdir, args.path)
        if ctx.config.safety.restrict_writes_to_workdir and not is_within(path, ctx.workdir):
            return ToolResult(
                ok=False,
                error=(
                    "Verzeichniserstellung ausserhalb des Arbeitsverzeichnisses ist "
                    f"nicht erlaubt: {path}"
                ),
            )

        await asyncio.to_thread(lambda: path.mkdir(parents=True, exist_ok=True))
        return ToolResult(ok=True, output=f"Verzeichnis angelegt: {path}", meta={"path": str(path)})
