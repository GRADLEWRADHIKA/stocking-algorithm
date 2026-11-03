"""Simple in-memory sliding-window rate limiter middleware (per client IP; stricter on /api/auth)."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, now: float | None = None) -> tuple[bool, float]:
        """Register a hit. Returns (allowed, retry_after_seconds)."""
        now = time.monotonic() if now is None else now
        with self._lock:
            q = self._hits[key]
            cutoff = now - self.window
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= self.limit:
                return False, max(0.0, q[0] + self.window - now)
            q.append(now)
            return True, 0.0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, general_limit: int | None = None, auth_limit: int | None = None):
        super().__init__(app)
        s = get_settings()
        self.general = SlidingWindowLimiter(general_limit or s.RATE_LIMIT_PER_MINUTE)
        self.auth = SlidingWindowLimiter(auth_limit or s.AUTH_RATE_LIMIT_PER_MINUTE)

    async def dispatch(self, request: Request, call_next):
        s = get_settings()
        path = request.url.path
        if not s.RATE_LIMIT_ENABLED or not path.startswith("/api") or request.method == "OPTIONS":
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        limiter = self.auth if path.startswith("/api/auth") else self.general
        allowed, retry = limiter.hit(f"{ip}")
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests; slow down.", "code": "rate_limited"},
                headers={"Retry-After": str(int(retry) + 1)},
            )
        return await call_next(request)
