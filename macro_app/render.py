"""Rendering-Helfer im Apple-Design (helle, cleane Oberfläche).

Erzeugt weiche Schatten, weiße Karten mit abgerundeten Ecken, gefüllte
Buttons und iOS-typische Bedienelemente – der klare, ruhige Apple-Look.
"""

from PIL import Image, ImageDraw, ImageFilter

_SS = 4  # Supersampling für glatte Rundungen


def rounded_mask(w, h, radius):
    mask = Image.new("L", (w * _SS, h * _SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, w * _SS - 1, h * _SS - 1], radius=radius * _SS, fill=255)
    return mask.resize((w, h), Image.LANCZOS)


def make_background(w, h):
    """Sehr dezenter heller Verlauf (iOS-Systemhintergrund)."""
    top = (247, 247, 250)
    bottom = (236, 236, 241)
    col = Image.new("RGB", (1, h))
    pix = col.load()
    for y in range(h):
        t = y / (h - 1)
        pix[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t)
                          for i in range(3))
    return col.resize((w, h))


def _vgradient(w, h, top, bottom):
    """Vertikaler Farbverlauf als RGBA-Bild."""
    col = Image.new("RGB", (1, h))
    pix = col.load()
    for y in range(h):
        t = y / max(1, h - 1)
        pix[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t)
                          for i in range(3))
    return col.resize((w, h)).convert("RGBA")


def make_pill(w, h, radius, fill=None, pad=16, shadow_alpha=38, shadow_blur=9,
              shadow_dy=4, border=None, gradient=None):
    """Abgerundetes Rechteck mit weichem Schatten (Karte oder Button).

    ``fill`` ist eine Farbe, alternativ ``gradient=(oben, unten)`` für einen
    vertikalen Verlauf. Rückgabe: (RGBA-Kachel, pad) – die Kachel ist ringsum
    um ``pad`` größer (Platz für den Schatten).
    """
    tw, th = w + 2 * pad, h + 2 * pad
    tile = Image.new("RGBA", (tw, th), (0, 0, 0, 0))

    if shadow_alpha > 0:
        shadow = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            [pad, pad + shadow_dy, pad + w - 1, pad + shadow_dy + h - 1],
            radius=radius, fill=(0, 0, 0, shadow_alpha))
        tile = Image.alpha_composite(tile, shadow.filter(
            ImageFilter.GaussianBlur(shadow_blur)))

    if gradient is not None:
        fill_img = _vgradient(w, h, gradient[0], gradient[1])
    else:
        if len(fill) == 3:
            fill = fill + (255,)
        fill_img = Image.new("RGBA", (w, h), fill)
    card = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    card.paste(fill_img, (pad, pad), rounded_mask(w, h, radius))
    tile = Image.alpha_composite(tile, card)

    if border is not None:
        layer = Image.new("RGBA", (tw * _SS, th * _SS), (0, 0, 0, 0))
        ImageDraw.Draw(layer).rounded_rectangle(
            [pad * _SS, pad * _SS, (pad + w) * _SS - 1, (pad + h) * _SS - 1],
            radius=radius * _SS, outline=border, width=_SS)
        tile = Image.alpha_composite(tile, layer.resize((tw, th),
                                                        Image.LANCZOS))
    return tile, pad


def app_icon(size=52, radius=15):
    """App-Kachel im Squircle-Stil: blauer Verlauf mit weißem Aufnahme-Symbol."""
    tile, pad = make_pill(size, size, radius, gradient=((92, 152, 255),
                          (58, 78, 240)), shadow_alpha=55, shadow_blur=11,
                          shadow_dy=5)
    ss = _SS
    glyph = Image.new("RGBA", (tile.width * ss, tile.height * ss),
                      (0, 0, 0, 0))
    draw = ImageDraw.Draw(glyph)
    cx = (pad + size / 2) * ss
    cy = (pad + size / 2) * ss
    ring = size * 0.30 * ss
    draw.ellipse([cx - ring, cy - ring, cx + ring, cy + ring],
                 outline=(255, 255, 255, 235), width=int(size * 0.085 * ss))
    dot = size * 0.12 * ss
    draw.ellipse([cx - dot, cy - dot, cx + dot, cy + dot],
                 fill=(255, 255, 255, 255))
    glyph = glyph.resize(tile.size, Image.LANCZOS)
    return Image.alpha_composite(tile, glyph), pad


def frosted_rect(w, h, radius, alpha=235, border_alpha=90):
    """Milchglas-Fläche: halbtransparentes Weiß mit feinem hellen Rand."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img.paste(Image.new("RGBA", (w, h), (255, 255, 255, alpha)), (0, 0),
              rounded_mask(w, h, radius))
    layer = Image.new("RGBA", (w * _SS, h * _SS), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(
        [0, 0, w * _SS - 1, h * _SS - 1], radius=radius * _SS,
        outline=(255, 255, 255, border_alpha), width=_SS)
    return Image.alpha_composite(img, layer.resize((w, h), Image.LANCZOS))


def glass_icon(size=46, radius=13):
    """Gläserne App-Kachel (für die Hero-Karte): weiß-transluzent mit Symbol."""
    base = frosted_rect(size, size, radius, alpha=48, border_alpha=120)
    glyph = Image.new("RGBA", (size * _SS, size * _SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glyph)
    c = size * _SS / 2
    ring = size * 0.30 * _SS
    draw.ellipse([c - ring, c - ring, c + ring, c + ring],
                 outline=(255, 255, 255, 255), width=int(size * 0.09 * _SS))
    dot = size * 0.12 * _SS
    draw.ellipse([c - dot, c - dot, c + dot, c + dot],
                 fill=(255, 255, 255, 255))
    return Image.alpha_composite(base, glyph.resize(base.size, Image.LANCZOS))


def stepper_bg(w=94, h=30, radius=8, fill=(233, 233, 236),
               divider=(198, 198, 204)):
    """iOS-Stepper: graues, abgerundetes Feld mit Trennlinie in der Mitte."""
    img = Image.new("RGBA", (w * _SS, h * _SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, w * _SS - 1, h * _SS - 1],
                           radius=radius * _SS, fill=fill + (255,))
    cx = w * _SS // 2
    draw.line([cx, int(h * _SS * 0.24), cx, int(h * _SS * 0.76)],
              fill=divider + (255,), width=_SS)
    return img.resize((w, h), Image.LANCZOS)


def apple_switch(on, w=51, h=31):
    """iOS-Umschalter: grün wenn aktiv, hellgrau wenn aus; weißer Knopf."""
    img = Image.new("RGBA", (w * _SS, h * _SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = h * _SS // 2
    track = (52, 199, 89, 255) if on else (229, 229, 234, 255)
    draw.rounded_rectangle([0, 0, w * _SS - 1, h * _SS - 1], radius=r,
                           fill=track)
    pad = 2 * _SS
    kd = h * _SS - 2 * pad
    kx = (w * _SS - pad - kd) if on else pad
    # weicher Knopfschatten
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        [kx, pad + _SS, kx + kd, pad + kd + _SS], fill=(0, 0, 0, 60))
    img = Image.alpha_composite(img, shadow.filter(
        ImageFilter.GaussianBlur(3 * _SS)))
    ImageDraw.Draw(img).ellipse([kx, pad, kx + kd, pad + kd],
                                fill=(255, 255, 255, 255))
    return img.resize((w, h), Image.LANCZOS)
