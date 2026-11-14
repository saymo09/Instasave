"""Servidor de TESTE (e2e): provedor e rede com fixtures. Nunca usado em produção."""
import io
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import uvicorn
from PIL import Image, ImageDraw

from instasave.app import create_app
from instasave.config import Settings
from instasave.models import AVAILABLE, PARTIAL, UNAVAILABLE, ProviderResult, RawMedia
from instasave.netsafe import FetchError, Response

CDN = "https://scontent.cdninstagram.com/"
CAPTION = "Legenda de teste 🎉✨\n\nSegunda linha com #hashtag e #outra\n" + "texto longo " * 60


def jpeg(color, text):
    im = Image.new("RGB", (640, 640), color)
    ImageDraw.Draw(im).text((20, 20), text, fill="white")
    b = io.BytesIO(); im.save(b, "JPEG"); return b.getvalue()


def mp4():
    try:
        out = subprocess.run(["ffmpeg", "-v", "quiet", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=1",
                              "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "-"],
                             capture_output=True, timeout=20, check=True).stdout
        if out:
            return out
    except Exception:
        pass
    return b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 400


FILES = {
    CDN + "img1.jpg": jpeg("#7c3aed", "imagem 1"), CDN + "img2.jpg": jpeg("#be185d", "imagem 2"),
    CDN + "img3.jpg": jpeg("#0e7490", "imagem 3"), CDN + "t.jpg": jpeg("#333333", "thumb video"),
    CDN + "vid.mp4": mp4(),
}


class Fetcher:
    def fetch(self, url):
        body = FILES.get(url)
        if body is None:
            raise FetchError("connection_failed")
        return Response(200, {"content-length": str(len(body))}, iter([body[i:i + 4096] for i in range(0, len(body), 4096)]), lambda: None)


class Provider:
    name = "fixture"

    def available(self):
        return True

    def resolve(self, ref):
        c = ref.shortcode
        if c == "IMAGE0001":
            return ProviderResult(AVAILABLE, "image", CAPTION, "autor.teste", None, [RawMedia("image", CDN + "img1.jpg")], [], self.name)
        if c == "REEL00001":
            return ProviderResult(AVAILABLE, "reel", CAPTION, "autor.teste", 1.0, [RawMedia("video", CDN + "vid.mp4", CDN + "t.jpg")], [], self.name)
        if c == "CAROUSEL1":
            m = [RawMedia("image", CDN + "img1.jpg"), RawMedia("video", CDN + "vid.mp4", CDN + "t.jpg"), RawMedia("image", CDN + "img2.jpg"), RawMedia("image", CDN + "img3.jpg")]
            return ProviderResult(AVAILABLE, "carousel", CAPTION, "autor.teste", None, m, [], self.name)
        if c == "PARTIAL01":
            return ProviderResult(PARTIAL, "image", None, None, None, [RawMedia("image", CDN + "img2.jpg")], ["A legenda não pôde ser obtida."], self.name)
        return ProviderResult(UNAVAILABLE, limitations=["O Instagram não permitiu obter esta publicação por acesso público."], provider=self.name)


if __name__ == "__main__":
    port = int(sys.argv[1])
    s = replace(Settings.from_env(), resolve_per_min=1000, media_per_min=1000)
    uvicorn.run(create_app(s, [Provider()], Fetcher()), host="127.0.0.1", port=port, log_level="warning")
