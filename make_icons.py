"""Gera os ícones PNG do PWA (Pillow). Uso: python3 scripts/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
A, B = (139, 92, 246), (236, 72, 153)


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(round(A[i] + (B[i] - A[i]) * t) for i in range(3))
    return img


def glyph(size: int, scale: float) -> Image.Image:
    S = size * 4  # supersampling
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = S / 64 * scale
    off = S * (1 - scale) / 2
    p = lambda x, y: (off + x * u, off + y * u)
    w = int(5 * u)
    d.line([p(32, 14), p(32, 38)], fill="white", width=w)
    d.line([p(21, 29), p(32, 40), p(43, 29)], fill="white", width=w, joint="curve")
    d.line([p(17, 48), p(47, 48)], fill="white", width=w)
    for c in (p(32, 14), p(21, 29), p(43, 29), p(17, 48), p(47, 48)):
        d.ellipse([c[0] - w / 2, c[1] - w / 2, c[0] + w / 2, c[1] + w / 2], fill="white")
    return im.resize((size, size), Image.LANCZOS)


def icon(size: int, scale: float, rounded: bool) -> Image.Image:
    base = gradient(size).convert("RGBA")
    base.alpha_composite(glyph(size, scale))
    if rounded:
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=size * 4 // 4, fill=255)
        base.putalpha(mask.resize((size, size), Image.LANCZOS))
    return base


icon(192, 1.0, True).save(OUT / "icon-192.png")
icon(512, 1.0, True).save(OUT / "icon-512.png")
icon(512, 0.62, False).save(OUT / "icon-maskable-512.png")  # área segura para máscara
ap = icon(180, 0.9, False).convert("RGB")
ap.save(OUT / "apple-touch-icon.png")
(OUT / "icon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    '<stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#EC4899"/></linearGradient></defs>'
    '<rect width="64" height="64" rx="16" fill="url(#g)"/><path d="M32 14v24M21 29l11 11 11-11" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
    '<path d="M17 48h30" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>\n'
)
print("icons ok")
