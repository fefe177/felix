"""Prompt builders for the agent loop.

Each function returns a plain string. The planner and verifier prompts embed a
stable marker (:data:`PLANNER_MARKER` / :data:`VERIFY_MARKER`) so callers - and
tests - can recognise the request type unambiguously.
"""

from __future__ import annotations

from typing import Any

#: Marker embedded in the planner prompt to identify a planning request.
PLANNER_MARKER = "[[LOCALPILOT_PLAN_REQUEST]]"
#: Marker embedded in the verify prompt to identify a verification request.
VERIFY_MARKER = "[[LOCALPILOT_VERIFY_REQUEST]]"


def system_prompt(tool_specs: list[dict[str, Any]], safety_mode: str) -> str:
    """Build the main system prompt for the think phase.

    Args:
        tool_specs: OpenAI tool specs (names/descriptions are listed).
        safety_mode: The active safety mode.

    Returns:
        The system-prompt string stating the role, tools, the strict tool-call
        contract and the safety rules.
    """

    lines: list[str] = [
        "Du bist LocalPilot, ein autonomer Desktop-Agent auf Windows 11.",
        "Du erfuellst Aufgaben Schritt fuer Schritt, indem du genau ein Tool pro Zug "
        "aufrufst und danach die Beobachtung auswertest.",
        f"Sicherheitsmodus: {safety_mode}.",
        "",
        "Verfuegbare Tools:",
    ]
    for spec in tool_specs:
        function = spec["function"]
        lines.append(f"- {function['name']}: {function['description']}")

    lines += [
        "",
        "ZWINGENDER ANTWORT-VERTRAG:",
        'Antworte mit GENAU EINEM JSON-Objekt: {"tool": "<name>", "arguments": {...}}.',
        'Mehrere Aktionen in einem Zug: {"actions": [{"tool": ..., "arguments": ...}, ...]}.',
        'Aufgabe abgeschlossen: {"tool": "finish", "arguments": {"summary": "<kurzfassung>"}}.',
        'Rueckfrage noetig: {"tool": "ask_user", "arguments": {"question": "<frage>"}}.',
        "",
        "Regeln:",
        "- Gib NIEMALS Prosa statt eines Tool-Calls aus.",
        "- Erfinde NIEMALS Tools, Argumente oder Beobachtungen.",
        "- Reagiere immer auf die tatsaechliche letzte Beobachtung.",
        "- Halte dich an den Sicherheitsmodus; gesperrte Aktionen werden abgelehnt.",
    ]
    return "\n".join(lines)


def planner_prompt(goal: str, known_strategies: list[str]) -> str:
    """Build the planner prompt asking for a numbered JSON step list.

    Args:
        goal: The user's goal.
        known_strategies: Short descriptions of relevant past strategies.

    Returns:
        A prompt requesting a JSON array of ``{"idx", "description"}`` objects.
    """

    lines: list[str] = [
        PLANNER_MARKER,
        "Erstelle einen knappen, umsetzbaren Plan fuer das folgende Ziel.",
        f"Ziel: {goal}",
    ]
    if known_strategies:
        lines.append("")
        lines.append("Bekannte, frueher erfolgreiche Strategien:")
        lines += [f"- {item}" for item in known_strategies]
    lines += [
        "",
        "Antworte AUSSCHLIESSLICH mit einem JSON-Array nummerierter Schritte:",
        '[{"idx": 0, "description": "..."}, {"idx": 1, "description": "..."}]',
        "Kein Fliesstext, nur das JSON-Array.",
    ]
    return "\n".join(lines)


def verify_prompt(step_description: str, last_result: str) -> str:
    """Build the verify prompt judging whether a step succeeded.

    Args:
        step_description: The plan step (or goal) being checked.
        last_result: A compact rendering of the latest tool result.

    Returns:
        A prompt requesting a JSON object
        ``{"success": bool, "reason": str, "next_hint": str}``.
    """

    return "\n".join(
        [
            VERIFY_MARKER,
            "Bewerte, ob der folgende Schritt anhand des Tool-Ergebnisses erfolgreich war.",
            f"Schritt: {step_description}",
            f"Letztes Ergebnis: {last_result}",
            "",
            "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:",
            '{"success": true, "reason": "...", "next_hint": "..."}',
        ]
    )
