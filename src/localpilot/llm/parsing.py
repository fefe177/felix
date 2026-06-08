"""Tool-call extraction and repair prompting.

This module is the backbone of the agent: it turns a model response into a list
of :class:`~localpilot.llm.messages.ToolCall`. It prefers the backend's native
tool calls; when those are absent it parses the assistant's text defensively.

Text parsing proceeds in stages:

1. Strip Markdown code fences (```json ... ```), preferring fenced content.
2. Locate balanced JSON objects via brace matching (string-aware, not a naive
   regular expression) and decode each candidate.
3. Accept two schemas: ``{"tool": ..., "arguments": {...}}`` and
   ``{"actions": [...]}``.
4. Recognise the special tools ``finish`` (with a ``summary``) and ``ask_user``
   (with a ``question``), including shorthand spellings.

If no valid tool call can be recovered, :class:`ToolCallParseError` is raised
with a message written to be shown back to the model so it can self-correct.
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Iterator
from typing import Any

from localpilot.llm.base import LLMResponse
from localpilot.llm.errors import ToolCallParseError
from localpilot.llm.messages import Message, Role, ToolCall

#: Human/model-readable message used when no valid tool call can be parsed.
PARSE_ERROR_MESSAGE = (
    "Antwort war kein gueltiger Tool-Call. Antworte mit genau einem JSON-Objekt "
    '{"tool": "<name>", "arguments": {...}}.'
)

#: Keys consumed by the tool-call envelope and therefore not treated as arguments.
_ENVELOPE_KEYS = frozenset({"tool", "name", "action", "arguments", "args"})

#: Special tools and the argument key their shorthand value maps to.
_SPECIAL_TOOLS: dict[str, str] = {"finish": "summary", "ask_user": "question"}

_FENCE_RE = re.compile(r"```(?:[a-zA-Z0-9_+-]+)?\s*(.*?)```", re.DOTALL)


def extract_tool_calls(response: LLMResponse) -> list[ToolCall]:
    """Return the tool calls for ``response``, native ones taking precedence.

    Args:
        response: The normalised model response.

    Returns:
        A non-empty list of :class:`ToolCall`.

    Raises:
        ToolCallParseError: If the response carries no native tool calls and no
            valid tool call can be parsed from its text.
    """

    if response.tool_calls:
        return list(response.tool_calls)
    return _parse_text(response.text or "")


def build_repair_message(error: str) -> Message:
    """Build a corrective message instructing the model how to respond.

    Args:
        error: The parse error to echo back to the model.

    Returns:
        A system :class:`Message` describing the exact required format.
    """

    content = (
        f"Deine vorherige Antwort konnte nicht als Tool-Call interpretiert werden: {error}\n"
        'Antworte mit GENAU EINEM JSON-Objekt im Format {"tool": "<name>", '
        '"arguments": {<argumente>}}. Kein Fliesstext, keine Erklaerung und kein '
        "Markdown ausserhalb des JSON-Objekts."
    )
    return Message(role=Role.SYSTEM, content=content)


def _parse_text(text: str) -> list[ToolCall]:
    """Parse free-form model text into tool calls or raise ``ToolCallParseError``."""

    for candidate in _candidate_texts(text):
        for obj in _iter_json_objects(candidate):
            calls = _object_to_tool_calls(obj)
            if calls:
                return calls
    raise ToolCallParseError(PARSE_ERROR_MESSAGE)


def _candidate_texts(text: str) -> Iterator[str]:
    """Yield the fenced code blocks first, then the full text as a fallback."""

    for match in _FENCE_RE.findall(text):
        fenced = match.strip()
        if fenced:
            yield fenced
    yield text


def _iter_json_objects(text: str) -> Iterator[dict[str, Any]]:
    """Yield every balanced, decodable JSON object found in ``text``.

    Brace matching is string-aware: braces inside JSON string literals (and
    escaped quotes) are ignored, so embedded ``{`` / ``}`` do not corrupt the
    boundary detection.
    """

    depth = 0
    start: int | None = None
    in_string = False
    escaped = False

    for index, char in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}":
            if depth == 0:
                continue
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start : index + 1]
                start = None
                decoded = _try_decode(candidate)
                if decoded is not None:
                    yield decoded


def _try_decode(candidate: str) -> dict[str, Any] | None:
    """Decode ``candidate`` as a JSON object, returning ``None`` on failure."""

    try:
        value = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _object_to_tool_calls(obj: dict[str, Any]) -> list[ToolCall]:
    """Convert a decoded object into tool calls; empty list if unrecognised."""

    actions = obj.get("actions")
    if isinstance(actions, list):
        calls: list[ToolCall] = []
        for item in actions:
            if isinstance(item, dict):
                call = _single_tool_call(item)
                if call is not None:
                    calls.append(call)
        return calls

    call = _single_tool_call(obj)
    return [call] if call is not None else []


def _single_tool_call(obj: dict[str, Any]) -> ToolCall | None:
    """Convert one decoded object into a :class:`ToolCall`, or ``None``."""

    explicit_name = obj.get("tool") or obj.get("name") or obj.get("action")

    # Shorthand for the special tools, e.g. {"finish": "done"} or
    # {"ask_user": {"question": "..."}}, only when no explicit tool name is set.
    if not explicit_name:
        for special, arg_key in _SPECIAL_TOOLS.items():
            if special in obj:
                value = obj[special]
                arguments = value if isinstance(value, dict) else {arg_key: value}
                return ToolCall(id=_new_call_id(), name=special, arguments=arguments)

    if not isinstance(explicit_name, str) or not explicit_name:
        return None

    raw_arguments = obj.get("arguments")
    if raw_arguments is None:
        raw_arguments = obj.get("args")

    if isinstance(raw_arguments, dict):
        arguments = raw_arguments
    else:
        arguments = {key: value for key, value in obj.items() if key not in _ENVELOPE_KEYS}

    return ToolCall(id=_new_call_id(), name=explicit_name, arguments=arguments)


def _new_call_id() -> str:
    """Generate a unique identifier for a parsed (non-native) tool call."""

    return f"call_{uuid.uuid4().hex[:8]}"


def first_json_value(text: str) -> Any | None:
    """Return the first decodable JSON object or array found in ``text``.

    Like the tool-call parser, this strips code fences and uses a string-aware
    bracket scanner (handling both ``{}`` and ``[]``) rather than a naive regex.
    Used by the planner (arrays) and the verifier (objects). Returns ``None`` if
    nothing decodable is found.
    """

    for candidate in _candidate_texts(text):
        value = _scan_first_json(candidate)
        if value is not None:
            return value
    return None


def _scan_first_json(text: str) -> Any | None:
    """Scan for the first balanced ``{...}`` or ``[...]`` that decodes as JSON."""

    closers = {"}": "{", "]": "["}
    stack: list[str] = []
    start: int | None = None
    in_string = False
    escaped = False

    for index, char in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char in "{[":
            if not stack:
                start = index
            stack.append(char)
        elif char in "}]":
            if not stack:
                continue
            opener = stack.pop()
            if closers[char] != opener:
                stack = []
                start = None
                continue
            if not stack and start is not None:
                candidate = text[start : index + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    start = None
    return None
