# Action-Momente der Schatten-Story: zerspringende Scheibe (Hand, Risse, Loch, fliegende Scherben)
# und der Schatten, der kopfüber von der Decke kommt.
import math
import random
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont
from figuren import schatten, hand, mensch, leuchten, W, H
from fahrgaeste import fahrgaeste_malen
from orte import innenraum, draussen, rahmen, AUGE, AUGE_LEISE

SCHRIFT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

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


TV_BOX = (160, 345, 560, 715)


def _tv_gehaeuse(im):
    im.paste(Image.new('RGB', im.size, (6, 7, 9)))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 900, W, H), fill=(18, 12, 10))
    d.rounded_rectangle((110, 300, 610, 790), 40, fill=(40, 36, 34), outline=(70, 64, 60), width=8)
    d.rectangle((250, 790, 470, 880), fill=(30, 26, 24))
    return d


def _tv_schein(im, t, box):
    schein = Image.new('RGB', im.size, (120, 130, 150))
    maske = Image.new('L', im.size, 0)
    ImageDraw.Draw(maske).ellipse((-80, 150, W + 80, 1200), fill=40 + int(20 * math.sin(t * 40)))
    im.paste(schein, (0, 0), maske.filter(ImageFilter.GaussianBlur(80)))
    ImageDraw.Draw(im).rounded_rectangle(box, 18, outline=(20, 18, 16), width=10)


def fernseher(im, t, lt, dauer):
    # Haus: der alte Fernseher geht von selbst an - Rauschen, darin taucht sie auf und kommt immer näher
    _tv_gehaeuse(im)
    box = TV_BOX
    rauschen = Image.effect_noise((box[2] - box[0], box[3] - box[1]), 90).convert('RGB')
    if lt > 1.0:  # im Rauschen erscheint sie und kommt näher
        p = min((lt - 1.0) / max(dauer - 1.4, 0.6), 1)
        lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
        schatten(lage, 360, 715 + 520 * p, s=0.6 + 1.2 * p)
        figur = lage.crop(box)
        rauschen.paste(figur, (0, 0), figur)
    im.paste(rauschen, box[:2])
    _tv_schein(im, t, box)
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


# --- eigene Animationen pro Story ---

STEWARDESS = {'farbe': (150, 28, 40), 'oberteil': 'anzug', 'kopf': 'haare', 'haar': (30, 22, 18), 'zopf': True, 'hose': (40, 30, 36)}


def zaehlen(im, t, lt, dauer, gaeste):
    # Flugzeug: die Stewardess geht durch den Gang und zählt - 38, 39, 40 ... 41
    innenraum(im, t, lt, licht=0.8, fahrt=False)
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    fahrgaeste_malen(lage, t, gaeste)
    p = min(lt / max(dauer * 0.8, 0.5), 1)
    mensch(lage, 250, 812, angst=0.2 + 0.7 * p, blick=0.8)
    mensch(lage, 760 - 300 * p, 1010, s=1.15, sitzen=False, lauf=lt * 7 if p < 1 else None, blick=-0.6, stil=STEWARDESS)
    im.paste(lage, (0, 0), lage)
    n = 38 + min(int(p * 4), 3)
    rot = n == 41
    f = ImageFont.truetype(SCHRIFT, 150 if rot else 120)
    zit = random.randint(-6, 6) if rot else 0
    ImageDraw.Draw(im).text((360 + zit, 300 + zit), str(n), font=f, fill=(230, 20, 20) if rot else (240, 240, 240),
                            stroke_width=8, stroke_fill=(0, 0, 0), anchor='mm')
    return im


def turbulenz(im, t, lt, gaeste):
    # Flugzeug: alles wackelt, das Licht flackert, eine Gepäckklappe springt auf und ein Koffer fällt
    flacker = 0.25 if int(lt * 11) % 3 == 0 else 1.0
    innenraum(im, t, lt, licht=flacker, fahrt=False)
    d = ImageDraw.Draw(im)
    auf = min(max(lt - 0.6, 0) / 0.25, 1)
    d.polygon([(370, 172), (540, 172), (540, 172 + 90 * auf), (370, 172 + 70 * auf)], fill=(60, 62, 76))  # Klappe
    if auf > 0:
        d.rectangle((372, 60, 538, 170), fill=(8, 8, 12))
    if lt > 0.85:
        fy = 120 + 1400 * (lt - 0.85) ** 2
        if fy < 1100:
            d.rounded_rectangle((400, fy, 510, fy + 80), 10, fill=(120, 70, 40), outline=(60, 34, 20), width=4)
            d.line((440, fy - 12, 470, fy - 12), fill=(60, 34, 20), width=6)
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    fahrgaeste_malen(lage, t, gaeste)
    mensch(lage, 250, 812, angst=1.0, blick=math.sin(lt * 5) * 0.8)
    im.paste(lage, (0, 0), lage)
    im = Image.blend(Image.new('RGB', im.size, (4, 4, 8)), im, 0.35 + 0.65 * flacker)
    return ImageChops.offset(im, int(12 * math.sin(lt * 37)), int(9 * math.sin(lt * 53)))


def fluegel(im, t, lt):
    # Flugzeug: auf dem Flügel taucht einer auf - dann noch einer - dann noch einer, immer näher
    draussen(im, t, lt, '')
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for i, (x, gr) in enumerate(((560, 0.55), (380, 0.8), (190, 1.05))):
        a = min(max(lt - i * 1.1, 0) / 0.3, 1)
        if a > 0:
            schatten(lage, x, 808 + 60 * x / W, s=gr, wink=0.5 * math.sin(lt * 6 + i), alpha=int(255 * a))
    im.paste(lage, (0, 0), lage)
    rahmen(im)
    return im


def live(im, t, lt):
    # Haus: der Fernseher zeigt das eigene Wohnzimmer live - und hinter dem Sofa taucht sie auf
    _tv_gehaeuse(im)
    klein = Image.new('RGB', im.size)
    innenraum(klein, t, lt, licht=0.7, fahrt=False)
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    schatten(lage, 520, 1010, s=1.45, alpha=int(255 * min(max(lt - 0.8, 0) / 1.5, 1)))
    lage.paste((0, 0, 0, 0), (0, 640, W, H))  # nur Kopf und Schultern schauen über die Lehne
    mensch(lage, 250, 812, angst=0.6, blick=-0.4)
    klein.paste(lage, (0, 0), lage)
    box = TV_BOX
    bild = klein.crop((20, 280, 700, 910)).resize((box[2] - box[0], box[3] - box[1])).convert('L').convert('RGB')
    bd = ImageDraw.Draw(bild)
    for y in range(0, bild.height, 4):  # Bildzeilen wie bei einer alten Kamera
        bd.line((0, y, bild.width, y), fill=(0, 0, 0), width=1)
    if int(lt * 2) % 2 == 0:
        bd.ellipse((18, 18, 40, 40), fill=(230, 20, 20))
    bd.text((50, 29), 'LIVE', font=ImageFont.truetype(SCHRIFT, 26), fill=(240, 240, 240), anchor='lm')
    im.paste(bild, box[:2])
    _tv_schein(im, t, box)
    return im


def klinke(im, t, lt, dauer, klopf_bei):
    # Haus: es klopft an der Zimmertür, die Klinke geht langsam runter, unter der Tür bewegen sich Schatten
    im.paste(Image.new('RGB', im.size, (22, 24, 24)))
    stoss = sum(math.exp(-30 * (lt - (klopf_bei + i * 0.32))) for i in range(3) if lt >= klopf_bei + i * 0.32)
    dx = int(8 * stoss * math.sin(lt * 90))
    d = ImageDraw.Draw(im)
    d.rectangle((150 + dx, 100, 570 + dx, 1160), fill=(86, 58, 40), outline=(50, 34, 24), width=10)
    for y0, y1 in ((160, 560), (640, 1100)):
        d.rectangle((210 + dx, y0, 510 + dx, y1), outline=(64, 42, 28), width=8)
    d.rectangle((150, 1160, 570, 1185), fill=(255, 214, 150))  # Licht unter der Tür
    fx = 360 + 90 * math.sin(lt * 1.6)
    for ex in (-35, 35):
        d.rectangle((fx + ex - 22, 1160, fx + ex + 22, 1185), fill=(10, 8, 6))
    runter = min(max(lt - klopf_bei - 1.2, 0) / 1.6, 1) * 0.7 + (0.08 * math.sin(lt * 30) if lt > klopf_bei + 1.2 else 0)
    hx, hy = 490 + dx, 600
    d.rounded_rectangle((hx - 22, hy - 50, hx + 22, hy + 110), 10, fill=(180, 170, 140))
    w = 0.1 + runter
    d.line((hx, hy, hx - 110 * math.cos(w), hy + 110 * math.sin(w)), fill=(205, 195, 160), width=22)
    d.ellipse((hx - 9, hy + 58, hx + 9, hy + 80), fill=(6, 6, 6))  # Schlüsselloch
    d.rectangle((hx - 4, hy + 74, hx + 4, hy + 96), fill=(6, 6, 6))
    if lt > dauer - 1.6:
        im.paste(AUGE_LEISE, (hx - 14, hy + 69 - 14), AUGE_LEISE)
    return im


def rufen(im, t, lt, gaeste):
    # Wald: aus der Dunkelheit zwischen den Bäumen kommen Rufe - Schallwellen von dort, wo zwei Augen leuchten
    innenraum(im, t, lt, licht=1.0, fahrt=False)
    welle = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(welle)
    for i in range(4):
        r = (lt * 140 + i * 70) % 280
        d.ellipse((600 - r, 420 - r * 0.7, 600 + r, 420 + r * 0.7), outline=(220, 230, 255, int(170 * (1 - r / 280))), width=4)
    im.paste(welle, (0, 0), welle)
    if int(lt * 1.5) % 3 != 2:
        for ex in (-9, 9):
            im.paste(AUGE_LEISE, (600 + ex - 14, 420 - 14), AUGE_LEISE)
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    fahrgaeste_malen(lage, t, gaeste)
    mensch(lage, 250, 812, angst=0.6, blick=1.0)
    im.paste(lage, (0, 0), lage)
    return im


def zelt(im, t, lt, dauer):
    # Wald: im Zelt, die Taschenlampe an - draußen geht etwas mit Geweih ums Zelt, sein Schatten wandert über die Plane
    im.paste(Image.new('RGB', im.size, (10, 6, 4)))
    d = ImageDraw.Draw(im)
    plane = [(-40, 1240), (360, 120), (760, 1240)]
    d.polygon(plane, fill=(150, 78, 30))
    d.line((360, 120, 360, 1240), fill=(110, 56, 22), width=6)  # Reißverschluss
    for y in range(200, 1240, 40):
        d.line((352, y, 368, y + 10), fill=(90, 46, 18), width=3)
    licht = leuchten(360, (255, 210, 140), 120)
    im.paste(licht, (360 - 360, 1000 - 360), licht)
    halt = dauer - 1.3
    x = -160 + 520 * min(lt / max(halt, 0.5), 1)
    tmp = Image.new('RGBA', im.size, (0, 0, 0, 0))
    schatten(tmp, x, 1150, s=1.5 + (0.35 * min((lt - halt) / 0.8, 1) if lt > halt else 0), augen=False)
    silhouette = Image.new('RGBA', im.size, (20, 8, 2, 255))
    maske = ImageChops.multiply(tmp.split()[3].point(lambda v: int(v * 0.85)).filter(ImageFilter.GaussianBlur(8)), _zeltmaske(plane))
    im.paste(silhouette, (0, 0), maske)
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    mensch(lage, 330, 1300, s=1.3, angst=0.9, blick=max(-1, min(1, (x - 330) / 300)))
    im.paste(lage, (0, 0), lage)
    return im


def _zeltmaske(plane):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(plane, fill=255)
    return m
