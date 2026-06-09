"""WebSocket endpoint streaming agent events to connected clients.

``/ws/events`` subscribes the connection to the in-process :class:`EventBus` and
forwards every published event (thoughts, tool calls, results, screenshot paths,
role changes, log lines) as JSON. Each client gets its own queue, so multiple
clients can listen simultaneously; a concurrent reader detects disconnects even
when no events are flowing.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


async def _drain_incoming(websocket: WebSocket) -> None:
    """Consume client messages so a disconnect is detected promptly."""

    try:
        while True:
            await websocket.receive()
    except WebSocketDisconnect:
        return


@router.websocket("/ws/events")
async def events(websocket: WebSocket) -> None:
    """Stream all event-bus events to the connected client as JSON."""

    context = getattr(websocket.app.state, "context", None)
    await websocket.accept()
    if context is None:
        await websocket.close(code=1011)
        return

    queue = context.container.event_bus.subscribe()
    reader = asyncio.create_task(_drain_incoming(websocket))
    try:
        while not reader.done():
            event = await queue.get()
            await websocket.send_text(json.dumps(event, default=str, ensure_ascii=False))
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        reader.cancel()
        context.container.event_bus.unsubscribe(queue)
