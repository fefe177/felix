"""Erzeugt die Glas-Optik (Frosted Glass) per Pillow.

Alle Panels und Buttons werden als Bilder komponiert: ein farbiger
Aurora-Verlauf im Hintergrund, darüber weichgezeichnete, aufgehellte
Glasflächen mit feinem Rand und Glanz – der typische Apple-„Liquid-Glass"-Look.
"""

from PIL import Image, ImageChops, ImageDraw, ImageFilter

_SS = 4  # Supersampling für glatte, runde Ecken


def rounded_mask(w, h, radius):
    """Weiche Alpha-Maske mit abgerundeten Ecken."""
    mask = Image.new("L", (w * _SS, h * _SS), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        [0, 0, w * _SS - 1, h * _SS - 1], radius=radius * _SS, fill=255)
    return mask.resize((w, h), Image.LANCZOS)


def make_wallpaper(w, h):
    """Dunkler Aurora-Verlauf mit weichen Farbwolken."""
    # Vertikaler Grundverlauf
    top = (30, 22, 54)
    bottom = (10, 9, 20)
    base = Image.new("RGB", (w, h))
    px = base.load()
    for y in range(h):
        t = y / (h - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)

    # Weiche Farbwolken additiv darüberlegen
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    blobs = [
        (int(w * 0.15), int(h * 0.12), int(w * 0.55), (78, 60, 200)),
        (int(w * 0.95), int(h * 0.08), int(w * 0.50), (196, 58, 150)),
        (int(w * 0.05), int(h * 0.85), int(w * 0.60), (36, 110, 190)),
        (int(w * 0.98), int(h * 0.95), int(w * 0.55), (120, 52, 190)),
    ]
    for cx, cy, rad, col in blobs:
        gd.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=col)
    glow = glow.filter(ImageFilter.GaussianBlur(int(w * 0.18)))
    return ImageChops.add(base, glow)


def _gloss(w, h, radius, strength):
    """Weißer Glanzverlauf von oben (wie Lichtreflex auf Glas)."""
    col = Image.new("L", (1, h), 0)
    cp = col.load()
    span = h * 0.6
    for y in range(h):
        cp[0, y] = max(0, int(strength * (1 - y / span))) if y < span else 0
    grad = col.resize((w, h))
    grad = ImageChops.multiply(grad, rounded_mask(w, h, radius))
    layer = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    layer.putalpha(grad)
    return layer


def _border(w, h, radius, alpha):
    """Feiner heller Rand rund um die Glasfläche."""
    layer = Image.new("RGBA", (w * _SS, h * _SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle(
        [0, 0, w * _SS - 1, h * _SS - 1], radius=radius * _SS,
        outline=(255, 255, 255, alpha), width=_SS)
    return layer.resize((w, h), Image.LANCZOS)


def glass_tile(source, box, radius, tint=(255, 255, 255), tint_alpha=30,
               gloss=70, border=70, blur=15):
    """Eine Glasfläche: Ausschnitt weichzeichnen, tönen, Glanz + Rand.

    ``source`` ist das Hintergrundbild, ``box`` der Bereich (x1,y1,x2,y2),
    aus dem die Unschärfe entsteht – so scheint der Hintergrund echt durch.
    """
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    crop = source.crop(box).convert("RGB")
    tile = crop.filter(ImageFilter.GaussianBlur(blur)).convert("RGBA")
    if tint_alpha > 0:
        overlay = Image.new("RGBA", (w, h), tint + (tint_alpha,))
        tile = Image.alpha_composite(tile, overlay)
    if gloss > 0:
        tile = Image.alpha_composite(tile, _gloss(w, h, radius, gloss))
    if border > 0:
        tile = Image.alpha_composite(tile, _border(w, h, radius, border))
    tile.putalpha(rounded_mask(w, h, radius))
    return tile


def switch_img(on, w=48, h=28):
    """Kleiner Glas-Umschalter (iOS-Stil), grün wenn aktiv."""
    ss = _SS
    img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = h * ss // 2
    track = (48, 180, 120, 255) if on else (118, 118, 135, 150)
    draw.rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], radius=r,
                           fill=track)
    draw.rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], radius=r,
                           outline=(255, 255, 255, 60), width=ss)
    pad = 4 * ss
    kd = h * ss - 2 * pad
    kx = (w * ss - pad - kd) if on else pad
    draw.ellipse([kx, pad, kx + kd, pad + kd], fill=(255, 255, 255, 245))
    return img.resize((w, h), Image.LANCZOS)
