"""Criação de ZIP seguro: nomes sanitizados e únicos, sem ZIP Slip."""
from __future__ import annotations

import zipfile
from pathlib import Path

from .mediafile import safe_filename


def build_zip(dest: Path, files: list[tuple[str, Path]]) -> None:
    """files = [(nome_desejado, caminho_local)]. Nomes são sanitizados; nunca contêm diretórios."""
    used: set[str] = set()
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_STORED) as zf:
        for wanted, path in files:
            stem, _, ext = wanted.rpartition(".")
            name = safe_filename(stem or wanted, ext)
            base, n = name, 1
            while name in used:
                n += 1
                head, _, e = base.rpartition(".")
                name = f"{head}-{n}.{e}"
            used.add(name)
            zf.write(path, arcname=name)
