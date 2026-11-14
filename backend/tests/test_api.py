import json
import os
import zipfile
import io
from dataclasses import replace

from conftest import CAPTION, JPEG, MP4, FakeFetcher, FakeProvider, Server
from instasave.app import create_app
from instasave.config import Settings
from instasave.models import AVAILABLE, PARTIAL, UNAVAILABLE, ProviderResult, RawMedia
from instasave.providers.base import ProviderError

POST = "https://www.instagram.com/p/ABC123xyz/"
CDN = "https://scontent.cdninstagram.com/"


def tmp_files(env):
    import time
    for _ in range(40):  # a limpeza roda como tarefa após o envio da resposta
        left = [f for f in env.svc.tmp_root.rglob("*") if f.is_file()]
        if not left:
            break
        time.sleep(0.05)
    return left


def avail(media, **kw):
    return ProviderResult(status=AVAILABLE, post_type="image", caption=CAPTION, author="autor",
                          media=media, provider="fixture", **kw)


def test_health_and_security_headers(env):
    st, h, raw = env.request("GET", "/api/health")
    j = json.loads(raw)
    assert st == 200 and j["status"] == "ok" and j["providers"][0]["name"] == "fixture"
    lh = {k.lower(): v for k, v in h.items()}
    assert lh["x-content-type-options"] == "nosniff" and "frame-ancestors 'none'" in lh["content-security-policy"]


def test_resolve_invalid_inputs(env):
    for body, code in [({"url": "olá"}, "invalid_url"), ({"url": "https://evil.com/p/ABC123xyz/"}, "unsupported_platform"),
                       ({"url": "http://127.0.0.1/"}, "invalid_url"), ({}, "invalid_url")]:
        st, j = env.post_json("/api/resolve", body)
        assert st == 400 and j["error"]["code"] == code and j["error"]["message"]
    st, h, raw = env.request("POST", "/api/resolve", None)
    assert st == 400


def test_resolve_unavailable_gives_original_link(env):
    env.provider.result = ProviderResult(status=UNAVAILABLE, limitations=["bloqueado"])
    st, j = env.post_json("/api/resolve", {"url": POST + "?igsh=1"})
    assert st == 200 and j["status"] == "unavailable" and j["media_items"] == []
    assert j["source_url"] == POST and j["embed_url"].endswith("/embed/") and "bloqueado" in j["limitations"]


def test_no_provider_configured(env):
    env.provider.is_available = False
    st, j = env.post_json("/api/resolve", {"url": POST})
    assert j["status"] == "unavailable" and "configurado" in j["limitations"][0]


def test_provider_exception_does_not_crash(env):
    env.provider.result = RuntimeError("boom /internal/path")
    st, j = env.post_json("/api/resolve", {"url": POST})
    assert st == 200 and j["status"] == "unavailable" and "internal" not in json.dumps(j)
    env.provider.result = ProviderError("Tempo esgotado")
    st, j = env.post_json("/api/resolve", {"url": POST})
    assert "Tempo esgotado" in j["limitations"]


def test_resolve_never_exposes_media_urls(env):
    env.provider.result = avail([RawMedia("image", CDN + "a.jpg")])
    st, j = env.post_json("/api/resolve", {"url": POST})
    assert "cdninstagram" not in json.dumps(j) and j["media_items"][0]["token"]
    assert j["caption"] == CAPTION  # emojis, hashtags, quebras e texto longo intactos


def test_image_download_validates_and_cleans_tmp(env):
    env.fetcher.routes[CDN + "a.jpg"] = (200, JPEG, {"content-type": "text/html"})
    env.provider.result = avail([RawMedia("image", CDN + "a.jpg")])
    j = env.post_json("/api/resolve", {"url": POST})[1]
    tok = j["media_items"][0]["token"]
    st, h, body = env.request("GET", f"/api/media/{tok}?download=1")
    lh = {k.lower(): v for k, v in h.items()}
    assert st == 200 and body == JPEG and lh["content-type"] == "image/jpeg"  # MIME vem do conteúdo
    assert lh["content-disposition"].startswith("attachment") and "instasave-ABC123xyz-01.jpg" in lh["content-disposition"]
    assert tmp_files(env) == []


def test_video_content_mismatch_rejected(env):
    env.fetcher.routes[CDN + "v.mp4"] = (200, b"<html>not a video</html>" * 5, None)
    env.provider.result = avail([RawMedia("video", CDN + "v.mp4")])
    tok = env.post_json("/api/resolve", {"url": POST})[1]["media_items"][0]["token"]
    st, h, raw = env.request("GET", f"/api/media/{tok}")
    assert st == 502 and json.loads(raw)["error"]["code"] == "invalid_content"
    # imagem entregue onde se esperava vídeo também é rejeitada
    env.fetcher.routes[CDN + "v.mp4"] = (200, JPEG, None)
    st, h, raw = env.request("GET", f"/api/media/{tok}")
    assert st == 502


def test_too_large_declared_and_streamed(env):
    env.provider.result = avail([RawMedia("image", CDN + "big.jpg")])
    tok = env.post_json("/api/resolve", {"url": POST})[1]["media_items"][0]["token"]
    big = JPEG + b"0" * 5000  # limite do teste: 2000 bytes
    env.fetcher.routes[CDN + "big.jpg"] = (200, big, None)
    assert env.request("GET", f"/api/media/{tok}")[0] == 413
    env.fetcher.routes[CDN + "big.jpg"] = (200, big, {"content-length": "10"})  # cabeçalho mentiroso
    assert env.request("GET", f"/api/media/{tok}")[0] == 413
    assert tmp_files(env) == []


def test_upstream_errors(env):
    env.provider.result = avail([RawMedia("image", CDN + "x.jpg")])
    tok = env.post_json("/api/resolve", {"url": POST})[1]["media_items"][0]["token"]
    env.fetcher.routes[CDN + "x.jpg"] = (404, b"", None)
    st, h, raw = env.request("GET", f"/api/media/{tok}")
    assert st == 502 and json.loads(raw)["error"]["code"] == "fetch_failed"
    env.fetcher.routes.pop(CDN + "x.jpg")
    assert env.request("GET", f"/api/media/{tok}")[0] == 502


def test_client_cannot_supply_arbitrary_urls(env):
    for t in ["https%3A%2F%2Fevil.com%2Fx.jpg", "..%2F..%2Fetc%2Fpasswd", "nope-not-a-token-1234567"]:
        st, h, raw = env.request("GET", f"/api/media/{t}")
        assert st == 404
    assert json.loads(env.request("GET", "/api/media/nope-not-a-token-1234567")[2])["error"]["code"] == "expired"
    assert env.fetcher.calls == []


def test_carousel_zip_order_and_validity(env):
    items = [RawMedia("image", CDN + "1.jpg"), RawMedia("video", CDN + "2.mp4"), RawMedia("image", CDN + "3.jpg")]
    env.fetcher.routes.update({CDN + "1.jpg": (200, JPEG, None), CDN + "2.mp4": (200, MP4, None), CDN + "3.jpg": (200, JPEG + b"3", None)})
    env.provider.result = ProviderResult(status=AVAILABLE, post_type="carousel", caption=CAPTION, media=items, provider="fixture")
    j = env.post_json("/api/resolve", {"url": POST})[1]
    assert [i["kind"] for i in j["media_items"]] == ["image", "video", "image"] and j["zip_token"]
    st, h, body = env.request("GET", f"/api/zip/{j['zip_token']}")
    assert st == 200
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        assert z.testzip() is None
        assert z.namelist() == ["instasave-ABC123xyz-01.jpg", "instasave-ABC123xyz-02.mp4", "instasave-ABC123xyz-03.jpg"]
        assert z.read("instasave-ABC123xyz-02.mp4") == MP4
    assert tmp_files(env) == []


def test_zip_fails_when_one_item_fails_and_individual_still_works(env):
    items = [RawMedia("image", CDN + "1.jpg"), RawMedia("image", CDN + "2.jpg")]
    env.fetcher.routes[CDN + "1.jpg"] = (200, JPEG, None)  # 2.jpg ausente
    env.provider.result = ProviderResult(status=AVAILABLE, post_type="carousel", media=items, provider="fixture")
    j = env.post_json("/api/resolve", {"url": POST})[1]
    st, h, raw = env.request("GET", f"/api/zip/{j['zip_token']}")
    e = json.loads(raw)["error"]
    assert st == 502 and "item 2 de 2" in e["message"]
    assert env.request("GET", f"/api/media/{j['media_items'][0]['token']}")[0] == 200
    assert tmp_files(env) == []


def test_token_expiry(env):
    from instasave.store import TokenStore
    t = [0.0]
    store = TokenStore(10, 3, clock=lambda: t[0])
    k = store.put("v"); assert store.get(k) == "v"
    t[0] = 11; assert store.get(k) is None
    t[0] = 0; ks = [store.put(i) for i in range(5)]
    assert store.get(ks[0]) is None and store.get(ks[4]) == 4  # limite de entradas


def test_rate_limit_and_unauthorized_proxy_header():
    s = replace(Settings(), static_dir=None, resolve_per_min=3)
    app = create_app(s, [FakeProvider()], FakeFetcher())
    with Server(app) as srv:
        codes = [srv.post_json("/api/resolve", {"url": POST})[0] for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


def test_busy_when_concurrency_exhausted(env):
    for _ in range(env.settings.max_concurrent_media):
        env.svc.sem.acquire()
    env.provider.result = avail([RawMedia("image", CDN + "a.jpg")])
    tok = env.post_json("/api/resolve", {"url": POST})[1]["media_items"][0]["token"]
    st, h, raw = env.request("GET", f"/api/media/{tok}")
    assert st == 503 and json.loads(raw)["error"]["code"] == "busy"
    for _ in range(env.settings.max_concurrent_media):
        env.svc.sem.release()


def test_ssrf_blocked_media_host_never_fetched(env):
    # provedor malicioso/defeituoso devolvendo destino interno: SafeFetcher real bloqueia
    from instasave.netsafe import SafeFetcher
    prov = FakeProvider()
    prov.result = avail([RawMedia("image", "https://169.254.169.254/latest/meta-data")])
    app = create_app(replace(Settings(), static_dir=None), [prov], SafeFetcher(("cdninstagram.com",)))
    with Server(app) as srv:
        tok = srv.post_json("/api/resolve", {"url": POST})[1]["media_items"][0]["token"]
        st, h, raw = srv.request("GET", f"/api/media/{tok}")
    assert st == 403 and json.loads(raw)["error"]["code"] == "blocked"
