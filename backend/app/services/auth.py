"""Authentication: registration, login, rotating refresh tokens, logout, password reset."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AuthError, ConflictError, ValidationAppError
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    is_valid_email,
    new_opaque_token,
    normalize_email,
    validate_password_strength,
    verify_password,
)
from app.models import PasswordResetToken, RefreshToken, User, UserPreference
from app.services.audit import audit

TIMEFRAMES = {"1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def user_dict(u: User) -> dict:
    p = u.preferences
    prefs = {
        "theme": p.theme if p else "dark", "default_timeframe": p.default_timeframe if p else "1d",
        "default_exchange": p.default_exchange if p else "NSE", "chart_config": (p.chart_config if p else {}) or {},
    }
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active,
            "created_at": u.created_at.isoformat(), "preferences": prefs}


def create_user(db: Session, email: str, password: str, full_name: str, role: str = "USER") -> User:
    email = normalize_email(email)
    if not is_valid_email(email):
        raise ValidationAppError("Invalid email address", code="invalid_email")
    errs = validate_password_strength(password)
    if errs:
        raise ValidationAppError("; ".join(errs), code="weak_password", errors=errs)
    if db.execute(select(User).where(User.email == email)).unique().scalar_one_or_none():
        raise ConflictError("An account with this email already exists", code="email_taken")
    u = User(email=email, full_name=(full_name or "").strip()[:200], password_hash=hash_password(password), role=role)
    u.preferences = UserPreference(theme="dark", default_timeframe="1d", default_exchange="NSE", chart_config={})
    db.add(u)
    db.flush()
    return u


def _issue_tokens(db: Session, u: User) -> dict:
    s = get_settings()
    access, expires_in = create_access_token(u.id, u.role)
    raw = new_opaque_token()
    rt = RefreshToken(user_id=u.id, token_hash=hash_token(raw), created_at=_now(),
                      expires_at=_now() + timedelta(days=s.REFRESH_TOKEN_DAYS))
    db.add(rt)
    db.flush()
    return {"access_token": access, "refresh_token": raw, "token_type": "bearer", "expires_in": expires_in,
            "user": user_dict(u), "_rt": rt}


def register(db: Session, email: str, password: str, full_name: str, ip: str | None) -> dict:
    u = create_user(db, email, password, full_name)
    tokens = _issue_tokens(db, u)
    audit(db, "auth.register", user_id=u.id, entity_type="user", entity_id=u.id, ip=ip)
    db.commit()
    tokens.pop("_rt")
    return tokens


def login(db: Session, email: str, password: str, ip: str | None) -> dict:
    email_n = normalize_email(email)
    u = db.execute(select(User).where(User.email == email_n)).unique().scalar_one_or_none()
    if u is None or not verify_password(password, u.password_hash):
        audit(db, "auth.login", user_id=u.id if u else None, ip=ip, success=False, details={"email": email_n}, commit=True)
        raise AuthError("Invalid email or password", code="invalid_credentials")
    if not u.is_active:
        audit(db, "auth.login", user_id=u.id, ip=ip, success=False, details={"reason": "inactive"}, commit=True)
        raise AuthError("Account is disabled", code="account_disabled")
    u.last_login_at = _now()
    tokens = _issue_tokens(db, u)
    audit(db, "auth.login", user_id=u.id, ip=ip)
    db.commit()
    tokens.pop("_rt")
    return tokens


def refresh(db: Session, raw: str, ip: str | None) -> dict:
    rt = db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw or ""))).scalar_one_or_none()
    if rt is None:
        raise AuthError("Invalid refresh token", code="invalid_refresh_token")
    if rt.revoked_at is not None:
        # token reuse after rotation: revoke the whole family for safety
        db.execute(update(RefreshToken).where(RefreshToken.user_id == rt.user_id, RefreshToken.revoked_at.is_(None))
                   .values(revoked_at=_now()))
        audit(db, "auth.refresh_reuse_detected", user_id=rt.user_id, ip=ip, success=False, commit=True)
        raise AuthError("Refresh token has been revoked", code="revoked_refresh_token")
    if rt.expires_at < _now():
        raise AuthError("Refresh token expired", code="expired_refresh_token")
    u = db.get(User, rt.user_id)
    if u is None or not u.is_active:
        raise AuthError("Account is disabled", code="account_disabled")
    tokens = _issue_tokens(db, u)
    rt.revoked_at = _now()
    rt.replaced_by_id = tokens["_rt"].id
    audit(db, "auth.refresh", user_id=u.id, ip=ip)
    db.commit()
    tokens.pop("_rt")
    return tokens


def logout(db: Session, raw: str, ip: str | None) -> None:
    rt = db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw or ""))).scalar_one_or_none()
    if rt is not None and rt.revoked_at is None:
        rt.revoked_at = _now()
        audit(db, "auth.logout", user_id=rt.user_id, ip=ip)
    db.commit()


def request_password_reset(db: Session, email: str, ip: str | None) -> dict:
    s = get_settings()
    u = db.execute(select(User).where(User.email == normalize_email(email))).unique().scalar_one_or_none()
    msg = {"message": "If an account exists for this email, a password reset token has been issued."}
    if u is None or not u.is_active:
        audit(db, "auth.password_reset_request", ip=ip, success=False, details={"email": normalize_email(email)}, commit=True)
        return msg
    raw = new_opaque_token()
    db.add(PasswordResetToken(user_id=u.id, token_hash=hash_token(raw), created_at=_now(),
                              expires_at=_now() + timedelta(minutes=s.PASSWORD_RESET_MINUTES)))
    audit(db, "auth.password_reset_request", user_id=u.id, ip=ip)
    db.commit()
    if s.is_development:
        msg["dev_reset_token"] = raw  # no email service exists locally; dev-only convenience
    return msg


def confirm_password_reset(db: Session, raw: str, new_password: str, ip: str | None) -> dict:
    prt = db.execute(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(raw or ""))).scalar_one_or_none()
    if prt is None or prt.used_at is not None or prt.expires_at < _now():
        raise ValidationAppError("Invalid or expired reset token", code="invalid_reset_token")
    errs = validate_password_strength(new_password)
    if errs:
        raise ValidationAppError("; ".join(errs), code="weak_password", errors=errs)
    u = db.get(User, prt.user_id)
    u.password_hash = hash_password(new_password)
    prt.used_at = _now()
    db.execute(update(RefreshToken).where(RefreshToken.user_id == u.id, RefreshToken.revoked_at.is_(None))
               .values(revoked_at=_now()))
    audit(db, "auth.password_reset_confirm", user_id=u.id, ip=ip)
    db.commit()
    return {"message": "Password updated. Please log in again."}


def update_preferences(db: Session, u: User, data: dict) -> User:
    p = u.preferences or UserPreference(user_id=u.id)
    if "theme" in data and data["theme"] is not None:
        if data["theme"] not in ("dark", "light"):
            raise ValidationAppError("theme must be 'dark' or 'light'")
        p.theme = data["theme"]
    if data.get("default_timeframe") is not None:
        if data["default_timeframe"] not in TIMEFRAMES:
            raise ValidationAppError("Invalid default_timeframe")
        p.default_timeframe = data["default_timeframe"]
    if data.get("default_exchange") is not None:
        if data["default_exchange"] not in ("NSE", "BSE"):
            raise ValidationAppError("default_exchange must be NSE or BSE")
        p.default_exchange = data["default_exchange"]
    if data.get("chart_config") is not None:
        if not isinstance(data["chart_config"], dict):
            raise ValidationAppError("chart_config must be an object")
        p.chart_config = data["chart_config"]
    u.preferences = p
    db.commit()
    db.refresh(u)
    return u
