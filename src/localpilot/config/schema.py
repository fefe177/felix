"""Pydantic configuration schema for LocalPilot.

This module defines the *shape* of the configuration only: the nested settings
models, their fields, types and sensible defaults. The loading and merging
logic lives in :mod:`localpilot.config.loader`.

The top-level :class:`AppConfig` is a ``pydantic-settings`` ``BaseSettings``
model so that environment variables (prefix ``LOCALPILOT_``, nested with
``__``) can override values. Environment variables take precedence over values
supplied at construction time (e.g. those merged from YAML files).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


class LLMConfig(BaseModel):
    """Settings for the local LLM backend (OpenAI-compatible API)."""

    backend: Literal["ollama", "lmstudio"] = "ollama"
    base_url: str = "http://localhost:11434/v1"
    api_key: str = "not-needed"
    model: str = "qwen3:8b"
    temperature: float = 0.7
    max_tokens: int = 4096
    request_timeout_s: int = 120


class VisionConfig(BaseModel):
    """Settings for screen vision and OCR."""

    enabled: bool = True
    model: str = "qwen2.5vl:7b"
    ocr_enabled: bool = True


class MemoryConfig(BaseModel):
    """Settings for persistent memory storage."""

    db_path: str = "./workspace/localpilot.db"
    vector_enabled: bool = False
    embedding_model: str | None = None


class BrowserConfig(BaseModel):
    """Settings for browser automation."""

    headless: bool = False
    default_timeout_ms: int = 30000


class DesktopConfig(BaseModel):
    """Settings for desktop / GUI automation."""

    failsafe: bool = True
    move_duration_s: float = 0.2


class TerminalConfig(BaseModel):
    """Settings for terminal / command execution."""

    timeout_s: int = 60
    workdir: str = "./workspace"
    command_blocklist: list[str] = Field(
        default_factory=lambda: [
            "format",
            "del",
            "rmdir",
            "rm -rf",
            "shutdown",
            "reboot",
            "diskpart",
            "mkfs",
        ]
    )


class SafetyConfig(BaseModel):
    """Settings that govern how autonomously the agent may act."""

    mode: Literal["safe", "balanced", "autonomous"] = "balanced"
    restrict_writes_to_workdir: bool = True


class ServerConfig(BaseModel):
    """Settings for the local control server."""

    host: str = "127.0.0.1"
    port: int = 8765


class AppConfig(BaseSettings):
    """Top-level application configuration.

    Bundles every sub-configuration. As a ``BaseSettings`` model it reads
    overrides from the process environment (and an optional ``.env`` file)
    using the ``LOCALPILOT_`` prefix and ``__`` as the nesting delimiter, e.g.
    ``LOCALPILOT_LLM__MODEL=qwen3:14b`` overrides ``llm.model``.
    """

    model_config = SettingsConfigDict(
        env_prefix="LOCALPILOT_",
        env_nested_delimiter="__",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm: LLMConfig = Field(default_factory=LLMConfig)
    vision: VisionConfig = Field(default_factory=VisionConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    browser: BrowserConfig = Field(default_factory=BrowserConfig)
    desktop: DesktopConfig = Field(default_factory=DesktopConfig)
    terminal: TerminalConfig = Field(default_factory=TerminalConfig)
    safety: SafetyConfig = Field(default_factory=SafetyConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    log_level: str = "INFO"

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """Make environment variables win over values passed at construction.

        The loader passes merged YAML values as init keyword arguments. By
        ordering the environment sources before ``init_settings`` we guarantee
        the documented precedence: defaults < YAML < ``.env`` file < process
        environment.
        """

        return (env_settings, dotenv_settings, init_settings, file_secret_settings)
