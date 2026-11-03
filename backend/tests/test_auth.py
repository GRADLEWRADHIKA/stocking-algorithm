"""Auth: register/login/refresh rotation/logout/protected routes/roles/password reset/rate limiting."""
from app.core.rate_limit import SlidingWindowLimiter


def test_register_login_me(client, fresh_user):
    t = fresh_user["tokens"]
    assert set(t) == {"access_token", "refresh_token", "token_type", "expires_in", "user"}
    assert t["token_type"] == "bearer" and t["user"]["role"] == "USER"
    assert set(t["user"]["preferences"]) == {"theme", "default_timeframe", "default_exchange", "chart_config"}
    me = client.get("/api/users/me", headers=fresh_user["headers"]).json()
    assert me["email"] == fresh_user["email"]
    r = client.post("/api/auth/login", json={"email": fresh_user["email"].upper(), "password": fresh_user["password"]})
    assert r.status_code == 200


def test_register_validation(client, fresh_user):
    dup = client.post("/api/auth/register", json={"email": fresh_user["email"], "password": "Passw0rd!", "full_name": "x"})
    assert dup.status_code == 409 and dup.json()["code"] == "email_taken"
    weak = client.post("/api/auth/register", json={"email": "w@example.com", "password": "short", "full_name": "x"})
    assert weak.status_code == 400 and weak.json()["code"] == "weak_password"
    bad = client.post("/api/auth/register", json={"email": "not-an-email", "password": "Passw0rd!1", "full_name": "x"})
    assert bad.status_code == 400


def test_bad_login(client):
    r = client.post("/api/auth/login", json={"email": "demo@quantdesk.local", "password": "wrong"})
    assert r.status_code == 401 and r.json() == {"detail": "Invalid email or password", "code": "invalid_credentials"}


def test_refresh_rotation_and_reuse_detection(client, fresh_user):
    rt1 = fresh_user["tokens"]["refresh_token"]
    r = client.post("/api/auth/refresh", json={"refresh_token": rt1})
    assert r.status_code == 200
    rt2 = r.json()["refresh_token"]
    assert rt2 != rt1
    reuse = client.post("/api/auth/refresh", json={"refresh_token": rt1})
    assert reuse.status_code == 401 and reuse.json()["code"] == "revoked_refresh_token"
    # reuse revoked the whole family, so rt2 no longer works either
    assert client.post("/api/auth/refresh", json={"refresh_token": rt2}).status_code == 401


def test_logout_revokes_refresh(client, fresh_user):
    login = client.post("/api/auth/login", json={"email": fresh_user["email"], "password": fresh_user["password"]}).json()
    assert client.post("/api/auth/logout", json={"refresh_token": login["refresh_token"]}).json() == {"message": "Logged out"}
    assert client.post("/api/auth/refresh", json={"refresh_token": login["refresh_token"]}).status_code == 401


def test_protected_routes_require_auth(client):
    for path in ("/api/users/me", "/api/watchlists", "/api/alerts", "/api/notifications", "/api/backtests",
                 "/api/paper-trading/accounts", "/api/strategies", "/api/portfolio/1"):
        r = client.get(path)
        assert r.status_code == 401, path
        assert r.json()["code"] == "not_authenticated"
    r = client.get("/api/users/me", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401 and r.json()["code"] == "invalid_token"


def test_admin_guard(client, auth, admin_auth):
    assert client.get("/api/admin/users", headers=auth).status_code == 403
    assert client.get("/api/admin/users", headers=admin_auth).status_code == 200
    h = client.get("/api/admin/health", headers=admin_auth).json()
    assert h["database"] == "ok" and h["counts"]["stocks"] > 0
    logs = client.get("/api/admin/audit-logs?limit=500", headers=admin_auth).json()
    assert any(l["action"] == "auth.login" for l in logs)
    cfg = client.get("/api/admin/config", headers=admin_auth).json()
    assert cfg["SECRET_KEY"] == "set" and "test-secret" not in str(cfg)


def test_password_reset_flow(client, fresh_user):
    r = client.post("/api/auth/password-reset/request", json={"email": fresh_user["email"]}).json()
    token = r["dev_reset_token"]  # ENV=development in tests
    unknown = client.post("/api/auth/password-reset/request", json={"email": "nobody@example.com"}).json()
    assert "dev_reset_token" not in unknown and unknown["message"] == r["message"]  # no account enumeration
    ok = client.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "NewPassw0rd"})
    assert ok.status_code == 200
    again = client.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "NewPassw0rd2"})
    assert again.status_code == 400  # single use
    assert client.post("/api/auth/login", json={"email": fresh_user["email"], "password": "NewPassw0rd"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": fresh_user["email"], "password": fresh_user["password"]}).status_code == 401


def test_preferences_update(client, fresh_user):
    h = fresh_user["headers"]
    r = client.patch("/api/users/me/preferences", headers=h, json={"theme": "light", "chart_config": {"overlays": ["sma_20"]}})
    assert r.status_code == 200 and r.json()["preferences"]["theme"] == "light"
    assert r.json()["preferences"]["default_timeframe"] == "1d"
    assert client.patch("/api/users/me/preferences", headers=h, json={"theme": "blue"}).status_code == 422
    assert client.patch("/api/users/me", headers=h, json={"full_name": "Renamed"}).json()["full_name"] == "Renamed"


def test_sliding_window_limiter():
    lim = SlidingWindowLimiter(3, 60)
    assert all(lim.hit("ip", now=t)[0] for t in (0, 1, 2))
    allowed, retry = lim.hit("ip", now=3)
    assert not allowed and retry > 0
    assert lim.hit("ip", now=61)[0]  # window slid
