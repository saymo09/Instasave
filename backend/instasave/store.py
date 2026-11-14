"""Armazenamento em memória, com TTL, de tokens opacos que apontam para URLs de mídia.

O cliente nunca informa URLs de mídia: ele só recebe/envia tokens emitidos aqui.
"""
from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass


@dataclass
class MediaEntry:
    url: str
    kind: str  # image | video
    filename: str


@dataclass
class PostEntry:
    shortcode: str
    media_tokens: list[str]


class TokenStore:
    def __init__(self, ttl: int, max_entries: int, clock=time.monotonic):
        self.ttl = ttl
        self.max = max_entries
        self.clock = clock
        self._data: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def put(self, value: object) -> str:
        token = secrets.token_urlsafe(18)
        now = self.clock()
        with self._lock:
            self._purge(now)
            while len(self._data) >= self.max:
                self._data.pop(next(iter(self._data)))
            self._data[token] = (now + self.ttl, value)
        return token

    def get(self, token: str):
        with self._lock:
            item = self._data.get(token)
            if not item:
                return None
            if item[0] < self.clock():
                del self._data[token]
                return None
            return item[1]

    def _purge(self, now: float) -> None:
        for k in [k for k, (exp, _) in self._data.items() if exp < now]:
            del self._data[k]
