"""LocalPilot command-line entry point.

Exposes a :mod:`typer` application:

* ``run``    - start the agent on a goal (``--goal`` or interactive), or just
  report readiness when no goal is given; ``--safe`` / ``--balanced`` /
  ``--autonomous`` select the safety mode, ``--multi-agent`` the orchestrator.
* ``config`` - print the fully merged configuration as JSON.
* ``serve``  - start the FastAPI/WebSocket control server.

The module-level ``app`` object is referenced by the ``localpilot`` console
script defined in ``pyproject.toml``.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import typer

from localpilot.agent.safety import CLIConfirmationProvider
from localpilot.config.loader import load_config
from localpilot.config.schema import AppConfig
from localpilot.container import Container
from localpilot.llm.errors import LLMError
from localpilot.logging.setup import configure_logging

app = typer.Typer(
    name="localpilot",
    help="LocalPilot - an autonomous local desktop agent.",
    no_args_is_help=True,
    add_completion=False,
)

_ConfigOption = typer.Option(
    None,
    "--config",
    "-c",
    help="Path to an optional YAML config file overriding the defaults.",
)


def _select_mode(safe: bool, balanced: bool, autonomous: bool, default: str) -> str:
    """Resolve the safety mode from the flags, erroring on conflicts."""

    chosen = [
        name
        for name, flag in (("safe", safe), ("balanced", balanced), ("autonomous", autonomous))
        if flag
    ]
    if len(chosen) > 1:
        raise typer.BadParameter("Bitte nur einen Sicherheitsmodus angeben.")
    return chosen[0] if chosen else default


@app.command()
def run(
    goal: str | None = typer.Option(
        None, "--goal", "-g", help="The goal for the agent (prompts interactively if omitted)."
    ),
    safe: bool = typer.Option(False, "--safe", help="Use the safe safety mode."),
    balanced: bool = typer.Option(False, "--balanced", help="Use the balanced safety mode."),
    autonomous: bool = typer.Option(
        False, "--autonomous", help="Use the autonomous safety mode."
    ),
    multi_agent: bool = typer.Option(
        False, "--multi-agent", help="Use the multi-agent orchestrator instead of the single agent."
    ),
    config: Path | None = _ConfigOption,
) -> None:
    """Run the agent on a goal, or report readiness when no goal is given."""

    app_config = load_config(str(config) if config is not None else None)
    configure_logging(app_config.log_level)
    mode = _select_mode(safe, balanced, autonomous, app_config.safety.mode)
    use_multi_agent = multi_agent or app_config.multi_agent

    if goal is None and sys.stdin.isatty():
        entered = typer.prompt(
            "Was soll LocalPilot tun? (leer lassen zum Beenden)", default="", show_default=False
        )
        goal = entered.strip() or None

    container = Container(app_config)
    asyncio.run(_run_lifecycle(container, app_config, goal, mode, use_multi_agent))


async def _run_lifecycle(
    container: Container,
    app_config: AppConfig,
    goal: str | None,
    mode: str,
    multi_agent: bool,
) -> None:
    """Start the container, run the agent (if a goal is set) and shut down."""

    try:
        await container.startup()
        if goal:
            runner = container.create_runner(multi_agent, CLIConfirmationProvider())
            try:
                result = await runner.run(goal, mode)
            except LLMError as exc:
                typer.echo(f"LLM-Fehler: {exc}", err=True)
                typer.echo(
                    "Laeuft ein lokales LLM-Backend (Ollama/LM Studio) und ist das Modell "
                    "geladen? Pruefe llm.base_url und llm.model.",
                    err=True,
                )
                raise typer.Exit(code=1) from exc
            container.logger.info(
                "agent_done",
                task_id=result.task_id,
                status=result.status,
                multi_agent=multi_agent,
            )
            typer.echo(f"\nTask {result.task_id} - Status: {result.status}")
            typer.echo(result.summary)
            if result.question:
                typer.echo(f"Rueckfrage: {result.question}")
        else:
            container.logger.info(
                "LocalPilot bereit",
                backend=app_config.llm.backend,
                model=app_config.llm.model,
                safety_mode=mode,
                multi_agent=multi_agent,
            )
    finally:
        await container.shutdown()


@app.command("config")
def show_config(config: Path | None = _ConfigOption) -> None:
    """Load the configuration and print it as indented JSON."""

    app_config = load_config(str(config) if config is not None else None)
    typer.echo(app_config.model_dump_json(indent=2))


@app.command()
def serve(config: Path | None = _ConfigOption) -> None:
    """Start the FastAPI control server (host/port from the server config)."""

    import uvicorn

    from localpilot.server.app import create_app

    app_config = load_config(str(config) if config is not None else None)
    fastapi_app = create_app(config=app_config)
    uvicorn.run(fastapi_app, host=app_config.server.host, port=app_config.server.port)


@app.command()
def daemon(
    once: bool = typer.Option(False, "--once", help="Run a single self-chosen task and exit."),
    stop: bool = typer.Option(False, "--stop", help="Write the STOP sentinel and exit."),
    mission: str | None = typer.Option(
        None,
        "--mission",
        "-m",
        help="Restrict to one mission: organize | research | code.",
    ),
    config: Path | None = _ConfigOption,
) -> None:
    """Run the autonomous daemon (self-directed, no confirmation prompts).

    The daemon chooses its own goals from the configured missions, executes
    them autonomously, and learns from the results. Safety guardrails
    (STOP file, blocklist, workdir restriction) stay active at all times.

    Examples::

        localpilot daemon --once          # one self-chosen task, then exit
        localpilot daemon                 # run forever until STOP file appears
        localpilot daemon --stop          # halt a running daemon gracefully
        localpilot daemon --mission code  # restrict to the code mission
    """

    app_config = load_config(str(config) if config is not None else None)
    configure_logging(app_config.log_level)

    if stop:
        from pathlib import Path as _Path

        stop_path = _Path(app_config.daemon.stop_file).expanduser().resolve()
        stop_path.parent.mkdir(parents=True, exist_ok=True)
        stop_path.touch()
        typer.echo(f"STOP-Datei geschrieben: {stop_path}")
        return

    asyncio.run(_daemon_lifecycle(app_config, once=once, mission=mission))


async def _daemon_lifecycle(
    app_config: AppConfig,
    *,
    once: bool,
    mission: str | None,
) -> None:
    """Start the container, run the daemon and shut down cleanly."""

    from localpilot.autonomy.daemon import AutonomousDaemon

    container = Container(app_config)
    # Daemon forces autonomous mode; blocklist + workdir restriction stay on.
    app_config.safety.mode = "autonomous"
    try:
        await container.startup()
        d: AutonomousDaemon = container.create_daemon()
        if once:
            result = await d.run_once(mission)
            if result is None:
                typer.echo("Daemon wurde durch STOP-Datei abgebrochen.")
            else:
                typer.echo(f"\nTask {result.task_id} – Status: {result.status}")
                typer.echo(result.summary)
        else:
            typer.echo(
                f"Daemon gestartet. Arbeitsordner: {app_config.daemon.mission_root}\n"
                f"Stoppen: localpilot daemon --stop  oder STOP-Datei anlegen: "
                f"{app_config.daemon.stop_file}"
            )
            import signal

            loop = asyncio.get_running_loop()

            def _handle_signal() -> None:
                typer.echo("\nSignal empfangen – Daemon wird beendet …")
                d.request_stop()

            for sig in (signal.SIGINT, signal.SIGTERM):
                try:
                    loop.add_signal_handler(sig, _handle_signal)
                except (NotImplementedError, OSError):
                    pass  # Windows: signal handler not supported in event loop

            await d.run_forever()
    except LLMError as exc:
        typer.echo(f"LLM-Fehler: {exc}", err=True)
        typer.echo(
            "Laeuft ein lokales LLM-Backend? Pruefe llm.base_url und llm.model.",
            err=True,
        )
        raise typer.Exit(code=1) from exc
    finally:
        await container.shutdown()


if __name__ == "__main__":  # pragma: no cover
    app()
