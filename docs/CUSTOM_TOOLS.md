# Adding a custom tool

LocalPilot tools are small classes that satisfy the
[`Tool`](../src/localpilot/tools/base.py) protocol: a `name`, a `description`, a
Pydantic `args_model` and an asynchronous `run`. The `ToolManager` validates the
model's arguments, applies the safety gate and advertises the tool to the LLM as
an OpenAI tool spec - you only write the class.

This guide builds a complete, runnable `hello` tool.

## 1. Write the tool

Create `src/localpilot/tools/hello_tool.py`:

```python
"""Example custom tool: a friendly greeting."""

from __future__ import annotations

from pydantic import BaseModel, Field

from localpilot.tools.base import ToolContext, ToolResult
from localpilot.tools.decorators import builtin_tools


class HelloArgs(BaseModel):
    """Arguments for the hello tool."""

    name: str = Field(description="Who to greet.")


@builtin_tools.register
class HelloTool:
    """Return a friendly greeting for the given name."""

    name = "hello"
    description = "Return a friendly greeting for a given name."
    # Annotate as type[BaseModel] so the tool satisfies the Tool protocol
    # (the protocol's args_model attribute is invariant).
    args_model: type[BaseModel] = HelloArgs

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult:
        # The ToolManager has already validated the raw arguments into HelloArgs;
        # assert to narrow the type for the checker and document the invariant.
        assert isinstance(args, HelloArgs)
        return ToolResult(ok=True, output=f"Hallo, {args.name}!")
```

Key points:

- **`name`** must be unique; it is what the LLM calls and what the safety gate
  classifies. Unknown names are treated as `dangerous` by default.
- **`description`** is shown to the model - keep it precise.
- **`args_model`** is a Pydantic model; its JSON schema is advertised to the LLM
  and used to validate arguments before `run` is called.
- **`run`** is `async`. Do CPU- or I/O-heavy blocking work in
  `asyncio.to_thread(...)` so the event loop stays responsive.
- Return a `ToolResult`; on failure use `ok=False` with a clear `error` message
  (it is fed back to the model so it can recover).

## 2. Register it

The `@builtin_tools.register` decorator adds the tool to the shared registry at
import time. Make sure the module is imported so the decorator runs - add it to
`src/localpilot/tools/__init__.py` next to the other tools, e.g.:

```python
from localpilot.tools.hello_tool import HelloTool  # noqa: F401  (registers on import)
```

(The existing `tools/__init__.py` imports each built-in tool class for exactly
this reason.) After that, `get_builtin_tools()` includes the tool and every
`Container`-built agent can use it.

## 3. Safety classification (optional)

By default unknown tools require confirmation in `safe`/`balanced` and run in
`autonomous`. To classify your tool explicitly, add it to `TOOL_RISK` in
[`agent/safety.py`](../src/localpilot/agent/safety.py), e.g.
`"hello": RiskLevel.READ_ONLY`. Read-only tools run without confirmation in
`balanced` mode.

## 4. Try it

```python
import asyncio
import tempfile
from pathlib import Path

import structlog

from localpilot.config.schema import AppConfig
from localpilot.logging.setup import EventBus
from localpilot.llm.messages import ToolCall
from localpilot.tools import ToolContext, ToolManager, get_builtin_tools

ctx = ToolContext(
    config=AppConfig(),
    logger=structlog.get_logger("demo"),
    event_bus=EventBus(),
    workdir=Path(tempfile.mkdtemp()),
)
manager = ToolManager(get_builtin_tools())
result = asyncio.run(
    manager.execute(ToolCall(id="1", name="hello", arguments={"name": "Welt"}), ctx)
)
print(result.ok, result.output)  # True Hallo, Welt!
```

For an isolated test (without touching the global registry), build a private
registry instead:

```python
from localpilot.tools.decorators import ToolRegistry

registry = ToolRegistry()
registry.register(HelloTool)
manager = ToolManager(registry.tools())
```

That's the whole contract: validated arguments in, a structured `ToolResult`
out. The agent loop, safety gate, memory logging and event streaming all work
with your tool automatically.
