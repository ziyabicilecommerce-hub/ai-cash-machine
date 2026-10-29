# Weitere Bösewichte der Schatten-Story, gleiche Maße wie der Schatten (Füße bei y, Arm per "wink"):
# Gremlin (Flugzeug), Frau in Weiß (Haus), Hirsch-Kreatur (Wald) - jeweils mit eigener Jumpscare-Fratze.
import math
from PIL import Image, ImageDraw, ImageFilter
from figuren import A, ZEIT, W, H, glied, leuchten, _ss

GRUEN, WEISSGLUT, ROT = leuchten(40, (90, 255, 100), 170), leuchten(40, (255, 255, 255), 150), leuchten(30, (255, 30, 20), 200)


def _krallen(d, T, hand, richtung, s, f, lang=48):
    for w in (-0.5, -0.17, 0.17, 0.5):
        spitze = (hand[0] + math.cos(richtung + w) * lang * s, hand[1] + math.sin(richtung + w) * lang * s)
        glied(d, T(*hand), T(*spitze), max(2, int(3.5 * s * A)), f)


def _glut(cv, sprite, cx, cy, gr):
    g = sprite.resize((max(8, int(gr)), max(8, int(gr))))
    cv.alpha_composite(g, (int(cx - g.width / 2), int(cy - g.height / 2)))


def gremlin(ziel, x, y, s=1.0, wink=0.0, alpha=255, augen=True):
    # klein, bucklig, Fledermausohren, grün leuchtende Schlitzaugen, Maul voller Zähne
    a = -1.25 + wink
    hr = (x + 30 * s + math.cos(a) * 170 * s, y - 230 * s + math.sin(a) * 170 * s)
    hl = (x - 70 * s, y - 70 * s)
    box = (min(x - 170 * s, hr[0] - 70 * s), min(y - 420 * s, hr[1] - 70 * s), max(x + 170 * s, hr[0] + 70 * s), max(y + 30 * s, hr[1] + 70 * s))

    def zeichne(cv, T):
        S = s * A
        k = lambda px, py: T(x + px * s, y + py * s)
        d = ImageDraw.Draw(cv)
        f, dunkel = (40, 52, 38, alpha), (26, 34, 24, alpha)
        for sx in (-1, 1):
            glied(d, k(sx * 24, -110), k(sx * 50, -56), int(18 * S), dunkel)
            glied(d, k(sx * 50, -56), k(sx * 32, -4), int(14 * S), dunkel)
            _krallen(d, T, (x + sx * 32 * s, y - 4 * s), math.pi / 2 - sx * 0.6, s, dunkel, 22)
        d.ellipse((*k(-58, -250), *k(58, -96)), fill=f)
        d.ellipse((*k(-38, -296), *k(64, -196)), fill=f)
        glied(d, k(-40, -220), k(-78, -140), int(12 * S), f)
        glied(d, k(-78, -140), T(*hl), int(10 * S), f)
        glied(d, k(40, -226), T(*hr), int(11 * S), f)
        _krallen(d, T, hl, math.pi / 2, s, f)
        _krallen(d, T, hr, a, s, f)
        hx, hy = k(14, -300)
        for sx in (-1, 1):
            d.polygon([(hx + sx * 28 * S, hy - 18 * S), (hx + sx * 100 * S, hy - 78 * S), (hx + sx * 46 * S, hy + 8 * S)], fill=f)
            d.polygon([(hx + sx * 38 * S, hy - 16 * S), (hx + sx * 86 * S, hy - 62 * S), (hx + sx * 48 * S, hy - 2 * S)], fill=(90, 50, 50, alpha))
        d.ellipse((hx - 46 * S, hy - 40 * S, hx + 46 * S, hy + 40 * S), fill=f)
        if not augen:
            return cv
        for ex in (-17, 17):
            _glut(cv, GRUEN, hx + ex * S, hy - 8 * S, 60 * S)
            d.ellipse((hx + ex * S - 11 * S, hy - 14 * S, hx + ex * S + 11 * S, hy - 2 * S), fill=(210, 255, 150, alpha))
            d.ellipse((hx + ex * S - 2 * S, hy - 13 * S, hx + ex * S + 2 * S, hy - 3 * S), fill=(0, 0, 0, alpha))
        zaehne = [(hx + i * 5 * S, hy + 18 * S + (0 if i % 2 else 7 * S)) for i in range(-6, 7)]
        d.polygon([(hx - 32 * S, hy + 14 * S), (hx + 32 * S, hy + 14 * S), (hx, hy + 30 * S)], fill=(20, 0, 0, alpha))
        d.line(zaehne, fill=(235, 230, 210, alpha), width=max(1, int(3 * S)))
        return cv

    _ss(ziel, box, zeichne)


def frau(ziel, x, y, s=1.0, wink=0.0, alpha=255, augen=True):
    # große Frau in zerrissenem weißem Kleid, lange schwarze Haare vor dem Gesicht, ein Auge schaut durch
    a = -1.35 + wink * 0.8
    zuck = math.sin(ZEIT[0] * 31) * 4 if int(ZEIT[0] * 2) % 5 == 0 else 0.0
    hr = (x + 28 * s + math.cos(a) * 210 * s, y - 392 * s + math.sin(a) * 210 * s)
    hl = (x - 52 * s, y - 150 * s)
    box = (min(x - 130 * s, hr[0] - 70 * s), min(y - 520 * s, hr[1] - 70 * s), max(x + 130 * s, hr[0] + 70 * s), max(y + 30 * s, hr[1] + 70 * s))

    def zeichne(cv, T):
        S = s * A
        k = lambda px, py: T(x + px * s, y + py * s)
        d = ImageDraw.Draw(cv)
        kleid, haut, haar = (216, 214, 206, alpha), (204, 204, 198, alpha), (8, 8, 10, alpha)
        saum = [k(66 - i * 12, -6 - (i % 2) * 22) for i in range(12)]
        d.polygon([k(-34, -402), k(34, -402), k(66, -10)] + saum + [k(-66, -10)], fill=kleid)
        for i in range(5):
            d.line((*k(-20 + i * 10, -380), *k(-40 + i * 20, -30)), fill=(176, 174, 166, alpha), width=max(1, int(2 * S)))
        glied(d, k(-30, -390), T(*hl), int(10 * S), haut)
        glied(d, k(30, -392), T(*hr), int(10 * S), haut)
        for hand, r in ((hl, math.pi / 2), (hr, a)):
            for w in (-0.4, -0.13, 0.13, 0.4):
                glied(d, T(*hand), T(hand[0] + math.cos(r + w) * 34 * s, hand[1] + math.sin(r + w) * 34 * s), max(2, int(3 * S)), haut)
        hx, hy = k(zuck, -445)
        d.ellipse((hx - 28 * S, hy - 34 * S, hx + 28 * S, hy + 34 * S), fill=haut)
        d.polygon([(hx - 36 * S, hy - 20 * S), (hx, hy - 42 * S), (hx + 36 * S, hy - 20 * S), (hx + 48 * S, hy + 190 * S), (hx - 48 * S, hy + 190 * S)], fill=haar)
        for i in range(9):
            d.line((hx - 30 * S + i * 7.5 * S, hy - 20 * S, hx - 40 * S + i * 10 * S, hy + 200 * S), fill=(30, 30, 34, alpha), width=max(1, int(2 * S)))
        if augen:
            _glut(cv, WEISSGLUT, hx + 9 * S, hy - 4 * S, 40 * S)
            d.ellipse((hx + 3 * S, hy - 9 * S, hx + 15 * S, hy + 1 * S), fill=(245, 245, 240, alpha))
            d.ellipse((hx + 7 * S, hy - 7 * S, hx + 11 * S, hy - 1 * S), fill=(0, 0, 0, alpha))
        return cv

    _ss(ziel, box, zeichne)


def hirsch(ziel, x, y, s=1.0, wink=0.0, alpha=255, augen=True):
    # ausgemergelt, Rippen, Hirschschädel mit Geweih, rote Punkt-Augen, extrem lange Arme
    a = -1.2 + wink
    hr = (x + 26 * s + math.cos(a) * 260 * s, y - 400 * s + math.sin(a) * 260 * s)
    hl = (x - 70 * s, y - 40 * s)
    box = (min(x - 170 * s, hr[0] - 80 * s), min(y - 680 * s, hr[1] - 80 * s), max(x + 170 * s, hr[0] + 80 * s), max(y + 30 * s, hr[1] + 80 * s))

    def zeichne(cv, T):
        S = s * A
        k = lambda px, py: T(x + px * s, y + py * s)
        d = ImageDraw.Draw(cv)
        f, rippe, knochen = (34, 28, 24, alpha), (78, 66, 56, alpha), (226, 220, 204, alpha)
        for sx in (-1, 1):
            glied(d, k(sx * 16, -200), k(sx * 30, -100), int(12 * S), f)
            glied(d, k(sx * 30, -100), k(sx * 18, -4), int(10 * S), f)
        d.polygon([k(-30, -410), k(30, -410), k(22, -200), k(-22, -200)], fill=f)
        for i in range(5):
            d.arc((*k(-24, -390 + i * 32), *k(24, -360 + i * 32)), 200, 340, fill=rippe, width=max(1, int(3 * S)))
        glied(d, k(-28, -400), k(-62, -220), int(10 * S), f)
        glied(d, k(-62, -220), T(*hl), int(8 * S), f)
        glied(d, k(28, -402), T(*hr), int(9 * S), f)
        _krallen(d, T, hl, math.pi / 2, s, f, 58)
        _krallen(d, T, hr, a, s, f, 58)
        d.line((*k(0, -410), *k(0, -440)), fill=f, width=int(10 * S))
        d.polygon([k(-24, -500), k(24, -500), k(14, -450), k(0, -420), k(-14, -450)], fill=knochen)
        for sx in (-1, 1):  # Geweih mit Enden
            pts = [k(sx * 14, -498), k(sx * 46, -560), k(sx * 52, -630)]
            d.line([p for p in pts], fill=(190, 180, 160, alpha), width=max(2, int(6 * S)))
            for (bx, by), (ex, ey) in (((sx * 32, -532), (sx * 70, -560)), ((sx * 48, -585), (sx * 30, -640)), ((sx * 50, -610), (sx * 84, -640))):
                d.line((*k(bx, by), *k(ex, ey)), fill=(190, 180, 160, alpha), width=max(2, int(5 * S)))
        for ex in (-10, 10):
            ax, ay = k(ex, -478)
            d.ellipse((ax - 8 * S, ay - 9 * S, ax + 8 * S, ay + 9 * S), fill=(0, 0, 0, alpha))
            if augen:
                _glut(cv, ROT, ax, ay, 30 * S)
                d.ellipse((ax - 2 * S, ay - 2 * S, ax + 2 * S, ay + 2 * S), fill=(255, 60, 40, alpha))
        return cv

    _ss(ziel, box, zeichne)


ZEICHNER = {'gremlin': gremlin, 'frau': frau, 'hirsch': hirsch}


def _fratze_grund(im, lt):
    im.paste(Image.new('RGB', (W, H), (40, 0, 0) if int(lt * 12) % 2 else (0, 0, 0)))
    return 1.0 + 0.25 * min(lt / 0.25, 1), W / 2, 640


def gremlin_fratze(im, lt):
    g, cx, cy = _fratze_grund(im, lt)
    d = ImageDraw.Draw(im)
    for sx in (-1, 1):
        d.polygon([(cx + sx * 150 * g, cy - 220 * g), (cx + sx * 360 * g, cy - 560 * g), (cx + sx * 280 * g, cy - 40 * g)], fill=(40, 52, 38))
    d.ellipse((cx - 300 * g, cy - 360 * g, cx + 300 * g, cy + 360 * g), fill=(44, 58, 42))
    for ex in (-120, 120):
        gl = GRUEN.resize((int(320 * g), int(320 * g)))
        im.paste(gl, (int(cx + ex * g - gl.width / 2), int(cy - 110 * g - gl.height / 2)), gl)
        d.ellipse((cx + ex * g - 80 * g, cy - 150 * g, cx + ex * g + 80 * g, cy - 70 * g), fill=(210, 255, 150))
        d.ellipse((cx + ex * g - 10 * g, cy - 148 * g, cx + ex * g + 10 * g, cy - 72 * g), fill=(0, 0, 0))
    d.polygon([(cx - 230 * g, cy + 90 * g), (cx + 230 * g, cy + 90 * g), (cx, cy + 300 * g)], fill=(20, 0, 0))
    d.line([(cx + i * 22 * g, cy + 100 * g + (0 if i % 2 else 34 * g)) for i in range(-10, 11)], fill=(235, 230, 210), width=int(8 * g))


def frau_fratze(im, lt):
    g, cx, cy = _fratze_grund(im, lt)
    d = ImageDraw.Draw(im)
    d.ellipse((cx - 230 * g, cy - 320 * g, cx + 230 * g, cy + 340 * g), fill=(214, 212, 206))
    for ex in (-90, 90):
        d.ellipse((cx + ex * g - 56 * g, cy - 120 * g, cx + ex * g + 56 * g, cy - 20 * g), fill=(0, 0, 0))
    d.ellipse((cx - 70 * g, cy + 90 * g, cx + 70 * g, cy + 300 * g), fill=(0, 0, 0))
    spalt = 150 + 80 * min(lt / 0.4, 1)  # die Haare reißen auf
    for sx in (-1, 1):
        d.polygon([(cx + sx * spalt * g, -40), (cx + sx * 700, -40), (cx + sx * 700, H), (cx + sx * (spalt - 30) * g, H)], fill=(6, 6, 8))
    im.paste(im.filter(ImageFilter.GaussianBlur(1)))


def hirsch_fratze(im, lt):
    g, cx, cy = _fratze_grund(im, lt)
    d = ImageDraw.Draw(im)
    for sx in (-1, 1):
        d.line([(cx + sx * 90 * g, cy - 280 * g), (cx + sx * 260 * g, cy - 560 * g), (cx + sx * 300 * g, cy - 800 * g)], fill=(190, 180, 160), width=int(26 * g))
        d.line([(cx + sx * 200 * g, cy - 460 * g), (cx + sx * 380 * g, cy - 540 * g)], fill=(190, 180, 160), width=int(20 * g))
    d.polygon([(cx - 210 * g, cy - 300 * g), (cx + 210 * g, cy - 300 * g), (cx + 130 * g, cy + 150 * g), (cx, cy + 420 * g), (cx - 130 * g, cy + 150 * g)], fill=(226, 220, 204))
    for ex in (-95, 95):
        d.ellipse((cx + ex * g - 60 * g, cy - 170 * g, cx + ex * g + 60 * g, cy - 40 * g), fill=(0, 0, 0))
        rot = ROT.resize((int(120 * g), int(120 * g)))
        im.paste(rot, (int(cx + ex * g - rot.width / 2), int(cy - 105 * g - rot.height / 2)), rot)
    d.line([(cx - 20 * g, cy - 280 * g), (cx + 10 * g, cy - 200 * g), (cx - 15 * g, cy - 120 * g)], fill=(120, 110, 96), width=int(6 * g))


FRATZEN = {'gremlin': gremlin_fratze, 'frau': frau_fratze, 'hirsch': hirsch_fratze}
