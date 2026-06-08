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
registry in a later phase.

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

## Phase 1 (current state)

Phase 1 adds the LLM layer and the tool-call parser described above:

- conversation message models and OpenAI serialisation;
- the `LLMClient` protocol and `LLMResponse` model;
- the `OpenAICompatibleClient` with streaming support and clear error mapping;
- the defensive tool-call parser and repair-message helper;
- a lazy `llm_client` property on the container.

No concrete tools, agent loop, vision, browser, desktop, terminal, multi-agent
or server functionality is implemented yet — those arrive in later phases.
