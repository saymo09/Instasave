"""Adaptador opcional para o yt-dlp (open-source, Unlicense).

- Executável fixo, argumentos separados, sem shell, diretório temporário, timeout.
- Nunca recebe cookies, login ou tokens. Se o Instagram exigir autenticação, o resultado
  é "indisponível" — não há tentativa de contornar a proteção.
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from typing import Any
from urllib.parse import urlsplit

from ..igurl import PostRef
from ..models import AVAILABLE, PARTIAL, UNAVAILABLE, ProviderResult, RawMedia
from ..netsafe import host_allowed
from .base import ProviderError

IMAGE_EXTS = {"jpg", "jpeg", "png", "webp"}
MAX_OUTPUT = 5 * 1024 * 1024


class YtDlpProvider:
    name = "yt-dlp"

    def __init__(self, path: str | None, host_suffixes: tuple[str, ...], timeout: float = 45.0):
        self.path = path
        self.suffixes = host_suffixes
        self.timeout = timeout

    def available(self) -> bool:
        return bool(self.path)

    def resolve(self, ref: PostRef) -> ProviderResult:
        if not self.path:
            raise ProviderError("Mecanismo de extração não instalado.")
        with tempfile.TemporaryDirectory(prefix="instasave-ytdlp-") as tmp:
            cmd = [self.path, "--ignore-config", "--no-warnings", "--socket-timeout", "15", "-J", "--", ref.url]
            try:
                proc = subprocess.run(  # noqa: S603 — executável fixo, sem shell
                    cmd, capture_output=True, timeout=self.timeout, cwd=tmp,
                    env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": tmp}, check=False,
                )
            except subprocess.TimeoutExpired:
                raise ProviderError("A consulta demorou demais. Tente novamente em instantes.") from None
            except OSError:
                raise ProviderError("Mecanismo de extração indisponível no servidor.") from None
        if proc.returncode != 0 or not proc.stdout or len(proc.stdout) > MAX_OUTPUT:
            return ProviderResult(
                status=UNAVAILABLE, provider=self.name,
                limitations=["O Instagram não permitiu obter esta publicação por acesso público (pode exigir login, estar privada, removida ou limitar acessos automatizados)."],
            )
        try:
            info = json.loads(proc.stdout)
        except ValueError:
            raise ProviderError("Resposta inesperada do mecanismo de extração.") from None
        return parse_info(info, ref, self.suffixes, self.name)


def _ok_url(u: Any, suffixes: tuple[str, ...]) -> bool:
    if not isinstance(u, str):
        return False
    p = urlsplit(u)
    return p.scheme == "https" and bool(p.hostname) and host_allowed(p.hostname, suffixes)


def _num(v: Any) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _int(v: Any) -> int | None:
    n = _num(v)
    return int(n) if n is not None else None


def _pick_video(entry: dict, suffixes) -> str | None:
    best, score = None, -1.0
    for f in entry.get("formats") or []:
        if not isinstance(f, dict) or not _ok_url(f.get("url"), suffixes):
            continue
        if f.get("vcodec") in (None, "none") or f.get("ext") != "mp4":
            continue
        s = (_num(f.get("height")) or 0) + (1000 if f.get("acodec") not in (None, "none") else 0)
        if s > score:
            best, score = f["url"], s
    if best:
        return best
    return entry["url"] if _ok_url(entry.get("url"), suffixes) else None


def parse_info(info: dict, ref: PostRef, suffixes: tuple[str, ...], provider: str) -> ProviderResult:
    entries = info.get("entries") if info.get("_type") == "playlist" else None
    raw_items = [e for e in (entries or [info]) if isinstance(e, dict)]
    media: list[RawMedia] = []
    dropped = 0
    for e in raw_items:
        ext = str(e.get("ext") or "").lower()
        has_video = any(
            isinstance(f, dict) and f.get("vcodec") not in (None, "none") for f in (e.get("formats") or [])
        ) or e.get("vcodec") not in (None, "none")
        if has_video or ext == "mp4":
            url, kind = _pick_video(e, suffixes), "video"
        elif ext in IMAGE_EXTS:
            url, kind = (e["url"] if _ok_url(e.get("url"), suffixes) else None), "image"
        else:
            url, kind = None, "image"
        if not url:
            dropped += 1
            continue
        thumb = e.get("thumbnail") if _ok_url(e.get("thumbnail"), suffixes) else None
        media.append(RawMedia(kind=kind, url=url, thumbnail_url=thumb,
                              width=_int(e.get("width")), height=_int(e.get("height")),
                              duration=_num(e.get("duration"))))
    limitations: list[str] = []
    if not media:
        return ProviderResult(status=UNAVAILABLE, provider=provider,
                              limitations=["Nenhuma mídia pôde ser obtida por acesso público."])
    if dropped:
        limitations.append(f"{dropped} item(ns) do carrossel não puderam ser obtidos.")
    caption = info.get("description")
    caption = caption if isinstance(caption, str) and caption.strip() else None
    if caption is None:
        limitations.append("A legenda não pôde ser obtida.")
    author = info.get("uploader") or info.get("channel") or info.get("uploader_id")
    if len(media) > 1:
        ptype = "carousel"
    elif ref.kind == "reel":
        ptype = "reel"
    else:
        ptype = media[0].kind
    return ProviderResult(
        status=AVAILABLE if not limitations else PARTIAL,
        post_type=ptype, caption=caption, author=author if isinstance(author, str) else None,
        duration=_num(info.get("duration")) if len(media) == 1 else None,
        media=media, limitations=limitations, provider=provider,
    )
