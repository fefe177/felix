"""Extensive tests for the tool-call parser.

These tests cover native precedence, plain JSON, fenced JSON, JSON embedded in
prose, multiple actions, the special ``finish`` / ``ask_user`` tools and a
variety of malformed inputs. No network access is involved.
"""

from __future__ import annotations

import pytest

from localpilot.llm.base import LLMResponse
from localpilot.llm.errors import ToolCallParseError
from localpilot.llm.messages import Role, ToolCall
from localpilot.llm.parsing import build_repair_message, extract_tool_calls


def _response(text: str = "", tool_calls: list[ToolCall] | None = None) -> LLMResponse:
    return LLMResponse(text=text, tool_calls=tool_calls or [])


def test_native_tool_calls_take_precedence() -> None:
    """Native tool calls win even when the text holds a different JSON object."""

    native = ToolCall(id="call_native", name="search", arguments={"q": "hello"})
    response = _response(
        text='{"tool": "click", "arguments": {"x": 1}}',
        tool_calls=[native],
    )

    calls = extract_tool_calls(response)

    assert calls == [native]


def test_plain_json_object() -> None:
    """A bare JSON object parses into a single tool call."""

    response = _response(text='{"tool": "open_file", "arguments": {"path": "a.txt"}}')

    calls = extract_tool_calls(response)

    assert len(calls) == 1
    assert calls[0].name == "open_file"
    assert calls[0].arguments == {"path": "a.txt"}
    assert calls[0].id  # a generated id is present


def test_json_inside_code_fence() -> None:
    """JSON wrapped in a ```json fence is extracted."""

    response = _response(
        text='```json\n{"tool": "type_text", "arguments": {"text": "hi {there}"}}\n```'
    )

    calls = extract_tool_calls(response)

    assert calls[0].name == "type_text"
    # Braces inside the string value must not break boundary detection.
    assert calls[0].arguments == {"text": "hi {there}"}


def test_json_with_surrounding_prose() -> None:
    """JSON surrounded by natural language is still located."""

    response = _response(
        text='Sure, I will do that now.\n{"tool": "run", "arguments": {"cmd": "dir"}}\nDone!'
    )

    calls = extract_tool_calls(response)

    assert calls[0].name == "run"
    assert calls[0].arguments == {"cmd": "dir"}


def test_multiple_actions() -> None:
    """The {"actions": [...]} schema yields one call per action, in order."""

    response = _response(
        text=(
            '{"actions": ['
            '{"tool": "a", "arguments": {"n": 1}}, '
            '{"tool": "b", "arguments": {}}'
            "]}"
        )
    )

    calls = extract_tool_calls(response)

    assert [c.name for c in calls] == ["a", "b"]
    assert calls[0].arguments == {"n": 1}
    assert calls[1].arguments == {}


def test_finish_tool_explicit() -> None:
    """The finish tool is recognised with its summary argument."""

    response = _response(text='{"tool": "finish", "arguments": {"summary": "all done"}}')

    calls = extract_tool_calls(response)

    assert calls[0].name == "finish"
    assert calls[0].arguments == {"summary": "all done"}


def test_finish_tool_shorthand() -> None:
    """Shorthand {"finish": "..."} maps the value to the summary argument."""

    response = _response(text='{"finish": "wrapped up"}')

    calls = extract_tool_calls(response)

    assert calls[0].name == "finish"
    assert calls[0].arguments == {"summary": "wrapped up"}


def test_ask_user_tool_explicit() -> None:
    """The ask_user tool is recognised with its question argument."""

    response = _response(text='{"tool": "ask_user", "arguments": {"question": "Which file?"}}')

    calls = extract_tool_calls(response)

    assert calls[0].name == "ask_user"
    assert calls[0].arguments == {"question": "Which file?"}


def test_ask_user_tool_shorthand() -> None:
    """Shorthand {"ask_user": "..."} maps the value to the question argument."""

    response = _response(text='{"ask_user": "Proceed?"}')

    calls = extract_tool_calls(response)

    assert calls[0].name == "ask_user"
    assert calls[0].arguments == {"question": "Proceed?"}


def test_arguments_default_to_leftover_keys() -> None:
    """When arguments is absent, leftover top-level keys become the arguments."""

    response = _response(text='{"tool": "move", "x": 10, "y": 20}')

    calls = extract_tool_calls(response)

    assert calls[0].name == "move"
    assert calls[0].arguments == {"x": 10, "y": 20}


@pytest.mark.parametrize(
    "text",
    [
        "",
        "There is no JSON in this sentence.",
        '{"tool": "broken", "arguments": }',  # invalid JSON
        "{ unbalanced",  # never closes
        '{"no_tool_key": true}',  # valid JSON, but not a tool call
        "[1, 2, 3]",  # JSON array, not an object
    ],
)
def test_invalid_input_raises(text: str) -> None:
    """Missing or malformed tool calls raise ToolCallParseError."""

    with pytest.raises(ToolCallParseError):
        extract_tool_calls(_response(text=text))


def test_first_valid_object_wins() -> None:
    """A leading invalid object is skipped in favour of the first valid one."""

    response = _response(
        text='{"oops": } then {"tool": "ok", "arguments": {"v": 1}}'
    )

    calls = extract_tool_calls(response)

    assert calls[0].name == "ok"


def test_build_repair_message() -> None:
    """The repair message is a system message that explains the required format."""

    message = build_repair_message("kaputt")

    assert message.role is Role.SYSTEM
    assert "kaputt" in message.content
    assert '"tool"' in message.content
