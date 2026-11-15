# Neue Hauptfigur (15.11., Wunsch: "mach die Charaktere anders"): Webtoon-Stil statt Flash-Strichmännchen.
# Echte Proportionen (Schultern, Taille, Gelenke), Haare mit Strähnen, Augen mit Iris und Lid, keine Schweißtropfen.
# Licht kommt von rechts (Handy/Mond): linke Körperhälfte im Schatten, kalte Lichtkante rechts - gibt Volumen.
import math
from PIL import Image, ImageChops, ImageDraw, ImageFilter

A = 2


def _ton(f, k):
    return tuple(max(0, min(255, int(c * k))) for c in f[:3])


def _mix(f, g, k):
    return tuple(int(f[i] * (1 - k) + g[i] * k) for i in range(3))


def _glied(d, a, b, w1, w2, f):
    # sich verjüngendes Körperteil (Oberarm, Unterschenkel ...): dick bei a, dünner bei b
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy) or 1
    nx, ny = -dy / n, dx / n
    d.polygon([(a[0] + nx * w1 / 2, a[1] + ny * w1 / 2), (b[0] + nx * w2 / 2, b[1] + ny * w2 / 2),
               (b[0] - nx * w2 / 2, b[1] - ny * w2 / 2), (a[0] - nx * w1 / 2, a[1] - ny * w1 / 2)], fill=f)
    for p, w in ((a, w1), (b, w2)):
        d.ellipse((p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2), fill=f)


def licht(cv, kante=(150, 190, 255)):
    # Volumen: links abdunkeln (Verlauf), rechts eine kalte Lichtkante entlang der Silhouette
    r, g, b, a = cv.split()
    breite = cv.size[0]
    verlauf = Image.linear_gradient('L').rotate(90, expand=True).resize(cv.size).point(lambda v: 150 + int(v * 105 / 255))
    verlauf = verlauf.transpose(Image.FLIP_LEFT_RIGHT)
    rgb = ImageChops.multiply(Image.merge('RGB', (r, g, b)), Image.merge('RGB', (verlauf,) * 3))
    rand = ImageChops.subtract(a, ImageChops.offset(a, max(2, breite // 90), 0)).filter(ImageFilter.GaussianBlur(1.5))
    farbe = Image.new('RGB', cv.size, kante)
    rgb = Image.composite(ImageChops.screen(rgb, farbe), rgb, rand.point(lambda v: int(v * 0.85)))
    return Image.merge('RGBA', (*rgb.split(), a))


def gesicht(d, fx, fy, s, angst, blick, haut, verdeckt=False, schlaf=False, augen=(84, 58, 40)):
    dunkel = (26, 22, 30)
    if schlaf:
        for ex in (-1, 1):
            d.arc((fx + ex * 9 * s - 6 * s, fy - 6 * s, fx + ex * 9 * s + 6 * s, fy + 2 * s), 20, 160, fill=dunkel, width=max(1, int(2.2 * s)))
        return
    oeffnung = 1 + angst * 0.7
    for ex in (-1, 1):
        ax, ay = fx + ex * 9.5 * s + blick * 2.5 * s, fy - 2 * s
        w, h = 6.8 * s, 4.2 * s * oeffnung
        d.ellipse((ax - w, ay - h, ax + w, ay + h), fill=(246, 244, 240))
        ir = (3.6 - 0.8 * angst) * s
        ix = ax + blick * 2.6 * s + math.sin(angst * 40) * 0.4 * s
        d.ellipse((ix - ir, ay - ir, ix + ir, ay + ir), fill=augen)
        d.ellipse((ix - ir * 0.5, ay - ir * 0.5, ix + ir * 0.5, ay + ir * 0.5), fill=dunkel)
        d.ellipse((ix + ir * 0.1, ay - ir * 0.75, ix + ir * 0.6, ay - ir * 0.25), fill=(255, 255, 255))
        d.arc((ax - w - 0.5 * s, ay - h - 1.2 * s, ax + w + 0.5 * s, ay + h), 195, 345, fill=dunkel, width=max(1, int(2.4 * s)))  # Oberlid + Wimpern
        innen = -ex
        d.line((ax + innen * 5 * s, ay - (8 + 3 * angst) * s, ax - innen * 5 * s, ay - (9 - 2 * angst) * s), fill=_ton(dunkel, 2.2), width=max(1, int(1.6 * s)))
        if angst > 0.55:  # dunkle Ringe unter den Augen statt Comic-Schweiß
            d.arc((ax - w, ay + h - 3 * s, ax + w, ay + h + 4 * s), 20, 160, fill=_ton(haut, 0.78), width=max(1, int(1.6 * s)))
    d.line((fx + 2 * s + blick * 2 * s, fy + 3 * s, fx + 3.5 * s + blick * 2 * s, fy + 9 * s), fill=_ton(haut, 0.72), width=max(1, int(1.8 * s)))
    if verdeckt:
        return
    my = fy + 16 * s
    if angst < 0.3:
        d.arc((fx - 5 * s, my - 3 * s, fx + 5 * s, my + 1 * s), 20, 160, fill=_ton(haut, 0.55), width=max(1, int(1.8 * s)))
    else:
        mw, mh = (4 + 2 * angst) * s, (2 + 8 * angst) * s
        d.ellipse((fx - mw + blick * 2 * s, my - mh / 2, fx + mw + blick * 2 * s, my + mh / 2), fill=(60, 20, 26))
        d.chord((fx - mw * 0.8 + blick * 2 * s, my - mh / 2, fx + mw * 0.8 + blick * 2 * s, my), 180, 360, fill=(236, 232, 226))


def zeichne_held(cv, T, x, y, s, stil, sitzen, angst, blick, zeigen_gesicht, lauf, schlaf, atem, z):
    d = ImageDraw.Draw(cv)
    S = s * A
    k = lambda px, py: T(x + px * s, y + py * s)
    stoff = tuple(stil.get('farbe', (58, 66, 92)))
    falte = _ton(stoff, 0.72)
    hose = tuple(stil.get('hose', (46, 60, 92)))
    haut = tuple(stil.get('haut', (240, 206, 182)))
    if angst > 0.7:
        haut = _mix(haut, (214, 220, 232), (angst - 0.7) * 1.2)  # wird blass vor Angst
    haar = tuple(stil.get('haar', (38, 28, 24)))
    oberteil, kopfart = stil.get('oberteil', 'hoodie'), stil.get('kopf', 'haare')
    # Beine
    if sitzen:
        for dx, f in ((14, _ton(hose, 0.8)), (-12, hose)):
            _glied(d, k(dx, -122), k(dx + 78, -112), 34 * S, 27 * S, f)
            _glied(d, k(dx + 78, -112), k(dx + 82, -24), 26 * S, 20 * S, f)
            d.rounded_rectangle((*k(dx + 66, -30), *k(dx + 112, -8)), radius=int(9 * S), fill=(30, 30, 36))
            d.rectangle((*k(dx + 66, -14), *k(dx + 112, -8)), fill=(220, 220, 224))
    else:
        for i, (dx, f) in enumerate(((13, _ton(hose, 0.8)), (-13, hose))):
            sw = math.sin(lauf + i * math.pi) * 0.6 if lauf is not None else 0.0
            knie = (dx + math.sin(sw) * 54, -122 + math.cos(sw) * 56)
            fuss = (knie[0] + math.sin(sw * 0.4) * 46 - (18 if sw < 0 else 0), knie[1] + 50)
            _glied(d, k(dx, -122), k(*knie), 32 * S, 25 * S, f)
            _glied(d, k(*knie), k(*fuss), 24 * S, 18 * S, f)
            d.rounded_rectangle((*k(fuss[0] - 15, fuss[1] - 4), *k(fuss[0] + 24, fuss[1] + 14)), radius=int(8 * S), fill=(30, 30, 36))
            d.rectangle((*k(fuss[0] - 15, fuss[1] + 9), *k(fuss[0] + 24, fuss[1] + 14)), fill=(220, 220, 224))
    # Oberkörper: breite Schultern, schmalere Hüfte
    top = -236 + atem
    d.polygon([k(-42, top + 12), k(-30, top), k(30, top), k(42, top + 12), k(36, -128), k(32, -112), k(-32, -112), k(-36, -128)], fill=stoff)
    d.rectangle((*k(-33, -124), *k(33, -112)), fill=falte)  # Bund
    if oberteil == 'hoodie':
        d.chord((*k(-34, top - 14), *k(34, top + 24)), 0, 180, fill=falte)  # Kapuze liegt im Nacken
        for sx in (-8, 8):
            d.line((*k(sx, top + 12), *k(sx * 1.2, top + 46)), fill=(225, 225, 230), width=max(1, int(2.4 * S)))
        d.arc((*k(-26, -176), *k(26, -140)), 0, 180, fill=falte, width=max(1, int(2.6 * S)))
    elif oberteil == 'anzug':
        d.polygon([k(-15, top), k(15, top), k(0, -168)], fill=(232, 234, 238))
        d.polygon([k(-3, top + 6), k(3, top + 6), k(5, -176), k(0, -166), k(-5, -176)], fill=(150, 28, 34))
    elif oberteil == 'pyjama':
        for i in range(4):
            bx, by = k(0, top + 30 + i * 22)
            d.ellipse((bx - 3 * S, by - 3 * S, bx + 3 * S, by + 3 * S), fill=falte)
    else:
        d.line((*k(0, top + 4), *k(0, -116)), fill=falte, width=max(1, int(3 * S)))
    SK = S * 1.25
    kx, ky = k(blick * 6, -282 + atem * 0.4)
    fx, fy = kx + blick * 4 * S, ky + 4 * S
    vorm_mund = angst > 0.75

    def arme(vorn):
        for sx in (-1, 1):
            if vorn:
                ell, hand = k(sx * 46, -168), (fx + sx * 10 * SK, fy + 16 * SK)
            elif lauf is not None:
                schw = math.sin(lauf + (sx > 0) * math.pi) * 34
                ell, hand = k(sx * 52 + schw, -165), k(sx * 34 + schw * 1.6, -192)
            else:
                ell, hand = k(sx * 50, -176), k(sx * 46, -122)
            arm = _ton(stoff, 0.86)
            _glied(d, k(sx * 38, top + 12), ell, 25 * S, 21 * S, falte)  # dunkle Kontur trennt Arm und Körper
            _glied(d, ell, hand, 21 * S, 17 * S, falte)
            _glied(d, k(sx * 38, top + 12), ell, 21 * S, 17 * S, arm)
            _glied(d, ell, hand, 17 * S, 13 * S, arm)
            d.ellipse((hand[0] - 9 * S, hand[1] - 9 * S, hand[0] + 9 * S, hand[1] + 9 * S), fill=haut)
            d.ellipse((hand[0] - sx * 9 * S - 3 * S, hand[1] - 6 * S, hand[0] - sx * 9 * S + 3 * S, hand[1] + 2 * S), fill=haut)  # Daumen

    if not vorm_mund:
        arme(False)
    # Hals + Kopf (Gesicht mit spitzerem Kinn)
    d.rectangle((fx - 6.5 * SK, fy + 14 * SK, fx + 6.5 * SK, fy + 32 * SK), fill=_ton(haut, 0.8))
    if kopfart == 'kapuze':
        d.ellipse((kx - 34 * SK, ky - 38 * SK, kx + 34 * SK, ky + 34 * SK), fill=falte)
        d.ellipse((kx - 31 * SK, ky - 35 * SK, kx + 31 * SK, ky + 31 * SK), fill=stoff)
    for ox in (-1, 1):
        d.ellipse((fx + ox * 21 * SK - 5 * SK, fy - 4 * SK, fx + ox * 21 * SK + 5 * SK, fy + 8 * SK), fill=_ton(haut, 0.9))
    if kopfart == 'haare' and stil.get('zopf'):
        zx = fx + (24 - blick * 30) * S
        _glied(d, (zx, fy - 20 * SK), (zx + 8 * SK + math.sin(z * 3) * 3 * SK, fy + 38 * SK), 16 * SK, 8 * SK, _ton(haar, 0.9))
    if kopfart == 'haare':
        d.ellipse((fx - 25 * SK, fy - 38 * SK, fx + 25 * SK, fy + 8 * SK), fill=haar)
    d.ellipse((fx - 20 * SK, fy - 25 * SK, fx + 20 * SK, fy + 21 * SK), fill=haut)
    d.ellipse((fx - 11 * SK, fy + 8 * SK, fx + 11 * SK, fy + 26 * SK), fill=haut)  # Kinn
    if kopfart == 'haare':  # Pony aus Strähnen
        # Pony: vier große, ungleiche Strähnen, nach rechts gekämmt
        pony = [(-25, -4), (-22, -24), (-12, -9), (-8, -26), (2, -10), (6, -27), (14, -12), (18, -26), (25, -6), (26, -24), (10, -36), (-14, -36)]
        d.polygon([(fx + px * SK, fy + py * SK) for px, py in pony], fill=haar)
        d.line((fx - 8 * SK, fy - 30 * SK, fx + 10 * SK, fy - 26 * SK), fill=_ton(haar, 1.6), width=max(1, int(2 * SK)))  # Glanz
    elif kopfart == 'kapuze':
        d.chord((fx - 22 * SK, fy - 30 * SK, fx + 22 * SK, fy - 4 * SK), 180, 360, fill=_ton(stoff, 0.5))
    else:  # Mütze
        m = tuple(stil.get('muetze_farbe', (40, 60, 110)))
        d.chord((fx - 25 * SK, fy - 44 * SK, fx + 25 * SK, fy + 2 * SK), 180, 360, fill=m)
        d.rounded_rectangle((fx - 25 * SK, fy - 23 * SK, fx + 25 * SK, fy - 14 * SK), radius=int(4 * SK), fill=_ton(m, 0.75))
    if zeigen_gesicht:
        gesicht(d, fx, fy, SK, angst, blick, haut, verdeckt=vorm_mund, schlaf=schlaf, augen=tuple(stil.get('augen', (84, 58, 40))))
    if vorm_mund:
        arme(True)
    return licht(cv)
