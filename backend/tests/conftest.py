import json
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import replace
from pathlib import Path

import pytest
import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from instasave.app import create_app  # noqa: E402
from instasave.config import Settings  # noqa: E402
from instasave.models import AVAILABLE, PARTIAL, UNAVAILABLE, ProviderResult, RawMedia  # noqa: E402
from instasave.netsafe import FetchError, Response  # noqa: E402
from instasave.providers.base import ProviderError  # noqa: E402

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 300
CAPTION = "Olá 🌎✨\n\nSegunda linha com #hashtag e #outra\n" + "texto longo " * 400


class FakeFetcher:
    """Fixtures de rede: URL -> (status, body, headers)."""

    def __init__(self):
        self.routes: dict[str, object] = {}
        self.calls: list[str] = []

    def fetch(self, url: str) -> Response:
        self.calls.append(url)
        r = self.routes.get(url)
        if r is None:
            raise FetchError("connection_failed")
        if isinstance(r, Exception):
            raise r
        status, body, headers = r
        h = {"content-length": str(len(body))}
        h.update(headers or {})
        step = 50
        chunks = (body[i:i + step] for i in range(0, len(body), step))
        return Response(status, h, iter(chunks), lambda: None)


class FakeProvider:
    name = "fixture"

    def __init__(self):
        self.result: ProviderResult | Exception = ProviderResult(status=UNAVAILABLE)
        self.is_available = True

    def available(self):
        return self.is_available

    def resolve(self, ref):
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.fixture
def env():
    provider, fetcher = FakeProvider(), FakeFetcher()
    settings = replace(Settings(), static_dir=None, max_file_bytes=2000, resolve_per_min=1000, media_per_min=1000)
    app = create_app(settings, [provider], fetcher)
    with Server(app) as srv:
        srv.provider, srv.fetcher, srv.settings, srv.svc = provider, fetcher, settings, app.svc
        yield srv


class Server:
    def __init__(self, app):
        s = socket.socket(); s.bind(("127.0.0.1", 0)); self.port = s.getsockname()[1]; s.close()
        self.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=self.port, log_level="critical"))
        self.thread = threading.Thread(target=self.server.run, daemon=True)
        self.base = f"http://127.0.0.1:{self.port}"

    def __enter__(self):
        self.thread.start()
        for _ in range(100):
            if self.server.started:
                break
            time.sleep(0.05)
        return self

    def __exit__(self, *a):
        self.server.should_exit = True
        self.thread.join(5)

    def request(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def post_json(self, path, body):
        st, h, raw = self.request("POST", path, body)
        return st, json.loads(raw)
