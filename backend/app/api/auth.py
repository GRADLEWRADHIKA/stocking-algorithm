from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_current_user
from app.core.db import get_db
from app.models import User
from app.services import auth as svc

router = APIRouter(prefix="/api/auth", tags=["auth"])
users = APIRouter(prefix="/api/users", tags=["users"])


class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    full_name: str = Field(default="", max_length=200)


class LoginIn(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=512)


class ResetRequestIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class ResetConfirmIn(BaseModel):
    token: str = Field(min_length=10, max_length=512)
    new_password: str = Field(min_length=1, max_length=128)


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    return svc.register(db, body.email, body.password, body.full_name, client_ip(request))


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    return svc.login(db, body.email, body.password, client_ip(request))


@router.post("/refresh")
def refresh(body: RefreshIn, request: Request, db: Session = Depends(get_db)):
    return svc.refresh(db, body.refresh_token, client_ip(request))


@router.post("/logout")
def logout(body: RefreshIn, request: Request, db: Session = Depends(get_db)):
    svc.logout(db, body.refresh_token, client_ip(request))
    return {"message": "Logged out"}


@router.post("/password-reset/request")
def reset_request(body: ResetRequestIn, request: Request, db: Session = Depends(get_db)):
    return svc.request_password_reset(db, body.email, client_ip(request))


@router.post("/password-reset/confirm")
def reset_confirm(body: ResetConfirmIn, request: Request, db: Session = Depends(get_db)):
    return svc.confirm_password_reset(db, body.token, body.new_password, client_ip(request))


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)


class PreferencesIn(BaseModel):
    theme: Literal["dark", "light"] | None = None
    default_timeframe: Literal["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"] | None = None
    default_exchange: Literal["NSE", "BSE"] | None = None
    chart_config: dict | None = None


@users.get("/me")
def me(user: User = Depends(get_current_user)):
    return svc.user_dict(user)


@users.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = db.merge(user)
    if body.full_name is not None:
        u.full_name = body.full_name.strip()
    db.commit()
    db.refresh(u)
    return svc.user_dict(u)


@users.patch("/me/preferences")
def update_prefs(body: PreferencesIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = db.merge(user)
    u = svc.update_preferences(db, u, body.model_dump(exclude_unset=True))
    return svc.user_dict(u)
