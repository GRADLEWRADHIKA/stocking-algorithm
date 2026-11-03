from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_admin
from app.backtesting.service import list_runs, run_summary
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.market_data.cache import market_cache
from app.market_data.provider import market_data
from app.models import (
    AuditLog,
    BacktestRun,
    MarketCandle,
    PaperOrder,
    SimulatorState,
    Stock,
    TradingSignal,
    User,
)
from app.repositories.stocks import get_or_create_exchange, registry
from app.services.audit import audit
from app.services.auth import user_dict
from app.services.datasets import import_dataset, list_imports, validate_dataset
from app.services.simulation import controller, init_live_market

router = APIRouter(prefix="/api/admin", tags=["admin"])
public = APIRouter(prefix="/api", tags=["health"])
STARTED = time.time()
MAX_UPLOAD = 25 * 1024 * 1024


@public.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_ok = "ok"
    except Exception:  # noqa: BLE001
        db_ok = "error"
    return {"status": "ok" if db_ok == "ok" else "degraded", "database": db_ok, "version": get_settings().VERSION,
            "simulator_running": controller.running, "data_source": "SIMULATED"}


class UserPatch(BaseModel):
    role: str | None = Field(default=None, pattern="^(USER|ADMIN)$")
    is_active: bool | None = None


@router.get("/users")
def users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [user_dict(u) for u in db.execute(select(User).order_by(User.id)).unique().scalars().all()]


@router.patch("/users/{uid}")
def patch_user(uid: int, body: UserPatch, request: Request, admin: User = Depends(require_admin),
               db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if u is None:
        raise NotFoundError("User not found")
    if u.id == admin.id and (body.role == "USER" or body.is_active is False):
        raise ConflictError("Admins cannot demote or deactivate themselves", code="self_modification")
    if body.role is not None:
        u.role = body.role
    if body.is_active is not None:
        u.is_active = body.is_active
    audit(db, "admin.user_update", user_id=admin.id, entity_type="user", entity_id=uid, ip=client_ip(request),
          details=body.model_dump(exclude_none=True))
    db.commit()
    return user_dict(u)


def _stock_admin_dict(s: Stock) -> dict:
    return {"id": s.id, "symbol": s.symbol, "name": s.name, "exchange": s.exchange.code, "sector": s.sector,
            "industry": s.industry, "isin": s.isin, "instrument_type": s.instrument_type, "data_source": s.data_source,
            "is_active": s.is_active, "market_cap": float(s.market_cap) if s.market_cap is not None else None}


@router.get("/stocks")
def stocks(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [_stock_admin_dict(s) for s in db.execute(select(Stock).order_by(Stock.symbol)).unique().scalars().all()]


class StockIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9&\-_.]+$")
    name: str = Field(min_length=1, max_length=200)
    exchange: str = Field(default="NSE", pattern="^(NSE|BSE)$")
    sector: str = Field(default="Unclassified", max_length=64)
    industry: str | None = None
    isin: str | None = Field(default=None, max_length=12)
    market_cap: float | None = None


class StockPatch(BaseModel):
    is_active: bool | None = None
    name: str | None = None
    sector: str | None = None


@router.post("/stocks", status_code=201)
def create_stock(body: StockIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ex = get_or_create_exchange(db, body.exchange)
    sym = body.symbol.upper()
    if db.execute(select(Stock).where(Stock.symbol == sym, Stock.exchange_id == ex.id)).first():
        raise ConflictError(f"{sym} already exists on {body.exchange}", code="duplicate_stock")
    s = Stock(symbol=sym, name=body.name, exchange_id=ex.id, sector=body.sector, industry=body.industry, isin=body.isin,
              market_cap=body.market_cap, instrument_type="EQUITY", data_source="HISTORICAL_DATASET",
              fundamentals_source="HISTORICAL_DATASET", is_active=True, sim_params={},
              description=f"{body.name}: instrument added by an administrator; import a dataset to provide candles.")
    db.add(s)
    db.flush()
    audit(db, "admin.stock_create", user_id=admin.id, entity_type="stock", entity_id=s.id, ip=client_ip(request))
    db.commit()
    registry.invalidate()
    return _stock_admin_dict(s)


@router.patch("/stocks/{symbol}")
def patch_stock(symbol: str, body: StockPatch, request: Request, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    s = db.execute(select(Stock).where(Stock.symbol == symbol.upper())).unique().scalars().first()
    if s is None:
        raise NotFoundError(f"Unknown symbol '{symbol}'")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    audit(db, "admin.stock_update", user_id=admin.id, entity_type="stock", entity_id=s.id, ip=client_ip(request),
          details=body.model_dump(exclude_none=True))
    db.commit()
    registry.invalidate()
    return _stock_admin_dict(s)


async def _read_upload(file: UploadFile) -> tuple[bytes, str]:
    content = await file.read()
    if len(content) > MAX_UPLOAD:
        raise ValidationAppError("File too large (max 25 MB)", code="payload_too_large")
    name = (file.filename or "upload.csv").replace("\\", "/").split("/")[-1][:255]
    if not name.lower().endswith(".csv"):
        raise ValidationAppError("Only .csv files are accepted", code="invalid_file_type")
    return content, name


@router.post("/datasets/validate")
async def datasets_validate(file: UploadFile = File(...), admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    content, name = await _read_upload(file)
    return await asyncio.to_thread(validate_dataset, db, content, name, admin.id)


@router.post("/datasets/import")
async def datasets_import(request: Request, file: UploadFile = File(...), admin: User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    content, name = await _read_upload(file)
    rep = await asyncio.to_thread(import_dataset, db, content, name, admin.id, client_ip(request))
    controller.job("dataset_import", "completed", f"{name}: {rep.get('imported_rows', 0)} rows")
    return rep


@router.get("/datasets")
def datasets(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return list_imports(db)


class SimulatorIn(BaseModel):
    action: str = Field(pattern="^(start|stop|reseed)$")
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)
    tick_interval_ms: int | None = Field(default=None, ge=100, le=60000)
    regime: str | None = Field(default=None, pattern="^(bull|bear|sideways|high_vol|none)$")


@router.get("/simulator")
def simulator(admin: User = Depends(require_admin)):
    return controller.status()


@router.post("/simulator")
async def simulator_action(body: SimulatorIn, request: Request, admin: User = Depends(require_admin),
                           db: Session = Depends(get_db)):
    state = db.execute(select(SimulatorState)).scalar_one_or_none()
    if body.tick_interval_ms:
        controller.tick_interval_ms = body.tick_interval_ms
    regime = None if body.regime in (None, "none") else body.regime
    if body.regime is not None:
        from app.market_data.live import live_market

        live_market.regime = regime
    if body.action == "start":
        controller.running = True
    elif body.action == "stop":
        controller.running = False
    else:
        from app.scripts.seed import generate_market_data

        was = controller.running
        controller.running = False
        seed = body.seed if body.seed is not None else (state.seed if state else get_settings().SIMULATOR_SEED)
        controller.job("reseed", "running", f"seed {seed}")
        summary = await asyncio.to_thread(generate_market_data, seed, None, None, None, None, None)
        await asyncio.to_thread(init_live_market, seed, regime)
        controller.running = was
        controller.job("reseed", "completed", f"seed {seed}: {summary['candles']} candles")
    state = db.execute(select(SimulatorState)).scalar_one_or_none()
    if state is not None:
        state.is_running = controller.running
        state.tick_interval_ms = controller.tick_interval_ms
        state.regime = regime if body.regime is not None else state.regime
    audit(db, f"admin.simulator_{body.action}", user_id=admin.id, ip=client_ip(request), details=body.model_dump())
    db.commit()
    return controller.status()


@router.get("/health")
def admin_health(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    counts = {}
    for name, model in (("users", User), ("stocks", Stock), ("candles", MarketCandle), ("signals", TradingSignal),
                        ("backtests", BacktestRun), ("paper_orders", PaperOrder), ("audit_logs", AuditLog)):
        counts[name] = int(db.execute(select(func.count(model.id))).scalar_one())
    try:
        db.execute(text("SELECT 1"))
        dbs = "ok"
    except Exception:  # noqa: BLE001
        dbs = "error"
    return {"status": "ok" if dbs == "ok" else "degraded", "database": dbs, "simulator": controller.status(),
            "uptime_seconds": round(time.time() - STARTED, 1), "version": get_settings().VERSION, "counts": counts,
            "cache": market_cache.stats()}


@router.get("/audit-logs")
def audit_logs(limit: int = Query(100, ge=1, le=1000), admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit)).scalars().all()
    return [{"id": r.id, "user_id": r.user_id, "action": r.action, "entity_type": r.entity_type, "entity_id": r.entity_id,
             "ip_address": r.ip_address, "success": r.success, "details": r.details, "created_at": r.created_at.isoformat()}
            for r in rows]


@router.get("/jobs")
def jobs(admin: User = Depends(require_admin)):
    out = list(controller.jobs.values())
    out.insert(0, {"name": "simulator_loop", "status": "running" if controller.running else "stopped",
                   "detail": f"{controller.status()['ticks']} ticks", "last_run": controller.status()["last_tick_at"]})
    return out


@router.get("/config")
def config(admin: User = Depends(require_admin)):
    s = get_settings()
    url = s.database_url
    safe_url = url.split("@")[-1] if "@" in url else url  # never expose credentials
    return {"ENV": s.ENV, "DATABASE": ("sqlite" if s.is_sqlite else "postgresql") + " :: " + safe_url,
            "ACCESS_TOKEN_MINUTES": s.ACCESS_TOKEN_MINUTES, "REFRESH_TOKEN_DAYS": s.REFRESH_TOKEN_DAYS,
            "CORS_ORIGINS": s.cors_origins, "LOCAL_DATA_DIRECTORY": s.LOCAL_DATA_DIRECTORY,
            "SIMULATOR_SEED": s.SIMULATOR_SEED, "SIMULATOR_TICK_MS": s.SIMULATOR_TICK_MS,
            "RATE_LIMIT_PER_MINUTE": s.RATE_LIMIT_PER_MINUTE, "AUTH_RATE_LIMIT_PER_MINUTE": s.AUTH_RATE_LIMIT_PER_MINUTE,
            "SECRET_KEY": "set" if s.SECRET_KEY else "generated (dev)", "VERSION": s.VERSION}


@router.get("/backtests")
def all_backtests(limit: int = Query(100, ge=1, le=1000), admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [{**run_summary(r), "user_id": r.user_id} for r in list_runs(db, None, limit)]


_ = market_data
