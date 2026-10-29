# Schauplätze der Schatten-Story: Zug, Flugzeug, Haus und Wald. Jeder Ort hat eine Innenansicht mit Sitzplatz
# (Sitzfläche bei y 698-782, dort sitzen die Figuren), eine Außenansicht (Boden bei y 830, dort steht der Schatten)
# und einen Rahmen, durch den man nach draußen schaut. ORT[0] wird pro Story gesetzt.
import math
import random
from PIL import Image, ImageDraw, ImageFont
from figuren import leuchten

W, H = 720, 1280
WEISS = (245, 245, 245)
KLEIN = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
ORT = ['zug']

random.seed(11)
STERNE = [(random.randrange(W * 2), random.randrange(H), random.random() * 6.3, random.choice([1, 1, 2])) for _ in range(140)]


def verlauf(oben, unten):
    im = Image.new('RGB', (1, H))
    for y in range(H):
        k = y / H
        im.putpixel((0, y), tuple(int(oben[i] + (unten[i] - oben[i]) * k) for i in range(3)))
    return im.resize((W, H))


HIMMEL, WAND = verlauf((10, 16, 40), (1, 2, 6)), verlauf((22, 26, 40), (8, 9, 14))
LAMPE, AUGE, NEBEL, STREIF = leuchten(220, (255, 214, 150), 150), leuchten(18, (255, 255, 255)), leuchten(260, (170, 180, 205), 45), leuchten(60, (255, 190, 90), 200)
AUGE_LEISE, HANDYLICHT, AUGE_GROSS = leuchten(14, (255, 255, 255), 70), leuchten(90, (170, 200, 255), 170), leuchten(120, (255, 255, 255))


def sterne(d, t, dx=0.0, box=None):
    for x, y, p, r in STERNE:
        xx = (x - dx) % (W * 2) - W / 2
        if box and not (box[0] < xx < box[2] and box[1] < y < box[3]):
            continue
        a = int(90 + 140 * (0.5 + 0.5 * math.sin(t * 2 + p)))
        d.ellipse((xx - r, y - r, xx + r, y + r), fill=(a, a, min(255, a + 25)))


def zug_innen(im, t, lt, licht=1.0, fahrt=True, augen_im_fenster=False):
    im.paste(WAND)
    d = ImageDraw.Draw(im)
    for fx in (40, 380):
        box = (fx, 180, fx + 300, 470)
        d.rounded_rectangle(box, 28, fill=(4, 6, 16))
        sterne(d, t, dx=t * 420 if fahrt else 0, box=box)
        if fahrt:
            for i in range(3):
                sx = (fx + 330 - ((t * 900 + i * 260 + fx) % 420))
                if box[0] < sx < box[2] - 40:
                    im.paste(STREIF, (int(sx) - 60, 260 + i * 50 - 60), STREIF)
        d.rounded_rectangle(box, 28, outline=(120, 128, 150), width=6)
    if augen_im_fenster:  # verstecktes Detail zum Nochmal-Anschauen: er schaut schon die ganze Zeit rein
        for ex in (-9, 9):
            im.paste(AUGE_LEISE, (560 + ex - 14, 330 - 14), AUGE_LEISE)
    for fx in (40, 380):  # Spiegelung schräg über die Scheibe
        d.line((fx + 40, 470, fx + 150, 190), fill=(60, 66, 86), width=5)
        d.line((fx + 70, 470, fx + 170, 210), fill=(38, 42, 58), width=3)
    hell = int(200 * licht)
    d.rectangle((0, 0, W, 96), fill=(12, 13, 20))
    d.rectangle((150, 66, 570, 88), fill=(hell, hell, min(255, hell + 20)))
    if licht > 0.3:
        glanz = LAMPE.resize((520, 260))
        im.paste(glanz, (100, -60), glanz)
    d.line((30, 132, 690, 132), fill=(150, 155, 170), width=6)  # Haltestange mit Griffen
    for i, gx in enumerate(range(80, 680, 110)):
        sw = math.sin(t * 1.7 + i) * 6
        d.line((gx, 132, gx + sw, 168), fill=(120, 125, 140), width=4)
        d.ellipse((gx + sw - 14, 166, gx + sw + 14, 194), outline=(190, 195, 210), width=5)
    d.polygon([(0, 900), (W, 900), (W + 260, H), (-260, H)], fill=(16, 17, 25))  # Boden in Perspektive
    for i in range(1, 7):
        yy = 900 + (H - 900) * (i / 7) ** 1.6
        d.line((0, yy, W, yy), fill=(22, 24, 34), width=2)
    for xx in range(-260, W + 300, 120):
        d.line((W / 2 + (xx - W / 2) * 0.55, 900, xx, H), fill=(22, 24, 34), width=2)
    d.rounded_rectangle((60, 520, 660, 712), 26, fill=(28, 33, 50))  # Rückenlehne mit Polstern
    for nx in (260, 460):
        d.line((nx, 530, nx, 700), fill=(20, 24, 38), width=4)
    d.line((76, 532, 644, 532), fill=(44, 50, 72), width=3)
    d.rounded_rectangle((52, 698, 668, 782), 20, fill=(36, 42, 64))  # Sitzfläche
    d.line((70, 704, 650, 704), fill=(58, 66, 92), width=4)
    d.rectangle((70, 782, 650, 820), fill=(18, 20, 30))
    d.line((690, 90, 690, 900), fill=(140, 145, 160), width=10)
    d.line((686, 90, 686, 900), fill=(200, 205, 220), width=2)


def zug_draussen(im, t, lt, kz):
    im.paste(HIMMEL)
    d = ImageDraw.Draw(im)
    sterne(d, t)
    d.rectangle((0, 830, W, H), fill=(18, 19, 26))
    d.line((0, 830, W, 830), fill=(200, 200, 210), width=4)
    d.line((470, 830, 470, 360), fill=(60, 62, 72), width=12)
    im.paste(LAMPE, (470 - 220, 360 - 120), LAMPE)
    d.rectangle((130, 420, 330, 480), fill=(30, 32, 44), outline=(190, 190, 200), width=4)
    d.text((230, 450), kz, font=KLEIN, fill=WEISS, anchor='mm')
    for i in range(3):
        nx = int((t * 30 + i * 300) % (W + 500)) - 400
        im.paste(NEBEL, (nx, 650 + i * 40), NEBEL)


def zug_rahmen(im, fuer_zettel=False):
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 120), fill=(16, 18, 28)); d.rectangle((0, 1060, W, H), fill=(16, 18, 28))
    d.rectangle((0, 0, 50, H), fill=(16, 18, 28)); d.rectangle((W - 50, 0, W, H), fill=(16, 18, 28))
    d.rounded_rectangle((50, 120, W - 50, 1060), 40, outline=(130, 136, 156), width=10)


KABINE, ZIMMER, NACHTWALD = verlauf((30, 32, 42), (10, 10, 16)), verlauf((26, 30, 30), (10, 11, 12)), verlauf((8, 14, 28), (2, 4, 6))
FEUER, MOND = leuchten(200, (255, 140, 50), 190), leuchten(70, (230, 235, 255), 230)
random.seed(21)
BAEUME = [(random.randrange(-40, W + 40), random.randrange(26, 70), random.random()) for _ in range(14)]
WOLKEN = [(random.randrange(0, W * 2), random.randrange(180, 1000), random.randrange(60, 160)) for _ in range(18)]


def _wolken(d, t, box=None, tempo=60):
    for x, y, r in WOLKEN:
        xx = (x - t * tempo) % (W * 2) - W / 2
        if box and not (box[0] - r < xx < box[2] + r and box[1] < y < box[3]):
            continue
        d.ellipse((xx - r, y - r * 0.4, xx + r, y + r * 0.4), fill=(34, 38, 54))


def _sitzbank(d, farbe_lehne, farbe_sitz, segmente=(260, 460)):
    d.rounded_rectangle((60, 520, 660, 712), 26, fill=farbe_lehne)
    for nx in segmente:
        d.line((nx, 530, nx, 700), fill=tuple(int(c * 0.7) for c in farbe_lehne), width=4)
    d.rounded_rectangle((52, 698, 668, 782), 20, fill=farbe_sitz)
    d.line((70, 704, 650, 704), fill=tuple(min(255, int(c * 1.4)) for c in farbe_sitz), width=4)
    d.rectangle((70, 782, 650, 820), fill=(18, 20, 30))


def flugzeug_innen(im, t, lt, licht=1.0, fahrt=True, augen_im_fenster=False):
    im.paste(KABINE)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((-20, 40, W + 20, 175), 30, fill=(44, 46, 58))  # Gepäckfächer
    for x in range(0, W, 180):
        d.line((x, 50, x, 170), fill=(30, 32, 42), width=3)
        d.ellipse((x + 80, 182, x + 96, 198), fill=(int(200 * licht), int(190 * licht), int(150 * licht)))
    for fx in (60, 280, 500):  # ovale Fenster mit Wolken und Blinklicht
        box = (fx, 230, fx + 150, 450)
        d.rounded_rectangle(box, 70, fill=(6, 8, 18))
        _wolken(d, t, box=box)
        sterne(d, t, box=box)
        d.rounded_rectangle(box, 70, outline=(150, 154, 168), width=8)
    if int(t * 1.2) % 2 == 0:
        rot = leuchten(30, (255, 40, 40), 220)
        im.paste(rot, (575 - 30, 400 - 30), rot)
    if augen_im_fenster:
        for ex in (-9, 9):
            im.paste(AUGE_LEISE, (575 + ex - 14, 330 - 14), AUGE_LEISE)
    d.polygon([(0, 900), (W, 900), (W + 260, H), (-260, H)], fill=(28, 22, 34))  # Teppich im Gang
    for i in range(1, 6):
        d.line((0, 900 + (H - 900) * (i / 6) ** 1.6, W, 900 + (H - 900) * (i / 6) ** 1.6), fill=(36, 28, 42), width=2)
    for x0, x1 in ((60, 250), (260, 460), (470, 660)):  # Sitze mit Kopfstütze
        d.rounded_rectangle((x0, 500, x1, 712), 30, fill=(32, 44, 86))
        d.rounded_rectangle((x0 + 30, 506, x1 - 30, 548), 14, fill=(200, 204, 214))
    d.rounded_rectangle((52, 698, 668, 782), 20, fill=(38, 52, 98))
    d.rectangle((70, 782, 650, 820), fill=(18, 20, 30))
    for ax in (255, 465):
        d.rounded_rectangle((ax - 10, 640, ax + 10, 720), 6, fill=(60, 62, 74))


def flugzeug_draussen(im, t, lt, kz):
    im.paste(HIMMEL)
    d = ImageDraw.Draw(im)
    sterne(d, t)
    _wolken(d, t, tempo=240)
    d.polygon([(-40, 800), (W + 40, 860), (W + 40, 960), (-40, 940)], fill=(78, 84, 100))  # Flügel
    d.line((-40, 800, W + 40, 860), fill=(150, 156, 172), width=5)
    if int(t * 1.2) % 2 == 0:
        rot = leuchten(40, (255, 40, 40), 230)
        im.paste(rot, (W - 70, 820), rot)


def flugzeug_rahmen(im, fuer_zettel=False):
    maske = Image.new('L', (W, H), 255)
    ImageDraw.Draw(maske).rounded_rectangle((90, 150, W - 90, 1040), 170, fill=0)
    im.paste(KABINE, (0, 0), maske)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((90, 150, W - 90, 1040), 170, outline=(160, 164, 178), width=14)
    d.rounded_rectangle((70, 130, W - 70, 1060), 185, outline=(90, 94, 106), width=6)


def haus_innen(im, t, lt, licht=1.0, fahrt=True, augen_im_fenster=False):
    im.paste(ZIMMER)
    d = ImageDraw.Draw(im)
    for x in range(0, W, 48):  # Tapete
        d.line((x, 0, x, 900), fill=(32, 36, 36), width=3)
    box = (190, 170, 530, 470)  # Fenster zum Garten
    d.rectangle(box, fill=(6, 10, 22))
    im.paste(MOND, (420 - 70, 230 - 70), MOND)
    for i in range(5):
        bx = 210 + i * 70
        d.polygon([(bx, 470), (bx + 30, 300 + (i * 37) % 60), (bx + 60, 470)], fill=(4, 6, 10))
    if augen_im_fenster:
        for ex in (-9, 9):
            im.paste(AUGE_LEISE, (300 + ex - 14, 400 - 14), AUGE_LEISE)
    d.rectangle(box, outline=(120, 96, 70), width=10)
    d.line((360, 170, 360, 470), fill=(120, 96, 70), width=8)
    d.line((190, 320, 530, 320), fill=(120, 96, 70), width=8)
    wehen = math.sin(t * 1.3) * 8  # Vorhänge
    for x0 in (140, 520):
        d.polygon([(x0, 150), (x0 + 60, 150), (x0 + 50 + wehen, 500), (x0 + 6 + wehen, 500)], fill=(80, 22, 28))
    d.rectangle((40, 220, 120, 320), outline=(140, 116, 80), width=6)  # Bild an der Wand
    d.ellipse((600, 210, 680, 290), fill=(40, 42, 46), outline=(170, 170, 176), width=5)  # Uhr
    d.line((640, 250, 640, 218), fill=(220, 220, 225), width=4)
    d.line((640, 250, 664, 250), fill=(220, 220, 225), width=3)
    d.polygon([(0, 900), (W, 900), (W + 260, H), (-260, H)], fill=(44, 30, 22))  # Holzboden
    for xx in range(-260, W + 300, 70):
        d.line((W / 2 + (xx - W / 2) * 0.55, 900, xx, H), fill=(34, 22, 16), width=2)
    _sitzbank(d, (66, 42, 40), (80, 52, 48))  # Sofa
    for ax in (40, 680):
        d.rounded_rectangle((ax - 30, 600, ax + 30, 790), 26, fill=(72, 46, 44))
    d.line((700, 300, 700, 900), fill=(60, 60, 66), width=8)  # Stehlampe
    if licht > 0.3:
        schein = leuchten(120, (255, 200, 120), int(150 * licht))
        im.paste(schein, (700 - 120, 300 - 120), schein)
    d.polygon([(660, 260), (740, 260), (720, 320), (680, 320)], fill=(150, 120, 80))


def haus_draussen(im, t, lt, kz):
    im.paste(HIMMEL)
    d = ImageDraw.Draw(im)
    sterne(d, t)
    im.paste(MOND, (560 - 70, 250 - 70), MOND)
    for x, breite, tiefe in BAEUME[:8]:
        d.polygon([(x - breite, 830), (x, 330 + tiefe * 200), (x + breite, 830)], fill=(4, 8, 12))
    d.rectangle((0, 830, W, H), fill=(10, 18, 14))  # Rasen
    for x in range(0, W, 36):  # Gartenzaun
        d.rectangle((x, 760, x + 14, 840), fill=(40, 40, 44))
    d.line((0, 785, W, 785), fill=(40, 40, 44), width=8)
    for i in range(2):
        nx = int((t * 25 + i * 380) % (W + 500)) - 400
        im.paste(NEBEL, (nx, 700 + i * 50), NEBEL)


def haus_rahmen(im, fuer_zettel=False):
    d = ImageDraw.Draw(im)
    for box in ((0, 0, W, 120), (0, 1060, W, H), (0, 0, 50, H), (W - 50, 0, W, H)):
        d.rectangle(box, fill=(26, 30, 30))
    d.rectangle((50, 120, W - 50, 1060), outline=(120, 96, 70), width=16)
    d.line((W / 2, 120, W / 2, 1060), fill=(120, 96, 70), width=12)
    d.line((50, 590, W - 50, 590), fill=(120, 96, 70), width=12)


def wald_innen(im, t, lt, licht=1.0, fahrt=True, augen_im_fenster=False):
    # Lagerfeuer im Wald: Bäume, Mond, Baumstamm als Sitz, flackerndes Feuer vorne
    im.paste(NACHTWALD)
    d = ImageDraw.Draw(im)
    sterne(d, t)
    im.paste(MOND, (140 - 70, 170 - 70), MOND)
    for x, breite, tiefe in BAEUME:
        farbe = (int(6 + 10 * tiefe), int(10 + 12 * tiefe), int(14 + 14 * tiefe))
        d.rectangle((x - breite // 3, 80 + int(tiefe * 120), x + breite // 3, 900), fill=farbe)
        d.polygon([(x - breite * 1.4, 520), (x, 60 + tiefe * 150), (x + breite * 1.4, 520)], fill=farbe)
    if augen_im_fenster:
        for ex in (-9, 9):
            im.paste(AUGE_LEISE, (600 + ex - 14, 420 - 14), AUGE_LEISE)
    d.rectangle((0, 760, W, H), fill=(12, 16, 12))
    d.rounded_rectangle((52, 690, 668, 790), 46, fill=(64, 44, 30))  # Baumstamm
    for x in range(90, 640, 70):
        d.arc((x, 700, x + 60, 780), 200, 340, fill=(44, 30, 20), width=3)
    for ex in (52, 668):
        d.ellipse((ex - 30, 690, ex + 30, 790), fill=(110, 80, 52), outline=(70, 50, 32), width=4)
    flamme = 0.8 + 0.2 * math.sin(t * 13) + 0.1 * math.sin(t * 29)
    glut = FEUER.resize((int(400 * flamme * max(licht, 0.3)), int(400 * flamme * max(licht, 0.3))))
    im.paste(glut, (380 - glut.width // 2, 1160 - glut.height // 2), glut)
    for i in range(5):  # Holzscheite + Flammen
        d.line((300 + i * 40, 1210, 380, 1130), fill=(60, 36, 22), width=12)
    for i in range(4):
        h = 70 + 30 * math.sin(t * 9 + i * 1.7)
        d.polygon([(350 + i * 20, 1170), (360 + i * 20, 1170 - h), (372 + i * 20, 1170)], fill=(255, 150 + i * 20, 40))


def wald_draussen(im, t, lt, kz):
    im.paste(NACHTWALD)
    d = ImageDraw.Draw(im)
    sterne(d, t)
    for x, breite, tiefe in BAEUME:
        farbe = (int(4 + 8 * tiefe), int(8 + 10 * tiefe), int(12 + 12 * tiefe))
        d.rectangle((x - breite // 3, 80 + int(tiefe * 150), x + breite // 3, 830), fill=farbe)
    d.rectangle((0, 830, W, H), fill=(12, 16, 12))
    d.polygon([(300, 830), (420, 830), (W, H), (0, H)], fill=(30, 26, 20))  # Waldweg
    for i in range(3):
        nx = int((t * 30 + i * 300) % (W + 500)) - 400
        im.paste(NEBEL, (nx, 650 + i * 40), NEBEL)


def wald_rahmen(im, fuer_zettel=False):
    # kein Fenster im Wald: nur für den Zettel ein dicker Baumstamm in der Mitte
    if not fuer_zettel:
        return
    d = ImageDraw.Draw(im)
    d.rectangle((200, 0, 520, H), fill=(40, 30, 22))
    for y in range(40, H, 90):
        d.arc((210, y, 510, y + 80), 190, 350, fill=(26, 18, 12), width=5)


INNEN = {'zug': zug_innen, 'flugzeug': flugzeug_innen, 'haus': haus_innen, 'wald': wald_innen}
DRAUSSEN = {'zug': zug_draussen, 'flugzeug': flugzeug_draussen, 'haus': haus_draussen, 'wald': wald_draussen}
RAHMEN = {'zug': zug_rahmen, 'flugzeug': flugzeug_rahmen, 'haus': haus_rahmen, 'wald': wald_rahmen}
SPIEGELBOX = {'zug': (386, 186, 674, 464), 'flugzeug': (506, 236, 644, 444), 'haus': (196, 176, 524, 464), 'wald': (386, 186, 674, 464)}


def innenraum(im, t, lt, licht=1.0, fahrt=True, augen_im_fenster=False):
    INNEN.get(ORT[0], zug_innen)(im, t, lt, licht=licht, fahrt=fahrt, augen_im_fenster=augen_im_fenster)


def draussen(im, t, lt, kz):
    DRAUSSEN.get(ORT[0], zug_draussen)(im, t, lt, kz)


def rahmen(im, fuer_zettel=False):
    RAHMEN.get(ORT[0], zug_rahmen)(im, fuer_zettel)
