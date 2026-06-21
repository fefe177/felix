# Handoff - continue LocalPilot in a fresh chat

Paste the prompt below into a new Claude Code session **on the Windows PC** to
continue. Everything is on GitHub; this file makes the context portable.

## Repository

- GitHub repo: `fefe177/felix`
- Branch: `claude/localpilot-phase-0-scaffold-hUjmF`
- This is the source of truth - always pull it first.

## State (what's already done)

LocalPilot - a local, autonomous desktop agent (local LLM via Ollama/LM Studio).
Phases 0-10 are complete and on GitHub:

- Config, logging + event bus, dependency container, CLI.
- LLM layer + defensive tool-call parser.
- Tools: file, terminal, browser (Playwright), desktop (PyAutoGUI), vision
  (screenshot + OCR + VLM).
- Memory: SQLite long-term, short-term, optional vector.
- Autonomous single-agent loop + real safety gate (safe/balanced/autonomous).
- Optional multi-agent orchestrator.
- FastAPI control server (REST + `/ws/events`).
- Electron + React + Vite desktop GUI.
- Docs, example configs, MIT license, end-to-end checks.
- Windows installer via GitHub Actions, **with the Python backend bundled**
  (PyInstaller) so users only need Ollama + a model.

## Next task: Phase 11 - the autonomous daemon

Build the long-running, self-directed agent described in
[`docs/AUTONOMY.md`](AUTONOMY.md): it self-chooses missions
(organize / research / code), runs the existing `AgentLoop` in **autonomous**
mode (no confirmation), learns from experience (memory + strategies +
reflection), and loops.

User's chosen settings:

- Autonomous, **but** keep: STOP-file kill switch, hard command blocklist, and
  writes restricted to the working directory.
- The AI decides for itself which mission to do.
- Implement on the PC, following `docs/AUTONOMY.md` step by step.

Confirm with the user at the start: which folder is the AI's sandbox
(`daemon.mission_root`, default `./workspace`), how often it acts, and whether
the `research` mission may use the live browser.

## Working rules (important)

- **The cloud dev container keeps getting reset to an old commit mid-session.**
  So: at the start of work, and whenever something looks missing, run
  `git fetch origin <branch>` then `git reset --hard origin/<branch>`. **Commit
  and push after every meaningful step** so nothing is lost.
- Quality bar (must stay green): `ruff check .`, `mypy` (strict for
  `src/localpilot`), `pytest`; for the GUI: `npm run build` (tsc) and
  `npm test` (Vitest). Full type hints + docstrings, no TODOs/placeholders.
- To actually run the agent you need a local model: `ollama serve` and
  `ollama pull qwen3:8b`. Without it, the CLI prints a clear "backend not
  reachable" message (tests use a mock LLM, no network).

## How to run / install on Windows

- Full from-source install: `.\scripts\install_windows.ps1`, then
  `.\scripts\start_windows.ps1` (see `README.md`).
- Prebuilt installer: GitHub -> Actions -> "Build Windows installer" ->
  Run workflow (or push a `v*` tag for a Release).
