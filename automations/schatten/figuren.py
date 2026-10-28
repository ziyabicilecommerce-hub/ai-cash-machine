# Figuren der Schatten-Story: die Person (mit Angst-Mimik), der Schatten (mit Gesicht) und die Hand an der Scheibe.
import math
from PIL import Image, ImageDraw, ImageFilter

W, H = 720, 1280
HAUT = (214, 219, 230)
ZEIT = [0.0]  # aktuelle Videozeit: Blinzeln, Zittern, Atmen


def leuchten(radius, farbe, staerke=255):
    g = Image.new('RGBA', (radius * 2, radius * 2), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse((radius * 0.4, radius * 0.4, radius * 1.6, radius * 1.6), fill=farbe + (staerke,))
    return g.filter(ImageFilter.GaussianBlur(radius * 0.35))


AUGE = leuchten(18, (255, 255, 255))


def glied(d, a, b, w, f):
    d.line((a, b), fill=f, width=w)
    for p in (a, b):
        d.ellipse((p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2), fill=f)


def mensch(lage, x, y, s=1.0, sitzen=True, farbe=HAUT, angst=0.0, blick=0.0, gesicht=True):
    # gefüllte Silhouette mit Angst: zittert, atmet schnell, große Augen, offener Mund, Schweiß, Hände vors Gesicht
    d = ImageDraw.Draw(lage)
    z = ZEIT[0]
    x += math.sin(z * 47) * 3.2 * angst * s + math.sin(z * 31) * 1.5 * angst * s
    atem = math.sin(z * (2.2 + 7 * angst)) * (1 + 3 * angst)
    k = lambda px, py: (x + px * s, y + py * s)
    kopf = k(blick * 7, -272 + atem * 0.4)
    d.ellipse((kopf[0] - 24 * s, kopf[1] - 28 * s, kopf[0] + 24 * s, kopf[1] + 28 * s), fill=farbe)
    d.rectangle((*k(-9, -250), *k(9, -232)), fill=farbe)
    d.polygon([k(-46, -232 + atem), k(46, -232 + atem), k(36, -120), k(-36, -120)], fill=farbe)
    if angst > 0.75:  # Hände vor den Mund
        for sx in (-1, 1):
            glied(d, k(sx * 42, -226 + atem), k(sx * 40, -170), int(22 * s), farbe)
            glied(d, k(sx * 40, -170), k(sx * 10 + blick * 7, -248), int(19 * s), farbe)
    else:
        glied(d, k(-42, -226 + atem), k(-56, -150), int(22 * s), farbe)
        glied(d, k(-56, -150), k(-20, -110), int(19 * s), farbe)
        glied(d, k(42, -226 + atem), k(56, -150), int(22 * s), farbe)
        glied(d, k(56, -150), k(22, -112), int(19 * s), farbe)
    if sitzen:
        for dx in (-16, 16):
            glied(d, k(dx, -122), k(dx + 78, -116), int(30 * s), farbe)
            glied(d, k(dx + 78, -116), k(dx + 84, -20), int(25 * s), farbe)
    else:
        for dx in (-18, 18):
            glied(d, k(dx, -122), k(dx * 1.3, -10), int(28 * s), farbe)
    if gesicht:
        gesicht_malen(d, kopf, s, angst, blick, verdeckt=angst > 0.75)


def gesicht_malen(d, kopf, s, angst, blick, verdeckt=False):
    dunkel = (22, 26, 38)
    kx, ky = kopf
    zitter = math.sin(ZEIT[0] * 60) * 1.2 * angst * s
    for ex in (-9, 9):
        ax, ay = kx + ex * s + blick * 4 * s, ky - 5 * s
        r = (2.6 + 3.2 * angst) * s
        d.ellipse((ax - r, ay - r * 1.15, ax + r, ay + r * 1.15), fill=(250, 250, 252))
        pr = max(1.2, (2.2 - 0.9 * angst) * s)
        px = ax + blick * 1.6 * s + zitter
        d.ellipse((px - pr, ay - pr, px + pr, ay + pr), fill=dunkel)
        # Augenbrauen: innen hochgezogen = Angst
        innen = -1 if ex > 0 else 1
        d.line((ax - innen * 6 * s, ay - (7 + 2 * angst) * s, ax + innen * 2 * s, ay - (7 + 6 * angst) * s), fill=dunkel, width=max(1, int(2 * s)))
    if not verdeckt:
        mh = (1.5 + 9 * angst) * s
        mw = (5 + 2 * angst) * s
        my = ky + 13 * s
        if angst < 0.3:
            d.line((kx - mw, my, kx + mw, my), fill=dunkel, width=max(1, int(2 * s)))
        else:
            d.ellipse((kx - mw + blick * 3 * s, my - mh / 2, kx + mw + blick * 3 * s, my + mh / 2), fill=dunkel)
    if angst > 0.5:  # Schweißtropfen läuft runter
        ty = ky - 14 * s + ((ZEIT[0] * 22) % 26) * s
        tx = kx + 22 * s
        d.ellipse((tx - 3 * s, ty - 3 * s, tx + 3 * s, ty + 4 * s), fill=(170, 210, 255))
        d.polygon([(tx - 2.6 * s, ty - 1 * s), (tx + 2.6 * s, ty - 1 * s), (tx, ty - 7 * s)], fill=(170, 210, 255))


ROTGLUT = leuchten(40, (255, 40, 20), 150)


def schatten(ziel, x, y, s=1.0, wink=0.0, alpha=255, augen=True):
    # langer Schatten mit Gesicht: rot glühende Augen mit Schlitzpupillen, breites Grinsen, Krallenfinger
    lage = Image.new('RGBA', ziel.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    f = (0, 0, 0, alpha)
    k = lambda px, py: (x + px * s, y + py * s)
    d.ellipse((*k(-32, -495), *k(32, -398)), fill=f)
    d.polygon([k(-36, -405), k(36, -405), k(24, -150), k(16, 0), k(-16, 0), k(-24, -150)], fill=f)
    hl = k(-60, -60)
    glied(d, k(-30, -390), hl, int(14 * s), f)
    a = -1.25 + wink
    hr = (x + 30 * s + math.cos(a) * 230 * s, y - 390 * s + math.sin(a) * 230 * s)
    glied(d, k(30, -390), hr, int(14 * s), f)
    for (hx, hy), richtung in ((hl, math.pi / 2), (hr, a)):
        for w in (-0.5, -0.17, 0.17, 0.5):
            glied(d, (hx, hy), (hx + math.cos(richtung + w) * 46 * s, hy + math.sin(richtung + w) * 46 * s), max(2, int(4 * s)), f)
    ziel.alpha_composite(lage.filter(ImageFilter.GaussianBlur(2)))
    if not augen:
        return
    gesicht = Image.new('RGBA', ziel.size, (0, 0, 0, 0))
    g = ImageDraw.Draw(gesicht)
    ga = min(255, alpha + 60)
    zu = (ZEIT[0] % 3.7) < 0.13  # blinzeln
    for ex in (-14, 14):
        cx, cy = x + ex * s, y - 455 * s
        r = ROTGLUT.resize((max(8, int(70 * s)), max(8, int(70 * s))))
        gesicht.alpha_composite(r, (int(cx - r.width / 2), int(cy - r.height / 2)))
        if zu:
            g.line((cx - 10 * s, cy, cx + 10 * s, cy), fill=(255, 240, 220, ga), width=max(1, int(2 * s)))
        else:
            o = 1 if ex > 0 else -1  # schräg nach innen unten: böser Blick
            g.polygon([(cx + o * 14 * s, cy - 5 * s), (cx, cy - 8 * s), (cx - o * 12 * s, cy + 3 * s), (cx, cy + 6 * s)], fill=(255, 245, 225, ga))
            g.ellipse((cx - 1.6 * s, cy - 5 * s, cx + 1.6 * s, cy + 4 * s), fill=(0, 0, 0, ga))
    # Grinsen: dünne helle Sichel mit Zähnen
    pts = [(x + i * s, y - 422 * s - 0.016 * (i * i) * s) for i in range(-26, 27, 2)]
    pts_u = [(px, py + 9 * s * (1 - abs(i) / 28)) for (px, py), i in zip(pts, range(-26, 27, 2))]
    g.polygon(pts + pts_u[::-1], fill=(235, 230, 215, ga))
    for (px, py), i in zip(pts, range(-26, 27, 2)):
        if i % 4 == 0:
            g.line((px, py, px, py + 9 * s), fill=(0, 0, 0, ga), width=max(1, int(1.5 * s)))
    ziel.alpha_composite(gesicht)


def hand(im, x, y, staerke):
    lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    f = (205, 210, 222, int(230 * staerke))
    d.ellipse((x - 75, y - 60, x + 75, y + 95), fill=f)
    for i, (dx, lang) in enumerate(((-62, 120), (-30, 165), (5, 180), (40, 160), (78, 95))):
        glied(d, (x + dx * 0.9, y - 30 + (40 if i == 4 else 0)), (x + dx * 1.35, y - lang + (60 if i == 4 else 0)), 30, f)
    lage = lage.filter(ImageFilter.GaussianBlur(2))
    im.paste(lage, (0, 0), lage)
