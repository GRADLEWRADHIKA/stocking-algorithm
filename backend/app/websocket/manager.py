"""WebSocket connection manager for /ws/market."""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket

logger = logging.getLogger("quantdesk.ws")


@dataclass
class Client:
    ws: WebSocket
    symbols: set[str] | None  # None = all symbols
    user_id: int | None
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=2000))


class ConnectionManager:
    def __init__(self) -> None:
        self.clients: dict[int, Client] = {}

    def register(self, ws: WebSocket, symbols: set[str] | None, user_id: int | None) -> Client:
        c = Client(ws, symbols, user_id)
        self.clients[id(ws)] = c
        return c

    def unregister(self, ws: WebSocket) -> None:
        self.clients.pop(id(ws), None)

    @property
    def count(self) -> int:
        return len(self.clients)

    def _enqueue(self, c: Client, msg: dict) -> None:
        try:
            c.queue.put_nowait(json.dumps(msg))
        except asyncio.QueueFull:  # slow consumer: drop oldest
            try:
                c.queue.get_nowait()
                c.queue.put_nowait(json.dumps(msg))
            except Exception:  # noqa: BLE001
                pass

    def publish_ticks(self, ticks: list[dict], indices: list[dict]) -> None:
        for c in list(self.clients.values()):
            for t in ticks:
                if c.symbols is None or t["symbol"] in c.symbols:
                    self._enqueue(c, t)
            for ix in indices:
                self._enqueue(c, ix)

    def publish_notification(self, user_id: int, notification: dict) -> None:
        for c in list(self.clients.values()):
            if c.user_id == user_id:
                self._enqueue(c, {"type": "notification", "notification": notification})


manager = ConnectionManager()
