"""Validação de conteúdo (magic bytes) e nomes de arquivo seguros."""
from __future__ import annotations

import re
import unicodedata


def sniff(head: bytes) -> tuple[str, str, str] | None:
    """Retorna (kind, mime, ext) pelo conteúdo real, ou None se desconhecido."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image", "image/jpeg", "jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", "image/png", "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image", "image/webp", "webp"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image", "image/gif", "gif"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"heic", b"heix", b"mif1", b"avif"):
            return None
        return "video", "video/mp4", "mp4"
    if head[:4] == b"\x1aE\xdf\xa3":
        return "video", "video/webm", "webm"
    return None


_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(stem: str, ext: str, fallback: str = "instasave") -> str:
    """Nome ASCII, sem separadores de caminho, sem pontos iniciais, tamanho limitado."""
    norm = unicodedata.normalize("NFKD", stem or "").encode("ascii", "ignore").decode()
    norm = _SAFE.sub("_", norm).strip("._-")[:60] or fallback
    ext = re.sub(r"[^A-Za-z0-9]", "", ext or "").lower()[:5] or "bin"
    return f"{norm}.{ext}"
