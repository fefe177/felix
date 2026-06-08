"""LocalPilot command-line entry point.

Exposes a :mod:`typer` application with two Phase 0 commands:

* ``run``    - load configuration, initialise logging and report readiness.
* ``config`` - print the fully merged configuration as JSON.

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


if __name__ == "__main__":  # pragma: no cover
    app()
