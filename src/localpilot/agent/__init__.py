"""Autonomous agent: state, prompts, safety, planner and the main loop."""

from __future__ import annotations

from localpilot.agent.loop import AgentLoop, AgentRunResult
from localpilot.agent.planner import Planner
from localpilot.agent.prompts import planner_prompt, system_prompt, verify_prompt
from localpilot.agent.safety import (
    CLIConfirmationProvider,
    ConfirmationProvider,
    Decision,
    SafetyGate,
)
from localpilot.agent.state import AgentState, PlanStep

__all__ = [
    "AgentLoop",
    "AgentRunResult",
    "AgentState",
    "CLIConfirmationProvider",
    "ConfirmationProvider",
    "Decision",
    "PlanStep",
    "Planner",
    "SafetyGate",
    "planner_prompt",
    "system_prompt",
    "verify_prompt",
]
