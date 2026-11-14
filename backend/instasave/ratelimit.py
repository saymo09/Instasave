"""Limitador simples de janela deslizante por chave (IP)."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, per_minute: int, clock=time.monotonic):
        self.limit = per_minute
        self.clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = self.clock()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - 60:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            if len(self._hits) > 5000:  # evita crescimento ilimitado
                for k in [k for k, v in self._hits.items() if not v]:
                    del self._hits[k]
            return True
