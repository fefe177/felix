"""The LLM client protocol and the structured response model.

:class:`LLMClient` is a structural :class:`typing.Protocol`: any object that
provides a compatible ``chat`` coroutine satisfies it, no inheritance required.
:class:`LLMResponse` is the backend-agnostic result returned by ``chat``.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field

from localpilot.llm.messages import Message, ToolCall


class TokenUsage(BaseModel):
    """Token accounting for a single LLM call, when the backend reports it."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMResponse(BaseModel):
    """The normalised result of a chat completion.

    Attributes:
        text: The assistant's textual content (empty string if none).
        tool_calls: Tool calls reported natively by the backend, if any.
        raw: The raw backend payload (e.g. ``completion.model_dump()``).
        usage: Token usage, when the backend provides it.
    """

    text: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)
    usage: TokenUsage | None = None


@runtime_checkable
class LLMClient(Protocol):
    """Structural protocol for an asynchronous chat LLM client."""

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Send ``messages`` (and optional OpenAI tool specs) and return a response."""
        ...
