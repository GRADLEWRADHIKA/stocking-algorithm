"""MarketCacheService: small thread-safe in-process LRU cache with per-entry TTL."""
from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable
from typing import Any


class MarketCacheService:
    def __init__(self, max_entries: int = 512, default_ttl: float = 300.0):
        self.max_entries = max_entries
        self.default_ttl = default_ttl
        self._data: OrderedDict[Hashable, tuple[float, Any]] = OrderedDict()
        self._lock = threading.RLock()
        self.hits = 0
        self.misses = 0

    def get(self, key: Hashable) -> Any | None:
        with self._lock:
            item = self._data.get(key)
            if item is None:
                self.misses += 1
                return None
            expires, value = item
            if expires < time.monotonic():
                self._data.pop(key, None)
                self.misses += 1
                return None
            self._data.move_to_end(key)
            self.hits += 1
            return value

    def set(self, key: Hashable, value: Any, ttl: float | None = None) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + (ttl or self.default_ttl), value)
            self._data.move_to_end(key)
            while len(self._data) > self.max_entries:
                self._data.popitem(last=False)

    def get_or_set(self, key: Hashable, factory: Callable[[], Any], ttl: float | None = None) -> Any:
        v = self.get(key)
        if v is None:
            v = factory()
            self.set(key, v, ttl)
        return v

    def invalidate(self, predicate: Callable[[Hashable], bool] | None = None) -> None:
        with self._lock:
            if predicate is None:
                self._data.clear()
                return
            for k in [k for k in self._data if predicate(k)]:
                self._data.pop(k, None)

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {"entries": len(self._data), "hits": self.hits, "misses": self.misses}


market_cache = MarketCacheService()
