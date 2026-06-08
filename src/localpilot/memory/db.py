"""Asynchronous SQLite database wrapper built on ``aiosqlite``.

:class:`Database` owns a single connection, applies WAL mode and foreign-key
enforcement, runs the bundled ``schema.sql`` idempotently and exposes small
generic ``execute`` / ``fetchall`` / ``fetchone`` helpers used by the memory
stores.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

import aiosqlite

_SCHEMA_PATH = Path(__file__).with_name("schema.sql")


class Database:
    """A thin async wrapper around a single SQLite connection."""

    def __init__(self, db_path: str) -> None:
        """Store the database path; no connection is opened until :meth:`connect`."""

        self._db_path = db_path
        self._conn: aiosqlite.Connection | None = None

    @property
    def connection(self) -> aiosqlite.Connection:
        """The live connection, or raise if :meth:`connect` was not called."""

        if self._conn is None:
            raise RuntimeError("Database ist nicht verbunden; bitte connect() aufrufen.")
        return self._conn

    async def connect(self) -> None:
        """Open the connection (idempotent), enabling WAL and foreign keys."""

        if self._conn is not None:
            return
        if self._db_path != ":memory:":
            parent = Path(self._db_path).parent
            parent.mkdir(parents=True, exist_ok=True)
        self._conn = await aiosqlite.connect(self._db_path)
        self._conn.row_factory = aiosqlite.Row
        await self._conn.execute("PRAGMA journal_mode=WAL;")
        await self._conn.execute("PRAGMA foreign_keys=ON;")
        await self._conn.commit()

    async def close(self) -> None:
        """Close the connection if open (idempotent)."""

        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    async def init_schema(self) -> None:
        """Execute ``schema.sql`` to create tables and indexes (idempotent)."""

        sql = _SCHEMA_PATH.read_text(encoding="utf-8")
        await self.connection.executescript(sql)
        await self.connection.commit()

    async def execute(self, sql: str, params: Sequence[Any] | None = None) -> None:
        """Run a write statement with parameters and commit."""

        await self.connection.execute(sql, tuple(params or ()))
        await self.connection.commit()

    async def fetchall(
        self, sql: str, params: Sequence[Any] | None = None
    ) -> list[aiosqlite.Row]:
        """Run a query and return all rows."""

        cursor = await self.connection.execute(sql, tuple(params or ()))
        try:
            rows = await cursor.fetchall()
        finally:
            await cursor.close()
        return list(rows)

    async def fetchone(
        self, sql: str, params: Sequence[Any] | None = None
    ) -> aiosqlite.Row | None:
        """Run a query and return the first row, or ``None``."""

        cursor = await self.connection.execute(sql, tuple(params or ()))
        try:
            row = await cursor.fetchone()
        finally:
            await cursor.close()
        return row
