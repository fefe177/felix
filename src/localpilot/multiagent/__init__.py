"""Multi-agent orchestration (optional; the single-agent path is the default)."""

from __future__ import annotations

from localpilot.multiagent.orchestrator import Orchestrator, OrchestratorResult
from localpilot.multiagent.roles import (
    AgentRole,
    DebugAgent,
    ExecutorAgent,
    PlannerAgent,
    ResearchAgent,
)

__all__ = [
    "AgentRole",
    "DebugAgent",
    "ExecutorAgent",
    "Orchestrator",
    "OrchestratorResult",
    "PlannerAgent",
    "ResearchAgent",
]
