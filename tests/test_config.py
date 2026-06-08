"""Tests for configuration loading, environment overrides and validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from localpilot.config.loader import load_config
from localpilot.config.schema import AppConfig


def test_default_config_loads() -> None:
    """The bundled default.yaml loads into a valid AppConfig with its defaults."""

    config = load_config(None)

    assert isinstance(config, AppConfig)
    assert config.llm.backend == "ollama"
    assert config.llm.base_url == "http://localhost:11434/v1"
    assert config.llm.model == "qwen3:8b"
    assert config.safety.mode == "balanced"
    assert config.terminal.workdir == "./workspace"
    assert config.browser.headless is False
    assert "shutdown" in config.terminal.command_blocklist


def test_env_override_takes_precedence(monkeypatch: pytest.MonkeyPatch) -> None:
    """LOCALPILOT_ environment variables override YAML values, including nested ones."""

    monkeypatch.setenv("LOCALPILOT_LLM__MODEL", "deepseek-r1:14b")
    monkeypatch.setenv("LOCALPILOT_SAFETY__MODE", "autonomous")
    monkeypatch.setenv("LOCALPILOT_LOG_LEVEL", "DEBUG")

    config = load_config(None)

    assert config.llm.model == "deepseek-r1:14b"
    assert config.safety.mode == "autonomous"
    assert config.log_level == "DEBUG"
    # Untouched values keep their defaults.
    assert config.llm.backend == "ollama"


def test_optional_file_overrides_defaults(write_yaml: object) -> None:
    """A user YAML file deep-merges over the defaults."""

    override = write_yaml(  # type: ignore[operator]
        "override.yaml",
        """
        llm:
          model: llama-3.1-8b-instruct
        browser:
          headless: true
        """,
    )

    config = load_config(str(override))

    assert config.llm.model == "llama-3.1-8b-instruct"
    assert config.browser.headless is True
    # Sibling keys within the merged section are preserved.
    assert config.llm.backend == "ollama"


def test_invalid_safety_mode_raises(write_yaml: object) -> None:
    """An out-of-range safety mode fails schema validation."""

    override = write_yaml(  # type: ignore[operator]
        "bad.yaml",
        """
        safety:
          mode: turbo
        """,
    )

    with pytest.raises(ValidationError):
        load_config(str(override))
