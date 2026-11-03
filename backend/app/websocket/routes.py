"""WS /ws/market?symbols=RELIANCE,TCS&token=<access>

Server pushes {type:'tick'}, {type:'index'} and (with a valid token) {type:'notification'} messages.
On connect a snapshot of the subscribed symbols and all indices is sent immediately. Clients may send
{"action":"subscribe","symbols":[...]} to change their subscription (empty list = all symbols).
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.db import SessionLocal
from app.core.security import decode_access_token
from app.models import User
from app.services.simulation import controller
from app.websocket.manager import manager

router = APIRouter()


def _user_id(token: str | None) -> int | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    with SessionLocal() as db:
        u = db.get(User, int(payload["sub"]))
        return u.id if u and u.is_active else None


@router.websocket("/ws/market")
async def ws_market(ws: WebSocket):
    await ws.accept()
    raw = ws.query_params.get("symbols")
    symbols = {s.strip().upper() for s in raw.split(",") if s.strip()} if raw else None
    uid = await asyncio.to_thread(_user_id, ws.query_params.get("token"))
    client = manager.register(ws, symbols, uid)
    ticks, idx = controller._messages()
    for m in [t for t in ticks if symbols is None or t["symbol"] in symbols] + idx:
        manager._enqueue(client, m)  # snapshot only for this client

    async def sender():
        while True:
            msg = await client.queue.get()
            await ws.send_text(msg)

    async def receiver():
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
            except ValueError:
                continue
            if isinstance(msg, dict) and msg.get("action") == "subscribe":
                syms = msg.get("symbols") or []
                client.symbols = {str(s).upper() for s in syms} or None
            elif isinstance(msg, dict) and msg.get("action") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))

    tasks = [asyncio.create_task(sender()), asyncio.create_task(receiver())]
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        for t in done:
            exc = t.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                pass
    except WebSocketDisconnect:
        pass
    finally:
        for t in tasks:
            t.cancel()
        manager.unregister(ws)
