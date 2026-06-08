# LocalPilot

LocalPilot is an autonomous local desktop agent for Windows 11. It is designed
to run entirely against local, OpenAI-compatible LLM backends (Ollama or LM
Studio) and to operate the desktop, browser and terminal on your behalf.

## Status: Phase 5 (memory system)

This repository contains the foundation, the LLM layer, the tool system, the
browser/desktop controllers, the vision system and now the memory system. There
is intentionally still no agent loop or GUI yet.

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

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the LLM layer, the
tool-call contract, the tool system, the controllers, the vision system and the
memory system, and [`docs/INSTALL.md`](docs/INSTALL.md) for detailed setup notes.

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
