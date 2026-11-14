"""Orquestra provedores, emite tokens e prepara arquivos temporários."""
from __future__ import annotations

import logging
import os
import tempfile
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from .config import Settings
from .igurl import PostRef
from .mediafile import safe_filename, sniff
from .models import AVAILABLE, PARTIAL, UNAVAILABLE, ProviderResult
from .netsafe import FetchError, Fetcher, TooLarge, UnsafeTarget
from .providers.base import Provider, ProviderError
from .store import MediaEntry, PostEntry, TokenStore
from .zipbuilder import build_zip

log = logging.getLogger("instasave")


class MediaError(Exception):
    """Erro de entrega de mídia com código estável e mensagem amigável."""

    MESSAGES = {
        "expired": "O link da mídia expirou. Processe o link novamente.",
        "too_large": "O arquivo é maior que o limite permitido.",
        "timeout": "A operação demorou demais. Tente novamente.",
        "fetch_failed": "Não foi possível baixar o arquivo agora. Tente novamente.",
        "invalid_content": "O arquivo recebido não é uma imagem ou vídeo válido.",
        "busy": "O servidor está ocupado. Tente novamente em instantes.",
        "blocked": "Destino de mídia não permitido.",
    }
    STATUS = {"expired": 404, "too_large": 413, "timeout": 504, "fetch_failed": 502,
              "invalid_content": 502, "busy": 503, "blocked": 403}

    def __init__(self, code: str, detail: str | None = None):
        super().__init__(code)
        self.code = code
        self.message = self.MESSAGES[code] if detail is None else f"{self.MESSAGES[code]} {detail}"
        self.status = self.STATUS[code]


@dataclass
class Prepared:
    path: Path
    mime: str
    filename: str


class InstaSaveService:
    def __init__(self, settings: Settings, providers: list[Provider], fetcher: Fetcher):
        self.s = settings
        self.providers = providers
        self.fetcher = fetcher
        self.store = TokenStore(settings.token_ttl, settings.max_store_entries)
        self.sem = threading.BoundedSemaphore(settings.max_concurrent_media)
        self.tmp_root = Path(tempfile.mkdtemp(prefix="instasave-"))

    # ---------- resolução ----------
    def resolve(self, ref: PostRef) -> dict:
        limitations: list[str] = []
        result: ProviderResult | None = None
        tried = 0
        for p in self.providers:
            if not p.available():
                continue
            tried += 1
            try:
                r = p.resolve(ref)
            except ProviderError as e:
                limitations.append(e.message)
                continue
            except Exception:  # falha de um método não derruba o app
                log.exception("provider_failed provider=%s kind=%s", getattr(p, "name", "?"), ref.kind)
                limitations.append("Falha inesperada ao consultar a publicação.")
                continue
            if r.status in (AVAILABLE, PARTIAL) and r.media:
                result = r
                break
            limitations.extend(r.limitations)
        if tried == 0:
            limitations.append("Nenhum mecanismo de extração está configurado neste servidor (veja a documentação).")
        if result is None:
            return self._payload(ref, ProviderResult(status=UNAVAILABLE, limitations=_dedupe(limitations)), [], None)
        items = []
        tokens: list[str] = []
        for i, m in enumerate(result.media, 1):
            ext = {"image": "jpg", "video": "mp4"}[m.kind]
            name = safe_filename(f"instasave-{ref.shortcode}-{i:02d}", ext)
            t = self.store.put(MediaEntry(url=m.url, kind=m.kind, filename=name))
            th = self.store.put(MediaEntry(url=m.thumbnail_url, kind="image", filename="thumb.jpg")) if m.thumbnail_url else (t if m.kind == "image" else None)
            tokens.append(t)
            items.append({"index": i, "kind": m.kind, "token": t, "thumbnail_token": th,
                          "width": m.width, "height": m.height, "duration": m.duration, "filename": name})
        post_token = self.store.put(PostEntry(ref.shortcode, tokens)) if len(tokens) > 1 else None
        return self._payload(ref, result, items, post_token)

    def _payload(self, ref: PostRef, r: ProviderResult, items: list[dict], post_token: str | None) -> dict:
        return {
            "status": r.status, "post_type": r.post_type or ref.kind, "source_url": ref.url,
            "embed_url": ref.embed_url, "shortcode": ref.shortcode, "caption": r.caption,
            "author": r.author, "duration": r.duration, "media_items": items,
            "zip_token": post_token, "limitations": r.limitations, "provider": r.provider or None,
        }

    # ---------- mídia ----------
    @contextmanager
    def _slot(self):
        if not self.sem.acquire(blocking=False):
            raise MediaError("busy")
        try:
            yield
        finally:
            self.sem.release()

    def _download(self, entry: MediaEntry, dest_dir: Path) -> Prepared:
        try:
            resp = self.fetcher.fetch(entry.url)
        except UnsafeTarget:
            raise MediaError("blocked") from None
        except FetchError as e:
            raise MediaError("timeout" if e.code == "timeout" else "fetch_failed") from None
        try:
            if resp.status != 200:
                raise MediaError("fetch_failed")
            declared = resp.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > self.s.max_file_bytes:
                raise MediaError("too_large")
            fd, name = tempfile.mkstemp(dir=dest_dir, suffix=".part")
            path = Path(name)
            total, kind_info = 0, None
            try:
                with os.fdopen(fd, "wb") as out:
                    for chunk in resp.iter_chunks():
                        if kind_info is None:
                            kind_info = sniff(chunk[:16])
                            if kind_info is None or kind_info[0] != entry.kind:
                                raise MediaError("invalid_content")
                        total += len(chunk)
                        if total > self.s.max_file_bytes:
                            raise TooLarge()
                        out.write(chunk)
            except TooLarge:
                path.unlink(missing_ok=True)
                raise MediaError("too_large") from None
            except FetchError as e:
                path.unlink(missing_ok=True)
                raise MediaError("timeout" if e.code == "timeout" else "fetch_failed") from None
            except Exception:
                path.unlink(missing_ok=True)
                raise
            if kind_info is None:
                path.unlink(missing_ok=True)
                raise MediaError("invalid_content")
            _, mime, ext = kind_info
            stem = entry.filename.rpartition(".")[0]
            return Prepared(path, mime, safe_filename(stem, ext))
        finally:
            resp.close()

    def prepare_media(self, token: str) -> tuple[Prepared, Path]:
        """Devolve arquivo temporário validado + diretório a limpar após o envio."""
        entry = self.store.get(token)
        if not isinstance(entry, MediaEntry):
            raise MediaError("expired")
        with self._slot():
            d = Path(tempfile.mkdtemp(dir=self.tmp_root))
            try:
                return self._download(entry, d), d
            except BaseException:
                cleanup(d)
                raise

    def prepare_zip(self, post_token: str) -> tuple[Prepared, Path]:
        post = self.store.get(post_token)
        if not isinstance(post, PostEntry):
            raise MediaError("expired")
        with self._slot():
            d = Path(tempfile.mkdtemp(dir=self.tmp_root))
            try:
                files: list[tuple[str, Path]] = []
                total = 0
                for i, t in enumerate(post.media_tokens, 1):
                    entry = self.store.get(t)
                    if not isinstance(entry, MediaEntry):
                        raise MediaError("expired")
                    try:
                        prepared = self._download(entry, d)
                    except MediaError as e:
                        raise MediaError(e.code, f"(item {i} de {len(post.media_tokens)})") from None
                    total += prepared.path.stat().st_size
                    if total > self.s.max_zip_bytes:
                        raise MediaError("too_large")
                    files.append((prepared.filename, prepared.path))
                out = d / "bundle.zip"
                build_zip(out, files)
                return Prepared(out, "application/zip", f"instasave-{post.shortcode}.zip"), d
            except BaseException:
                cleanup(d)
                raise


def cleanup(d: Path) -> None:
    import shutil
    shutil.rmtree(d, ignore_errors=True)


def _dedupe(xs: list[str]) -> list[str]:
    seen, out = set(), []
    for x in xs:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out
