# Installing LocalPilot

LocalPilot targets **Windows 11** for its desktop-automation features, but the
configuration, LLM layer, memory, server and (browser-based) tools also run on
Linux/macOS for development. This guide covers a full install of the Python
backend and the optional desktop GUI.

## 1. Prerequisites

- **Windows 11** (for desktop/vision automation; other OSes work for the rest).
- **Python 3.11+** - verify with `python --version`.
- **Node.js 18+** - only for the GUI (`gui/`).
- A local, OpenAI-compatible LLM backend:
  - [Ollama](https://ollama.com/) on `http://localhost:11434`, or
  - [LM Studio](https://lmstudio.ai/) with its OpenAI server on
    `http://localhost:1234`.
- Models (pull before first real run), e.g. with Ollama:

  ```powershell
  ollama pull qwen3:8b          # agent/reasoning model
  ollama pull qwen2.5vl:7b      # vision-language model (for vision_describe)
  ```

## 2. Virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\activate
```

If PowerShell blocks activation, allow scripts for the session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

## 3. Install the Python package

```powershell
pip install -e ".[dev]"     # editable install incl. dev tools (pytest, ruff, mypy)
# or, runtime only:
pip install -r requirements.txt
```

## 4. Install the Playwright browser

The browser tools drive Chromium via Playwright. Download it once:

```powershell
playwright install chromium
```

## 5. Configure

```powershell
copy .env.example .env        # then edit; see config/models.example.yaml for profiles
```

Precedence (lowest to highest): `config/default.yaml` -> a `--config` file ->
`.env` / process environment (`LOCALPILOT_` prefix, `__` for nesting).

## 6. Verify

```powershell
localpilot config            # prints the merged configuration as JSON
localpilot run               # initialises everything and reports readiness
pytest                       # run the test suite
```

## 7. (Optional) Desktop GUI

```powershell
cd gui
npm install
npm run dev                  # starts Vite + Electron; Electron starts the backend
```

See [`gui/README.md`](../gui/README.md) for dev vs. build details.

## Windows-specific notes

### PyAutoGUI (desktop control)

- PyAutoGUI and PyGetWindow are imported **lazily** and only by the desktop
  tools, so importing LocalPilot never requires a display. They do require an
  interactive desktop session at run time.
- Keep PyAutoGUI's **fail-safe** enabled (`desktop.failsafe: true`, the default):
  slamming the mouse into a screen corner aborts automation.
- Some applications run elevated; to control them, LocalPilot must run with
  matching privileges. Prefer non-elevated targets where possible.
- Display scaling (high-DPI) can offset coordinates. Use `vision_find` (OCR) to
  locate on-screen text and feed the returned centre into `desktop_click`.

### Playwright (browser)

- `playwright install chromium` downloads a managed Chromium into a per-user
  cache. If your environment blocks the download, the browser tools and their
  tests are skipped with a clear message; everything else still works.
- Set `browser.headless: true` for unattended runs.

### ONNX OCR (vision)

- OCR uses `rapidocr-onnxruntime`, which bundles ONNX models and runs on the CPU
  by default - no GPU or extra downloads required. The engine is initialised
  lazily on first use (the first OCR call is slower).
- Screen capture uses `mss` and needs a real display; it fails on a headless
  host (expected - that path is for the Windows desktop).

### Optional vector memory

- Semantic memory is off by default. To enable it, set
  `memory.vector_enabled: true`, configure `memory.embedding_model`, and install
  `sqlite-vec` (`pip install sqlite-vec`). When unavailable it degrades to a safe
  no-op with a clear status message.

## Troubleshooting

- **`localpilot` not found** - activate the virtual environment and confirm the
  editable install succeeded.
- **Default config not found** - run from the repository root so
  `config/default.yaml` resolves.
- **LLM connection errors** - ensure Ollama/LM Studio is running and the model
  is pulled/loaded; check `llm.base_url` and `llm.model`.
- **Skipped tests** - browser tests skip when Chromium is not installed; OCR
  tests skip if the engine/font is unavailable. Both are expected without those
  optional pieces.
