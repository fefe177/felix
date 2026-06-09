"""REST API routes for LocalPilot.

These endpoints let a UI start/cancel runs, answer confirmations, browse memory
(tasks, preferences, strategies), fetch screenshots and read the (non-secret)
configuration and health. The shared :class:`ServerContext` is taken from
``app.state`` via the :func:`get_context` dependency.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from localpilot.server.runtime import RunConflictError, ServerContext

router = APIRouter()


def get_context(request: Request) -> ServerContext:
    """Return the server context, or 503 if the app is not initialised yet."""

    context = getattr(request.app.state, "context", None)
    if context is None:
        raise HTTPException(status_code=503, detail="Server ist nicht initialisiert.")
    assert isinstance(context, ServerContext)
    return context


#: Dependency injecting the shared server context into a route.
ContextDep = Annotated[ServerContext, Depends(get_context)]


class TaskRequest(BaseModel):
    """Body for ``POST /api/tasks``."""

    goal: str = Field(min_length=1, description="The goal for the agent.")
    safety_mode: Literal["safe", "balanced", "autonomous"] = "balanced"
    multi_agent: bool = False


class ConfirmRequest(BaseModel):
    """Body for ``POST /api/confirm``."""

    decision: bool


class PreferenceRequest(BaseModel):
    """Body for ``PUT /api/memory/preferences``."""

    key: str = Field(min_length=1)
    value: str


@router.get("/api/health")
async def health(context: ContextDep) -> dict[str, Any]:
    """Liveness probe plus the current run status."""

    return {
        "status": "ok",
        "active_run": context.run_manager.active,
        "task_id": context.run_manager.current_task_id,
    }


@router.post("/api/tasks")
async def create_task(body: TaskRequest, context: ContextDep) -> dict[str, str]:
    """Start a background agent run and return its task id (409 if one is active)."""

    try:
        task_id = await context.run_manager.start(body.goal, body.safety_mode, body.multi_agent)
    except RunConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"task_id": task_id}


@router.post("/api/tasks/{task_id}/cancel")
async def cancel_task(task_id: str, context: ContextDep) -> dict[str, bool]:
    """Cancel the active run cooperatively."""

    cancelled = await context.run_manager.cancel()
    return {"cancelled": cancelled}


@router.post("/api/confirm")
async def confirm(body: ConfirmRequest, context: ContextDep) -> dict[str, bool]:
    """Deliver a pending confirmation decision to the waiting safety gate."""

    return {"resolved": context.confirm_provider.resolve(body.decision)}


@router.get("/api/tasks")
async def list_tasks(
    context: ContextDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
) -> list[dict[str, Any]]:
    """Return the most recent tasks from long-term memory."""

    tasks = await context.container.memory.get_recent_tasks(limit)
    return [task.model_dump() for task in tasks]


@router.get("/api/tasks/{task_id}")
async def get_task(task_id: str, context: ContextDep) -> dict[str, Any]:
    """Return a single task together with its ordered steps."""

    bundle = await context.container.memory.get_task_with_steps(task_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Task nicht gefunden.")
    return bundle


@router.get("/api/memory/preferences")
async def get_preferences(context: ContextDep) -> dict[str, str]:
    """Return all stored preferences."""

    return await context.container.memory.all_preferences()


@router.put("/api/memory/preferences")
async def set_preference(body: PreferenceRequest, context: ContextDep) -> dict[str, bool]:
    """Insert or update a preference."""

    await context.container.memory.set_preference(body.key, body.value)
    return {"ok": True}


@router.get("/api/memory/strategies")
async def get_strategies(context: ContextDep) -> list[dict[str, Any]]:
    """Return all strategies, including each one's success rate."""

    strategies = await context.container.memory.find_strategies("")
    return [
        {**strategy.model_dump(), "success_rate": strategy.success_rate}
        for strategy in strategies
    ]


@router.get("/api/screenshots/{name}")
async def get_screenshot(name: str, context: ContextDep) -> FileResponse:
    """Serve a stored screenshot PNG from the temp dir or the workspace."""

    if name != Path(name).name or not name.lower().endswith(".png"):
        raise HTTPException(status_code=400, detail="Ungueltiger Dateiname.")
    workdir = Path(context.container.config.terminal.workdir).resolve()
    for directory in (Path(tempfile.gettempdir()), workdir):
        candidate = directory / name
        if candidate.is_file():
            return FileResponse(candidate, media_type="image/png")
    raise HTTPException(status_code=404, detail="Screenshot nicht gefunden.")


@router.get("/api/config")
async def get_config(context: ContextDep) -> dict[str, Any]:
    """Return the current configuration with secrets redacted."""

    data = context.container.config.model_dump()
    if isinstance(data.get("llm"), dict) and "api_key" in data["llm"]:
        data["llm"]["api_key"] = "***"
    return data
