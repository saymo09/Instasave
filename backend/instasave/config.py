"""Configuração lida do ambiente. Nenhum segredo é necessário."""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    max_file_bytes: int = 100 * 1024 * 1024
    max_zip_bytes: int = 300 * 1024 * 1024
    fetch_timeout: float = 20.0
    fetch_deadline: float = 90.0
    max_redirects: int = 3
    resolve_per_min: int = 10
    media_per_min: int = 40
    max_concurrent_media: int = 3
    token_ttl: int = 30 * 60
    max_store_entries: int = 500
    trust_proxy: bool = False
    ytdlp_path: str | None = None
    static_dir: Path | None = None
    # Hosts de CDN permitidos para mídia (sufixo de domínio)
    media_host_suffixes: tuple[str, ...] = field(
        default=("cdninstagram.com", "fbcdn.net")
    )

    @classmethod
    def from_env(cls) -> "Settings":
        ytdlp = os.environ.get("INSTASAVE_YTDLP_PATH") or shutil.which("yt-dlp")
        static = os.environ.get("INSTASAVE_STATIC_DIR")
        base = Path(__file__).resolve().parents[2]
        static_dir = Path(static) if static else base / "frontend" / "dist"
        if not static_dir.is_absolute():
            static_dir = (base / "backend" / static_dir).resolve()
        return cls(
            max_file_bytes=_int("INSTASAVE_MAX_FILE_MB", 100) * 1024 * 1024,
            resolve_per_min=_int("INSTASAVE_RESOLVE_PER_MIN", 10),
            media_per_min=_int("INSTASAVE_MEDIA_PER_MIN", 40),
            trust_proxy=os.environ.get("INSTASAVE_TRUST_PROXY") == "1",
            ytdlp_path=ytdlp,
            static_dir=static_dir,
        )
