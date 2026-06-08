"""Tests for OpenAICompatibleClient using a mocked AsyncOpenAI client.

The real ``AsyncOpenAI`` is never contacted: the client's internal ``_client``
is replaced with light fakes, so no network calls occur.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from openai import APIConnectionError, APITimeoutError

from localpilot.config.schema import LLMConfig
from localpilot.llm.errors import LLMConnectionError, LLMTimeoutError
from localpilot.llm.messages import Message, Role
from localpilot.llm.openai_compatible import OpenAICompatibleClient


class _FakeFunction:
    def __init__(self, name: str, arguments: str) -> None:
        self.name = name
        self.arguments = arguments


class _FakeToolCall:
    def __init__(self, id_: str, name: str, arguments: str) -> None:
        self.id = id_
        self.type = "function"
        self.function = _FakeFunction(name, arguments)


class _FakeMessage:
    def __init__(self, content: str | None, tool_calls: list[_FakeToolCall] | None = None) -> None:
        self.content = content
        self.tool_calls = tool_calls


class _FakeChoice:
    def __init__(self, message: _FakeMessage) -> None:
        self.message = message
        self.finish_reason = "stop"


class _FakeUsage:
    prompt_tokens = 11
    completion_tokens = 7
    total_tokens = 18


class _FakeCompletion:
    def __init__(self, message: _FakeMessage, usage: _FakeUsage | None) -> None:
        self.choices = [_FakeChoice(message)]
        self.usage = usage

    def model_dump(self) -> dict[str, Any]:
        return {"model": "fake-model", "object": "chat.completion"}


def _client_with_create(create: Any) -> OpenAICompatibleClient:
    """Build a client whose underlying SDK call is replaced by ``create``."""

    client = OpenAICompatibleClient(LLMConfig(model="fake-model"))
    client._client = SimpleNamespace(  # type: ignore[assignment]
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    return client


async def test_chat_returns_text_response() -> None:
    """A plain text completion populates text and usage, with no tool calls."""

    async def create(**kwargs: Any) -> _FakeCompletion:
        return _FakeCompletion(_FakeMessage("Hallo Welt"), _FakeUsage())

    client = _client_with_create(create)
    response = await client.chat([Message(role=Role.USER, content="hi")])

    assert response.text == "Hallo Welt"
    assert response.tool_calls == []
    assert response.usage is not None
    assert response.usage.total_tokens == 18
    assert response.raw["model"] == "fake-model"


async def test_chat_populates_native_tool_calls() -> None:
    """Native tool calls are normalised with decoded arguments."""

    async def create(**kwargs: Any) -> _FakeCompletion:
        message = _FakeMessage(None, [_FakeToolCall("call_1", "search", '{"query": "x"}')])
        return _FakeCompletion(message, _FakeUsage())

    client = _client_with_create(create)
    response = await client.chat([Message(role=Role.USER, content="hi")])

    assert response.text == ""
    assert len(response.tool_calls) == 1
    call = response.tool_calls[0]
    assert call.id == "call_1"
    assert call.name == "search"
    assert call.arguments == {"query": "x"}


async def test_chat_forwards_parameters() -> None:
    """Model, serialised messages, tools and stream flag reach the SDK call."""

    captured: dict[str, Any] = {}

    async def create(**kwargs: Any) -> _FakeCompletion:
        captured.update(kwargs)
        return _FakeCompletion(_FakeMessage("ok"), _FakeUsage())

    client = _client_with_create(create)
    tools = [{"type": "function", "function": {"name": "noop"}}]
    await client.chat([Message(role=Role.USER, content="hi")], tools=tools, top_p=0.5)

    assert captured["model"] == "fake-model"
    assert captured["messages"] == [{"role": "user", "content": "hi"}]
    assert captured["tools"] == tools
    assert captured["stream"] is False
    assert captured["top_p"] == 0.5


async def test_chat_maps_timeout_error() -> None:
    """APITimeoutError is translated into LLMTimeoutError."""

    async def create(**kwargs: Any) -> _FakeCompletion:
        raise APITimeoutError(httpx.Request("POST", "http://localhost:11434/v1"))

    client = _client_with_create(create)
    with pytest.raises(LLMTimeoutError):
        await client.chat([Message(role=Role.USER, content="hi")])


async def test_chat_maps_connection_error() -> None:
    """APIConnectionError is translated into LLMConnectionError."""

    async def create(**kwargs: Any) -> _FakeCompletion:
        raise APIConnectionError(request=httpx.Request("POST", "http://localhost:11434/v1"))

    client = _client_with_create(create)
    with pytest.raises(LLMConnectionError):
        await client.chat([Message(role=Role.USER, content="hi")])
