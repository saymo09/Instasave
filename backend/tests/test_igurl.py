import pytest
from instasave.igurl import InvalidUrl, parse_instagram_url


@pytest.mark.parametrize("raw,kind,code", [
    ("https://www.instagram.com/p/ABC123xyz/", "post", "ABC123xyz"),
    ("https://instagram.com/reel/ABC123xyz", "reel", "ABC123xyz"),
    ("https://www.instagram.com/reels/ABC123xyz/?igsh=abc&utm_source=x#frag", "reel", "ABC123xyz"),
    ("https://www.instagram.com/tv/ABC123xyz/", "tv", "ABC123xyz"),
    ("  https://www.instagram.com/usuario.nome/p/AB-_12345/  ", "post", "AB-_12345"),
    ("HTTPS://WWW.INSTAGRAM.COM/p/ABC123xyz/", "post", "ABC123xyz"),
    ("https://www.instagram.com:443/p/ABC123xyz/", "post", "ABC123xyz"),
])
def test_valid(raw, kind, code):
    ref = parse_instagram_url(raw)
    assert ref.kind == kind and ref.shortcode == code
    assert ref.url.startswith("https://www.instagram.com/") and "?" not in ref.url and "#" not in ref.url
    assert ref.embed_url.endswith("/embed/")


@pytest.mark.parametrize("raw,code", [
    ("", "invalid_url"), ("   ", "invalid_url"), ("olá mundo", "invalid_url"),
    ("www.instagram.com/p/ABC123xyz/", "invalid_url"),
    ("http://www.instagram.com/p/ABC123xyz/", "invalid_url"),
    ("ftp://www.instagram.com/p/ABC123xyz/", "invalid_url"),
    ("javascript:alert(1)", "invalid_url"),
    ("file:///etc/passwd", "invalid_url"),
    ("data:text/html,hi", "invalid_url"),
    ("https://user:pw@www.instagram.com/p/ABC123xyz/", "invalid_url"),
    ("https://www.instagram.com@evil.com/p/ABC123xyz/", "invalid_url"),
    ("https://www.instagram.com:8443/p/ABC123xyz/", "invalid_url"),
    ("https://evil.com/p/ABC123xyz/", "unsupported_platform"),
    ("https://www.instagram.com.evil.com/p/ABC123xyz/", "unsupported_platform"),
    ("https://notinstagram.com/p/ABC123xyz/", "unsupported_platform"),
    ("https://127.0.0.1/p/ABC123xyz/", "unsupported_platform"),
    ("https://instagr.am/p/ABC123xyz/", "unsupported_platform"),
    ("https://www.instagram.com/", "unsupported_url"),
    ("https://www.instagram.com/usuario/", "unsupported_url"),
    ("https://www.instagram.com/stories/user/123/", "unsupported_url"),
    ("https://www.instagram.com/share/reel/ABCDEFG/", "unsupported_url"),
    ("https://www.instagram.com/p/AB/", "unsupported_url"),
    ("https://www.instagram.com/p/ABC123xyz/ extra", "invalid_url"),
    ("https://www.instagram.com/p/ABC123\nxyz/", "invalid_url"),
    ("https://" + "a" * 3000, "invalid_url"),
])
def test_invalid(raw, code):
    with pytest.raises(InvalidUrl) as e:
        parse_instagram_url(raw)
    assert e.value.code == code and e.value.message


def test_non_string():
    with pytest.raises(InvalidUrl):
        parse_instagram_url(None)  # type: ignore[arg-type]
