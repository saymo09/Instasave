import json
import os
import stat
import sys
from pathlib import Path

import pytest
from instasave.igurl import parse_instagram_url
from instasave.models import AVAILABLE, PARTIAL, UNAVAILABLE
from instasave.providers.base import ProviderError
from instasave.providers.ytdlp import YtDlpProvider, parse_info

SUF = ("cdninstagram.com", "fbcdn.net")
CDN = "https://scontent.cdninstagram.com/"
CAP = "Legenda 🎉\nlinha 2 #tag"


def ref(kind="p"):
    return parse_instagram_url(f"https://www.instagram.com/{kind}/ABC123xyz/")


def video_entry(**kw):
    e = {"ext": "mp4", "duration": 12.5, "width": 720, "height": 1280, "thumbnail": CDN + "t.jpg",
         "formats": [
             {"url": CDN + "low.mp4", "ext": "mp4", "vcodec": "avc1", "acodec": "none", "height": 360},
             {"url": CDN + "hi.mp4", "ext": "mp4", "vcodec": "avc1", "acodec": "mp4a", "height": 720},
             {"url": "https://evil.example.com/x.mp4", "ext": "mp4", "vcodec": "avc1", "acodec": "mp4a", "height": 2000},
         ]}
    e.update(kw)
    return e


def test_reel_available():
    r = parse_info({**video_entry(), "description": CAP, "uploader": "autor"}, ref("reel"), SUF, "yt-dlp")
    assert r.status == AVAILABLE and r.post_type == "reel"
    assert r.media[0].url == CDN + "hi.mp4" and r.media[0].kind == "video"  # ignora host fora da allowlist
    assert r.caption == CAP and r.author == "autor" and r.duration == 12.5


def test_image_post_without_caption_is_partial():
    r = parse_info({"ext": "jpg", "url": CDN + "a.jpg"}, ref(), SUF, "yt-dlp")
    assert r.status == PARTIAL and r.post_type == "image" and r.caption is None
    assert any("legenda" in l.lower() for l in r.limitations)


def test_carousel_order_and_dropped_item():
    info = {"_type": "playlist", "description": CAP, "entries": [
        {"ext": "jpg", "url": CDN + "1.jpg"}, video_entry(), {"ext": "jpg", "url": "http://insecure.cdninstagram.com/x.jpg"},
        {"ext": "jpg", "url": CDN + "4.jpg"}]}
    r = parse_info(info, ref(), SUF, "yt-dlp")
    assert r.post_type == "carousel" and [m.kind for m in r.media] == ["image", "video", "image"]
    assert r.status == PARTIAL and any("1 item" in l for l in r.limitations)


def test_nothing_usable_is_unavailable():
    r = parse_info({"ext": "jpg", "url": "https://evil.com/a.jpg"}, ref(), SUF, "yt-dlp")
    assert r.status == UNAVAILABLE and not r.media


def test_long_caption_preserved_verbatim():
    long = ("emoji 🙂 " * 3000) + "\n\n#fim"
    r = parse_info({**video_entry(), "description": long}, ref(), SUF, "yt-dlp")
    assert r.caption == long


def _script(tmp_path: Path, body: str) -> str:
    p = tmp_path / "fake-yt-dlp"
    p.write_text(f"#!{sys.executable}\nimport sys, json\n{body}\n")
    p.chmod(p.stat().st_mode | stat.S_IEXEC)
    return str(p)


def test_subprocess_success_and_args_are_safe(tmp_path):
    exe = _script(tmp_path, f"""
assert sys.argv[-2] == '--' and sys.argv[-1].startswith('https://www.instagram.com/')
assert '--ignore-config' in sys.argv
print(json.dumps({{**{video_entry()!r}, 'description': {CAP!r}}}))""")
    r = YtDlpProvider(exe, SUF).resolve(ref("reel"))
    assert r.status == AVAILABLE and r.caption == CAP


def test_subprocess_login_required_is_unavailable_without_leaking_stderr(tmp_path):
    exe = _script(tmp_path, "sys.stderr.write('ERROR: login required /secret/path'); sys.exit(1)")
    r = YtDlpProvider(exe, SUF).resolve(ref())
    assert r.status == UNAVAILABLE and "secret" not in " ".join(r.limitations)


def test_subprocess_timeout(tmp_path):
    exe = _script(tmp_path, "import time; time.sleep(5)")
    with pytest.raises(ProviderError):
        YtDlpProvider(exe, SUF, timeout=0.5).resolve(ref())


def test_subprocess_garbage_output(tmp_path):
    exe = _script(tmp_path, "print('not json')")
    with pytest.raises(ProviderError):
        YtDlpProvider(exe, SUF).resolve(ref())


def test_not_installed():
    p = YtDlpProvider(None, SUF)
    assert not p.available()
    with pytest.raises(ProviderError):
        p.resolve(ref())


def test_url_with_shell_chars_never_reaches_shell(tmp_path):
    # PostRef só contém URL canônica gerada a partir do shortcode validado
    with pytest.raises(Exception):
        parse_instagram_url("https://www.instagram.com/p/ABC;rm -rf /;/")
