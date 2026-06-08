"""Exception types for the LLM layer.

All errors raised by the LLM layer derive from :class:`LLMError` so callers can
catch the whole family with a single ``except``.
"""

from __future__ import annotations


class LLMError(Exception):
    """Base class for every error raised by the LLM layer."""


class LLMConnectionError(LLMError):
    """Raised when the LLM backend cannot be reached."""


class LLMTimeoutError(LLMError):
    """Raised when an LLM request exceeds its configured timeout."""


class ToolCallParseError(LLMError):
    """Raised when a model response cannot be parsed into a tool call.

    The error message is intentionally written so it can be shown back to the
    model to prompt a self-correction.
    """
