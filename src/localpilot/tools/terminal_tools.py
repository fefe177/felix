"""Terminal tools: shell command and Python execution in a subprocess.

Both tools run inside ``ctx.workdir``, enforce a timeout (from the call or
:class:`~localpilot.config.schema.TerminalConfig`) and truncate very large
output. Shell commands are screened against the configured ``command_blocklist``
(case-insensitive substring match) before they run.
"""

from __future__ import annotations

import asyncio
import sys

from pydantic import BaseModel, Field, model_validator

from localpilot.tools.base import ToolContext, ToolResult, resolve_path
from localpilot.tools.decorators import builtin_tools

#: Maximum number of characters returned per stream before truncation.
MAX_OUTPUT_CHARS = 20_000


def _truncate(text: str) -> str:
    """Truncate ``text`` to :data:`MAX_OUTPUT_CHARS`, noting how much was cut."""

    if len(text) <= MAX_OUTPUT_CHARS:
        return text
    dropped = len(text) - MAX_OUTPUT_CHARS
    return f"{text[:MAX_OUTPUT_CHARS]}\n...[abgeschnitten, {dropped} weitere Zeichen]"


def _blocked_pattern(command: str, blocklist: list[str]) -> str | None:
    """Return the first blocklist pattern contained in ``command``, or ``None``."""

    lowered = command.lower()
    for pattern in blocklist:
        if pattern.lower() in lowered:
            return pattern
    return None


async def _run_subprocess(
    program_args: list[str] | None,
    shell_command: str | None,
    cwd: str,
    timeout_s: int,
) -> ToolResult:
    """Run a subprocess (shell or exec), enforcing timeout and truncation."""

    if shell_command is not None:
        process = await asyncio.create_subprocess_shell(
            shell_command,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        label = shell_command
    else:
        assert program_args is not None
        process = await asyncio.create_subprocess_exec(
            *program_args,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        label = " ".join(program_args)

    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            process.communicate(), timeout=timeout_s
        )
    except TimeoutError:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        await process.wait()
        return ToolResult(
            ok=False,
            error=f"Befehl hat das Zeitlimit von {timeout_s}s ueberschritten.",
            meta={"command": label, "timeout_s": timeout_s},
        )

    exit_code = process.returncode
    stdout = _truncate(stdout_bytes.decode("utf-8", errors="replace"))
    stderr = _truncate(stderr_bytes.decode("utf-8", errors="replace"))
    return ToolResult(
        ok=exit_code == 0,
        output={"stdout": stdout, "stderr": stderr, "exit_code": exit_code},
        error=None if exit_code == 0 else f"Befehl endete mit Exit-Code {exit_code}.",
        meta={"command": label, "exit_code": exit_code},
    )


class RunCommandArgs(BaseModel):
    """Arguments for :class:`RunCommandTool`."""

    command: str = Field(description="The shell command to execute.")
    timeout_s: int | None = Field(
        default=None,
        ge=1,
        description="Timeout in seconds; defaults to the terminal config value.",
    )


@builtin_tools.register
class RunCommandTool:
    """Run a shell command in the workdir, screened against the blocklist."""

    name = "run_command"
    description = "Execute a shell command in the working directory and return its output."
    args_model: type[BaseModel] = RunCommandArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        """Run ``args.command`` unless it matches a blocked pattern."""

        assert isinstance(args, RunCommandArgs)
        blocked = _blocked_pattern(args.command, ctx.config.terminal.command_blocklist)
        if blocked is not None:
            return ToolResult(
                ok=False,
                error=f"Befehl blockiert (enthaelt gesperrtes Muster '{blocked}').",
                meta={"pattern": blocked},
            )
        timeout_s = args.timeout_s if args.timeout_s is not None else ctx.config.terminal.timeout_s
        return await _run_subprocess(
            program_args=None,
            shell_command=args.command,
            cwd=str(ctx.workdir),
            timeout_s=timeout_s,
        )


class RunPythonArgs(BaseModel):
    """Arguments for :class:`RunPythonTool` - exactly one of ``code`` or ``file``."""

    code: str | None = Field(default=None, description="Inline Python source to run.")
    file: str | None = Field(default=None, description="Path to a Python file to run.")
    timeout_s: int | None = Field(
        default=None,
        ge=1,
        description="Timeout in seconds; defaults to the terminal config value.",
    )

    @model_validator(mode="after")
    def _exactly_one_source(self) -> RunPythonArgs:
        """Ensure exactly one of ``code`` or ``file`` is provided."""

        if bool(self.code) == bool(self.file):
            raise ValueError("Genau eines von 'code' oder 'file' muss angegeben werden.")
        return self


@builtin_tools.register
class RunPythonTool:
    """Run Python code or a Python file in a subprocess in the workdir."""

    name = "run_python"
    description = "Execute Python code (inline or from a file) in a subprocess."
    args_model: type[BaseModel] = RunPythonArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        """Run the provided Python ``code`` or ``file``."""

        assert isinstance(args, RunPythonArgs)
        timeout_s = args.timeout_s if args.timeout_s is not None else ctx.config.terminal.timeout_s
        if args.file is not None:
            target = resolve_path(ctx.workdir, args.file)
            if not target.is_file():
                return ToolResult(ok=False, error=f"Python-Datei nicht gefunden: {target}")
            program_args = [sys.executable, str(target)]
        else:
            program_args = [sys.executable, "-c", args.code or ""]

        return await _run_subprocess(
            program_args=program_args,
            shell_command=None,
            cwd=str(ctx.workdir),
            timeout_s=timeout_s,
        )
