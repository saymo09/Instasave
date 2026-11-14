"""Contratos compartilhados entre provedores, serviço e API."""
from __future__ import annotations

from dataclasses import dataclass, field

AVAILABLE = "available"
PARTIAL = "partial"
UNAVAILABLE = "unavailable"


@dataclass
class RawMedia:
    """Mídia confirmada por um provedor. A URL nunca sai do servidor."""
    kind: str  # "image" | "video"
    url: str
    thumbnail_url: str | None = None
    width: int | None = None
    height: int | None = None
    duration: float | None = None


@dataclass
class ProviderResult:
    status: str
    post_type: str | None = None  # image | video | reel | carousel
    caption: str | None = None
    author: str | None = None
    duration: float | None = None
    media: list[RawMedia] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    provider: str = ""
