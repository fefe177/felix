"""Optional semantic (vector) memory backed by ``sqlite-vec``.

This component is fully optional and gated by
:attr:`~localpilot.config.schema.MemoryConfig.vector_enabled`. It is only active
when **all** of the following hold:

* ``memory.vector_enabled`` is ``true``;
* an embedding model is configured (``memory.embedding_model``);
* the ``sqlite-vec`` package is importable.

When any condition is unmet, every method is a safe no-op and :meth:`status`
returns a clear explanation, so the rest of the memory system keeps working.
Embeddings are produced via the OpenAI-compatible ``/v1/embeddings`` endpoint.
"""

from __future__ import annotations

import json
import struct
import uuid
from typing import Any

from localpilot.config.schema import LLMConfig, MemoryConfig
from localpilot.memory.db import Database


def _sqlite_vec_available() -> bool:
    """Return ``True`` if the ``sqlite-vec`` package can be imported."""

    try:
        import sqlite_vec  # noqa: F401
    except ImportError:
        return False
    return True


def _serialize(vector: list[float]) -> bytes:
    """Pack a float vector into the little-endian bytes ``sqlite-vec`` expects."""

    return struct.pack(f"<{len(vector)}f", *vector)


class VectorMemory:
    """Semantic memory over ``sqlite-vec``; a no-op when not fully available."""

    def __init__(self, db: Database, config: MemoryConfig, llm_config: LLMConfig) -> None:
        """Store dependencies; nothing is created until first use."""

        self._db = db
        self._config = config
        self._llm_config = llm_config
        self._initialized = False
        self._dimension: int | None = None

    @property
    def enabled(self) -> bool:
        """Whether the feature is switched on (flag + embedding model set)."""

        return bool(self._config.vector_enabled and self._config.embedding_model)

    @property
    def available(self) -> bool:
        """Whether the feature is enabled *and* ``sqlite-vec`` is installed."""

        return self.enabled and _sqlite_vec_available()

    def status(self) -> str:
        """Return a human-readable explanation of the current vector state."""

        if not self._config.vector_enabled:
            return "Vektorspeicher deaktiviert (memory.vector_enabled = false)."
        if not self._config.embedding_model:
            return "Vektorspeicher inaktiv: kein 'embedding_model' konfiguriert."
        if not _sqlite_vec_available():
            return "Vektorspeicher inaktiv: das Paket 'sqlite-vec' ist nicht installiert."
        return "Vektorspeicher aktiv."

    async def initialize(self) -> None:
        """Load the ``sqlite-vec`` extension into the connection (best effort)."""

        if not self.available or self._initialized:
            return
        try:
            import sqlite_vec

            connection = self._db.connection
            await connection.enable_load_extension(True)
            await connection.load_extension(sqlite_vec.loadable_path())
            await connection.enable_load_extension(False)
            self._initialized = True
        except Exception:
            # Degrade gracefully to a no-op rather than breaking the app.
            self._initialized = False

    async def add(self, text: str, metadata: dict[str, Any] | None = None) -> str | None:
        """Embed and store ``text``; return its id, or ``None`` when inactive."""

        if not self.available:
            return None
        await self.initialize()
        if not self._initialized:
            return None
        embedding = await self._embed(text)
        await self._ensure_table(len(embedding))
        vector_id = str(uuid.uuid4())
        await self._db.execute(
            "INSERT INTO memory_vectors (id, embedding, content, metadata_json) "
            "VALUES (?, ?, ?, ?)",
            (vector_id, _serialize(embedding), text, json.dumps(metadata or {})),
        )
        return vector_id

    async def search(self, query: str, k: int = 5) -> list[dict[str, Any]]:
        """Return the ``k`` nearest stored entries, or ``[]`` when inactive."""

        if not self.available:
            return []
        await self.initialize()
        if not self._initialized or self._dimension is None:
            return []
        embedding = await self._embed(query)
        rows = await self._db.fetchall(
            "SELECT id, content, metadata_json, distance FROM memory_vectors "
            "WHERE embedding MATCH ? ORDER BY distance LIMIT ?",
            (_serialize(embedding), k),
        )
        return [
            {
                "id": row["id"],
                "content": row["content"],
                "metadata": json.loads(row["metadata_json"]),
                "distance": row["distance"],
            }
            for row in rows
        ]

    async def _ensure_table(self, dimension: int) -> None:
        """Create the ``vec0`` virtual table once the embedding size is known."""

        if self._dimension is not None:
            return
        await self._db.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0("
            f"id TEXT PRIMARY KEY, embedding float[{dimension}], "
            "content TEXT, metadata_json TEXT)"
        )
        self._dimension = dimension

    async def _embed(self, text: str) -> list[float]:
        """Produce an embedding via the OpenAI-compatible embeddings endpoint."""

        from openai import AsyncOpenAI

        model = self._config.embedding_model
        assert model is not None  # guaranteed by `available`
        client = AsyncOpenAI(
            base_url=self._llm_config.base_url,
            api_key=self._llm_config.api_key or "not-needed",
        )
        response = await client.embeddings.create(model=model, input=text)
        return list(response.data[0].embedding)
