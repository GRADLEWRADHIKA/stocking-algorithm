from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import AuditLog

logger = logging.getLogger("quantdesk.audit")


def audit(db: Session, action: str, *, user_id: int | None = None, entity_type: str | None = None,
          entity_id: str | int | None = None, ip: str | None = None, success: bool = True,
          details: dict | None = None, commit: bool = False) -> None:
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type,
                    entity_id=None if entity_id is None else str(entity_id), ip_address=ip, success=success,
                    details=details or {}))
    if commit:
        db.commit()
    logger.info("audit action=%s user=%s entity=%s:%s success=%s", action, user_id, entity_type, entity_id, success)
