# LocalPilot Architecture

This document describes the architecture of LocalPilot in my own words. The
implemented scope is summarised in the per-phase "current state" sections at the
end; the project is built up phase by phase (Phases 0-9 are implemented, from the
configuration scaffold through the autonomous agent to the desktop GUI).

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
- **multiagent** - optional orchestration of role-specialised agents (planner,
  executor, debug, research) reusing the single-agent loop.
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

The `localpilot.agent` package is the heart of the system: the autonomous loop
(Observe -> Think -> Plan -> Act -> Verify -> Learn) plus its state, prompts,
safety gate and planner.

- **`state.py`** - `AgentState` (Pydantic): the goal, the `plan` (`PlanStep`
  list), the current step index, a compact action history, a scratchpad and the
  status.
- **`prompts.py`** - `system_prompt` (role, tools, the strict tool-call
  contract, safety rules), `planner_prompt` (asks for a numbered JSON step list)
  and `verify_prompt` (asks for `{"success", "reason", "next_hint"}`). The
  planner/verify prompts carry stable markers so callers and tests can identify
  the request type.
- **`safety.py`** - `SafetyGate.authorize(tool_name, args, ctx) -> Decision`
  (`allow`, `needs_confirmation`, `reason`): `safe` confirms everything,
  `balanced` confirms writes/terminal/desktop, `autonomous` allows freely but
  hard-denies blocklisted commands and out-of-workdir writes. Hard rules are
  also exposed synchronously as `static_guard` and wired into the `ToolManager`
  as defence in depth. Confirmation goes through the `ConfirmationProvider`
  protocol; `CLIConfirmationProvider` prompts on the terminal.
- **`planner.py`** - `Planner.make_plan(goal, memory)` pulls relevant strategies
  from long-term memory, asks the LLM and parses the step list defensively,
  falling back to a single generic step.
- **`loop.py`** - `AgentLoop.run(goal, safety_mode)`: create the task, build the
  plan, then iterate. Each turn: build the prompt from plan + short-term context
  + last observation; ask the LLM; parse a tool call (one repair attempt on
  failure); handle `finish` / `ask_user`; otherwise authorise (and confirm) and
  execute each tool, persist the step, feed the observation back; verify
  progress (updating the plan) and learn (reinforce or penalise strategies).
  Bounded by `agent.max_iterations`; returns an `AgentRunResult`.

The container exposes a `safety_gate`, wires `static_guard` into the
`tool_context`, and builds a fully-wired loop via `create_agent_loop(...)`. The
CLI runs it with `localpilot run --goal "<goal>" [--safe|--balanced|--autonomous]`.

## Multi-agent mode (optional)

The `localpilot.multiagent` package adds an optional orchestration layer on top
of the single-agent loop. It is off by default (`multi_agent: false`); the
single-agent path is unchanged when disabled.

- **`roles.py`** - the `AgentRole` protocol and four roles, each with a
  system-prompt suffix and an allowed-tool predicate: `PlannerAgent`
  (read-only planning), `ExecutorAgent` (all tools, subject to safety),
  `DebugAgent` (reads terminal/logs/files to diagnose failures) and
  `ResearchAgent` (browser/vision/search). Each suffix embeds a `[[ROLE:<name>]]`
  marker.
- **`orchestrator.py`** - `Orchestrator.run(goal, mode)`: the planner produces
  the plan; for each step a role is chosen (research keywords -> research, else
  executor); a step is executed by a **reused** `AgentLoop` configured with the
  role's tool subset and prompt suffix (no tool logic is duplicated). On failure
  the debug role analyses the step and its hint feeds bounded executor retries.
  Roles share the long-term and short-term memory and the event bus; every role
  switch is published for the GUI.

The container's `create_runner(multi_agent, ...)` returns the `Orchestrator`
when enabled and the `AgentLoop` otherwise; the CLI adds `--multi-agent`.

## Control server

The `localpilot.server` package exposes the agent over HTTP/WebSocket so a
desktop GUI (a later phase) can drive it. It is the Python backend only - no GUI
files.

- **`websocket.py`** - `/ws/events` subscribes a connection to the event bus and
  forwards every event (thoughts, tool calls, results, screenshot paths, role
  changes, log lines) as JSON. Each client gets its own queue, so several can
  listen at once; a concurrent reader detects disconnects.
- **`routes.py`** - REST: `POST /api/tasks` (start a run; one at a time, else
  409), `POST /api/tasks/{id}/cancel` (cooperative cancel), `POST /api/confirm`
  (deliver a safety decision), `GET /api/tasks` and `GET /api/tasks/{id}`,
  `GET`/`PUT /api/memory/preferences`, `GET /api/memory/strategies`,
  `GET /api/screenshots/{name}`, `GET /api/config` (secrets redacted) and
  `GET /api/health`.
- **`runtime.py`** - the `AgentRunManager` (single background run, cancellation),
  the `WebUIConfirmationProvider` (a `ConfirmationProvider` whose `confirm`
  publishes a `confirmation_request` event and awaits the decision from
  `POST /api/confirm`) and the shared `ServerContext`.
- **`app.py`** - the FastAPI factory: CORS for the Vite dev origin, the routers,
  and a lifespan that builds/adopts the container, attaches the provider and
  bridges the application logger to the event bus so log lines also stream over
  `/ws/events`; on shutdown it cancels any run and closes the browser/database.

The CLI starts it with `localpilot serve` (host/port from `ServerConfig`).

## Desktop GUI

The `gui/` directory holds the desktop GUI (Electron + React + Vite); it is a
pure client of the control server and contains no agent logic.

- **Electron** (`electron/main.js`, `preload.js`) - creates the window (Vite dev
  server in dev, built files in production), optionally starts the Python
  backend (`localpilot serve`) as a child process, waits for `/api/health` and
  stops it on quit. The preload exposes only the backend base URL to the
  renderer (context isolation on, node integration off). Backend command/URL are
  configurable via environment variables.
- **API layer** (`src/api/`) - `client.ts` wraps the REST endpoints (typed,
  with an `ApiError`), `config.ts` resolves the backend URL, and
  `useEventStream.ts` subscribes to `/ws/events` and reduces the raw events into
  typed state (run status, plan, tool calls, logs, screenshot, pending
  confirmation), reconnecting automatically.
- **Components** (`src/components/`) - a dark dashboard: `TaskPanel` (goal,
  safety mode, multi-agent toggle, start/stop, `ConfirmDialog` for SAFE/BALANCED
  confirmations), `PlanView`, `ToolCalls`, `LiveLogs`, `ScreenshotPreview` and
  `MemoryView` (tasks with step drilldown, preferences, strategies). Connection
  and error states are surfaced clearly.

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

## Phase 8 (current state)

Phase 8 adds the HTTP/WebSocket control server (the Python backend only - no GUI
files):

- `/ws/events` streaming all agent events to multiple clients;
- REST endpoints to start (one at a time -> 409) and cancel runs, deliver safety
  confirmations via the `WebUIConfirmationProvider`, and read tasks,
  preferences, strategies, screenshots, the redacted config and health;
- a FastAPI app with CORS, a lifespan managing the container and a logger ->
  event-bus bridge, and the `localpilot serve` command.

Earlier phases delivered the configuration system, logging and event bus, the
container, the CLI, the LLM layer with the tool-call parser, the tool system
with file/terminal/browser/desktop/vision tools, the controllers, the vision
system, the memory system, the autonomous single-agent loop with its safety
gate, and the optional multi-agent orchestrator.

## Phase 9 (current state)

Phase 9 adds the desktop GUI in `gui/` (Electron + React + Vite), a pure client
of the Phase 8 control server:

- an Electron shell that can start/stop the Python backend and exposes only its
  base URL to the renderer;
- a typed REST client and a reconnecting `useEventStream` hook over `/ws/events`;
- a dark dashboard (task panel with confirmation dialog, plan, tool calls, live
  logs, screenshot preview) and a memory browser;
- a light Vitest unit test for the REST client and a documented manual smoke
  check.

The GUI completes the LocalPilot stack from configuration through the autonomous
agent to a desktop interface.
