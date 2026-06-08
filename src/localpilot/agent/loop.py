"""The single-agent reasoning loop.

:class:`Agent` implements the perceive -> think -> act -> observe loop over the
LLM and the tool manager:

1. **Think** - ask the LLM for the next action, advertising the tool specs.
2. **Parse** - extract a tool call from the response; on a parse failure, send a
   repair message and retry (bounded by ``agent.max_repair_attempts``).
3. **Act** - run the tool via the manager (which validates arguments and applies
   the safety gate), or handle the ``finish`` / ``ask_user`` control tools.
4. **Observe** - feed the result back into the conversation and short-term
   memory, persist the step, and repeat (bounded by ``agent.max_iterations``).

Every run is recorded in long-term memory and streamed on the event bus.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import structlog

from localpilot.agent.prompts import build_system_prompt
from localpilot.config.schema import AppConfig
from localpilot.llm.base import LLMClient
from localpilot.llm.errors import ToolCallParseError
from localpilot.llm.messages import Message, Role, ToolCall
from localpilot.llm.parsing import build_repair_message, extract_tool_calls
from localpilot.logging.setup import EventBus
from localpilot.memory.long_term import LongTermMemory
from localpilot.memory.short_term import ShortTermMemory
from localpilot.tools.base import ToolContext, ToolResult
from localpilot.tools.registry import ToolManager

#: Maximum characters of a tool result fed back into the conversation.
_MAX_OBSERVATION_CHARS = 4_000


@dataclass
class AgentResult:
    """The outcome of an agent run.

    Attributes:
        task_id: The persisted task id.
        status: One of ``completed``, ``failed`` or ``needs_input``.
        summary: A short human-readable summary of the outcome.
        steps: How many tool steps were executed.
        question: A question for the user when ``status`` is ``needs_input``.
    """

    task_id: str
    status: str
    summary: str
    steps: int
    question: str | None = None


class Agent:
    """Drives one goal to completion through the think/act/observe loop."""

    def __init__(
        self,
        *,
        llm_client: LLMClient,
        tool_manager: ToolManager,
        tool_context: ToolContext,
        memory: LongTermMemory,
        config: AppConfig,
        event_bus: EventBus,
        logger: structlog.stdlib.BoundLogger,
        short_term: ShortTermMemory | None = None,
    ) -> None:
        """Wire the agent's dependencies and read its limits from ``config``."""

        self._llm = llm_client
        self._tools = tool_manager
        self._ctx = tool_context
        self._memory = memory
        self._config = config
        self._event_bus = event_bus
        self._logger = logger
        self._short_term = short_term or ShortTermMemory()
        self._max_iterations = config.agent.max_iterations
        self._max_repair = config.agent.max_repair_attempts

    async def run(self, goal: str) -> AgentResult:
        """Execute ``goal`` and return the final :class:`AgentResult`."""

        task_id = await self._memory.create_task(goal, self._config.safety.mode)
        self._short_term.set_goal(goal)
        await self._publish({"type": "agent_start", "task_id": task_id, "goal": goal})

        specs = self._tools.get_specs()
        preferences = await self._memory.all_preferences()
        messages: list[Message] = [
            Message(
                role=Role.SYSTEM,
                content=build_system_prompt(
                    specs,
                    self._config.safety.mode,
                    self._short_term.as_context_text(),
                    preferences or None,
                ),
            ),
            Message(role=Role.USER, content=goal),
        ]

        step_index = 0
        repair_attempts = 0

        for _ in range(self._max_iterations):
            response = await self._llm.chat(messages, tools=specs)
            try:
                tool_calls = extract_tool_calls(response)
            except ToolCallParseError as exc:
                repair_attempts += 1
                if repair_attempts > self._max_repair:
                    return await self._fail(
                        task_id,
                        step_index,
                        "Modell lieferte wiederholt keinen gueltigen Tool-Call.",
                    )
                messages.append(Message(role=Role.ASSISTANT, content=response.text))
                messages.append(build_repair_message(str(exc)))
                continue

            repair_attempts = 0
            messages.append(
                Message(
                    role=Role.ASSISTANT,
                    content=_assistant_transcript(response.text, tool_calls),
                )
            )

            for tool_call in tool_calls:
                if tool_call.name == "finish":
                    summary = str(tool_call.arguments.get("summary", "")).strip()
                    await self._memory.set_task_result(task_id, summary)
                    await self._publish(
                        {"type": "agent_finish", "task_id": task_id, "summary": summary}
                    )
                    return AgentResult(task_id, "completed", summary, step_index)

                if tool_call.name == "ask_user":
                    question = str(tool_call.arguments.get("question", "")).strip()
                    await self._memory.set_task_status(task_id, "needs_input")
                    await self._publish(
                        {"type": "agent_ask_user", "task_id": task_id, "question": question}
                    )
                    return AgentResult(
                        task_id,
                        "needs_input",
                        "Der Agent benoetigt eine Rueckfrage.",
                        step_index,
                        question=question,
                    )

                result = await self._tools.execute(tool_call, self._ctx)
                await self._record_step(task_id, step_index, response.text, tool_call, result)
                messages.append(
                    Message(
                        role=Role.USER,
                        content=(
                            f"Beobachtung vom Tool '{tool_call.name}': "
                            f"{_result_to_text(result)}"
                        ),
                    )
                )
                step_index += 1

        return await self._fail(
            task_id,
            step_index,
            f"Abbruch nach {self._max_iterations} Iterationen ohne Abschluss.",
        )

    async def _record_step(
        self,
        task_id: str,
        index: int,
        thought: str,
        tool_call: ToolCall,
        result: ToolResult,
    ) -> None:
        """Persist a step, update short-term memory and log any error."""

        step_id = await self._memory.add_step(
            task_id,
            index,
            thought or None,
            tool_call.name,
            tool_call.arguments,
            result.model_dump(),
            result.ok,
        )
        self._short_term.add_action_result(tool_call.name, result.ok, _summarise(result))
        if not result.ok:
            await self._memory.log_error(
                task_id,
                step_id,
                "ToolError",
                result.error or "Unbekannter Tool-Fehler.",
                result.meta.get("traceback"),
            )
        await self._publish(
            {
                "type": "agent_step",
                "task_id": task_id,
                "index": index,
                "tool": tool_call.name,
                "ok": result.ok,
            }
        )

    async def _fail(self, task_id: str, steps: int, summary: str) -> AgentResult:
        """Mark the task failed, emit an event and return a failed result."""

        await self._memory.set_task_error(task_id, summary)
        await self._publish({"type": "agent_failed", "task_id": task_id, "summary": summary})
        return AgentResult(task_id, "failed", summary, steps)

    async def _publish(self, event: dict[str, Any]) -> None:
        """Log and publish an agent event on the event bus."""

        self._logger.info("agent_event", **event)
        await self._event_bus.publish(event)


def _assistant_transcript(text: str, tool_calls: list[ToolCall]) -> str:
    """Return a transcript line for the assistant turn (text or serialised call)."""

    if text:
        return text
    first = tool_calls[0]
    return json.dumps({"tool": first.name, "arguments": first.arguments})


def _result_to_text(result: ToolResult) -> str:
    """Render a tool result compactly for feeding back into the conversation."""

    payload: dict[str, Any] = {"ok": result.ok}
    if result.error is not None:
        payload["error"] = result.error
    if result.output is not None:
        payload["output"] = result.output
    text = json.dumps(payload, ensure_ascii=False, default=str)
    if len(text) > _MAX_OBSERVATION_CHARS:
        return text[:_MAX_OBSERVATION_CHARS] + " ...[gekuerzt]"
    return text


def _summarise(result: ToolResult) -> str:
    """Short one-line summary of a result for short-term memory."""

    if result.ok:
        return _result_to_text(result)[:200]
    return f"Fehler: {result.error}"
