"""An OpenAI-compatible LLM client.

:class:`OpenAICompatibleClient` talks to any OpenAI ``/v1`` compatible backend
(Ollama, LM Studio, ...) using the official ``openai`` async SDK. It normalises
results into :class:`~localpilot.llm.base.LLMResponse`, populates native tool
calls when the backend reports them, and translates transport failures into the
clear exceptions defined in :mod:`localpilot.llm.errors`.

Streaming is supported via ``chat(..., stream=True)`` but ``chat`` always
returns a fully-assembled :class:`LLMResponse`.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, cast

from openai import APIConnectionError, APITimeoutError, AsyncOpenAI

from localpilot.config.schema import LLMConfig
from localpilot.llm.base import LLMResponse, TokenUsage
from localpilot.llm.errors import LLMConnectionError, LLMTimeoutError
from localpilot.llm.messages import Message, ToolCall, to_openai_format

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from openai import AsyncStream
    from openai.types.chat import ChatCompletion, ChatCompletionChunk


def _coerce_arguments(raw: object) -> dict[str, Any]:
    """Best-effort conversion of raw tool arguments into a mapping.

    Native tool calls deliver arguments as a JSON string; streaming assembles
    them incrementally. Anything that is not a JSON object decodes to an empty
    mapping rather than raising, keeping the client robust against odd output.
    """

    if isinstance(raw, dict):
        return cast("dict[str, Any]", raw)
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


class OpenAICompatibleClient:
    """Asynchronous chat client for OpenAI-compatible local backends."""

    def __init__(self, config: LLMConfig) -> None:
        """Build the client from an :class:`LLMConfig`."""

        self._config = config
        self._client = AsyncOpenAI(
            base_url=config.base_url,
            api_key=config.api_key or "not-needed",
            timeout=float(config.request_timeout_s),
        )

    @property
    def config(self) -> LLMConfig:
        """The configuration this client was built with."""

        return self._config

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        *,
        stream: bool = False,
        **kwargs: Any,
    ) -> LLMResponse:
        """Run a chat completion and return a normalised response.

        Args:
            messages: The conversation history.
            tools: Optional OpenAI tool specs advertised to the model.
            stream: If ``True``, consume the streaming API and assemble the
                final response from the deltas.
            **kwargs: Extra parameters forwarded verbatim to the backend
                (e.g. ``top_p``), overriding the config-derived defaults.

        Returns:
            A fully-assembled :class:`LLMResponse`.

        Raises:
            LLMTimeoutError: If the request exceeds the configured timeout.
            LLMConnectionError: If the backend cannot be reached.
        """

        params = self._build_params(messages, tools, kwargs)
        try:
            if stream:
                return await self._chat_streaming(params)
            create = cast(
                "Callable[..., Awaitable[ChatCompletion]]",
                self._client.chat.completions.create,
            )
            completion = await create(stream=False, **params)
        except APITimeoutError as exc:
            raise LLMTimeoutError(
                f"LLM-Anfrage an {self._config.base_url} hat das Zeitlimit von "
                f"{self._config.request_timeout_s}s ueberschritten."
            ) from exc
        except APIConnectionError as exc:
            raise LLMConnectionError(
                f"Verbindung zum LLM-Backend unter {self._config.base_url} fehlgeschlagen."
            ) from exc
        return self._completion_to_response(completion)

    def _build_params(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None,
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        """Assemble the request parameters, applying caller overrides last."""

        params: dict[str, Any] = {
            "model": self._config.model,
            "messages": to_openai_format(messages),
            "temperature": self._config.temperature,
            "max_tokens": self._config.max_tokens,
        }
        if tools:
            params["tools"] = tools
        params.update(overrides)
        return params

    def _completion_to_response(self, completion: ChatCompletion) -> LLMResponse:
        """Normalise a non-streaming completion into an :class:`LLMResponse`."""

        choice = completion.choices[0]
        message = choice.message
        tool_calls: list[ToolCall] = []
        for tc in message.tool_calls or []:
            function = getattr(tc, "function", None)
            if function is None:
                continue
            tool_calls.append(
                ToolCall(
                    id=tc.id,
                    name=function.name,
                    arguments=_coerce_arguments(function.arguments),
                )
            )
        usage = self._usage(completion.usage)
        return LLMResponse(
            text=message.content or "",
            tool_calls=tool_calls,
            raw=completion.model_dump(),
            usage=usage,
        )

    async def _chat_streaming(self, params: dict[str, Any]) -> LLMResponse:
        """Consume the streaming API and assemble a complete response."""

        create = cast(
            "Callable[..., Awaitable[AsyncStream[ChatCompletionChunk]]]",
            self._client.chat.completions.create,
        )
        stream = await create(stream=True, **params)

        text_parts: list[str] = []
        fragments: dict[int, dict[str, str]] = {}
        usage: TokenUsage | None = None
        last_chunk: dict[str, Any] = {}

        async for chunk in stream:
            last_chunk = chunk.model_dump()
            if chunk.usage is not None:
                usage = self._usage(chunk.usage)
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                text_parts.append(delta.content)
            for tc in delta.tool_calls or []:
                fragment = fragments.setdefault(tc.index, {"id": "", "name": "", "arguments": ""})
                if tc.id:
                    fragment["id"] = tc.id
                function = getattr(tc, "function", None)
                if function is not None:
                    if function.name:
                        fragment["name"] = function.name
                    if function.arguments:
                        fragment["arguments"] += function.arguments

        tool_calls = [
            ToolCall(
                id=fragment["id"] or f"call_{index}",
                name=fragment["name"],
                arguments=_coerce_arguments(fragment["arguments"]),
            )
            for index, fragment in sorted(fragments.items())
            if fragment["name"]
        ]
        return LLMResponse(
            text="".join(text_parts),
            tool_calls=tool_calls,
            raw=last_chunk,
            usage=usage,
        )

    @staticmethod
    def _usage(usage: Any) -> TokenUsage | None:
        """Convert a backend usage object into :class:`TokenUsage`, if present."""

        if usage is None:
            return None
        return TokenUsage(
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            total_tokens=getattr(usage, "total_tokens", 0) or 0,
        )
