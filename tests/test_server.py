"""Tests for the HTTP/WebSocket server using FastAPI's TestClient.

A mock LLM is injected into the container the app adopts, so no real model or
network is used. The TestClient runs the app's lifespan (startup/shutdown) and
drives the background agent run.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from localpilot.agent.prompts import PLANNER_MARKER, VERIFY_MARKER
from localpilot.config.schema import AppConfig
from localpilot.container import Container
from localpilot.llm.base import LLMResponse
from localpilot.llm.messages import Message
from localpilot.server.app import create_app


def _content(message: Message) -> str:
    if isinstance(message.content, str):
        return message.content
    return " ".join(str(part) for part in message.content)


class _ScriptedLLM:
    """Marker-aware mock LLM: canned plan/verify, scripted think-phase calls."""

    def __init__(self, tool_responses: list[str]) -> None:
        self._tool_responses = list(tool_responses)

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        text = "\n".join(_content(message) for message in messages)
        if PLANNER_MARKER in text:
            return LLMResponse(text='[{"idx": 0, "description": "Erledige das Ziel"}]')
        if VERIFY_MARKER in text:
            return LLMResponse(text='{"success": true, "reason": "ok", "next_hint": ""}')
        if self._tool_responses:
            return LLMResponse(text=self._tool_responses.pop(0))
        return LLMResponse(text='{"tool": "finish", "arguments": {"summary": "auto"}}')


class _GatedLLM:
    """Mock LLM that blocks in the planner phase until cancelled."""

    def __init__(self) -> None:
        self._gate: asyncio.Event | None = None

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        text = "\n".join(_content(message) for message in messages)
        if PLANNER_MARKER in text:
            if self._gate is None:
                self._gate = asyncio.Event()
            await self._gate.wait()  # blocks the run until cancelled
            return LLMResponse(text='[{"idx": 0, "description": "Schritt"}]')
        if VERIFY_MARKER in text:
            return LLMResponse(text='{"success": true, "reason": "ok", "next_hint": ""}')
        return LLMResponse(text='{"tool": "finish", "arguments": {"summary": "ok"}}')


def _build_app(
    tmp_path: Path, llm: Any, *, mode: str = "autonomous", max_iterations: int = 3
) -> Any:
    config = AppConfig()
    config.terminal.workdir = str(tmp_path)
    config.memory.db_path = str(tmp_path / "mem.db")
    config.agent.max_iterations = max_iterations
    config.safety.mode = mode  # type: ignore[assignment]
    container = Container(config)
    container._llm_client = llm
    return create_app(config=config, container=container)


def _wait_for_status(client: TestClient, task_id: str, target: str = "running") -> dict[str, Any]:
    """Poll a task until its status differs from ``target`` (or time out)."""

    for _ in range(100):
        response = client.get(f"/api/tasks/{task_id}")
        if response.status_code == 200:
            bundle = response.json()
            if bundle["task"]["status"] != target:
                return bundle
        time.sleep(0.05)
    return client.get(f"/api/tasks/{task_id}").json()


def test_health(tmp_path: Path) -> None:
    app = _build_app(tmp_path, _ScriptedLLM([]))
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


def test_config_redacts_secret(tmp_path: Path) -> None:
    app = _build_app(tmp_path, _ScriptedLLM([]))
    with TestClient(app) as client:
        data = client.get("/api/config").json()
        assert data["llm"]["api_key"] == "***"


def test_preferences_roundtrip(tmp_path: Path) -> None:
    app = _build_app(tmp_path, _ScriptedLLM([]))
    with TestClient(app) as client:
        assert client.get("/api/memory/preferences").json() == {}
        put = client.put("/api/memory/preferences", json={"key": "theme", "value": "dark"})
        assert put.status_code == 200
        assert client.get("/api/memory/preferences").json() == {"theme": "dark"}


def test_create_task_runs_and_records_steps(tmp_path: Path) -> None:
    llm = _ScriptedLLM(
        [
            '{"tool": "file_write", "arguments": {"path": "o.txt", "content": "x"}}',
            '{"tool": "finish", "arguments": {"summary": "ok"}}',
        ]
    )
    app = _build_app(tmp_path, llm)
    with TestClient(app) as client:
        response = client.post(
            "/api/tasks", json={"goal": "schreibe o.txt", "safety_mode": "autonomous"}
        )
        assert response.status_code == 200
        task_id = response.json()["task_id"]

        bundle = _wait_for_status(client, task_id)
        assert bundle["task"]["status"] == "completed"
        assert [step["tool"] for step in bundle["steps"]] == ["file_write"]
        assert (tmp_path / "o.txt").read_text(encoding="utf-8") == "x"


def test_second_concurrent_task_conflicts(tmp_path: Path) -> None:
    app = _build_app(tmp_path, _GatedLLM())
    with TestClient(app) as client:
        first = client.post("/api/tasks", json={"goal": "g1", "safety_mode": "autonomous"})
        assert first.status_code == 200
        task_id = first.json()["task_id"]

        second = client.post("/api/tasks", json={"goal": "g2", "safety_mode": "autonomous"})
        assert second.status_code == 409

        cancelled = client.post(f"/api/tasks/{task_id}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["cancelled"] is True


def test_confirmation_flow_unblocks_balanced_run(tmp_path: Path) -> None:
    llm = _ScriptedLLM(
        [
            '{"tool": "file_write", "arguments": {"path": "c.txt", "content": "y"}}',
            '{"tool": "finish", "arguments": {"summary": "ok"}}',
        ]
    )
    app = _build_app(tmp_path, llm, mode="balanced")
    with TestClient(app) as client:
        response = client.post(
            "/api/tasks", json={"goal": "schreibe c.txt", "safety_mode": "balanced"}
        )
        task_id = response.json()["task_id"]

        # The balanced file_write waits for confirmation; approve it once pending.
        resolved = False
        for _ in range(100):
            if client.post("/api/confirm", json={"decision": True}).json()["resolved"]:
                resolved = True
                break
            time.sleep(0.05)
        assert resolved

        bundle = _wait_for_status(client, task_id)
        assert bundle["task"]["status"] == "completed"
        assert (tmp_path / "c.txt").read_text(encoding="utf-8") == "y"


def test_websocket_streams_events(tmp_path: Path) -> None:
    llm = _ScriptedLLM(['{"tool": "finish", "arguments": {"summary": "ok"}}'])
    app = _build_app(tmp_path, llm)
    with TestClient(app) as client, client.websocket_connect("/ws/events") as ws:
        response = client.post("/api/tasks", json={"goal": "g", "safety_mode": "autonomous"})
        assert response.status_code == 200
        event = ws.receive_json()
        assert "type" in event
