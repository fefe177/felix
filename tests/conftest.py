"""Shared pytest fixtures for the LocalPilot test suite."""

from __future__ import annotations

import textwrap
from collections.abc import Iterator
from pathlib import Path

import pytest


@pytest.fixture
def config_dir(tmp_path: Path) -> Path:
    """Return a temporary directory for writing throw-away config files."""

    directory = tmp_path / "config"
    directory.mkdir()
    return directory


@pytest.fixture
def write_yaml(config_dir: Path) -> Iterator[object]:
    """Provide a helper that writes a YAML file into the temp config dir.

    The helper accepts a file name and raw YAML text (it is dedented for
    convenience) and returns the absolute path to the written file.
    """

    def _write(name: str, content: str) -> Path:
        path = config_dir / name
        path.write_text(textwrap.dedent(content), encoding="utf-8")
        return path

    yield _write


@pytest.fixture(autouse=True)
def _clear_localpilot_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Remove any ambient LOCALPILOT_* variables so tests are deterministic."""

    import os

    for key in list(os.environ):
        if key.startswith("LOCALPILOT_"):
            monkeypatch.delenv(key, raising=False)
