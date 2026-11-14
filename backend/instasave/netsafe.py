"""Rede segura: bloqueio de SSRF, DNS pinning, redirecionamentos revalidados, limites."""
from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import time
from dataclasses import dataclass
from typing import Callable, Iterator, Protocol
from urllib.parse import urljoin, urlsplit


class UnsafeTarget(Exception):
    pass


class FetchError(Exception):
    """Falha de rede/HTTP. `code` é estável; mensagem nunca expõe detalhes internos."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class TooLarge(FetchError):
    def __init__(self):
        super().__init__("too_large")


def is_forbidden_ip(ip: ipaddress._BaseAddress) -> bool:
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return is_forbidden_ip(ip.ipv4_mapped)
        if ip.sixtofour is not None and is_forbidden_ip(ip.sixtofour):
            return True
        if ip.teredo is not None:
            return True
    return not ip.is_global or ip.is_multicast


def host_allowed(host: str, suffixes: tuple[str, ...]) -> bool:
    host = host.lower().rstrip(".")
    return any(host == s or host.endswith("." + s) for s in suffixes)


Resolver = Callable[[str, int], list[str]]


def default_resolver(host: str, port: int) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise FetchError("dns_failed") from None
    return [i[4][0] for i in infos]


def resolve_public(host: str, port: int = 443, resolver: Resolver = default_resolver) -> str:
    """Resolve e exige que TODOS os endereços sejam públicos; devolve um para fixar a conexão."""
    try:  # host já é IP literal?
        literal = ipaddress.ip_address(host.strip("[]"))
        addrs = [str(literal)]
    except ValueError:
        addrs = resolver(host, port)
    if not addrs:
        raise FetchError("dns_failed")
    for a in addrs:
        try:
            ip = ipaddress.ip_address(a.split("%")[0])
        except ValueError:
            raise UnsafeTarget(host) from None
        if is_forbidden_ip(ip):
            raise UnsafeTarget(host)
    return addrs[0]


@dataclass
class Response:
    status: int
    headers: dict[str, str]
    _chunks: Iterator[bytes]
    _close: Callable[[], None]

    def iter_chunks(self) -> Iterator[bytes]:
        return self._chunks

    def close(self) -> None:
        self._close()


class Fetcher(Protocol):
    def fetch(self, url: str) -> Response: ...


class _PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host: str, ip: str, port: int, timeout: float):
        super().__init__(host, port, timeout=timeout, context=ssl.create_default_context())
        self._ip = ip

    def connect(self) -> None:  # conecta no IP validado, TLS/SNI com o hostname
        sock = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


class SafeFetcher:
    """GET https com allowlist de hosts, IP fixado após validação e redirecionamentos manuais."""

    def __init__(
        self,
        allowed_suffixes: tuple[str, ...],
        *,
        timeout: float = 20.0,
        deadline: float = 90.0,
        max_redirects: int = 3,
        resolver: Resolver = default_resolver,
    ):
        self.allowed = allowed_suffixes
        self.timeout = timeout
        self.deadline = deadline
        self.max_redirects = max_redirects
        self.resolver = resolver

    def fetch(self, url: str) -> Response:
        start = time.monotonic()
        current = url
        for _ in range(self.max_redirects + 1):
            parts = urlsplit(current)
            host = (parts.hostname or "").lower()
            if parts.scheme != "https" or parts.username or parts.password:
                raise UnsafeTarget(host)
            if parts.port not in (None, 443) or not host_allowed(host, self.allowed):
                raise UnsafeTarget(host)
            ip = resolve_public(host, 443, self.resolver)
            conn = _PinnedHTTPS(host, ip, 443, self.timeout)
            target = parts.path or "/"
            if parts.query:
                target += "?" + parts.query
            try:
                conn.request("GET", target, headers={"User-Agent": "InstaSave/1.0", "Accept": "*/*", "Accept-Encoding": "identity"})
                resp = conn.getresponse()
            except (OSError, http.client.HTTPException):
                conn.close()
                raise FetchError("connection_failed") from None
            if resp.status in (301, 302, 303, 307, 308):
                loc = resp.getheader("Location")
                conn.close()
                if not loc:
                    raise FetchError("bad_redirect")
                current = urljoin(current, loc)
                continue
            headers = {k.lower(): v for k, v in resp.getheaders()}
            deadline_at = start + self.deadline

            def chunks(resp=resp, conn=conn) -> Iterator[bytes]:
                try:
                    while True:
                        if time.monotonic() > deadline_at:
                            raise FetchError("timeout")
                        try:
                            data = resp.read(64 * 1024)
                        except (OSError, http.client.HTTPException):
                            raise FetchError("connection_failed") from None
                        if not data:
                            return
                        yield data
                finally:
                    conn.close()

            return Response(resp.status, headers, chunks(), conn.close)
        raise FetchError("too_many_redirects")
