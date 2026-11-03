"""Test configuration: isolated temporary SQLite DB with a small seeded SIMULATED universe."""
from __future__ import annotations

import os
import tempfile
from datetime import date
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="quantdesk_test_"))
os.environ.update({
    "DATABASE_URL": f"sqlite:///{(_TMP / 'test.db').as_posix()}",
    "AUTO_SEED": "false", "SIMULATOR_AUTOSTART": "false", "RUN_MIGRATIONS_ON_STARTUP": "false",
    "RATE_LIMIT_PER_MINUTE": "100000", "AUTH_RATE_LIMIT_PER_MINUTE": "100000", "ENV": "development",
    "SECRET_KEY": "test-secret-key-not-for-production", "MARKET_TODAY": "2026-11-03",
    "LOCAL_DATA_DIRECTORY": (_TMP / "datasets").as_posix(),
})

import pytest  # noqa: E402

from app.core.config import reset_settings_cache  # noqa: E402

reset_settings_cache()

TEST_SYMBOLS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "ITC", "HINDUNILVR", "BHARTIARTL",
                "PERSISTENT", "AUBANK", "TATASTEEL"]


@pytest.fixture(scope="session")
def seeded():
    from app.core.db import init_engine
    from app.market_data.universe import UNIVERSE
    from app.scripts.seed import seed_all
    from app.services.simulation import init_live_market

    init_engine()
    uni = [u for u in UNIVERSE if u.symbol in TEST_SYMBOLS]
    summary = seed_all(reset=True, seed=42, universe=uni, today=date(2026, 11, 3), years=1.5, intraday_sessions=2,
                       export=False, scan=True)
    init_live_market()
    return summary


@pytest.fixture(scope="session")
def client(seeded):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def demo_token(client):
    return _login(client, "demo@quantdesk.local", "Demo@12345")["access_token"]


@pytest.fixture(scope="session")
def admin_token(client):
    return _login(client, "admin@quantdesk.local", "Admin@12345")["access_token"]


@pytest.fixture
def auth(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture
def admin_auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def fresh_user(client):
    import uuid

    email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/api/auth/register", json={"email": email, "password": "Passw0rd!", "full_name": "Test User"})
    assert r.status_code == 201, r.text
    body = r.json()
    return {"email": email, "password": "Passw0rd!", "tokens": body,
            "headers": {"Authorization": f"Bearer {body['access_token']}"}}
