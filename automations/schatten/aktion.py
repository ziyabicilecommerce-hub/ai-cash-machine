# Action-Momente der Schatten-Story: zerspringende Scheibe (Hand, Risse, Loch, fliegende Scherben)
# und der Schatten, der kopfüber von der Decke kommt.
import math
import random
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
from figuren import schatten, hand, W, H

_r = random.Random(5)
RISSE = []
for _i in range(16):
    _w = _i / 16 * 2 * math.pi + _r.uniform(-0.15, 0.15)
    _x = _y = 0.0
    _pts = [(0.0, 0.0)]
    for _j in range(7):
        _w += _r.uniform(-0.35, 0.35)
        _l = _r.uniform(28, 55)
        _x += math.cos(_w) * _l
        _y += math.sin(_w) * _l
        _pts.append((_x, _y))
    RISSE.append(_pts)
SCHERBEN = []
for _i in range(46):
    _gr = _r.uniform(14, 46)
    _form = [(math.cos(a) * _gr * _r.uniform(0.5, 1.2), math.sin(a) * _gr * _r.uniform(0.5, 1.2))
             for a in sorted(_r.uniform(0, 2 * math.pi) for _ in range(3 + _i % 3))]
    SCHERBEN.append((_r.uniform(0, 2 * math.pi), _r.uniform(250, 900), _r.uniform(-8, 8), _form, _r.uniform(-60, 60), _r.uniform(-60, 60)))
LOCH = [(math.cos(i / 22 * 2 * math.pi) * r, math.sin(i / 22 * 2 * math.pi) * r * 1.15)
        for i, r in ((i, (185 if i % 2 else 110) + _r.uniform(-25, 25)) for i in range(22))]  # zackiges Loch


def risse(im, fortschritt, mx, my):
    d = ImageDraw.Draw(im)
    for pts in RISSE:
        p = [(mx + x, my + y) for x, y in pts[:max(1, int(len(pts) * fortschritt)) + 1]]
        if len(p) > 1:
            d.line(p, fill=(225, 235, 250), width=3)
            d.line(p, fill=(120, 130, 150), width=1)
    if fortschritt > 0.5:
        for r in (40, 90):
            d.ellipse((mx - r, my - r * 0.9, mx + r, my + r * 0.9), outline=(200, 210, 230), width=2)


def scherben(im, u, mx, my):
    # Scherben fliegen auseinander und auf die Kamera zu, fallen dabei nach unten
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    for w, v, rot, form, ox, oy in SCHERBEN:
        z = 1 + u * 2.6
        cx, cy = mx + ox + math.cos(w) * v * u, my + oy + math.sin(w) * v * u + 500 * u * u
        a = rot * u
        p = [(cx + (x * math.cos(a) - y * math.sin(a)) * z, cy + (x * math.sin(a) + y * math.cos(a)) * z) for x, y in form]
        alpha = int(max(0, 230 - u * 170))
        d.polygon(p, fill=(200, 220, 245, alpha // 2), outline=(240, 248, 255, alpha))
    im.paste(lage, (0, 0), lage)


def scheibe(im, lt, mx=360, my=560, schlag=0.25, bruch=1.0):
    # Hand knallt gegen die Scheibe, Risse wachsen, dann bricht sie: im Loch greift der Schatten herein
    if lt < bruch:
        if lt >= schlag:
            hand(im, mx, my, min((lt - schlag) / 0.08, 1))
        if lt >= schlag + 0.15:
            risse(im, min((lt - schlag - 0.15) / max(bruch - schlag - 0.15, 0.1), 1), mx, my)
        return
    loch = [(mx + x, my + y) for x, y in LOCH]
    hinten = Image.new('RGB', im.size, (34, 40, 60))  # draußen: kaltes Licht hinter dem Loch, damit er sichtbar ist
    hd = ImageDraw.Draw(hinten)
    for i in range(6):
        hd.ellipse((mx - 260 + i * 30, my - 300 + i * 30, mx + 260 - i * 30, my + 300 - i * 30), fill=(40 + i * 9, 46 + i * 9, 70 + i * 10))
    maske = Image.new('L', im.size, 0)
    ImageDraw.Draw(maske).polygon(loch, fill=255)
    im.paste(hinten, (0, 0), maske)
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    nah = min((lt - bruch) / 0.6, 1)
    gr = 1.35 + 0.35 * nah
    schatten(lage, mx - 6 * gr, my + 450 * gr, s=gr, wink=-0.2)
    lage.putalpha(ImageChops.multiply(lage.split()[3], maske))
    im.paste(lage, (0, 0), lage)
    ImageDraw.Draw(im).line(loch + loch[:1], fill=(210, 220, 240), width=4)
    scherben(im, lt - bruch, mx, my)


def decke_schatten(lage, x, p):
    # der Schatten kommt kopfüber von der Decke herunter (p: 0 = noch oben, 1 = ganz da)
    tmp = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    schatten(tmp, x, H - 40, s=1.1, wink=2.6)
    kopfueber = tmp.transpose(Image.FLIP_TOP_BOTTOM)
    versatz = int((1 - p) * 420)
    lage.alpha_composite(kopfueber.crop((0, versatz, W, H)), (0, 0))


def masken(lage, lt):
    # Flugzeug: die Sauerstoffmasken fallen aus den Fächern und pendeln an ihren Schläuchen
    d = ImageDraw.Draw(lage)
    p = min(lt / 0.5, 1)
    for i, mx in enumerate((110, 330, 550, 680)):
        schw = math.sin(lt * 5 + i) * 22 * p
        ende = (mx + schw, 175 + 290 * p - 20 * math.sin(lt * 9 + i) * (1 - p))
        d.line((mx, 175, *ende), fill=(220, 225, 230, 255), width=3)
        d.ellipse((ende[0] - 26, ende[1], ende[0] + 26, ende[1] + 40), fill=(240, 200, 40, 255), outline=(150, 120, 20, 255), width=3)


def fernseher(im, t, lt, dauer):
    # Haus: der alte Fernseher geht von selbst an - Rauschen, darin taucht sie auf und kommt immer näher
    im.paste(Image.new('RGB', im.size, (6, 7, 9)))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 900, W, H), fill=(18, 12, 10))
    d.rounded_rectangle((110, 300, 610, 790), 40, fill=(40, 36, 34), outline=(70, 64, 60), width=8)
    d.rectangle((250, 790, 470, 880), fill=(30, 26, 24))
    box = (160, 345, 560, 715)
    rauschen = Image.effect_noise((box[2] - box[0], box[3] - box[1]), 90).convert('RGB')
    if lt > 1.0:  # im Rauschen erscheint sie und kommt näher
        p = min((lt - 1.0) / max(dauer - 1.4, 0.6), 1)
        lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
        schatten(lage, 360, 715 + 520 * p, s=0.6 + 1.2 * p)
        figur = lage.crop(box)
        rauschen.paste(figur, (0, 0), figur)
    im.paste(rauschen, box[:2])
    schein = Image.new('RGB', im.size, (120, 130, 150))
    maske = Image.new('L', im.size, 0)
    ImageDraw.Draw(maske).ellipse((-80, 150, W + 80, 1200), fill=40 + int(20 * math.sin(t * 40)))
    im.paste(schein, (0, 0), maske.filter(ImageFilter.GaussianBlur(80)))
    d.rounded_rectangle(box, 18, outline=(20, 18, 16), width=10)
    return im


def taschenlampe(im, lt, dauer, hintergrund):
    # Wald: stockdunkel, der Lichtkegel wandert zwischen die Bäume - und bleibt an ihm hängen
    hell = ImageEnhance.Brightness(hintergrund).enhance(2.6)
    halt = max(dauer - 1.0, 0.8)
    if lt >= halt:
        lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
        schatten(lage, 360, 1480, s=1.9)
        hell.paste(lage, (0, 0), lage)
        lx = 360
    else:
        lx = 360 + math.sin(lt * 2.2) * 230
    maske = Image.new('L', im.size, 0)
    ImageDraw.Draw(maske).ellipse((lx - 230, 330, lx + 230, 790), fill=255)
    dunkel = Image.new('RGB', im.size, (2, 3, 5))
    dunkel.paste(hell, (0, 0), maske.filter(ImageFilter.GaussianBlur(40)))
    licht = Image.new('RGB', im.size, (255, 236, 190))  # warmer Schein im Kegel
    dunkel.paste(licht, (0, 0), maske.filter(ImageFilter.GaussianBlur(60)).point(lambda v: v // 7))
    return dunkel
