"""Persistent, long-term memory backed by SQLite.

:class:`LongTermMemory` records tasks, their steps and errors, user preferences
and reusable strategies. Reads return typed Pydantic records (``TaskRecord``,
``StepRecord``, ``ErrorRecord``, ``StrategyRecord``) so callers get validated,
self-describing data.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

from localpilot.memory.db import Database


def _utcnow() -> str:
    """Return the current UTC time as an ISO-8601 string."""

    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    """Return a new UUID4 string identifier."""

    return str(uuid.uuid4())


def _to_int_bool(value: bool | None) -> int | None:
    """Convert an optional bool to ``1``/``0``/``None`` for storage."""

    return None if value is None else int(value)


def _from_int_bool(value: int | None) -> bool | None:
    """Convert a stored ``1``/``0``/``None`` back to an optional bool."""

    return None if value is None else bool(value)


class TaskRecord(BaseModel):
    """A persisted task."""

    id: str
    created_at: str
    status: str
    goal: str
    safety_mode: str
    result: str | None = None
    error: str | None = None


class StepRecord(BaseModel):
    """A persisted reasoning/action step of a task."""

    id: str
    task_id: str
    idx: int
    thought: str | None = None
    tool: str | None = None
    arguments: dict[str, Any] = Field(default_factory=dict)
    result: Any = None
    ok: bool | None = None
    created_at: str


class ErrorRecord(BaseModel):
    """A persisted error encountered during a task."""

    id: str
    task_id: str | None = None
    step_id: str | None = None
    kind: str
    message: str
    traceback: str | None = None
    created_at: str


class StrategyRecord(BaseModel):
    """A persisted, reusable strategy with success/failure tallies."""

    id: str
    pattern: str
    description: str | None = None
    success_count: int = 0
    fail_count: int = 0
    last_used_at: str | None = None

    @property
    def success_rate(self) -> float:
        """The fraction of successful uses, or ``0.0`` when never used."""

        total = self.success_count + self.fail_count
        return self.success_count / total if total else 0.0


class LongTermMemory:
    """CRUD-style access to persistent tasks, steps, errors, preferences, strategies."""

    def __init__(self, db: Database) -> None:
        """Wrap an already-connected :class:`Database`."""

        self._db = db

    # -- Tasks ---------------------------------------------------------------

    async def create_task(self, goal: str, safety_mode: str) -> str:
        """Create a task in ``running`` status and return its id."""

        task_id = _new_id()
        await self._db.execute(
            "INSERT INTO tasks (id, created_at, status, goal, safety_mode) "
            "VALUES (?, ?, ?, ?, ?)",
            (task_id, _utcnow(), "running", goal, safety_mode),
        )
        return task_id

    async def set_task_status(self, task_id: str, status: str) -> None:
        """Update only the status of a task."""

        await self._db.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))

    async def set_task_result(self, task_id: str, result: str) -> None:
        """Store a task's result and mark it ``completed``."""

        await self._db.execute(
            "UPDATE tasks SET result = ?, status = ? WHERE id = ?",
            (result, "completed", task_id),
        )

    async def set_task_error(self, task_id: str, error: str) -> None:
        """Store a task's error and mark it ``failed``."""

        await self._db.execute(
            "UPDATE tasks SET error = ?, status = ? WHERE id = ?",
            (error, "failed", task_id),
        )

    async def get_task(self, task_id: str) -> TaskRecord | None:
        """Return a single task by id, or ``None``."""

        row = await self._db.fetchone("SELECT * FROM tasks WHERE id = ?", (task_id,))
        return _row_to_task(row) if row is not None else None

    async def get_recent_tasks(self, limit: int = 20) -> list[TaskRecord]:
        """Return the most recently created tasks, newest first."""

        rows = await self._db.fetchall(
            "SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?", (limit,)
        )
        return [_row_to_task(row) for row in rows]

    async def get_task_with_steps(self, task_id: str) -> dict[str, Any] | None:
        """Return a nested ``{"task": ..., "steps": [...]}`` dict, or ``None``."""

        task_row = await self._db.fetchone("SELECT * FROM tasks WHERE id = ?", (task_id,))
        if task_row is None:
            return None
        step_rows = await self._db.fetchall(
            "SELECT * FROM steps WHERE task_id = ? ORDER BY idx ASC", (task_id,)
        )
        return {
            "task": _row_to_task(task_row).model_dump(),
            "steps": [_row_to_step(row).model_dump() for row in step_rows],
        }

    # -- Steps ---------------------------------------------------------------

    async def add_step(
        self,
        task_id: str,
        idx: int,
        thought: str | None,
        tool: str | None,
        arguments: dict[str, Any],
        result: Any,
        ok: bool | None,
    ) -> str:
        """Append a step to a task and return its id."""

        step_id = _new_id()
        await self._db.execute(
            "INSERT INTO steps "
            "(id, task_id, idx, thought, tool, arguments_json, result_json, ok, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                step_id,
                task_id,
                idx,
                thought,
                tool,
                json.dumps(arguments),
                json.dumps(result),
                _to_int_bool(ok),
                _utcnow(),
            ),
        )
        return step_id

    # -- Errors --------------------------------------------------------------

    async def log_error(
        self,
        task_id: str | None,
        step_id: str | None,
        kind: str,
        message: str,
        traceback: str | None = None,
    ) -> str:
        """Persist an error and return its id."""

        error_id = _new_id()
        await self._db.execute(
            "INSERT INTO errors (id, task_id, step_id, kind, message, traceback, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (error_id, task_id, step_id, kind, message, traceback, _utcnow()),
        )
        return error_id

    async def get_errors(self, task_id: str) -> list[ErrorRecord]:
        """Return all errors logged for a task, oldest first."""

        rows = await self._db.fetchall(
            "SELECT * FROM errors WHERE task_id = ? ORDER BY created_at ASC", (task_id,)
        )
        return [_row_to_error(row) for row in rows]

    # -- Preferences ---------------------------------------------------------

    async def set_preference(self, key: str, value: str) -> None:
        """Insert or update a preference value."""

        await self._db.execute(
            "INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, "
            "updated_at = excluded.updated_at",
            (key, value, _utcnow()),
        )

    async def get_preference(self, key: str) -> str | None:
        """Return a preference value by key, or ``None``."""

        row = await self._db.fetchone("SELECT value FROM preferences WHERE key = ?", (key,))
        return None if row is None else row["value"]

    async def all_preferences(self) -> dict[str, str]:
        """Return all preferences as a ``{key: value}`` mapping."""

        rows = await self._db.fetchall("SELECT key, value FROM preferences ORDER BY key")
        return {row["key"]: row["value"] for row in rows}

    # -- Strategies ----------------------------------------------------------

    async def record_strategy(self, pattern: str, description: str | None = None) -> str:
        """Create a new strategy with zeroed tallies and return its id."""

        strategy_id = _new_id()
        await self._db.execute(
            "INSERT INTO strategies "
            "(id, pattern, description, success_count, fail_count, last_used_at) "
            "VALUES (?, ?, ?, 0, 0, ?)",
            (strategy_id, pattern, description, _utcnow()),
        )
        return strategy_id

    async def bump_strategy_success(self, strategy_id: str) -> None:
        """Increment a strategy's success count and touch ``last_used_at``."""

        await self._db.execute(
            "UPDATE strategies SET success_count = success_count + 1, last_used_at = ? "
            "WHERE id = ?",
            (_utcnow(), strategy_id),
        )

    async def bump_strategy_fail(self, strategy_id: str) -> None:
        """Increment a strategy's failure count and touch ``last_used_at``."""

        await self._db.execute(
            "UPDATE strategies SET fail_count = fail_count + 1, last_used_at = ? WHERE id = ?",
            (_utcnow(), strategy_id),
        )

    async def get_strategy(self, strategy_id: str) -> StrategyRecord | None:
        """Return a single strategy by id, or ``None``."""

        row = await self._db.fetchone("SELECT * FROM strategies WHERE id = ?", (strategy_id,))
        return _row_to_strategy(row) if row is not None else None

    async def find_strategies(self, pattern_like: str) -> list[StrategyRecord]:
        """Return strategies whose pattern contains ``pattern_like``.

        Results are sorted by success rate (descending), then by raw success
        count, so the most reliable strategies come first.
        """

        rows = await self._db.fetchall(
            "SELECT * FROM strategies WHERE pattern LIKE ?", (f"%{pattern_like}%",)
        )
        records = [_row_to_strategy(row) for row in rows]
        records.sort(key=lambda record: (record.success_rate, record.success_count), reverse=True)
        return records


def _row_to_task(row: Any) -> TaskRecord:
    return TaskRecord(
        id=row["id"],
        created_at=row["created_at"],
        status=row["status"],
        goal=row["goal"],
        safety_mode=row["safety_mode"],
        result=row["result"],
        error=row["error"],
    )


def _row_to_step(row: Any) -> StepRecord:
    return StepRecord(
        id=row["id"],
        task_id=row["task_id"],
        idx=row["idx"],
        thought=row["thought"],
        tool=row["tool"],
        arguments=json.loads(row["arguments_json"]) if row["arguments_json"] else {},
        result=json.loads(row["result_json"]) if row["result_json"] is not None else None,
        ok=_from_int_bool(row["ok"]),
        created_at=row["created_at"],
    )


def _row_to_error(row: Any) -> ErrorRecord:
    return ErrorRecord(
        id=row["id"],
        task_id=row["task_id"],
        step_id=row["step_id"],
        kind=row["kind"],
        message=row["message"],
        traceback=row["traceback"],
        created_at=row["created_at"],
    )


def _row_to_strategy(row: Any) -> StrategyRecord:
    return StrategyRecord(
        id=row["id"],
        pattern=row["pattern"],
        description=row["description"],
        success_count=row["success_count"],
        fail_count=row["fail_count"],
        last_used_at=row["last_used_at"],
    )
