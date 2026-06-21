# Phase 11 plan - Autonomous daemon ("the AI that lives on your PC")

This is a **design / build plan**, not yet implemented. It captures exactly what
to build so we can execute it on the user's Windows PC. It reuses the existing
agent loop, safety gate and memory - nothing here re-implements tool logic.

## Goal (what the user asked for)

A long-running agent that **lives on the machine**: when it has nothing to do it
**chooses its own goal**, runs it **autonomously (no per-action confirmation)**,
records everything, **learns from experience over time**, and repeats.

Chosen settings (from the user):

- **Autonomy:** fully autonomous (no confirmation prompts), **but** the
  emergency stop and the hard command blocklist stay on, and writes stay
  restricted to the working directory (`safety.restrict_writes_to_workdir: true`).
- **Mission:** the AI decides for itself among **organising files**,
  **researching & collecting knowledge**, and **working on code/projects**.
- **Timing:** plan now, build on the PC.

## Honest scope - what "learns the whole time" really means

A local open model does **not** retrain its own weights in real time (that needs
a training pipeline + GPU and risks breaking the model). "Learning" here is
**experience-based**, which is what already exists in the codebase and is what a
long-running agent actually needs:

- **Long-term memory** (SQLite): every task, step and error is stored.
- **Strategies** with success/fail counters that get reinforced over time
  (`record_strategy` / `bump_strategy_success` / `bump_strategy_fail`).
- **Reflection / journaling**: after each task the agent summarises what worked
  and what to do differently; this feeds the next goal.
- Optional **vector memory** (already scaffolded) for semantic recall.
- Optional **periodic consolidation**: turn many task notes into higher-level
  lessons / preferences.

We will be explicit in the UI/docs that this is "learning by doing", not
self-modifying the model.

## Safety model (always on, even fully autonomous)

This protects the user's own machine from catastrophic self-inflicted damage and
from web-content prompt injection. None of it adds per-action prompts.

1. **Emergency stop (kill switch).** A sentinel file `workspace/STOP` (path
   configurable). The daemon checks it before every cycle and before every task;
   if present it stops gracefully. Also stops on `Ctrl-C`/SIGTERM and on a
   "panic" button in the GUI. `localpilot daemon --stop` writes the file.
2. **Hard command blocklist** stays enforced by the terminal tool and the
   `SafetyGate` (`format`, `rm -rf`, `shutdown`, `diskpart`, `mkfs`, ...).
   Blocklisted commands are hard-denied in every mode.
3. **Workdir write restriction** stays on: file writes / dir creation outside the
   configured working directory are hard-denied.
4. **Rate limiting & back-off:** at most N tasks per hour; after K consecutive
   failed tasks, pause/back off (avoid runaway loops and resource burn).
5. **Per-task bounds:** existing `agent.max_iterations` and per-tool timeouts cap
   each task so it can't run forever.
6. **Full audit trail:** every task/step/error is in the DB and streamed on the
   event bus + JSON logs, so the user can always see and review what it did.
7. **Untrusted web content:** browsing can inject instructions. Mitigation: the
   blocklist + workdir restriction + bounded tools; the daemon never executes
   raw remote text as commands. Documented as a residual risk.

> Residual risk, stated plainly: this is **not a sandbox**. The guardrails reduce
> but do not eliminate the chance of unwanted actions. The kill switch + audit
> log are the user's controls.

## Architecture (new pieces, reusing the existing loop)

```
localpilot daemon
   │
   ▼
AutonomousDaemon  ──loop──►  pick mission ─► generate goal ─► run AgentLoop
   │  (autonomous mode)        (self-direct)   (LLM, memory)   (existing!)
   │                                                   │
   │  check STOP file / rate limit                     ▼
   │  reflect & learn  ◄───────────────────────  record task+steps (memory)
   └─ emit events (GUI live view) ──────────────► event bus ─► server ─► GUI
```

### New modules (`src/localpilot/autonomy/`)

- **`config`** - extend `schema.py` with a `DaemonConfig`:
  ```python
  class DaemonConfig(BaseModel):
      enabled: bool = False
      idle_interval_s: int = 60          # wait between self-chosen tasks
      max_tasks_per_hour: int = 20       # rate limit
      max_consecutive_failures: int = 5  # back off / pause after this
      stop_file: str = "./workspace/STOP"
      missions: list[str] = ["organize", "research", "code"]
      mission_root: str = "./workspace"  # the sandbox the AI works in
      reflect: bool = True               # learn after each task
  ```
  Add `daemon: DaemonConfig` to `AppConfig` and document the env vars.

- **`missions.py`** - mission definitions. Each mission has a `name`, a short
  `description`, a `root` directory (inside `mission_root`), and a goal-prompt
  hint. Built-ins: `organize` (tidy/sort/deduplicate files, maintain notes),
  `research` (browse, summarise findings into notes), `code` (work in a project
  folder: improve, document, fix). A `MissionSelector` chooses the next mission
  (round-robin, or weighted by recent success, or "let the LLM choose" - the
  user wants the AI to decide, so we let the LLM pick the mission from the list
  given recent memory).

- **`goalgen.py`** - `GoalGenerator.next_goal(mission, memory) -> str`. Uses the
  LLM: given the active mission + the last N tasks (from memory) + current
  strategies/notes, propose **one concrete, safe goal** to do next, avoiding
  recent duplicates. Robust JSON parsing (reuse `first_json_value`). Fallback:
  a generic per-mission goal.

- **`reflection.py`** - `reflect(task_id, goal, result, memory)`. After a task,
  ask the LLM for `{worked, didnt_work, lesson, next_hint}`; persist the lesson
  as a strategy (reinforce/record) and append a short journal entry (a
  preference key like `journal:<timestamp>` or a dedicated table later).

- **`daemon.py`** - `AutonomousDaemon`:
  ```python
  class AutonomousDaemon:
      def __init__(self, container, *, on_event=None): ...
      async def run_forever(self) -> None:
          while not self._should_stop():
              if self._rate_limited(): await self._sleep(); continue
              mission = self._selector.choose(...)
              goal = await self._goalgen.next_goal(mission, memory)
              await self._emit("daemon_pick", mission=mission.name, goal=goal)
              result = await self._runner.run(goal, "autonomous")   # AgentLoop
              if self._config.daemon.reflect:
                  await reflect(result.task_id, goal, result, memory)
              self._record_outcome(result)        # rate-limit + failure tracking
              await self._sleep(self._config.daemon.idle_interval_s)
      async def run_once(self) -> AgentRunResult: ...   # one cycle (for tests)
  ```
  - Reuses `container.create_runner(...)` in **autonomous** mode (no confirmation
    provider, so no prompts).
  - `_should_stop()` checks the STOP file and a stop event.
  - Clean shutdown (SIGINT/SIGTERM) -> finish current task or cancel, close DB.

### Container & CLI

- `Container.create_daemon()` -> `AutonomousDaemon` wired from the container.
- New CLI command:
  ```
  localpilot daemon            # run forever (autonomous), self-directed
  localpilot daemon --once     # run a single self-chosen task (for trying it)
  localpilot daemon --stop     # write the STOP sentinel to halt a running daemon
  localpilot daemon --mission research   # restrict to one mission
  ```
  Daemon mode forces `safety.mode = "autonomous"` but keeps blocklist + workdir
  restriction + kill switch.

### GUI (Phase 11b)

- An **"Autonomy"** panel: a big **Start/Stop** switch (writes/removes the STOP
  file via the server), a live feed of self-chosen missions + goals + results
  (already flows over `/ws/events`), and a prominent **PANIC STOP** button.
- New server endpoints: `POST /api/daemon/start`, `POST /api/daemon/stop`,
  `GET /api/daemon/status`. The daemon runs as a background task managed like the
  existing single run (one at a time).

## Implementation order (do on the PC)

1. `DaemonConfig` in `schema.py` + `default.yaml` + `.env.example` + tests.
2. STOP-file kill switch helper + `AutonomousDaemon.run_once` reusing `AgentLoop`
   in autonomous mode; emit events.
3. `missions.py` + `MissionSelector` (LLM chooses the mission).
4. `goalgen.py` self-directed goal generation (+ dedupe vs recent tasks).
5. `reflection.py` learning (strategies + journal).
6. Rate limiting + consecutive-failure back-off + clean shutdown.
7. CLI `localpilot daemon [--once|--stop|--mission]`.
8. Tests (mock LLM, no network): runs N self-generated goals; **respects the STOP
   file**; rate limit caps tasks; reflection writes a strategy; a failing task
   triggers back-off.
9. GUI autonomy panel + PANIC STOP + `/api/daemon/*` endpoints.
10. Docs: README "Autonomous mode" section + this file updated to "implemented".

## Quick start (once built)

```powershell
# one self-chosen task, to watch it work:
localpilot daemon --once --autonomous

# let it live (runs until you stop it):
localpilot daemon

# stop it from anywhere:
localpilot daemon --stop          # or create a file named STOP in .\workspace
```

## Open questions to confirm on the PC

- **Working directory:** which folder is the AI's sandbox (`daemon.mission_root`)?
  Default `./workspace`. Pointing it at real folders increases both usefulness
  and risk.
- **Cadence:** how often should it act (`idle_interval_s`) and the hourly cap?
- **Browsing on/off:** allow the `research` mission to use the live browser
  (needs `playwright install chromium`) or keep it offline at first?
