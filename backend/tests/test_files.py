import zipfile
from pathlib import Path

import pytest
from instasave.mediafile import safe_filename, sniff
from instasave.zipbuilder import build_zip


@pytest.mark.parametrize("stem,ext,expected", [
    ("../../etc/passwd", "jpg", "etc_passwd.jpg"),
    ("..\\..\\win", "mp4", "win.mp4"),
    ("", "jpg", "instasave.jpg"),
    (".hidden", "png", "hidden.png"),
    ("café ☕ foto", "JPG", "cafe_foto.jpg"),
    ("a" * 500, "jpg", "a" * 60 + ".jpg"),
    ("x", "../../sh", "x.sh"),
])
def test_safe_filename(stem, ext, expected):
    assert safe_filename(stem, ext) == expected


def test_sniff():
    assert sniff(b"\xff\xd8\xff\xe0")[:2] == ("image", "image/jpeg")
    assert sniff(b"\x89PNG\r\n\x1a\n")[2] == "png"
    assert sniff(b"RIFF\x00\x00\x00\x00WEBP")[2] == "webp"
    assert sniff(b"\x00\x00\x00\x18ftypmp42")[:2] == ("video", "video/mp4")
    assert sniff(b"<html><script>") is None
    assert sniff(b"MZ\x90\x00") is None
    assert sniff(b"") is None


def test_zip_slip_and_duplicates(tmp_path: Path):
    f1 = tmp_path / "a.bin"; f1.write_bytes(b"1")
    f2 = tmp_path / "b.bin"; f2.write_bytes(b"2")
    out = tmp_path / "o.zip"
    build_zip(out, [("../../evil.jpg", f1), ("/abs/path/x.jpg", f2), ("../../evil.jpg", f2)])
    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        assert z.testzip() is None
    assert len(names) == len(set(names)) == 3
    assert all("/" not in n and ".." not in n and not n.startswith(".") for n in names)
