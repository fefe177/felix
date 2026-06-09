# LocalPilot GUI

Desktop GUI for LocalPilot built with **Electron + React + Vite**. It talks to
the Python backend from Phase 8 over REST (`/api/...`) and a WebSocket
(`/ws/events`).

## Prerequisites

- Node.js 18+ and npm
- The LocalPilot Python package installed (so the backend can run), see the
  repository root `README.md`.

## Install

```bash
cd gui
npm install
```

## Run (development)

In dev, Vite serves the UI at `http://localhost:5173` and Electron loads it.
Electron also starts the Python backend (`localpilot serve`) automatically and
waits for `/api/health` before showing the window.

```bash
npm run dev
```

If you prefer to run the backend yourself (e.g. to see its logs in a separate
terminal), start it first and tell Electron not to spawn its own:

```bash
# terminal 1
localpilot serve
# terminal 2
cd gui
LOCALPILOT_EXTERNAL_BACKEND=1 npm run dev
```

### Backend command / URL (environment variables)

- `LOCALPILOT_BACKEND_URL` - backend base URL (default `http://127.0.0.1:8765`).
- `LOCALPILOT_EXTERNAL_BACKEND=1` - do not spawn the backend (use a running one).
- `LOCALPILOT_BACKEND_CMD` - full command to start the backend (overrides the
  default). Example: `LOCALPILOT_BACKEND_CMD="localpilot serve"`.
- `LOCALPILOT_PYTHON` - python executable for the default command
  (`python -m localpilot.main serve`).

If the backend cannot be started or reached, Electron shows a clear dialog and
the UI still opens, displaying the connection status and reconnecting.

## Build (production)

```bash
npm run build      # type-check + bundle the renderer into dist/
npm start          # run Electron against the built files
```

- **Dev mode** loads `http://localhost:5173` (hot reload) via Vite.
- **Build mode** loads the static files from `dist/` inside Electron.

## Packaging a Windows installer (electron-builder)

```bash
npm run dist:win   # builds a Windows NSIS installer + a portable .exe into release/
# or, for the current platform:
npm run dist
```

This produces, in `release/`:

- `LocalPilot Setup <version>.exe` - an NSIS installer (lets the user choose the
  install location, creates a desktop shortcut), and
- `LocalPilot <version>.exe` - a portable single-file executable.

The branded icon comes from `assets/icon.ico` (a 512px source is in
`assets/icon.png`).

### Important: where to build, and the Python backend

- **Build on Windows** for a Windows installer. Building a Windows target on
  Linux/macOS additionally needs Wine; on a network-restricted machine the build
  fails because electron-builder must download the Electron/Windows binaries.
- The installer packages **only the GUI**. The Python backend is **not** bundled.
  On the target machine, install the LocalPilot Python package and make sure the
  `localpilot` command is on `PATH` (the GUI spawns `localpilot serve` on
  startup). Alternatively set, before launching:
  - `LOCALPILOT_PYTHON` - e.g. `C:\path\to\python.exe` (the GUI then runs
    `python -m localpilot.main serve`), or
  - `LOCALPILOT_BACKEND_CMD` - a full command to start the backend, or
  - `LOCALPILOT_EXTERNAL_BACKEND=1` - if you start `localpilot serve` yourself.
- Bundling the Python backend into the installer (e.g. with PyInstaller) is
  possible but out of scope here.

## Tests

A light unit test covers the REST client shapes with a mocked `fetch`:

```bash
npm test
```

## Manual smoke check

1. Start the backend: `localpilot serve` (or let `npm run dev` do it).
2. Start the GUI: `cd gui && npm run dev`.
3. In the window, type a goal (e.g. *"Erstelle eine Datei notes.txt im
   Arbeitsverzeichnis"*), pick a safety mode and click **Start**.
4. Watch the **Plan**, **Tool-Aufrufe** and **Live-Logs** panels update from the
   event stream; if you chose SAFE/BALANCED a confirmation dialog appears for
   risky actions - approve or reject it.
5. Open the **Memory** view to browse recent tasks (with step drilldown),
   preferences and strategies.

> A reachable local LLM backend (Ollama or LM Studio) is required for a real run;
> without one the agent run will report a connection error, but the GUI, event
> stream and memory views still work.
