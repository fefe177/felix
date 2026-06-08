# Installing LocalPilot

This guide covers installing the Phase 0 scaffold on Windows 11. Linux and
macOS work for development of the configuration and CLI, but the eventual
desktop-automation features target Windows 11.

## 1. Prerequisites

- **Windows 11**
- **Python 3.11 or newer** - verify with:

  ```powershell
  python --version
  ```

- A local LLM backend for later phases (not required for Phase 0):
  - [Ollama](https://ollama.com/) listening on `http://localhost:11434`, or
  - [LM Studio](https://lmstudio.ai/) serving an OpenAI-compatible API on
    `http://localhost:1234`.

## 2. Create and activate a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\activate
```

On PowerShell you may first need to allow script execution for the session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

## 3. Install LocalPilot

Editable install including the development tools:

```powershell
pip install -e ".[dev]"
```

Runtime-only install (mirrors `requirements.txt`):

```powershell
pip install -r requirements.txt
```

## 4. Install the Playwright browser

Later phases drive a headless/headful Chromium via Playwright. Download it now:

```powershell
playwright install chromium
```

## 5. Configure

1. Copy the example environment file and edit as needed:

   ```powershell
   copy .env.example .env
   ```

2. Optionally start from a model profile in `config/models.example.yaml`, or
   create your own YAML file and pass it with `--config`.

Precedence (lowest to highest): `config/default.yaml` → `--config` file →
`.env` / environment variables (`LOCALPILOT_` prefix, `__` nesting).

## 6. Verify the installation

```powershell
localpilot config   # prints the merged configuration as JSON
localpilot run      # logs "LocalPilot bereit (Phase 0)" and exits
```

Run the test suite:

```powershell
pytest
```

## Troubleshooting

- **`localpilot` not found** - ensure the virtual environment is activated and
  the editable install completed without errors.
- **Default config not found** - run the CLI from the repository root so
  `config/default.yaml` can be located.
- **PyAutoGUI import errors on a headless Linux dev box** - these only matter
  for later desktop-automation phases; Phase 0 does not import them.
