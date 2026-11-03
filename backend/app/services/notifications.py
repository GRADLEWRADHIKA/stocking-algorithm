"""Notifications: persisted rows + a thread-safe bus drained by the WebSocket broadcaster."""
from __future__ import annotations

import queue

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import Notification

notification_bus: "queue.SimpleQueue[tuple[int, dict]]" = queue.SimpleQueue()


def notification_dict(n: Notification) -> dict:
    return {"id": n.id, "title": n.title, "body": n.body, "kind": n.kind, "is_read": n.is_read,
            "created_at": n.created_at.isoformat()}


def notify(db: Session, user_id: int, title: str, body: str, kind: str) -> Notification:
    n = Notification(user_id=user_id, title=title[:200], body=body, kind=kind)
    db.add(n)
    db.flush()
    notification_bus.put((user_id, notification_dict(n)))
    return n


def list_notifications(db: Session, user_id: int, unread_only: bool = False, limit: int = 100) -> list[dict]:
    q = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        q = q.where(Notification.is_read.is_(False))
    q = q.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)
    return [notification_dict(n) for n in db.execute(q).scalars().all()]


def mark_read(db: Session, user_id: int, nid: int) -> dict:
    n = db.get(Notification, nid)
    if n is None or n.user_id != user_id:
        raise NotFoundError("Notification not found")
    n.is_read = True
    db.commit()
    return notification_dict(n)


def mark_all_read(db: Session, user_id: int) -> int:
    res = db.execute(update(Notification).where(Notification.user_id == user_id, Notification.is_read.is_(False))
                     .values(is_read=True))
    db.commit()
    return res.rowcount or 0
