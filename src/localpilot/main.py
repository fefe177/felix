"""LocalPilot command-line entry point.

Exposes a :mod:`typer` application:

* ``run``    - load configuration, initialise logging and report readiness.
* ``config`` - print the fully merged configuration as JSON.
* ``do``     - run the agent loop on a single goal.

The module-level ``app`` object is referenced by the ``localpilot`` console
script defined in ``pyproject.toml``.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import typer

from localpilot.config.loader import load_config
from localpilot.config.schema import AppConfig
from localpilot.container import Container
from localpilot.logging.setup import configure_logging

app = typer.Typer(
    name="localpilot",
    help="LocalPilot - an autonomous local desktop agent (Phase 0 scaffold).",
    no_args_is_help=True,
    add_completion=False,
)

_ConfigOption = typer.Option(
    None,
    "--config",
    "-c",
    help="Path to an optional YAML config file overriding the defaults.",
)


@app.command()
def run(config: Path | None = _ConfigOption) -> None:
    """Load configuration, initialise logging and report readiness, then exit."""

    app_config = load_config(str(config) if config is not None else None)
    configure_logging(app_config.log_level)

    container = Container(app_config)
    asyncio.run(_run_lifecycle(container, app_config))


async def _run_lifecycle(container: Container, app_config: AppConfig) -> None:
    """Start the container, report readiness and always shut down cleanly."""

    try:
        await container.startup()
        container.logger.info(
            "LocalPilot bereit (Phase 0)",
            backend=app_config.llm.backend,
            model=app_config.llm.model,
            safety_mode=app_config.safety.mode,
        )
    finally:
        await container.shutdown()


@app.command("config")
def show_config(config: Path | None = _ConfigOption) -> None:
    """Load the configuration and print it as indented JSON."""

    app_config = load_config(str(config) if config is not None else None)
    typer.echo(app_config.model_dump_json(indent=2))


@app.command()
def do(
    goal: str = typer.Argument(..., help="The goal for the agent to accomplish."),
    config: Path | None = _ConfigOption,
) -> None:
    """Run the agent loop on a single goal and print the outcome.

    Requires a reachable local LLM backend (Ollama or LM Studio).
    """

    app_config = load_config(str(config) if config is not None else None)
    configure_logging(app_config.log_level)

    container = Container(app_config)
    asyncio.run(_do_lifecycle(container, goal))


async def _do_lifecycle(container: Container, goal: str) -> None:
    """Start the container, run the agent on ``goal`` and shut down cleanly."""

    try:
        await container.startup()
        agent = container.create_agent()
        result = await agent.run(goal)
        container.logger.info(
            "agent_result",
            status=result.status,
            steps=result.steps,
            summary=result.summary,
        )
        typer.echo(
            f"Status: {result.status} | Schritte: {result.steps}\n{result.summary}"
        )
        if result.question:
            typer.echo(f"Rueckfrage: {result.question}")
    finally:
        await container.shutdown()


if __name__ == "__main__":  # pragma: no cover
    app()
