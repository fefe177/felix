"""The autonomous agent loop: Observe -> Think -> Plan -> Act -> Verify -> Learn.

:class:`AgentLoop` is wired from the :class:`~localpilot.container.Container`. A
run creates a task, builds a plan, then iterates: build the prompt from the plan
and short-term context, ask the LLM, parse a tool call (with one repair attempt),
handle the ``finish`` / ``ask_user`` control tools, otherwise authorise (and
possibly confirm) and execute each tool, feed the observation back, verify
progress and learn from the outcome. Every phase is logged on the event bus, and
the loop is bounded by ``agent.max_iterations`` against runaway behaviour.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from localpilot.agent.planner import Planner
from localpilot.agent.prompts import system_prompt, verify_prompt
from localpilot.agent.safety import ConfirmationProvider, Decision, SafetyGate
from localpilot.agent.state import AgentState, PlanStep
from localpilot.llm.base import LLMClient, LLMResponse
from localpilot.llm.errors import ToolCallParseError
from localpilot.llm.messages import Message, Role, ToolCall
from localpilot.llm.parsing import build_repair_message, extract_tool_calls, first_json_value
from localpilot.memory.long_term import LongTermMemory
from localpilot.memory.short_term import ShortTermMemory
from localpilot.tools.base import ToolContext, ToolResult
from localpilot.tools.registry import ToolManager

if TYPE_CHECKING:
    from localpilot.container import Container

#: Maximum characters of a tool result fed back into the conversation.
_MAX_OBSERVATION_CHARS = 4_000


@dataclass
class AgentRunResult:
    """The outcome of an agent run.

    Attributes:
        task_id: The persisted task id.
        status: ``completed``, ``failed`` or ``needs_input``.
        summary: A short human-readable summary.
        state: The final :class:`AgentState`.
        question: A pending question when ``status`` is ``needs_input``.
    """

    task_id: str
    status: str
    summary: str
    state: AgentState
    question: str | None = None


class AgentLoop:
    """Drives a single goal to completion through the reasoning loop."""

    def __init__(
        self,
        container: Container,
        confirmation_provider: ConfirmationProvider | None = None,
    ) -> None:
        """Wire collaborators from ``container`` and store the confirm provider."""

        self._llm: LLMClient = container.llm_client
        self._tools: ToolManager = container.tool_manager
        self._ctx: ToolContext = container.tool_context
        self._memory: LongTermMemory = container.memory
        self._safety: SafetyGate = container.safety_gate
        self._event_bus = container.event_bus
        self._logger = container.logger
        self._config = container.config
        self._confirm = confirmation_provider
        self._planner = Planner(self._llm)
        self._max_iterations = self._config.agent.max_iterations
        self._short_term = ShortTermMemory()

    async def run(self, goal: str, safety_mode: str) -> AgentRunResult:
        """Execute ``goal`` under ``safety_mode`` and return the result."""

        self._config.safety.mode = safety_mode  # type: ignore[assignment]
        task_id = await self._memory.create_task(goal, safety_mode)
        state = AgentState(task_id=task_id, goal=goal, safety_mode=safety_mode)
        self._short_term.set_goal(goal)
        await self._emit("agent_start", task_id=task_id, goal=goal, safety_mode=safety_mode)

        state.plan = await self._planner.make_plan(goal, self._memory)
        await self._emit(
            "agent_plan", task_id=task_id, plan=[step.model_dump() for step in state.plan]
        )

        specs = self._tools.get_specs()
        last_observation = ""

        for iteration in range(self._max_iterations):
            await self._emit("agent_observe", task_id=task_id, iteration=iteration)
            messages = self._build_messages(state, last_observation, specs)
            response = await self._llm.chat(messages, tools=specs)
            tool_calls = await self._parse_with_repair(messages, response, specs)

            if tool_calls is None:
                await self._memory.log_error(
                    task_id, None, "ParseError", "Kein gueltiger Tool-Call nach Reparatur."
                )
                self._short_term.add_observation("Antwort war kein gueltiger Tool-Call.")
                last_observation = "Fehler: kein gueltiger Tool-Call."
                await self._emit("agent_parse_error", task_id=task_id, iteration=iteration)
                continue

            terminal = await self._process_tool_calls(state, response.text, tool_calls)
            if terminal is not None:
                return terminal
            last_observation = str(state.scratchpad.get("last_observation", ""))

        summary = "Maximale Iterationszahl erreicht, ohne die Aufgabe abzuschliessen."
        state.status = "failed"
        await self._memory.set_task_error(task_id, summary)
        await self._emit("agent_failed", task_id=task_id, reason="max_iterations")
        return AgentRunResult(task_id, "failed", summary, state)

    async def _process_tool_calls(
        self, state: AgentState, thought: str, tool_calls: list[ToolCall]
    ) -> AgentRunResult | None:
        """Process one response's tool calls; return a result if the run ends."""

        last_result: ToolResult | None = None
        for tool_call in tool_calls:
            if tool_call.name == "finish":
                return await self._finish(state, tool_call)
            if tool_call.name == "ask_user":
                terminal = await self._handle_ask_user(state, tool_call)
                if terminal is not None:
                    return terminal
                continue

            last_result = await self._act(state, thought, tool_call)
            state.scratchpad["last_observation"] = _result_to_text(last_result)

        if last_result is not None:
            await self._verify(state, last_result)
        return None

    async def _act(self, state: AgentState, thought: str, tool_call: ToolCall) -> ToolResult:
        """Authorise, optionally confirm, execute and record a single tool call."""

        decision = await self._safety.authorize(tool_call.name, tool_call.arguments, self._ctx)
        if not decision.allow:
            result = ToolResult(
                ok=False, error=f"Durch Sicherheitsregel blockiert: {decision.reason}"
            )
        elif decision.needs_confirmation and not await self._confirm_action(tool_call, decision):
            result = ToolResult(ok=False, error="Aktion wurde nicht bestaetigt.")
        else:
            result = await self._tools.execute(tool_call, self._ctx)

        step_id = await self._memory.add_step(
            state.task_id,
            len(state.history),
            thought or None,
            tool_call.name,
            tool_call.arguments,
            result.model_dump(),
            result.ok,
        )
        state.history.append(
            {
                "idx": len(state.history),
                "tool": tool_call.name,
                "arguments": tool_call.arguments,
                "ok": result.ok,
            }
        )
        self._short_term.add_action_result(tool_call.name, result.ok, _summarise(result))
        if not result.ok:
            await self._memory.log_error(
                state.task_id,
                step_id,
                "ToolError",
                result.error or "Unbekannter Tool-Fehler.",
                result.meta.get("traceback"),
            )
            await self._learn_failure(state.goal)
        await self._emit(
            "agent_act",
            task_id=state.task_id,
            tool=tool_call.name,
            arguments=tool_call.arguments,
            ok=result.ok,
            thought=thought,
        )
        return result

    async def _finish(self, state: AgentState, tool_call: ToolCall) -> AgentRunResult:
        """Handle the ``finish`` control tool: persist, learn and return success."""

        summary = str(tool_call.arguments.get("summary", "")).strip()
        state.status = "completed"
        await self._learn_success(state.goal, summary)
        await self._memory.set_task_result(state.task_id, summary)
        await self._emit("agent_finish", task_id=state.task_id, summary=summary)
        return AgentRunResult(state.task_id, "completed", summary, state)

    async def _handle_ask_user(
        self, state: AgentState, tool_call: ToolCall
    ) -> AgentRunResult | None:
        """Handle ``ask_user``; feed an answer back, or end the run pending input."""

        question = str(tool_call.arguments.get("question", "")).strip()
        await self._emit("agent_ask_user", task_id=state.task_id, question=question)
        answer = await self._request_answer(question)
        if answer is None:
            state.status = "needs_input"
            await self._memory.set_task_status(state.task_id, "needs_input")
            return AgentRunResult(
                state.task_id,
                "needs_input",
                "Der Agent benoetigt eine Rueckfrage.",
                state,
                question=question,
            )
        self._short_term.add_observation(f"Benutzerantwort: {answer}")
        state.scratchpad["last_observation"] = f"Benutzerantwort: {answer}"
        return None

    async def _verify(self, state: AgentState, result: ToolResult) -> None:
        """Ask the model whether the current step succeeded and update the plan."""

        step = state.current_step()
        description = step.description if step is not None else state.goal
        prompt = verify_prompt(description, _result_to_text(result))
        response = await self._llm.chat(
            [
                Message(role=Role.SYSTEM, content="Du bewertest den Fortschritt knapp."),
                Message(role=Role.USER, content=prompt),
            ]
        )
        parsed = first_json_value(response.text)
        verdict: dict[str, Any] = parsed if isinstance(parsed, dict) else {}
        success = bool(verdict.get("success")) and result.ok
        if success and step is not None:
            step.done = True
            state.advance()
        elif not success:
            hint = str(verdict.get("next_hint", "")).strip()
            if hint:
                state.scratchpad["hint"] = hint
        await self._emit(
            "agent_verify",
            task_id=state.task_id,
            success=success,
            reason=str(verdict.get("reason", "")),
        )

    async def _parse_with_repair(
        self, messages: list[Message], response: LLMResponse, specs: list[dict[str, Any]]
    ) -> list[ToolCall] | None:
        """Extract tool calls, allowing exactly one repair attempt on failure."""

        try:
            return extract_tool_calls(response)
        except ToolCallParseError as exc:
            repair_messages = [
                *messages,
                Message(role=Role.ASSISTANT, content=response.text),
                build_repair_message(str(exc)),
            ]
            retry = await self._llm.chat(repair_messages, tools=specs)
            try:
                return extract_tool_calls(retry)
            except ToolCallParseError:
                return None

    def _build_messages(
        self, state: AgentState, last_observation: str, specs: list[dict[str, Any]]
    ) -> list[Message]:
        """Build the think-phase messages from plan, context and last observation."""

        user_parts = [
            f"Ziel: {state.goal}",
            "",
            "Plan:",
            _render_plan(state.plan),
            "",
            "Kontext:",
            self._short_term.as_context_text(),
        ]
        if state.scratchpad.get("hint"):
            user_parts += ["", f"Hinweis: {state.scratchpad['hint']}"]
        if last_observation:
            user_parts += ["", "Letzte Beobachtung:", last_observation]
        user_parts += ["", "Waehle den naechsten Tool-Call gemaess Vertrag."]
        return [
            Message(role=Role.SYSTEM, content=system_prompt(specs, state.safety_mode)),
            Message(role=Role.USER, content="\n".join(user_parts)),
        ]

    async def _confirm_action(self, tool_call: ToolCall, decision: Decision) -> bool:
        """Request confirmation for a risky action; deny if no provider exists."""

        await self._emit(
            "agent_confirm_request", tool=tool_call.name, reason=decision.reason
        )
        if self._confirm is None:
            return False
        prompt = (
            f"Aktion '{tool_call.name}' mit Argumenten {tool_call.arguments} ausfuehren? "
            f"({decision.reason})"
        )
        approved = await self._confirm.confirm(prompt)
        await self._emit("agent_confirm_result", tool=tool_call.name, approved=approved)
        return approved

    async def _request_answer(self, question: str) -> str | None:
        """Get a free-text answer for ``ask_user`` if the provider supports it."""

        ask = getattr(self._confirm, "ask", None)
        if ask is None:
            return None
        answer = await ask(question)
        return str(answer)

    async def _learn_success(self, goal: str, summary: str) -> None:
        """Reinforce a strategy on success (bump existing or record a new one)."""

        pattern = goal[:80]
        strategies = await self._memory.find_strategies(pattern)
        if strategies:
            await self._memory.bump_strategy_success(strategies[0].id)
        else:
            await self._memory.record_strategy(pattern, summary[:200] or "Erfolgreich erledigt.")

    async def _learn_failure(self, goal: str) -> None:
        """Penalise an existing strategy on a tool failure, if one matches."""

        strategies = await self._memory.find_strategies(goal[:80])
        if strategies:
            await self._memory.bump_strategy_fail(strategies[0].id)

    async def _emit(self, event_type: str, **fields: Any) -> None:
        """Log and publish an agent event on the event bus."""

        self._logger.info(event_type, **fields)
        await self._event_bus.publish({"type": event_type, **fields})


def _render_plan(plan: list[PlanStep]) -> str:
    """Render a plan as a compact checklist."""

    if not plan:
        return "(noch kein Plan)"
    lines = []
    for step in plan:
        mark = "x" if step.done else " "
        suffix = f" -- {step.notes}" if step.notes else ""
        lines.append(f"[{mark}] {step.idx}: {step.description}{suffix}")
    return "\n".join(lines)


def _result_to_text(result: ToolResult) -> str:
    """Render a tool result compactly for the conversation."""

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
    """One-line summary of a result for short-term memory."""

    if result.ok:
        return _result_to_text(result)[:200]
    return f"Fehler: {result.error}"
