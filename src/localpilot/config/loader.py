"""Configuration loading and merging for LocalPilot.

Loading order, lowest precedence first:

1. ``config/default.yaml`` (the bundled defaults).
2. An optional user-supplied YAML file (the ``path`` argument).
3. The ``.env`` file and process environment (prefix ``LOCALPILOT_``).

YAML files are deep-merged; environment variables override everything because
of the source ordering defined on :class:`localpilot.config.schema.AppConfig`.
"""

from __future__ import annotations

import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml

from localpilot.config.schema import AppConfig


def _default_config_path() -> Path:
    """Locate ``config/default.yaml`` in both source and frozen (PyInstaller) runs.

    In a normal install the repository root is three parents up from this file
    (``<root>/src/localpilot/config/loader.py``). In a PyInstaller bundle the
    package lives inside the bundle, so the file is shipped under ``config/`` at
    the bundle root (``sys._MEIPASS``).
    """

    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
        return base / "config" / "default.yaml"
    return Path(__file__).resolve().parents[3] / "config" / "default.yaml"


DEFAULT_CONFIG_PATH = _default_config_path()


def _read_yaml(path: Path) -> dict[str, Any]:
    """Read a YAML file and return its top-level mapping.

    Returns an empty mapping for an empty file. Raises ``ValueError`` if the
    document is not a mapping.
    """

    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError(f"Configuration file {path} must contain a mapping at the top level.")
    return data


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge ``override`` into a copy of ``base``.

    Nested mappings are merged key by key; any non-mapping value in ``override``
    replaces the corresponding value in ``base``.
    """

    merged = deepcopy(base)
    for key, value in override.items():
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = _deep_merge(existing, value)
        else:
            merged[key] = deepcopy(value)
    return merged


def load_config(path: str | None = None) -> AppConfig:
    """Load, merge and validate the application configuration.

    Args:
        path: Optional path to a user YAML file whose values override the
            bundled defaults. If ``None``, only the defaults (plus environment
            overrides) are used.

    Returns:
        A validated :class:`AppConfig` instance.

    Raises:
        FileNotFoundError: If a configuration file does not exist.
        pydantic.ValidationError: If the merged configuration is invalid.
    """

    if not DEFAULT_CONFIG_PATH.exists():
        raise FileNotFoundError(f"Default configuration not found at {DEFAULT_CONFIG_PATH}.")

    merged = _read_yaml(DEFAULT_CONFIG_PATH)

    if path is not None:
        override_path = Path(path).expanduser().resolve()
        if not override_path.exists():
            raise FileNotFoundError(f"Configuration file not found at {override_path}.")
        merged = _deep_merge(merged, _read_yaml(override_path))

    return AppConfig(**merged)
