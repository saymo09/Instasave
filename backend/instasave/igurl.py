"""Validação e normalização de links do Instagram (servidor é a autoridade)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

ALLOWED_HOSTS = {"instagram.com", "www.instagram.com"}
_CODE = r"[A-Za-z0-9_-]{5,40}"
_PATH = re.compile(
    rf"^/(?:(?P<user>[A-Za-z0-9._]{{1,30}})/)?(?P<seg>p|reel|reels|tv)/(?P<code>{_CODE})/?$"
)
_UNSUPPORTED_HINTS = (
    ("stories", "Stories não são suportados."),
    ("share", "Links curtos de compartilhamento não são suportados. Abra o link, copie o endereço completo da publicação e cole aqui."),
)


class InvalidUrl(ValueError):
    """Link malformado ou fora das regras de segurança."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PostRef:
    kind: str  # "post" | "reel" | "tv"
    shortcode: str
    url: str  # URL canônica normalizada

    @property
    def embed_url(self) -> str:
        seg = {"post": "p", "reel": "reel", "tv": "tv"}[self.kind]
        return f"https://www.instagram.com/{seg}/{self.shortcode}/embed/"


def parse_instagram_url(raw: str) -> PostRef:
    if not isinstance(raw, str):
        raise InvalidUrl("invalid_url", "Informe um link.")
    text = raw.strip()
    if not text or len(text) > 2048:
        raise InvalidUrl("invalid_url", "Cole o link de uma publicação do Instagram.")
    if any(c.isspace() for c in text) or any(ord(c) < 32 for c in text):
        raise InvalidUrl("invalid_url", "O texto colado não parece ser um link único.")
    if "://" not in text:
        raise InvalidUrl("invalid_url", "O link precisa começar com https://")
    try:
        parts = urlsplit(text)
        port = parts.port
    except ValueError:
        raise InvalidUrl("invalid_url", "O link está malformado.") from None
    if parts.scheme.lower() != "https":
        raise InvalidUrl("invalid_url", "Use um link https:// do Instagram.")
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        raise InvalidUrl("invalid_url", "Links com credenciais não são aceitos.")
    host = (parts.hostname or "").lower().rstrip(".")
    if host not in ALLOWED_HOSTS:
        raise InvalidUrl("unsupported_platform", "Este link não é do Instagram. Só aceitamos instagram.com.")
    if port not in (None, 443):
        raise InvalidUrl("invalid_url", "Portas personalizadas não são aceitas.")
    path = re.sub(r"/{2,}", "/", parts.path)
    m = _PATH.match(path)
    if not m:
        low = path.lower()
        for key, msg in _UNSUPPORTED_HINTS:
            if f"/{key}/" in low or low.startswith(f"/{key}"):
                raise InvalidUrl("unsupported_url", msg)
        raise InvalidUrl(
            "unsupported_url",
            "Tipo de link não suportado. Use links de publicação (/p/), Reel (/reel/) ou vídeo (/tv/).",
        )
    if (m.group("user") or "").lower() in {"share", "stories", "explore", "accounts", "direct"}:
        low = "/" + m.group("user").lower() + "/"
        for key, msg in _UNSUPPORTED_HINTS:
            if low == f"/{key}/":
                raise InvalidUrl("unsupported_url", msg)
        raise InvalidUrl("unsupported_url", "Tipo de link não suportado.")
    seg = m.group("seg")
    kind = {"p": "post", "reel": "reel", "reels": "reel", "tv": "tv"}[seg]
    code = m.group("code")
    canon_seg = {"post": "p", "reel": "reel", "tv": "tv"}[kind]
    return PostRef(kind=kind, shortcode=code, url=f"https://www.instagram.com/{canon_seg}/{code}/")
