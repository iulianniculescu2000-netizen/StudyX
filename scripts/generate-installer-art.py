#!/usr/bin/env python
"""
Desenează imaginile expertului de instalare (build/sidebar.bmp, build/header.bmp) cu sigla StudyX.
Rulare: python scripts/generate-installer-art.py   (cere Pillow; fonturile Segoe UI din Windows)

BMP pe 24 de biți, cum cere NSIS: bara laterală 164x314, antetul 150x57. Desenat la 4x și redus, pentru margini fine.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'build')
FONTS = r'C:\Windows\Fonts'
SS = 4  # supraeșantionare

BG_TOP = (10, 11, 16)
BG_BOTTOM = (14, 22, 52)
BLUE = (10, 132, 255)
VIOLET = (94, 92, 230)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), int(size * SS))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(w, h, top, bottom):
    img = Image.new('RGB', (w, h), top)
    px = img.load()
    for y in range(h):
        color = lerp(top, bottom, (y / max(1, h - 1)) ** 1.4)
        for x in range(w):
            px[x, y] = color
    return img


def glow(size, center, radius, color, strength):
    layer = Image.new('RGB', size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=tuple(int(c * strength) for c in color))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.55))


def _screen(a, b):
    pa, pb = a.load(), b.load()
    out = Image.new('RGB', a.size)
    po = out.load()
    for y in range(a.size[1]):
        for x in range(a.size[0]):
            r1, g1, b1 = pa[x, y]
            r2, g2, b2 = pb[x, y]
            po[x, y] = (min(255, r1 + r2), min(255, g1 + g2), min(255, b1 + b2))
    return out


def draw_mark(canvas, left, top, size, dark_tile=True):
    """Cartea deschisă cu pulsul EKG, ca în Logo.tsx (viewBox 200)."""
    d = ImageDraw.Draw(canvas)
    k = size / 200.0

    def P(x, y):
        return (left + x * k, top + y * k)

    if dark_tile:
        d.rounded_rectangle((left, top, left + size, top + size), radius=52 * k, fill=(15, 15, 18), outline=(52, 54, 66), width=max(1, int(2 * k)))
    d.polygon([P(40, 56), P(46, 50), P(94, 54), P(94, 150), P(46, 154), P(40, 148)], fill=(255, 255, 255))
    d.polygon([P(106, 54), P(154, 50), P(160, 56), P(160, 148), P(154, 154), P(106, 150)], fill=(255, 255, 255))
    for y, x2 in ((82, 84), (93, 84), (104, 72)):
        d.line([P(52, y), P(x2, y)], fill=(228, 228, 232), width=max(1, int(2.5 * k)))
    pulse = [P(112, 108), P(122, 108), P(125, 95), P(128, 76), P(131, 134), P(135, 108), P(152, 108)]
    d.line(pulse, fill=BLUE, width=max(2, int(5 * k)), joint='curve')
    r = 5 * k
    cx, cy = P(128, 76)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=VIOLET)


def text_center(d, x, y, text, fnt, fill):
    w = d.textlength(text, font=fnt)
    d.text((x - w / 2, y), text, font=fnt, fill=fill)


def sidebar():
    w, h = 164 * SS, 314 * SS
    img = vertical_gradient(w, h, BG_TOP, BG_BOTTOM)
    img = _screen(img, glow((w, h), (w // 2, int(h * 0.98)), 120 * SS, BLUE, 0.55))
    img = _screen(img, glow((w, h), (int(w * 0.5), int(h * 0.22)), 70 * SS, VIOLET, 0.30))
    d = ImageDraw.Draw(img)
    mark = 86 * SS
    draw_mark(img, (w - mark) // 2, 40 * SS, mark)
    d = ImageDraw.Draw(img)
    text_center(d, w / 2, 142 * SS, 'StudyX', font('segoeuib.ttf', 25), (255, 255, 255))
    text_center(d, w / 2, 176 * SS, 'ÎNVAȚĂ. REPETĂ.', font('seguisb.ttf', 8.5), (150, 170, 215))
    text_center(d, w / 2, 190 * SS, 'REUȘEȘTE.', font('seguisb.ttf', 8.5), (150, 170, 215))
    d.line([(w / 2 - 14 * SS, 214 * SS), (w / 2 + 14 * SS, 214 * SS)], fill=(10, 132, 255), width=2 * SS)
    text_center(d, w / 2, 280 * SS, 'Versiunea 1.0', font('segoeui.ttf', 9), (170, 186, 225))
    return img.resize((164, 314), Image.LANCZOS)


def header():
    w, h = 150 * SS, 57 * SS
    img = Image.new('RGB', (w, h), (255, 255, 255))
    mark = 40 * SS
    draw_mark(img, 12 * SS, (h - mark) // 2, mark)
    d = ImageDraw.Draw(img)
    d.text((60 * SS, 11 * SS), 'StudyX', font=font('segoeuib.ttf', 19), fill=(20, 22, 30))
    d.text((61 * SS, 36 * SS), 'versiunea 1.0', font=font('segoeui.ttf', 9), fill=(110, 116, 132))
    return img.resize((150, 57), Image.LANCZOS)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sidebar().save(os.path.join(OUT, 'sidebar.bmp'), 'BMP')
    header().save(os.path.join(OUT, 'header.bmp'), 'BMP')
    print('imagini scrise in build/')
