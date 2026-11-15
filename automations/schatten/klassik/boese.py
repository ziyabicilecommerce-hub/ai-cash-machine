# Weitere Bösewichte der Schatten-Story, gleiche Maße wie der Schatten (Füße bei y, Arm per "wink"):
# Gremlin (Flugzeug), Frau in Weiß (Haus), Hirsch-Kreatur (Wald) - jeweils mit eigener Jumpscare-Fratze.
# Gezeichnet mit Licht und Schatten, Knochen, Zähnen, Haaren und kleinen Bewegungen (Atmen, Zucken, Schwanken).
import math
import random
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from figuren import A, ZEIT, W, H, glied, leuchten, _ss, _schattieren

GRUEN, WEISSGLUT, ROT = leuchten(40, (150, 255, 90), 190), leuchten(40, (255, 255, 255), 150), leuchten(30, (255, 30, 20), 220)


def _f(farbe, alpha, k=1.0):
    return tuple(min(255, int(c * k)) for c in farbe) + (alpha,)


def _glut(cv, sprite, cx, cy, gr):
    g = sprite.resize((max(8, int(gr)), max(8, int(gr))))
    cv.alpha_composite(g, (int(cx - g.width / 2), int(cy - g.height / 2)))


def _krallen(d, T, hand, richtung, s, f, lang=48, spitze=(30, 26, 22, 255)):
    # lange Finger mit Knöchel und dunkler, gebogener Kralle am Ende
    for w in (-0.5, -0.17, 0.17, 0.5):
        mitte = (hand[0] + math.cos(richtung + w) * lang * 0.55 * s, hand[1] + math.sin(richtung + w) * lang * 0.55 * s)
        ende = (mitte[0] + math.cos(richtung + w * 1.4) * lang * 0.45 * s, mitte[1] + math.sin(richtung + w * 1.4) * lang * 0.45 * s)
        glied(d, T(*hand), T(*mitte), max(2, int(4.5 * s * A)), f)
        glied(d, T(*mitte), T(*ende), max(2, int(3.5 * s * A)), f)
        haken = (ende[0] + math.cos(richtung + w + 0.9) * 14 * s, ende[1] + math.sin(richtung + w + 0.9) * 14 * s)
        glied(d, T(*ende), T(*haken), max(1, int(2.5 * s * A)), spitze)


def _zaehne(d, x0, x1, y, hoehe, n, S, farbe, unten=False, wackel=0.0):
    # spitze, ungleich lange Zähne zwischen x0 und x1
    breite = (x1 - x0) / n
    for i in range(n):
        h = hoehe * (0.6 + 0.4 * ((i * 7) % 5) / 4) * (1 - 0.5 * abs(i - n / 2) / (n / 2))
        bx = x0 + i * breite
        r = -1 if unten else 1
        d.polygon([(bx, y), (bx + breite, y), (bx + breite * 0.5 + wackel, y + r * h)], fill=farbe)


def gremlin(ziel, x, y, s=1.0, wink=0.0, alpha=255, augen=True):
    # bucklig und dürr, Stacheln auf dem Rücken, zerfetzte Fledermausohren, Schwanz,
    # riesiges Maul von Ohr zu Ohr voller Nadelzähne, gelb-grüne Schlitzaugen
    z = ZEIT[0]
    atem = math.sin(z * 5) * 4
    zuck = math.sin(z * 37) * 6 if int(z * 3) % 7 == 0 else 0.0
    a = -1.25 + wink
    hr = (x + 40 * s + math.cos(a) * 190 * s, y - 210 * s + math.sin(a) * 190 * s)
    hl = (x - 96 * s, y - 40 * s)
    box = (min(x - 230 * s, hr[0] - 90 * s), min(y - 440 * s, hr[1] - 90 * s), max(x + 200 * s, hr[0] + 90 * s), max(y + 30 * s, hr[1] + 90 * s))

    def zeichne(cv, T):
        S = s * A
        k = lambda px, py: T(x + px * s, y + py * s)
        haut, dunkel, hell, innen = (64, 80, 46), (34, 44, 26), (104, 118, 70), (120, 46, 52)
        koerper = Image.new('RGBA', cv.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(koerper)
        schw = math.sin(z * 2.2) * 30  # Schwanz peitscht langsam
        pts = [k(-30, -120), k(-110, -80), k(-170, -110 + schw * 0.5), k(-200, -170 + schw), k(-180, -210 + schw)]
        for i in range(len(pts) - 1):
            glied(d, pts[i], pts[i + 1], int((14 - i * 3) * S), _f(dunkel, alpha))
        d.polygon([pts[-1], (pts[-1][0] - 16 * S, pts[-1][1] - 26 * S), (pts[-1][0] + 14 * S, pts[-1][1] - 14 * S)], fill=_f(dunkel, alpha))
        for sx in (-1, 1):  # Beine wie bei einem Hund: Knie vorne, Ferse hinten
            glied(d, k(sx * 26, -116), k(sx * 64, -64), int(20 * S), _f(dunkel, alpha))
            glied(d, k(sx * 64, -64), k(sx * 44, -26), int(15 * S), _f(dunkel, alpha))
            glied(d, k(sx * 44, -26), k(sx * 62, -4), int(12 * S), _f(dunkel, alpha))
            d.ellipse((*k(sx * 64 - 12, -76), *k(sx * 64 + 12, -52)), fill=_f(haut, alpha))  # Kniescheibe
            _krallen(d, T, (x + sx * 62 * s, y - 4 * s), math.pi / 2 - sx * 0.9, s, _f(dunkel, alpha), 26)
        d.polygon([k(-70, -150), k(-58, -236 + atem), k(-10, -282 + atem), k(60, -262 + atem), k(72, -170), k(46, -104), k(-46, -104)], fill=_f(haut, alpha))
        d.ellipse((*k(-36, -228 + atem), *k(40, -110)), fill=_f(hell, alpha))  # Bauch
        for i in range(4):  # Rippen schimmern durch
            d.arc((*k(-34, -226 + i * 20 + atem), *k(38, -196 + i * 20 + atem)), 200, 340, fill=_f(dunkel, alpha), width=max(1, int(2.5 * S)))
        for i in range(6):  # Stacheln auf Buckel und Schultern
            bx, by = -62 + i * 10, -232 - i * 9 + atem
            d.polygon([k(bx - 9, by + 6), k(bx - 22, by - 34 + (i % 2) * 8), k(bx + 8, by)], fill=_f(dunkel, alpha))
        glied(d, k(-50, -230), k(-100, -140), int(13 * S), _f(haut, alpha))  # linker Arm hängt
        glied(d, k(-100, -140), T(*hl), int(11 * S), _f(haut, alpha))
        d.ellipse((*k(-110, -150), *k(-90, -130)), fill=_f(hell, alpha))
        ell = (x + 52 * s + math.cos(a) * 95 * s, y - 220 * s + math.sin(a) * 95 * s)
        glied(d, k(48, -240), T(*ell), int(13 * S), _f(haut, alpha))
        glied(d, T(*ell), T(*hr), int(11 * S), _f(haut, alpha))
        _krallen(d, T, hl, math.pi / 2 + 0.2, s, _f(haut, alpha), 52)
        _krallen(d, T, hr, a, s, _f(haut, alpha), 52)
        hx, hy = k(16 + zuck, -308 + atem)
        for sx in (-1, 1):  # große, zerfetzte Ohren mit Adern
            ohr = [(hx + sx * 34 * S, hy - 22 * S), (hx + sx * 130 * S, hy - 96 * S), (hx + sx * 112 * S, hy - 52 * S),
                   (hx + sx * 124 * S, hy - 34 * S), (hx + sx * 96 * S, hy - 18 * S), (hx + sx * 104 * S, hy), (hx + sx * 46 * S, hy + 12 * S)]
            d.polygon(ohr, fill=_f(haut, alpha))
            d.polygon([(hx + sx * 46 * S, hy - 14 * S), (hx + sx * 112 * S, hy - 80 * S), (hx + sx * 86 * S, hy - 14 * S), (hx + sx * 50 * S, hy + 2 * S)], fill=_f(innen, alpha))
            for j in range(3):
                d.line((hx + sx * 54 * S, hy - 6 * S, hx + sx * (80 + j * 10) * S, hy - (30 + j * 18) * S), fill=_f((80, 20, 26), alpha), width=max(1, int(1.6 * S)))
        d.ellipse((hx - 56 * S, hy - 50 * S, hx + 56 * S, hy + 46 * S), fill=_f(haut, alpha))
        d.polygon([(hx - 50 * S, hy - 22 * S), (hx, hy - 8 * S), (hx + 50 * S, hy - 22 * S), (hx + 44 * S, hy - 34 * S), (hx - 44 * S, hy - 34 * S)], fill=_f(dunkel, alpha))  # Stirnwulst
        for j in range(3):
            d.arc((hx - 30 * S, hy - (48 - j * 6) * S, hx + 30 * S, hy - (30 - j * 6) * S), 200, 340, fill=_f(dunkel, alpha), width=max(1, int(1.5 * S)))
        cv.alpha_composite(_schattieren(koerper, 0.35))
        g = ImageDraw.Draw(cv)
        auf = 0.75 + 0.25 * math.sin(z * 3)
        g.chord((hx - 50 * S, hy - 10 * S, hx + 50 * S, hy + (36 + 22 * auf) * S), 0, 180, fill=_f((40, 4, 8), alpha))  # Maul
        g.ellipse((hx - 14 * S, hy + 18 * S, hx + 14 * S, hy + (30 + 18 * auf) * S), fill=_f((140, 30, 40), alpha))  # Zunge
        _zaehne(g, hx - 46 * S, hx + 46 * S, hy + 13 * S, 16 * S, 14, S, _f((236, 230, 200), alpha))
        _zaehne(g, hx - 40 * S, hx + 40 * S, hy + (34 + 20 * auf) * S, 12 * S, 12, S, _f((220, 214, 180), alpha), unten=True)
        tropf = (z * 0.8) % 1
        g.line((hx + 22 * S, hy + 30 * S, hx + 22 * S, hy + (30 + 40 * tropf) * S), fill=_f((200, 220, 200), int(alpha * 0.6)), width=max(1, int(2 * S)))
        g.polygon([(hx - 7 * S, hy - 2 * S), (hx - 3 * S, hy + 6 * S), (hx - 10 * S, hy + 6 * S)], fill=_f((10, 10, 6), alpha))  # Nasenschlitze
        g.polygon([(hx + 7 * S, hy - 2 * S), (hx + 3 * S, hy + 6 * S), (hx + 10 * S, hy + 6 * S)], fill=_f((10, 10, 6), alpha))
        if augen:
            zu = (z % 4.3) < 0.12
            for ex in (-24, 24):
                ax, ay = hx + ex * S, hy - 20 * S
                _glut(cv, GRUEN, ax, ay, 80 * S)
                o = 1 if ex > 0 else -1
                if zu:
                    g.line((ax - 14 * S, ay, ax + 14 * S, ay), fill=_f((230, 255, 150), alpha), width=max(1, int(2 * S)))
                    continue
                g.polygon([(ax - o * 16 * S, ay - 1 * S), (ax + o * 16 * S, ay - 13 * S), (ax + o * 14 * S, ay + 6 * S), (ax - o * 12 * S, ay + 8 * S)], fill=_f((230, 250, 110), alpha))
                g.ellipse((ax - 2.4 * S, ay - 8 * S, ax + 2.4 * S, ay + 7 * S), fill=_f((0, 0, 0), alpha))
        return cv

    _ss(ziel, box, zeichne)


def frau(ziel, x, y, s=1.0, wink=0.0, alpha=255, augen=True):
    # sehr groß und dürr, schmutziges zerrissenes Nachthemd, nasse schwarze Haare bis zur Hüfte,
    # Kopf schief auf zu langem Hals, durch die Haare starrt ein Auge, darunter ein lang aufgerissener Mund
    z = ZEIT[0]
    zuck = math.sin(z * 41) * 5 if int(z * 2) % 5 == 0 else 0.0
    neig = 0.22 + 0.06 * math.sin(z * 0.9) + (0.25 if int(z * 2) % 9 == 0 else 0)
    a = -1.35 + wink * 0.8
    hr = (x + 30 * s + math.cos(a) * 240 * s, y - 392 * s + math.sin(a) * 240 * s)
    hl = (x - 58 * s, y - 120 * s)
    box = (min(x - 150 * s, hr[0] - 80 * s), min(y - 560 * s, hr[1] - 80 * s), max(x + 150 * s, hr[0] + 80 * s), max(y + 30 * s, hr[1] + 80 * s))

    def zeichne(cv, T):
        S = s * A
        k = lambda px, py: T(x + px * s, y + py * s)
        kleid, haut, haar = (206, 202, 190), (176, 182, 184), (6, 6, 9)
        koerper = Image.new('RGBA', cv.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(koerper)
        for sx in (-1, 1):  # nackte, graue Füße unter dem Saum
            d.ellipse((*k(sx * 22 - 16, -16), *k(sx * 22 + 18, 2)), fill=_f(haut, alpha, 0.8))
        r = random.Random(3)
        saum = [k(74 - i * 148 / 13, -18 - r.uniform(0, 30)) for i in range(14)]
        d.polygon([k(-34, -404), k(34, -404), k(52, -250), k(74, -18)] + saum + [k(-74, -18), k(-52, -250)], fill=_f(kleid, alpha))
        for i in range(7):  # Falten
            d.line((*k(-24 + i * 8, -390), *k(-60 + i * 20, -40)), fill=_f(kleid, alpha, 0.78), width=max(1, int(2.5 * S)))
        for fx, fy, fr in ((-30, -70, 26), (34, -110, 18), (-8, -180, 14), (20, -40, 22)):  # Schmutz und Risse
            d.ellipse((*k(fx - fr, fy - fr * 0.7), *k(fx + fr, fy + fr * 0.7)), fill=_f((96, 84, 70), int(alpha * 0.55)))
        d.polygon([k(10, -150), k(24, -120), k(14, -96), k(2, -120)], fill=_f((20, 18, 18), alpha))
        el = (x - 50 * s, y - 270 * s)  # Arme bis unter die Knie, Ellbogen spitz
        glied(d, k(-30, -392), T(*el), int(9 * S), _f(haut, alpha))
        glied(d, T(*el), T(*hl), int(8 * S), _f(haut, alpha))
        er = (x + 30 * s + math.cos(a) * 120 * s, y - 392 * s + math.sin(a) * 120 * s)
        glied(d, k(30, -394), T(*er), int(9 * S), _f(haut, alpha))
        glied(d, T(*er), T(*hr), int(8 * S), _f(haut, alpha))
        _krallen(d, T, hl, math.pi / 2 + 0.1, s, _f(haut, alpha), 60, _f((40, 36, 34), alpha))
        _krallen(d, T, hr, a, s, _f(haut, alpha), 60, _f((40, 36, 34), alpha))
        nx, ny = k(zuck * 0.4, -404)
        hx, hy = nx + math.sin(neig) * 70 * S, ny - math.cos(neig) * 70 * S
        glied(d, (nx, ny), (hx, hy), int(13 * S), _f(haut, alpha, 0.9))  # zu langer Hals
        d.ellipse((hx - 30 * S, hy - 38 * S, hx + 30 * S, hy + 36 * S), fill=_f(haut, alpha))
        cv.alpha_composite(_schattieren(koerper, 0.3))
        g = ImageDraw.Draw(cv)
        g.ellipse((hx + 2 * S, hy - 14 * S, hx + 22 * S, hy + 2 * S), fill=_f((40, 40, 46), alpha))  # tiefe Augenhöhle
        mund = 24 + 10 * math.sin(z * 1.7)
        g.ellipse((hx - 6 * S, hy + 10 * S, hx + 12 * S, hy + (10 + mund) * S), fill=_f((10, 4, 6), alpha))
        haare = Image.new('RGBA', cv.size, (0, 0, 0, 0))
        hd = ImageDraw.Draw(haare)
        hd.chord((hx - 36 * S, hy - 46 * S, hx + 36 * S, hy + 10 * S), 180, 360, fill=_f(haar, alpha))
        for i in range(26):  # Strähnen, nass und schwer, sie schwingen ein wenig
            u = i / 25
            sx = hx + (-36 + 72 * u) * S
            if 0.52 < u < 0.74:  # Lücke für Auge und Mund
                continue
            lang = (230 + 60 * math.sin(i * 1.7)) * S
            weh = math.sin(z * 1.3 + i * 0.7) * 8 * S
            pts = [(sx, hy - 30 * S), (sx + (u - 0.5) * 30 * S + weh * 0.4, hy + lang * 0.35), (sx + (u - 0.5) * 70 * S + weh, hy + lang)]
            hd.line(pts, fill=_f((14 + (i % 3) * 6, 14 + (i % 3) * 6, 22 + (i % 3) * 8), alpha), width=max(2, int((5 + i % 3) * S)), joint='curve')
        cv.alpha_composite(haare)
        if augen:
            _glut(cv, WEISSGLUT, hx + 12 * S, hy - 6 * S, 46 * S)
            g = ImageDraw.Draw(cv)
            g.ellipse((hx + 4 * S, hy - 12 * S, hx + 20 * S, hy), fill=_f((240, 240, 232), alpha))
            g.ellipse((hx + 10 * S, hy - 8 * S, hx + 14 * S, hy - 4 * S), fill=_f((0, 0, 0), alpha))
            for j in range(3):  # rote Äderchen
                g.line((hx + 4 * S, hy - 6 * S + j * 3 * S, hx + 9 * S, hy - 6 * S + j * 2 * S), fill=_f((170, 30, 30), alpha), width=1)
        return cv

    _ss(ziel, box, zeichne)


def _geweih(d, k, s, S, alpha, sx, farbe):
    # verzweigtes Geweih mit vielen Enden, eine Seite gespiegelt
    def ast(x0, y0, w, lang, dicke, tiefe):
        x1, y1 = x0 + sx * math.cos(w) * lang, y0 - math.sin(w) * lang
        d.line((*k(x0, y0), *k(x1, y1)), fill=_f(farbe, alpha), width=max(2, int(dicke * S)))
        if tiefe > 0:
            ast(x1, y1, w + 0.45, lang * 0.7, dicke * 0.7, tiefe - 1)
            ast(x1, y1, w - 0.4, lang * 0.62, dicke * 0.65, tiefe - 1)
    ast(14, -520, 1.15, 70, 9, 3)
    ast(30, -560, 0.35, 46, 6, 1)


def hirsch(ziel, x, y, s=1.0, wink=0.0, alpha=255, augen=True):
    # ausgehungertes Wesen: Haut wie verbranntes Leder über Rippen und Wirbelsäule, Beine mit Hufen,
    # Arme bis zu den Knien, gesprungener Hirschschädel mit Zähnen, tiefe Augenhöhlen mit roter Glut, großes Geweih mit Moos
    z = ZEIT[0]
    atem = math.sin(z * 2.6) * 3
    a = -1.2 + wink
    hr = (x + 30 * s + math.cos(a) * 280 * s, y - 410 * s + math.sin(a) * 280 * s)
    hl = (x - 86 * s, y - 120 * s)
    box = (min(x - 200 * s, hr[0] - 100 * s), min(y - 720 * s, hr[1] - 100 * s), max(x + 200 * s, hr[0] + 100 * s), max(y + 30 * s, hr[1] + 100 * s))

    def zeichne(cv, T):
        S = s * A
        k = lambda px, py: T(x + px * s, y + py * s)
        leder, knochen, dunkel = (52, 42, 36), (214, 204, 184), (24, 20, 18)
        koerper = Image.new('RGBA', cv.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(koerper)
        for sx in (-1, 1):  # Hinterbeine wie beim Tier: Knie vorne, Sprunggelenk hinten, Huf
            glied(d, k(sx * 18, -260), k(sx * 36, -160), int(15 * S), _f(leder, alpha))
            glied(d, k(sx * 36, -160), k(sx * 16, -70), int(10 * S), _f(leder, alpha))
            glied(d, k(sx * 16, -70), k(sx * 24, -12), int(8 * S), _f(leder, alpha))
            d.ellipse((*k(sx * 36 - 10, -170), *k(sx * 36 + 10, -150)), fill=_f(knochen, alpha, 0.55))
            d.polygon([k(sx * 24 - 12, -12), k(sx * 24 + 12, -12), k(sx * 24 + 14, 2), k(sx * 24 - 14, 2)], fill=_f(dunkel, alpha))
        d.polygon([k(-26, -290), k(26, -290), k(20, -250), k(-20, -250)], fill=_f(knochen, alpha, 0.6))  # Becken
        d.polygon([k(-44, -452 + atem), k(44, -452 + atem), k(36, -340), k(20, -280), k(-20, -280), k(-36, -340)], fill=_f(leder, alpha))
        for i in range(6):  # Rippen als Knochen
            yy = -436 + i * 24 + atem
            d.arc((*k(-38 + i * 2, yy), *k(38 - i * 2, yy + 30)), 195, 345, fill=_f(knochen, alpha, 0.85 - i * 0.06), width=max(2, int(4 * S)))
        d.line((*k(0, -446 + atem), *k(0, -300)), fill=_f(knochen, alpha, 0.7), width=max(2, int(5 * S)))
        for i in range(5):  # Hautfetzen hängen herunter
            fx = -34 + i * 17
            d.line((*k(fx, -300), *k(fx + 3, -262 + (i % 3) * 10)), fill=_f(leder, alpha, 0.8), width=max(1, int(4 * S)))
        el = (x - 70 * s, y - 280 * s)
        glied(d, k(-40, -440), T(*el), int(11 * S), _f(leder, alpha))
        glied(d, T(*el), T(*hl), int(9 * S), _f(leder, alpha))
        ex_, ey_ = T(*el)
        d.ellipse((ex_ - 9 * S, ey_ - 9 * S, ex_ + 9 * S, ey_ + 9 * S), fill=_f(knochen, alpha, 0.6))  # spitzer Ellbogen
        er = (x + 36 * s + math.cos(a) * 140 * s, y - 440 * s + math.sin(a) * 140 * s)
        glied(d, k(40, -442), T(*er), int(11 * S), _f(leder, alpha))
        glied(d, T(*er), T(*hr), int(9 * S), _f(leder, alpha))
        _krallen(d, T, hl, math.pi / 2, s, _f(leder, alpha), 80, _f(dunkel, alpha))
        _krallen(d, T, hr, a, s, _f(leder, alpha), 80, _f(dunkel, alpha))
        for i in range(4):  # Wirbel im Hals
            d.ellipse((*k(-9, -470 - i * 12), *k(9, -458 - i * 12)), fill=_f(knochen, alpha, 0.65))
        cv.alpha_composite(_schattieren(koerper, 0.3))
        g = ImageDraw.Draw(cv)
        for sx in (-1, 1):
            _geweih(g, k, s, S, alpha, sx, (196, 184, 160))
        r = random.Random(7)
        for i in range(7):  # Moos und Fäden hängen vom Geweih
            mx, my = r.choice((-1, 1)) * r.uniform(30, 90), -r.uniform(560, 640)
            lang = r.uniform(30, 70) + math.sin(z * 1.5 + i) * 5
            g.line((*k(mx, my), *k(mx + math.sin(z + i) * 4, my + lang)), fill=_f((52, 70, 40), alpha), width=max(1, int(3 * S)))
        g.polygon([k(-30, -540), k(30, -540), k(26, -500), k(14, -460), k(8, -426), k(-8, -426), k(-14, -460), k(-26, -500)], fill=_f(knochen, alpha))
        g.line([k(-6, -540), k(4, -515), k(-4, -498), k(6, -482)], fill=_f((110, 98, 84), alpha), width=max(1, int(2 * S)))  # Sprung im Schädel
        for ex in (-1, 1):
            g.polygon([k(ex * 4, -524), k(ex * 26, -526), k(ex * 22, -504), k(ex * 8, -500)], fill=_f((4, 2, 2), alpha))  # Augenhöhlen
        g.polygon([k(-5, -470), k(5, -470), k(0, -452)], fill=_f((4, 2, 2), alpha))  # Nasenloch
        (zx0, zy), (zx1, _) = k(-9, -432), k(9, -432)
        _zaehne(g, zx0, zx1, zy, 10 * S, 6, S, _f((234, 228, 206), alpha), unten=True)
        if int(z * 0.7) % 3 == 0:  # Atemwolke in der Kälte
            p = (z * 0.7) % 1
            wolke = Image.new('RGBA', cv.size, (0, 0, 0, 0))
            wx, wy = k(18 + 50 * p, -430 + 10 * p)
            ImageDraw.Draw(wolke).ellipse((wx - (12 + 30 * p) * S, wy - (8 + 20 * p) * S, wx + (12 + 30 * p) * S, wy + (8 + 20 * p) * S), fill=(200, 205, 215, int(90 * (1 - p) * alpha / 255)))
            cv.alpha_composite(wolke.filter(ImageFilter.GaussianBlur(6 * S)))
        if augen:
            for ex in (-15, 15):
                ax, ay = k(ex, -514)
                _glut(cv, ROT, ax, ay, 44 * S)
                ImageDraw.Draw(cv).ellipse((ax - 3 * S, ay - 3 * S, ax + 3 * S, ay + 3 * S), fill=_f((255, 90, 60), alpha))
        return cv

    _ss(ziel, box, zeichne)


ZEICHNER = {'gremlin': gremlin, 'frau': frau, 'hirsch': hirsch}


def _fratze_grund(im, lt):
    im.paste(Image.new('RGB', (W, H), (40, 0, 0) if int(lt * 12) % 2 else (0, 0, 0)))
    return 1.0 + 0.25 * min(lt / 0.25, 1), W / 2, 640


def _riesig(im, zeichner, lt, cx, cy, s, fuss_y):
    # die Figur selbst, so nah, dass nur noch der Kopf ins Bild passt
    lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    zeichner(lage, cx, fuss_y, s=s, wink=2.8)  # Arm unten, nur das Gesicht zählt
    lage = Image.composite(lage, Image.new('RGBA', (W, H), (0, 0, 0, 0)), lage.split()[3])
    im.paste(lage, (0, 0), lage)


def gremlin_fratze(im, lt):
    g, cx, cy = _fratze_grund(im, lt)
    _riesig(im, gremlin, lt, cx - 60 * g, cy, 4.2 * g, cy + 308 * 4.2 * g + 20)


def frau_fratze(im, lt):
    g, cx, cy = _fratze_grund(im, lt)
    _riesig(im, frau, lt, cx - 40 * g, cy, 5.2 * g, cy + 470 * 5.2 * g)


def hirsch_fratze(im, lt):
    g, cx, cy = _fratze_grund(im, lt)
    _riesig(im, hirsch, lt, cx, cy, 3.6 * g, cy + 500 * 3.6 * g)


FRATZEN = {'gremlin': gremlin_fratze, 'frau': frau_fratze, 'hirsch': hirsch_fratze}
