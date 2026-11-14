from __future__ import annotations

from typing import Protocol

from ..igurl import PostRef
from ..models import ProviderResult


class ProviderError(Exception):
    """Falha controlada de um provedor. `message` é segura para mostrar ao usuário."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class Provider(Protocol):
    name: str

    def available(self) -> bool: ...

    def resolve(self, ref: PostRef) -> ProviderResult: ...
