# LocalPilot

LocalPilot is an autonomous local desktop agent for Windows 11. It is designed
to run entirely against local, OpenAI-compatible LLM backends (Ollama or LM
Studio) and to operate the desktop, browser and terminal on your behalf.

## Status: Phase 6 (the autonomous agent)

This repository contains the foundation, the LLM layer, the tool system, the
browser/desktop controllers, the vision system, the memory system and now the
autonomous agent: state, planner, prompts, the real safety gate and the main
Observe -> Think -> Plan -> Act -> Verify -> Learn loop. There is intentionally
still no multi-agent orchestration (Phase 7) or GUI (Phase 8) yet.

Delivered so far:

- **Phase 0** - package layout, typed configuration (Pydantic + YAML + `.env`),
  structured logging + event bus, the dependency container and the Typer CLI.
- **Phase 1** - conversation models and OpenAI serialisation, the `LLMClient`
  protocol and `LLMResponse`, the `OpenAICompatibleClient` (Ollama / LM Studio)
  with optional streaming, and the defensive tool-call parser.
- **Phase 2** - the `Tool` protocol, `ToolResult`, `ToolContext`, OpenAI spec
  generation, the `ToolManager`, and file/terminal tools.
- **Phase 3** - `BrowserController` (Playwright/Chromium) and browser tools
  (`browser_open`, `browser_goto`, `browser_get_text`, `browser_click`,
  `browser_type`, `browser_extract_links`, `browser_search`); `DesktopController`
  (PyAutoGUI/PyGetWindow, lazy imports) and desktop tools (`desktop_move`,
  `desktop_click`, `desktop_double_click`, `desktop_scroll`, `desktop_type`,
  `desktop_press`, `desktop_activate_window`); container singletons wired into
  the tool context, with a browser cleanup hook on shutdown.
- **Phase 4** - the vision system: screen capture (`mss`), lazy OCR
  (`rapidocr-onnxruntime`), VLM description (OpenAI vision format) and heuristic
  text-based element finding, exposed as `vision_screenshot`, `vision_describe`,
  `vision_ocr` and `vision_find` tools.
- **Phase 5** - the memory system: an async SQLite database (`aiosqlite`, WAL),
  long-term memory (tasks, steps, errors, preferences, strategies), bounded
  short-term working memory, and optional `sqlite-vec` vector memory that
  degrades to a no-op; wired into the container with `startup`/`shutdown`.
- **Phase 6** - the autonomous agent: `AgentState`/`PlanStep`, the planner, the
  system/planner/verify prompts, the real async `SafetyGate` (with a
  confirmation provider) wired into the tool manager, and the `AgentLoop`
  (Observe -> Think -> Plan -> Act -> Verify -> Learn) with parse-repair,
  `finish`/`ask_user`, step persistence, strategy learning and event streaming;
  run with `localpilot run --goal "<goal>" [--safe|--balanced|--autonomous]`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the LLM layer, the
tool-call contract, the tool system, the controllers, the vision system, the
memory system and the agent loop, and [`docs/INSTALL.md`](docs/INSTALL.md) for
detailed setup notes.

## Requirements

- Windows 11
- Python 3.11+

## Installation

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -e ".[dev]"
playwright install chromium
```

`playwright install chromium` downloads the browser used by later phases; it is
harmless to run now.

## Usage

Start LocalPilot (Phase 0 only loads config, initialises logging and reports
readiness, then exits):

```powershell
localpilot run
```

Run the agent on a goal (needs a reachable local LLM backend):

```powershell
localpilot run --goal "Erstelle eine Datei notes.txt im Arbeitsverzeichnis" --balanced
```

Without `--goal`, `localpilot run` prompts interactively (or just reports
readiness when run non-interactively). Use `--safe` / `--balanced` /
`--autonomous` to choose the safety mode.

Print the fully merged configuration as JSON:

```powershell
localpilot config
```

Use a custom configuration file (deep-merged over the defaults):

```powershell
localpilot run --config path\to\my-config.yaml
```

### Configuration

Configuration is layered, lowest precedence first:

1. `config/default.yaml` - bundled defaults.
2. An optional YAML file passed via `--config`.
3. `.env` file and process environment variables, prefixed with `LOCALPILOT_`
   and nesting via `__` (e.g. `LOCALPILOT_LLM__MODEL=qwen3:14b`).

Copy `.env.example` to `.env` to set overrides, and see
`config/models.example.yaml` for ready-made model profiles.

## Development

```powershell
pytest          # run the test suite
ruff check .    # lint
mypy            # type-check src/localpilot (strict)
```
