"""LLM layer: messages, clients, the tool-call parser and errors."""

from __future__ import annotations

from localpilot.llm.base import LLMClient, LLMResponse, TokenUsage
from localpilot.llm.errors import (
    LLMConnectionError,
    LLMError,
    LLMTimeoutError,
    ToolCallParseError,
)
from localpilot.llm.messages import Message, Role, ToolCall, to_openai_format
from localpilot.llm.openai_compatible import OpenAICompatibleClient
from localpilot.llm.parsing import build_repair_message, extract_tool_calls

__all__ = [
    "LLMClient",
    "LLMConnectionError",
    "LLMError",
    "LLMResponse",
    "LLMTimeoutError",
    "Message",
    "OpenAICompatibleClient",
    "Role",
    "TokenUsage",
    "ToolCall",
    "ToolCallParseError",
    "build_repair_message",
    "extract_tool_calls",
    "to_openai_format",
]
