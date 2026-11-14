import ipaddress
import pytest
from instasave import netsafe
from instasave.netsafe import FetchError, SafeFetcher, UnsafeTarget, host_allowed, is_forbidden_ip, resolve_public

SUF = ("cdninstagram.com", "fbcdn.net")


@pytest.mark.parametrize("ip", [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0",
    "224.0.0.1", "100.64.0.1", "::1", "fe80::1", "fc00::1", "ff02::1", "::ffff:127.0.0.1",
    "::ffff:10.0.0.1", "2002:7f00:0001::1", "240.0.0.1",
])
def test_forbidden(ip):
    assert is_forbidden_ip(ipaddress.ip_address(ip))


@pytest.mark.parametrize("ip", ["8.8.8.8", "157.240.1.1", "2a03:2880:f12f:83:face:b00c:0:25de"])
def test_public(ip):
    assert not is_forbidden_ip(ipaddress.ip_address(ip))


def test_host_allowlist():
    assert host_allowed("scontent-gru1-1.cdninstagram.com", SUF)
    assert host_allowed("cdninstagram.com", SUF)
    assert not host_allowed("evilcdninstagram.com", SUF)
    assert not host_allowed("cdninstagram.com.evil.com", SUF)


def test_resolve_rejects_if_any_address_private():  # DNS rebinding / multi-A
    with pytest.raises(UnsafeTarget):
        resolve_public("x.cdninstagram.com", 443, lambda h, p: ["8.8.8.8", "10.0.0.5"])
    assert resolve_public("x.cdninstagram.com", 443, lambda h, p: ["8.8.8.8"]) == "8.8.8.8"


def test_resolve_literal_ip():
    with pytest.raises(UnsafeTarget):
        resolve_public("127.0.0.1")
    with pytest.raises(UnsafeTarget):
        resolve_public("[::1]")


class _FakeResp:
    def __init__(self, status, location=None):
        self.status, self._loc = status, location
    def getheader(self, n): return self._loc
    def getheaders(self): return []
    def read(self, n): return b""


def _fake_conn(script):
    class C:
        def __init__(self, host, ip, port, timeout):
            self.host, self.ip = host, ip
            script.append((host, ip))
        def request(self, *a, **k): pass
        def getresponse(self): return _FakeResp(302, script_loc[0])
        def close(self): pass
    return C


script_loc = [None]


@pytest.mark.parametrize("loc", [
    "https://127.0.0.1/x", "http://x.cdninstagram.com/x", "https://evil.com/x",
    "https://169.254.169.254/latest", "https://user:p@x.cdninstagram.com/",
])
def test_redirect_to_forbidden_is_blocked(monkeypatch, loc):
    calls = []
    monkeypatch.setattr(netsafe, "_PinnedHTTPS", _fake_conn(calls))
    script_loc[0] = loc
    f = SafeFetcher(SUF, resolver=lambda h, p: ["8.8.8.8"])
    with pytest.raises(UnsafeTarget):
        f.fetch("https://a.cdninstagram.com/start")
    assert len(calls) == 1  # só o destino inicial foi contatado


def test_redirect_limit(monkeypatch):
    monkeypatch.setattr(netsafe, "_PinnedHTTPS", _fake_conn([]))
    script_loc[0] = "https://b.cdninstagram.com/loop"
    f = SafeFetcher(SUF, max_redirects=2, resolver=lambda h, p: ["8.8.8.8"])
    with pytest.raises(FetchError) as e:
        f.fetch("https://a.cdninstagram.com/start")
    assert e.value.code == "too_many_redirects"


def test_initial_url_checks():
    f = SafeFetcher(SUF, resolver=lambda h, p: ["8.8.8.8"])
    for bad in ["http://a.cdninstagram.com/x", "https://a.cdninstagram.com:8443/x", "https://evil.com/x", "file:///etc/passwd"]:
        with pytest.raises(UnsafeTarget):
            f.fetch(bad)
    f2 = SafeFetcher(SUF, resolver=lambda h, p: ["10.0.0.1"])
    with pytest.raises(UnsafeTarget):
        f2.fetch("https://a.cdninstagram.com/x")
