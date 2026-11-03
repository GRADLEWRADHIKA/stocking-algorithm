from __future__ import annotations

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AuthError, ForbiddenError, ValidationAppError
from app.core.security import decode_access_token
from app.models import User

bearer = HTTPBearer(auto_error=False, description="JWT access token from /api/auth/login")

TIMEFRAMES = ("1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M")


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _user_from_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if payload is None:
        return None
    try:
        uid = int(payload["sub"])
    except (KeyError, ValueError):
        return None
    u = db.get(User, uid)
    if u is None or not u.is_active:
        return None
    return u


def get_optional_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                      db: Session = Depends(get_db)) -> User | None:
    return _user_from_token(db, creds.credentials if creds else None)


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                     db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise AuthError("Authentication required", code="not_authenticated")
    u = _user_from_token(db, creds.credentials)
    if u is None:
        raise AuthError("Invalid or expired access token", code="invalid_token")
    return u


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "ADMIN":
        raise ForbiddenError("Admin role required", code="admin_required")
    return user


def check_timeframe(tf: str) -> str:
    if tf not in TIMEFRAMES:
        raise ValidationAppError(f"Invalid timeframe '{tf}'; use one of {', '.join(TIMEFRAMES)}", code="invalid_timeframe")
    return tf
