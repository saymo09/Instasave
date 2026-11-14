"""API Starlette: /api/* + serve o frontend compilado (origem única)."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from starlette.applications import Starlette
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from . import __version__
from .config import Settings
from .igurl import InvalidUrl, parse_instagram_url
from .netsafe import Fetcher, SafeFetcher
from .providers.base import Provider
from .providers.ytdlp import YtDlpProvider
from .ratelimit import RateLimiter
from .service import InstaSaveService, MediaError, cleanup

log = logging.getLogger("instasave")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{10,64}$")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; "
        "frame-src https://www.instagram.com; style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    ),
}

ERR_MESSAGES = {
    "rate_limited": "Muitas requisições. Aguarde um minuto e tente novamente.",
    "bad_request": "Requisição inválida.",
    "internal": "Ocorreu um erro inesperado. Tente novamente.",
}


def error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def create_app(
    settings: Settings | None = None,
    providers: list[Provider] | None = None,
    fetcher: Fetcher | None = None,
) -> Starlette:
    s = settings or Settings.from_env()
    provs = providers if providers is not None else [YtDlpProvider(s.ytdlp_path, s.media_host_suffixes)]
    fetch = fetcher or SafeFetcher(s.media_host_suffixes, timeout=s.fetch_timeout,
                                   deadline=s.fetch_deadline, max_redirects=s.max_redirects)
    svc = InstaSaveService(s, provs, fetch)
    resolve_rl, media_rl = RateLimiter(s.resolve_per_min), RateLimiter(s.media_per_min)

    def client_key(req: Request) -> str:
        if s.trust_proxy:
            xff = req.headers.get("x-forwarded-for", "")
            if xff:
                return xff.split(",")[0].strip()[:64]
        return req.client.host if req.client else "unknown"

    async def health(_: Request) -> Response:
        return JSONResponse({"status": "ok", "version": __version__,
                             "providers": [{"name": p.name, "available": p.available()} for p in provs]})

    async def resolve(req: Request) -> Response:
        if not resolve_rl.allow(client_key(req)):
            return error("rate_limited", ERR_MESSAGES["rate_limited"], 429)
        try:
            body = json.loads((await req.body())[:4096] or b"{}")
            url = body.get("url") if isinstance(body, dict) else None
        except ValueError:
            return error("bad_request", ERR_MESSAGES["bad_request"], 400)
        try:
            ref = parse_instagram_url(url)  # type: ignore[arg-type]
        except InvalidUrl as e:
            return error(e.code, e.message, 400)
        try:
            payload = await run_in_threadpool(svc.resolve, ref)
        except Exception:
            log.exception("resolve_failed kind=%s", ref.kind)
            return error("internal", ERR_MESSAGES["internal"], 500)
        log.info("resolve kind=%s status=%s", ref.kind, payload["status"])
        return JSONResponse(payload, headers={"Cache-Control": "no-store"})

    async def _deliver(prep_fn, token: str, req: Request, attachment: bool) -> Response:
        if not media_rl.allow(client_key(req)):
            return error("rate_limited", ERR_MESSAGES["rate_limited"], 429)
        if not TOKEN_RE.match(token):
            return error("expired", MediaError.MESSAGES["expired"], 404)
        try:
            prepared, tmpdir = await run_in_threadpool(prep_fn, token)
        except MediaError as e:
            return error(e.code, e.message, e.status)
        except Exception:
            log.exception("media_failed")
            return error("internal", ERR_MESSAGES["internal"], 500)
        disp = "attachment" if attachment else "inline"
        return FileResponse(
            prepared.path, media_type=prepared.mime,
            headers={"Content-Disposition": f'{disp}; filename="{prepared.filename}"',
                     "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
            background=BackgroundTask(cleanup, tmpdir),
        )

    async def media(req: Request) -> Response:
        return await _deliver(svc.prepare_media, req.path_params["token"], req, req.query_params.get("download") == "1")

    async def zip_(req: Request) -> Response:
        return await _deliver(svc.prepare_zip, req.path_params["token"], req, True)

    routes = [
        Route("/api/health", health),
        Route("/api/resolve", resolve, methods=["POST"]),
        Route("/api/media/{token}", media),
        Route("/api/zip/{token}", zip_),
    ]
    if s.static_dir and Path(s.static_dir).is_dir():
        routes.append(Mount("/", StaticFiles(directory=s.static_dir, html=True), name="static"))

    app = Starlette(routes=routes)

    async def with_headers(scope, receive, send):
        if scope["type"] != "http":
            return await app(scope, receive, send)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                have = {k.lower() for k, _ in headers}
                for k, v in SECURITY_HEADERS.items():
                    if k.lower().encode() not in have:
                        headers.append((k.lower().encode(), v.encode()))
                if scope["path"] in ("/sw.js", "/index.html", "/") and b"cache-control" not in have:
                    headers.append((b"cache-control", b"no-cache"))
            await send(message)

        await app(scope, receive, send_wrapper)

    with_headers.svc = svc  # type: ignore[attr-defined]
    return with_headers  # type: ignore[return-value]
