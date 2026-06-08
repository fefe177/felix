# LocalPilot Architecture

This document describes the intended architecture of LocalPilot in my own
words. **Only the scaffold described in "Phase 0" below exists today**; the
remaining components are design targets for later phases.

## Goals

LocalPilot is an autonomous desktop agent that runs entirely on the local
machine. It reasons with a local, OpenAI-compatible LLM (Ollama or LM Studio)
and acts on the world through a set of tools: the desktop GUI, a browser, the
terminal and screen vision. Everything stays local for privacy and control.

## The agent loop

The core of LocalPilot (a later phase) is a perceive → think → act → observe
loop:

1. **Perceive.** Gather the current context: the user goal, recent history,
   relevant memory, and — when needed — a screenshot plus OCR/vision analysis
   of the screen.
2. **Think.** Send the context and the catalogue of available tools to the LLM.
   The model responds either with a final answer or with one or more tool
   calls.
3. **Act.** Execute the requested tool calls, subject to the active safety mode
   (see below). Each tool runs with validated arguments and a timeout.
4. **Observe.** Feed the tool results back into the context and repeat until the
   goal is met, a stop condition fires, or the user intervenes.

Events emitted at each step are published on an in-process event bus so a
future GUI can stream the agent's reasoning and actions in real time.

## Components

- **config** - typed, layered configuration (defaults → user YAML → `.env` /
  environment). Validated with Pydantic.
- **logging** - structured logging that renders a readable console view and a
  JSON log simultaneously, plus the event bus.
- **container** - a tiny dependency container that owns the configuration and
  lazily builds shared services.
- **llm** - a thin client over the local OpenAI-compatible endpoint, including
  tool-call request/response handling.
- **tools** - the tool registry and individual tool implementations. Tools
  expose a name, a typed argument schema and a result.
- **memory** - short- and long-term memory backed by SQLite (optionally a
  vector index) for recall across turns and sessions.
- **vision** - screenshot capture and OCR/vision analysis so the agent can
  "see" the screen.
- **browser** - browser automation via Playwright.
- **desktop** - mouse/keyboard/window control of native applications.
- **terminal** - sandboxed command execution with a command blocklist and a
  configurable working directory.
- **agent** - the single-agent reasoning loop described above.
- **multiagent** - orchestration of multiple cooperating agents.
- **server** - a local FastAPI + websocket server exposing control and the
  event stream to a GUI.

## Tool-call contract

Tools are the agent's only way to affect the world, and they follow a single
contract:

- Every tool has a **unique name** and a **typed argument schema** (Pydantic).
  The schemas are advertised to the LLM so it can request calls correctly.
- The LLM requests a tool by emitting a structured tool call: the tool name
  plus a JSON arguments object.
- Arguments are **validated** against the schema before execution. Invalid
  calls are rejected and the error is returned to the model rather than crashing
  the loop.
- Each tool returns a **structured result** (success/failure plus a payload or
  error message). That result is appended to the conversation so the model can
  reason about what happened.
- Execution is **bounded**: tools run with a timeout and may be blocked or
  require confirmation depending on the active safety mode.

This uniform contract keeps the reasoning loop independent of any individual
tool and makes new tools easy to add.

## LLM layer & tool-call parsing

The `localpilot.llm` package implements the model-facing half of the tool-call
contract. It is intentionally backend-agnostic and works against any
OpenAI-compatible `/v1` endpoint (Ollama, LM Studio).

- **Messages** (`messages.py`) - `Role`, `Message` and `ToolCall` Pydantic
  models plus `to_openai_format`, which serialises a conversation into the
  `list[dict]` shape the chat-completions API expects.
- **Client protocol** (`base.py`) - `LLMClient` is a structural `Protocol`
  exposing `async chat(messages, tools=None, **kw) -> LLMResponse`. An
  `LLMResponse` carries the assistant `text`, any native `tool_calls`, the
  `raw` backend payload and optional token `usage`.
- **OpenAI-compatible client** (`openai_compatible.py`) - wraps `AsyncOpenAI`,
  builds requests from `LLMConfig` (base URL, API key, model, temperature,
  max tokens, timeout), optionally streams and reassembles the final response,
  and translates transport failures into `LLMTimeoutError` /
  `LLMConnectionError`.
- **Tool-call parser** (`parsing.py`) - the backbone. `extract_tool_calls`
  prefers the backend's native tool calls. When a model only emits text, it:
  1. strips Markdown code fences, preferring fenced content;
  2. locates balanced JSON objects with a string-aware brace matcher (not a
     naive regex), so braces inside string values do not corrupt boundaries;
  3. accepts both `{"tool": ..., "arguments": {...}}` and
     `{"actions": [...]}`, and recognises the special `finish` (with a
     `summary`) and `ask_user` (with a `question`) tools, including shorthand
     spellings;
  4. raises `ToolCallParseError` with a model-readable message when nothing
     valid can be recovered. `build_repair_message` turns that message into a
     system instruction for a single repair attempt.

This realises the "structured tool call in, validated call out" half of the
contract; argument-schema validation and execution arrive with the tool
registry described next.

## Tool system

The `localpilot.tools` package implements the execution half of the tool-call
contract.

- **Foundation** (`base.py`) - `ToolResult` (`ok`, `output`, `error`, `meta`),
  the `Tool` protocol (`name`, `description`, `args_model`, async `run`), the
  `ToolContext` (config, logger, event bus, workdir and a `safety_gate`
  callback that is permissive until Phase 6) and `build_tool_spec`, which turns
  a tool's `args_model` into an OpenAI tool spec via `model_json_schema()`.
- **Registration** (`decorators.py`) - a small `ToolRegistry` whose `register`
  class decorator instantiates and stores tools by name. The built-in tools
  register into the shared `builtin_tools` registry.
- **Manager** (`registry.py`) - `ToolManager` produces specs via `get_specs()`
  and runs a `ToolCall` through `execute()`: unknown tool, invalid arguments
  (Pydantic validation), a blocked safety gate or a raised exception each become
  an `ok=False` `ToolResult` with a model-readable message (tracebacks go into
  `meta`). Every invocation is logged and published on the event bus
  (`tool_name`, `args`, `ok`, `duration_ms`).
- **File tools** (`file_tools.py`) - `file_read` (encoding fallback, size
  limit), `file_write` (honours `restrict_writes_to_workdir`, creates parents),
  `file_list` and `dir_create`. Blocking I/O runs in `asyncio.to_thread`.
- **Terminal tools** (`terminal_tools.py`) - `run_command` (shell, screened
  against `command_blocklist`, timeout, output truncation) and `run_python`
  (inline code or a file via the current interpreter, same limits).
- **Browser tools** (`browser_tools.py`) - thin wrappers over the browser
  controller: `browser_open`/`browser_goto`, `browser_get_text`,
  `browser_click`, `browser_type`, `browser_extract_links` and `browser_search`
  (Google query with a robust `a:has(h3)` selector and a visible-text fallback).
  Outputs stay compact (text and link lists are capped).
- **Desktop tools** (`desktop_tools.py`) - wrappers over the desktop controller:
  `desktop_move`, `desktop_click`, `desktop_double_click`, `desktop_scroll`,
  `desktop_type`, `desktop_press` and `desktop_activate_window`. Coordinates are
  validated against the current screen size before any movement.
- **Vision tools** (`vision_tools.py`) - `vision_screenshot` (capture, save,
  emit a `screenshot` event, return a small preview), `vision_describe` (VLM
  description), `vision_ocr` (recognised text + box count) and `vision_find`
  (locate on-screen text and return click coordinates). Heavy work runs in a
  worker thread.

## Browser and desktop controllers

The `localpilot.browser` and `localpilot.desktop` packages hold the stateful
controllers; the container owns one of each as a lazily-started singleton and
attaches them to the `ToolContext`.

- **`BrowserController`** (Playwright/Chromium) - idempotent, lock-guarded
  `start`/`stop`; a single context and page; async navigation and query helpers
  (`goto`, `get_text`, `click`, `type`, `get_links`, `screenshot_bytes`,
  `wait_for`, ...) that honour the configured timeouts and raise `BrowserError`
  instead of hanging. The container's `shutdown()` stops it on app exit (wired
  into `main.py run`).
- **`DesktopController`** (PyAutoGUI/PyGetWindow) - target platform is Windows
  11. PyAutoGUI and PyGetWindow are imported **lazily** (they cannot even import
  without a display), so the module loads fine on headless CI; backends can be
  injected for tests. Each blocking call runs via `asyncio.to_thread`, and
  `FAILSAFE`/`PAUSE` follow `DesktopConfig`.

## Vision system

The `localpilot.vision` package lets the agent "see" the screen.

- **`capture.py`** - `capture_screen` / `capture_region` (via `mss`, returning
  Pillow images), `save_temp` and `to_base64_png`. Capturing needs a real
  display, so it works on the Windows desktop but not on a headless CI box.
- **`ocr.py`** - a wrapper around `rapidocr-onnxruntime`. The ONNX engine is
  expensive, so it is initialised lazily and cached. `ocr_image` returns
  `OCRBox` results (text, confidence, box, centre); `full_text` joins them.
- **`vlm.py`** - `describe_image` reuses the OpenAI-compatible client and sends
  the screenshot inline as a base64 data URL in the OpenAI vision content
  format, using the model from `VisionConfig`. It returns a clear notice when
  vision is disabled.
- **`elements.py`** - pragmatic, **OCR/text-based** element finding:
  `find_text_elements` turns recognised lines into click targets and
  `find_element_by_text` returns the best match's centre and a similarity score.
  This is a heuristic bridge to `desktop_click`; it does not do pixel-accurate
  button segmentation and cannot find icon-only controls.

The container wires the LLM client into the `ToolContext` (vision description's
dependency); the OCR engine is the lazily-initialised vision service.

## Memory system

The `localpilot.memory` package gives the agent recall across steps and
sessions.

- **`db.py`** - `Database`, an async `aiosqlite` wrapper with WAL mode,
  foreign-key enforcement, idempotent schema initialisation (`schema.sql`) and
  small `execute`/`fetchall`/`fetchone` helpers.
- **`schema.sql`** - tables for `tasks`, `steps`, `errors`, `preferences` and
  `strategies` (UUID-string ids, ISO-8601 timestamps) with indexes on
  `task_id`/`status`.
- **`long_term.py`** - `LongTermMemory`: create tasks and set their
  result/error/status, append steps, log and read errors, get/set preferences,
  record strategies and bump their success/failure tallies (`find_strategies`
  ranks by success rate), and read recent tasks or a task with its ordered
  steps. Reads return typed records (`TaskRecord`, `StepRecord`, ...).
- **`short_term.py`** - `ShortTermMemory`: transient, per-task working memory
  with the current goal, a bounded history of observations/actions and a
  scratchpad; `as_context_text()` renders a compact prompt summary.
- **`vector.py`** - `VectorMemory`: optional semantic memory over `sqlite-vec`,
  gated by `memory.vector_enabled` and a configured embedding model. When the
  feature is off or `sqlite-vec` is missing, every method is a safe no-op and
  `status()` explains why. Embeddings use the OpenAI-compatible `/v1/embeddings`
  endpoint.

The container exposes lazy `database` and `memory` properties; `startup()`
connects the database and initialises the schema, and `shutdown()` closes it.

## Agent loop

The `localpilot.agent` package implements the think -> act -> observe loop and
the safety gate.

- **`loop.py`** - `Agent.run(goal)` creates a task, builds the system prompt and
  conversation, then iterates: ask the LLM (advertising the tool specs), extract
  a tool call (sending a repair message on a parse failure, bounded by
  `agent.max_repair_attempts`), and either handle the `finish` / `ask_user`
  control tools or execute the tool via the `ToolManager`. Each result is fed
  back as an observation, persisted as a step (errors are logged) and streamed
  on the event bus. The loop is bounded by `agent.max_iterations`. It returns an
  `AgentResult` (`completed` / `failed` / `needs_input`).
- **`safety.py`** - `SafetyGate` is the real gate (the `ToolContext` placeholder
  from Phase 2). It classifies each tool by risk (`read_only` / `write` /
  `dangerous`, unknown tools being dangerous) and allows it automatically only
  up to the threshold of the active mode; anything above needs a confirmation
  callback (denied by default). Static guardrails (command blocklist, workdir
  restriction) live in the tools and always apply.
- **`prompts.py`** - assembles the system prompt: identity, safety mode, the
  tool list and the strict JSON tool-call contract.

The container's `tool_context` now carries a real `SafetyGate`, and
`create_agent()` builds a fully-wired agent. The CLI exposes `localpilot do
"<goal>"`.

## Safety modes

A configurable safety mode governs how much autonomy the agent has:

- **safe** - the most conservative mode. Read-only and clearly harmless actions
  may run automatically; anything that changes the system (writing files,
  running commands, clicking destructive UI) requires explicit confirmation.
- **balanced** (default) - everyday actions run automatically, but high-risk or
  irreversible operations (destructive shell commands, writes outside the
  workdir, system-level changes) still require confirmation.
- **autonomous** - the agent acts without per-step confirmation. The static
  guardrails remain in force: the command blocklist, tool timeouts, and the
  option to restrict file writes to the configured workspace directory.

Across all modes, baseline guardrails always apply: a blocklist of dangerous
commands, per-tool timeouts, an optional restriction that confines file writes
to the workspace directory, and PyAutoGUI's fail-safe corner to abort desktop
control.

## Phase 0 (current state)

Phase 0 delivers only the foundations:

- the full package layout with placeholder sub-packages;
- the configuration schema, loader and default files;
- structured logging and the event bus;
- the dependency container;
- the Typer CLI (`run`, `config`);
- tests and project metadata.

## Phase 6 (current state)

Phase 6 adds the single-agent loop and the real safety gate:

- the think/act/observe `Agent` loop with parse-repair, the `finish` /
  `ask_user` control tools, step persistence and event streaming, bounded by
  `agent.max_iterations` / `agent.max_repair_attempts`;
- the `SafetyGate` enforcing the safety modes (replacing the Phase 2
  placeholder), wired into the `ToolContext`;
- `Container.create_agent()` and the `localpilot do "<goal>"` CLI command.

Earlier phases delivered the configuration system, logging and event bus, the
container, the CLI, the LLM layer with the tool-call parser, the tool system
with file/terminal/browser/desktop/vision tools, the controllers, the vision
system and the memory system.

No multi-agent orchestration or server/GUI functionality is implemented yet —
those arrive in later phases.
