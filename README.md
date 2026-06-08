# LocalPilot

LocalPilot is an autonomous local desktop agent for Windows 11. It is designed
to run entirely against local, OpenAI-compatible LLM backends (Ollama or LM
Studio) and to operate the desktop, browser and terminal on your behalf.

## Status: Phase 2 (tool system + file/terminal tools)

This repository contains the foundation, the model-facing LLM layer and now the
tool-system foundation with the two simplest tool families. There is
intentionally still no browser, desktop, vision, agent loop or GUI yet.

Delivered so far:

- **Phase 0** - package layout, typed configuration (Pydantic + YAML + `.env`),
  structured logging + event bus, the dependency container and the Typer CLI.
- **Phase 1** - conversation models and OpenAI serialisation, the `LLMClient`
  protocol and `LLMResponse`, the `OpenAICompatibleClient` (Ollama / LM Studio)
  with optional streaming and clear error mapping, and the defensive tool-call
  parser plus repair-message helper.
- **Phase 2** - the `Tool` protocol, `ToolResult`, `ToolContext` and OpenAI
  spec generation; a registry/decorator and the `ToolManager` (validation,
  safety gate, execution, event-bus logging); file tools (`file_read`,
  `file_write`, `file_list`, `dir_create`) and terminal tools (`run_command`,
  `run_python`); and lazy `tool_manager` / `tool_context` container properties.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the LLM layer, the
tool-call contract and the tool system, and [`docs/INSTALL.md`](docs/INSTALL.md)
for detailed setup notes.

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
