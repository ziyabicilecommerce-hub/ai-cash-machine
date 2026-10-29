# Figuren der Schatten-Story: die Person (mit Angst-Mimik), der Schatten (mit Gesicht) und die Hand an der Scheibe.
import math
from PIL import Image, ImageChops, ImageDraw, ImageFilter

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


A = 2  # Supersampling: doppelt so groß zeichnen, dann weich verkleinern = glatte Kanten


def _ton(f, k):
    return tuple(max(0, min(255, int(c * k))) for c in f[:3])


def _mix(f, g, k):
    return tuple(int(f[i] * (1 - k) + g[i] * k) for i in range(3))


def _ss(ziel, box, zeichne):
    # zeichne(cv, T) malt in doppelter Größe; T rechnet Bildkoordinaten in die Leinwand um
    bx0, by0, bx1, by1 = (int(v) for v in box)
    bw, bh = max(1, bx1 - bx0), max(1, by1 - by0)
    cv = Image.new('RGBA', (bw * A, bh * A), (0, 0, 0, 0))
    cv = zeichne(cv, lambda px, py: ((px - bx0) * A, (py - by0) * A)) or cv
    klein = cv.resize((bw, bh), Image.LANCZOS)
    sx0, sy0 = max(0, -bx0), max(0, -by0)
    sx1, sy1 = min(bw, ziel.width - bx0), min(bh, ziel.height - by0)
    if sx1 > sx0 and sy1 > sy0:
        ziel.alpha_composite(klein.crop((sx0, sy0, sx1, sy1)), (bx0 + sx0, by0 + sy0))


def _schattieren(cv, staerke=0.24):
    # oben hell, unten dunkler: gibt der flachen Figur Volumen
    r, g, b, a = cv.split()
    verlauf = Image.linear_gradient('L').resize(cv.size).point(lambda v: 255 - int(v * staerke))
    rgb = ImageChops.multiply(Image.merge('RGB', (r, g, b)), Image.merge('RGB', (verlauf,) * 3))
    return Image.merge('RGBA', (*rgb.split(), a))


def _aermel(d, a, b, w, hell, dunkel):
    glied(d, a, b, int(w + 3 * A), dunkel)
    glied(d, a, b, int(w), hell)


def mensch(lage, x, y, s=1.0, sitzen=True, farbe=HAUT, angst=0.0, blick=0.0, gesicht=True, lauf=None, schlaf=False):
    # Person im Hoodie: Kapuze, Gesicht, Bauchtasche, Kordeln, Jeans, Schuhe - zittert und atmet bei Angst
    z = ZEIT[0]
    x += (math.sin(z * 47) * 3.2 + math.sin(z * 31) * 1.5) * angst * s
    atem = math.sin(z * (2.2 + 7 * angst)) * (1 + 3 * angst)
    if lauf is not None:  # beim Rennen federt der ganze Körper
        y -= abs(math.sin(lauf)) * 10 * s

    def zeichne(cv, T):
        d = ImageDraw.Draw(cv)
        S = s * A
        k = lambda px, py: T(x + px * s, y + py * s)
        hoodie, kante, jeans, schuh = farbe, _ton(farbe, 0.78), _ton(farbe, 0.58), _ton(farbe, 0.22)
        haut = _mix(farbe, (252, 238, 228), 0.6)
        if sitzen:
            for dx, f in ((16, _ton(jeans, 0.85)), (-14, jeans)):
                glied(d, k(dx, -120), k(dx + 80, -114), int(31 * S), f)
                glied(d, k(dx + 80, -114), k(dx + 84, -26), int(25 * S), f)
                d.rounded_rectangle((*k(dx + 70, -32), *k(dx + 112, -10)), radius=int(8 * S), fill=schuh)
        else:
            for i, (dx, f) in enumerate(((16, _ton(jeans, 0.85)), (-16, jeans))):
                sw = math.sin(lauf + i * math.pi) * 0.6 if lauf is not None else 0.0
                knie = (dx + math.sin(sw) * 52, -120 + math.cos(sw) * 52)
                fuss = (knie[0] + math.sin(sw * 0.4) * 48 - (20 if sw < 0 else 0), knie[1] + 46)
                glied(d, k(dx, -120), k(*knie), int(29 * S), f)
                glied(d, k(*knie), k(*fuss), int(25 * S), f)
                d.rounded_rectangle((*k(fuss[0] - 16, fuss[1] - 4), *k(fuss[0] + 22, fuss[1] + 16)), radius=int(8 * S), fill=schuh)
        top = -230 + atem
        d.rounded_rectangle((*k(-46, top), *k(46, -114)), radius=int(24 * S), fill=kante)
        d.rounded_rectangle((*k(-43, top + 2), *k(43, -116)), radius=int(22 * S), fill=hoodie)
        d.rounded_rectangle((*k(-43, -132), *k(43, -114)), radius=int(8 * S), fill=kante)
        d.rounded_rectangle((*k(-25, -172), *k(25, -138)), radius=int(10 * S), outline=kante, width=max(1, int(2.5 * S)))
        for sx in (-7, 7):
            d.line((*k(sx, top + 6), *k(sx * 1.25, top + 36)), fill=kante, width=max(1, int(2.2 * S)))
            ex, ey = k(sx * 1.25, top + 38)
            d.ellipse((ex - 2.4 * S, ey - 2.4 * S, ex + 2.4 * S, ey + 2.4 * S), fill=kante)
        kx, ky = k(blick * 7, -270 + atem * 0.4)
        fx, fy = kx + blick * 5 * S, ky + 5 * S
        haende_vorm_mund = angst > 0.75
        if not haende_vorm_mund:
            for sx in (-1, 1):
                schw = math.sin(lauf + (sx > 0) * math.pi) * 34 if lauf is not None else 0.0
                ell, hand_ = ((sx * 50 + schw, -165), (sx * 34 + schw * 1.6, -190)) if lauf is not None else ((sx * 56, -152), (sx * 20, -118))
                _aermel(d, k(sx * 42, top + 8), k(*ell), 21 * S, hoodie, kante)
                _aermel(d, k(*ell), k(*hand_), 18 * S, hoodie, kante)
                hx, hy = k(hand_[0] - sx * 2, hand_[1] + 2)
                d.ellipse((hx - 9 * S, hy - 8 * S, hx + 9 * S, hy + 8 * S), fill=haut)
        d.ellipse((kx - 36 * S, ky - 39 * S, kx + 36 * S, ky + 35 * S), fill=kante)
        d.ellipse((kx - 33 * S, ky - 36 * S, kx + 33 * S, ky + 32 * S), fill=hoodie)
        d.ellipse((fx - 22 * S, fy - 26 * S, fx + 22 * S, fy + 24 * S), fill=_ton(hoodie, 0.55))
        d.ellipse((fx - 20 * S, fy - 23 * S, fx + 20 * S, fy + 23 * S), fill=haut)
        d.chord((fx - 21 * S, fy - 32 * S, fx + 21 * S, fy - 10 * S), 180, 360, fill=_ton(haut, 0.82))
        if gesicht:
            gesicht_malen(d, (fx, fy), S, angst, blick, verdeckt=haende_vorm_mund, schlaf=schlaf)
        if haende_vorm_mund:
            for sx in (-1, 1):
                _aermel(d, k(sx * 42, top + 8), k(sx * 44, -168), 21 * S, hoodie, kante)
                _aermel(d, k(sx * 44, -168), (fx + sx * 11 * S, fy + 16 * S), 18 * S, hoodie, kante)
                d.ellipse((fx + sx * 11 * S - 10 * S, fy + 8 * S, fx + sx * 11 * S + 10 * S, fy + 24 * S), fill=haut)
        return _schattieren(cv)

    _ss(lage, (x - 110 * s, y - 330 * s, x + 150 * s, y + 10 * s), zeichne)


def gesicht_malen(d, kopf, s, angst, blick, verdeckt=False, schlaf=False):
    dunkel = (22, 26, 38)
    kx, ky = kopf
    if schlaf:  # geschlossene Augen, entspannter Mund - merkt nichts
        for ex in (-9, 9):
            d.arc((kx + ex * s - 5 * s, ky - 9 * s, kx + ex * s + 5 * s, ky - 1 * s), 20, 160, fill=dunkel, width=max(1, int(2 * s)))
        d.line((kx - 3 * s, ky + 13 * s, kx + 3 * s, ky + 13 * s), fill=dunkel, width=max(1, int(2 * s)))
        return
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
    # langer Schatten: leicht gebückt, rauchige Ränder, lange Arme mit Krallen, rot glühende Augen, breites Grinsen
    a = -1.25 + wink
    hl = (x - 62 * s, y - 70 * s)
    hr = (x + 30 * s + math.cos(a) * 235 * s, y - 392 * s + math.sin(a) * 235 * s)
    box = (min(x - 120 * s, hr[0] - 80 * s), min(y - 540 * s, hr[1] - 80 * s), max(x + 120 * s, hr[0] + 80 * s), max(y + 30 * s, hr[1] + 80 * s))

    def zeichne(cv, T):
        S = s * A
        k = lambda px, py: T(x + px * s, y + py * s)
        rauch = Image.new('RGBA', cv.size, (0, 0, 0, 0))
        rd = ImageDraw.Draw(rauch)
        for i in range(9):  # Rauchfetzen steigen an den Rändern auf
            seite = -1 if i % 2 else 1
            hoehe = -60 - ((ZEIT[0] * 40 + i * 53) % 380)
            rx, ry = k(seite * (30 + (i * 7) % 18), hoehe)
            r = (14 + (i * 5) % 12) * S
            rd.ellipse((rx - r, ry - r, rx + r, ry + r), fill=(0, 0, 0, int(alpha * 0.45)))
        cv.alpha_composite(rauch.filter(ImageFilter.GaussianBlur(7 * A)))
        koerper = Image.new('RGBA', cv.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(koerper)
        f = (4, 4, 6, alpha)
        d.ellipse((*k(-30, -505), *k(42, -398)), fill=f)
        d.polygon([k(-40, -405), k(40, -408), k(32, -300), k(27, -150), k(22, -45), k(30, 0), k(10, -4), k(2, -34),
                   k(-8, -4), k(-30, 0), k(-21, -45), k(-26, -150), k(-31, -300)], fill=f)
        glied(d, k(-32, -390), k(-58, -250), int(13 * S), f)
        glied(d, k(-58, -250), T(*hl), int(11 * S), f)
        glied(d, k(32, -392), T(*hr), int(12 * S), f)
        for (hx, hy), richtung in ((hl, math.pi / 2), (hr, a)):
            for w in (-0.55, -0.2, 0.15, 0.5):
                spitze = (hx + math.cos(richtung + w) * 52 * s, hy + math.sin(richtung + w) * 52 * s)
                glied(d, T(hx, hy), T(*spitze), max(2, int(4 * S)), f)
                krall = (spitze[0] + math.cos(richtung + w + 0.6) * 10 * s, spitze[1] + math.sin(richtung + w + 0.6) * 10 * s)
                d.line((*T(*spitze), *T(*krall)), fill=f, width=max(1, int(2.5 * S)))
        cv.alpha_composite(koerper.filter(ImageFilter.GaussianBlur(1.2 * A)))
        if not augen:
            return cv
        g = ImageDraw.Draw(cv)
        ga = min(255, alpha + 60)
        zu = (ZEIT[0] % 3.7) < 0.13  # blinzeln
        for ex in (-14, 14):
            cx, cy = k(ex + 6, -458)
            r = ROTGLUT.resize((max(8, int(70 * S)), max(8, int(70 * S))))
            cv.alpha_composite(r, (int(cx - r.width / 2), int(cy - r.height / 2)))
            if zu:
                g.line((cx - 10 * S, cy, cx + 10 * S, cy), fill=(255, 240, 220, ga), width=max(1, int(2 * S)))
            else:
                o = 1 if ex > 0 else -1  # schräg nach innen unten: böser Blick
                g.polygon([(cx + o * 14 * S, cy - 5 * S), (cx, cy - 8 * S), (cx - o * 12 * S, cy + 3 * S), (cx, cy + 6 * S)], fill=(255, 245, 225, ga))
                g.ellipse((cx - 1.6 * S, cy - 5 * S, cx + 1.6 * S, cy + 4 * S), fill=(0, 0, 0, ga))
        mx, my = k(6, -425)
        pts = [(mx + i * S, my - 0.016 * (i * i) * S) for i in range(-26, 27, 2)]
        pts_u = [(px, py + 9 * S * (1 - abs(i) / 28)) for (px, py), i in zip(pts, range(-26, 27, 2))]
        g.polygon(pts + pts_u[::-1], fill=(235, 230, 215, ga))
        for (px, py), i in zip(pts, range(-26, 27, 2)):
            if i % 4 == 0:
                g.line((px, py, px, py + 9 * S), fill=(0, 0, 0, ga), width=max(1, int(1.5 * S)))
        return cv

    _ss(ziel, box, zeichne)


def hand(im, x, y, staerke):
    lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    f = (205, 210, 222, int(230 * staerke))
    d.ellipse((x - 75, y - 60, x + 75, y + 95), fill=f)
    for i, (dx, lang) in enumerate(((-62, 120), (-30, 165), (5, 180), (40, 160), (78, 95))):
        glied(d, (x + dx * 0.9, y - 30 + (40 if i == 4 else 0)), (x + dx * 1.35, y - lang + (60 if i == 4 else 0)), 30, f)
    lage = lage.filter(ImageFilter.GaussianBlur(2))
    im.paste(lage, (0, 0), lage)
