"""Conversation message models and OpenAI-format serialisation.

These Pydantic models describe the messages exchanged with the LLM and the
tool calls it may request. They are deliberately backend-agnostic; the
serialisation helper converts them into the ``list[dict]`` shape expected by
OpenAI-compatible chat-completions APIs (Ollama, LM Studio, ...).
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class Role(StrEnum):
    """The author role of a chat message."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class ToolCall(BaseModel):
    """A single tool invocation requested by the model.

    Attributes:
        id: A unique identifier for the call (used to correlate the result).
        name: The name of the tool to invoke.
        arguments: The decoded argument mapping for the tool.
    """

    id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class Message(BaseModel):
    """A single chat message.

    Attributes:
        role: Who authored the message.
        content: The textual content (may be empty for tool-call turns).
        name: Optional author/tool name (used by ``tool``/function messages).
        tool_call_id: Optional id linking a ``tool`` message to its tool call.
    """

    role: Role
    content: str = ""
    name: str | None = None
    tool_call_id: str | None = None


def to_openai_format(messages: list[Message]) -> list[dict[str, Any]]:
    """Serialise messages into the OpenAI chat-completions format.

    Args:
        messages: The conversation history.

    Returns:
        A list of plain dictionaries, each with at least ``role`` and
        ``content`` keys, plus ``name`` / ``tool_call_id`` when present.
    """

    serialised: list[dict[str, Any]] = []
    for message in messages:
        payload: dict[str, Any] = {"role": message.role.value, "content": message.content}
        if message.name is not None:
            payload["name"] = message.name
        if message.tool_call_id is not None:
            payload["tool_call_id"] = message.tool_call_id
        serialised.append(payload)
    return serialised
