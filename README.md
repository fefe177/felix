# LocalPilot

LocalPilot is an autonomous local desktop agent for Windows 11. It is designed
to run entirely against local, OpenAI-compatible LLM backends (Ollama or LM
Studio) and to operate the desktop, browser and terminal on your behalf.

## Status: Phase 0 (scaffold)

This repository currently contains **only the project scaffold and toolchain**.
There is intentionally no agent logic, no tools, no vision/browser/desktop
automation and no GUI yet. Phase 0 delivers:

- the full package layout with placeholder sub-packages for later phases;
- a typed, validated configuration system (Pydantic + YAML + `.env`);
- structured logging (pretty console + JSON file) and an in-process event bus;
- a lightweight dependency container;
- a Typer command-line interface with `run` and `config` commands;
- tests and project metadata.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the intended design and
[`docs/INSTALL.md`](docs/INSTALL.md) for detailed setup notes.

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
