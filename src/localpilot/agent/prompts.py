"""System-prompt construction for the agent loop.

The system prompt states the agent's identity and safety mode, lists the
available tools, and spells out the tool-call contract the model must follow
(exactly one JSON object, the ``finish``/``ask_user`` control tools, no prose).
"""

from __future__ import annotations

from typing import Any


def build_system_prompt(
    tool_specs: list[dict[str, Any]],
    safety_mode: str,
    context_text: str | None = None,
    preferences: dict[str, str] | None = None,
) -> str:
    """Build the system prompt for one agent run.

    Args:
        tool_specs: OpenAI tool specs (used to list tool names/descriptions).
        safety_mode: The active safety mode, shown to the model.
        context_text: Optional short-term memory summary.
        preferences: Optional user preferences to honour.

    Returns:
        The assembled system-prompt string.
    """

    lines: list[str] = [
        "Du bist LocalPilot, ein autonomer Desktop-Agent. Du erfuellst Aufgaben "
        "Schritt fuer Schritt, indem du Tools aufrufst und die Ergebnisse beobachtest.",
        f"Sicherheitsmodus: {safety_mode}.",
        "",
        "Verfuegbare Tools:",
    ]
    for spec in tool_specs:
        function = spec["function"]
        lines.append(f"- {function['name']}: {function['description']}")

    lines += [
        "",
        "Antwortvertrag (strikt einhalten):",
        'Antworte mit GENAU EINEM JSON-Objekt: {"tool": "<name>", "arguments": {...}}.',
        'Mehrere Schritte: {"actions": [{"tool": ..., "arguments": ...}, ...]}.',
        'Aufgabe erledigt: {"tool": "finish", "arguments": {"summary": "<kurzfassung>"}}.',
        'Rueckfrage noetig: {"tool": "ask_user", "arguments": {"question": "<frage>"}}.',
        "Gib KEINEN Fliesstext ausserhalb des JSON-Objekts aus.",
    ]

    if preferences:
        notes = ", ".join(f"{key}={value}" for key, value in preferences.items())
        lines += ["", f"Benutzereinstellungen: {notes}"]

    if context_text:
        lines += ["", "Aktueller Kontext:", context_text]

    return "\n".join(lines)
