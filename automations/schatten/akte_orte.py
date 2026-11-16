# Detailliertere Orte für den Akte-Stil (16.11., Wunsch: "mach die geiler, andere Orte - virale Orte, die Sinn ergeben").
# Orte, die in viralen Horror-Shorts immer wieder vorkommen und zur Geschichte passen: Wohnblock (Nachbar, Wand),
# Hausflur mit Wohnungstür (Klopfen, Tür, Treppenhaus), Schlafzimmer (Bett, Schrank, Schlaf), Haus am Waldrand.
# Dazu für alle Außen-Orte Atmosphäre: Mond mit Schein, Nebel, leuchtende Fenster mit Glühen, langsame Kamerafahrt.
import math
from PIL import Image, ImageDraw, ImageFilter

W, H = 720, 1280


def glut(im, kreise, farbe, blur=26):
    # weiches Leuchten um Lichtquellen (Fenster, Laternen, Mond)
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    for x0, y0, x1, y1 in kreise:
        d.rectangle((x0 - 10, y0 - 10, x1 + 10, y1 + 10), fill=farbe + (90,))
    lage = lage.filter(ImageFilter.GaussianBlur(blur))
    im.paste(lage, (0, 0), lage)


def himmel(im, t):
    d = ImageDraw.Draw(im)
    for y in range(0, H, 8):
        k = min(y / 800, 1)
        d.rectangle((0, y, W, y + 8), fill=(int(10 + 22 * k), int(12 + 24 * k), int(34 + 36 * k)))
    for i in range(55):
        x, y = (i * 137) % W, (i * 89) % 640 + 60
        if math.sin(t * 2.5 + i * 1.7) > -0.5:
            r = 1 + (i % 3 == 0)
            d.ellipse((x, y, x + r * 2, y + r * 2), fill=(220, 226, 255))
    mond = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(mond).ellipse((470, 120, 660, 310), fill=(200, 210, 255, 70))
    mond = mond.filter(ImageFilter.GaussianBlur(40))
    im.paste(mond, (0, 0), mond)
    d.ellipse((530, 180, 600, 250), fill=(240, 240, 226))
    d.ellipse((548, 196, 562, 210), fill=(222, 222, 206))


def nebel(im, t, y=740, staerke=70):
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    for i in range(7):
        x = (i * 160 + t * 18) % (W + 300) - 200
        d.ellipse((x, y - 40 + (i % 3) * 18, x + 360, y + 70 + (i % 3) * 18), fill=(150, 160, 190, staerke))
    lage = lage.filter(ImageFilter.GaussianBlur(30))
    im.paste(lage, (0, 0), lage)


def baum(d, x, y, h, farbe=(8, 12, 14)):
    d.line((x, y, x, y - h), fill=farbe, width=max(3, h // 22))
    for i in range(6):
        hy = y - h * (0.35 + i * 0.1)
        lang = h * (0.32 - i * 0.04)
        for sx in (-1, 1):
            d.line((x, hy, x + sx * lang, hy - lang * 0.5), fill=farbe, width=max(2, h // 40))


def gestalt_in(d, box, t):
    # der Geist der Geschichte (akte_geist.py) steht im Fenster - Kopf und Oberkörper, mit dem Fenster beschnitten
    from akte_geist import geist
    x0, y0, x1, y1 = (int(v) for v in box)
    im = d._image
    aus = im.crop((x0, y0, x1, y1))
    tmp = Image.new('RGB', (x1 - x0, y1 - y0), (14, 16, 22))
    tmp.paste(aus)
    h = y1 - y0
    geist(tmp, (x1 - x0) / 2, h * 3.0, s=h * 2.6 / 560, t=t)
    im.paste(tmp, (x0, y0))


def wohnblock(im, t, gestalt=0.0, dunkel=0.0):
    himmel(im, t)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 820, W, H), fill=(14, 16, 20))
    d.rectangle((90, 260, 630, 830), fill=(58, 60, 72))
    d.rectangle((90, 250, 630, 270), fill=(40, 42, 52))
    fenster, licht = [], []
    for r in range(7):
        for c in range(5):
            box = (118 + c * 102, 290 + r * 76, 178 + c * 102, 340 + r * 76)
            d.rectangle((box[0] - 4, box[3], box[2] + 4, box[3] + 6), fill=(80, 82, 94))  # Fensterbank
            nachbar = (r, c) == (3, 3)
            ich = (r, c) == (3, 2)
            an = ich or (not nachbar and (r * 5 + c * 3 + int(t * 0.3)) % 4 == 0)
            d.rectangle(box, fill=(255, 210, 120) if an and dunkel < 0.5 else (14, 16, 22))
            if an:
                licht.append(box)
            if nachbar:
                fenster.append(box)
    d.rectangle((330, 730, 390, 830), fill=(30, 30, 36))  # Haustür
    glut(im, licht, (255, 190, 90))
    if gestalt:
        gestalt_in(ImageDraw.Draw(im), fenster[0], t)
    for x in (40, 680):
        baum(d, x, 840, 320)
    nebel(im, t, 820)
    return licht


def flur(im, t, gestalt=0.0, dunkel=0.0):
    # Hausflur: Fliesen, flackernde Deckenlampe, Wohnungstür mit Spion, Fußmatte, Licht unter der Tür
    d = ImageDraw.Draw(im)
    an = dunkel < 0.5 and (math.sin(t * 9) > -0.8 or int(t * 3) % 5)
    wand = (70, 66, 60) if an else (28, 26, 24)
    d.rectangle((0, 0, W, H), fill=wand)
    d.rectangle((0, 900, W, H), fill=(46, 44, 42) if an else (18, 18, 18))
    for i in range(10):
        d.line((i * 80, 900, i * 80 - 200, H), fill=(36, 34, 32), width=2)
    d.rectangle((0, 860, W, 900), fill=(40, 38, 36))  # Fußleiste
    d.rectangle((230, 300, 490, 880), fill=(92, 60, 40))
    d.rectangle((230, 300, 490, 880), outline=(54, 36, 26), width=10)
    for y0 in (340, 600):
        d.rectangle((262, y0, 458, y0 + 220), outline=(70, 46, 30), width=6)
    d.ellipse((350, 420, 370, 440), fill=(20, 20, 24))  # Spion
    d.ellipse((440, 590, 462, 612), fill=(200, 180, 120))  # Klinke
    d.rectangle((250, 880, 470, 910), fill=(70, 30, 30))  # Fußmatte
    unter = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(unter).rectangle((236, 872, 484, 882), fill=(255, 230, 170, 200 if not gestalt else 60))
    im.paste(unter.filter(ImageFilter.GaussianBlur(6)), (0, 0), unter.filter(ImageFilter.GaussianBlur(6)))
    if gestalt:  # zwei Füße im Lichtspalt unter der Tür
        for x in (320, 390):
            d.rectangle((x, 872, x + 40, 882), fill=(4, 4, 6))
    d.text((360, 260), '3B', fill=(220, 210, 180), anchor='mm')
    lampe = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(lampe).ellipse((260, -60, 460, 120), fill=(255, 240, 200, 150 if an else 20))
    im.paste(lampe.filter(ImageFilter.GaussianBlur(30)), (0, 0), lampe.filter(ImageFilter.GaussianBlur(30)))
    return []


def schlafzimmer(im, t, gestalt=0.0, dunkel=0.0):
    # Schlafzimmer bei Nacht: Bett, Fenster mit Mond, Schrank einen Spalt offen, Handy leuchtet auf dem Nachttisch
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, H), fill=(26, 28, 44))
    d.rectangle((0, 880, W, H), fill=(34, 30, 34))
    d.rectangle((60, 260, 300, 560), fill=(20, 30, 64))  # Fenster
    d.ellipse((200, 300, 250, 350), fill=(236, 236, 220))
    d.rectangle((60, 260, 300, 560), outline=(70, 72, 90), width=12)
    d.line((180, 260, 180, 560), fill=(70, 72, 90), width=8)
    mondlicht = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(mondlicht).polygon([(60, 560), (300, 560), (520, 1100), (160, 1100)], fill=(150, 170, 230, 40))
    im.paste(mondlicht.filter(ImageFilter.GaussianBlur(24)), (0, 0), mondlicht.filter(ImageFilter.GaussianBlur(24)))
    d.rectangle((470, 220, 680, 880), fill=(70, 52, 44))  # Schrank
    spalt = 6 + 30 * gestalt
    d.rectangle((575 - spalt / 2, 240, 575 + spalt / 2, 860), fill=(4, 4, 6))
    if gestalt:
        for ex in (-4, 4):
            d.ellipse((575 + ex - 2, 470, 575 + ex + 2, 474), fill=(255, 255, 255))
    d.rounded_rectangle((60, 820, 440, 980), 20, fill=(70, 80, 120))  # Bett
    d.rounded_rectangle((60, 760, 200, 850), 30, fill=(220, 222, 232))
    d.rectangle((460, 880, 560, 960), fill=(60, 44, 36))  # Nachttisch
    an = int(t * 2) % 3 != 0
    d.rounded_rectangle((488, 862, 532, 884), 4, fill=(200, 225, 255) if an else (30, 30, 36))
    if an:
        glut(im, [(488, 862, 532, 884)], (150, 190, 255), 18)
    return []


def haus_wald(im, t, gestalt=0.0, dunkel=0.0):
    # einsames Haus am Waldrand: Veranda-Licht, Zaun, kahle Bäume, Nebel
    himmel(im, t)
    d = ImageDraw.Draw(im)
    for i in range(9):
        baum(d, i * 90 + 10, 800, 260 + (i * 53) % 140, (14, 20, 22))
    d.rectangle((0, 790, W, H), fill=(16, 22, 20))
    d.polygon([(160, 520), (360, 380), (560, 520)], fill=(44, 38, 48))
    d.rectangle((190, 520, 530, 800), fill=(64, 58, 70))
    d.rectangle((190, 520, 530, 800), outline=(40, 36, 44), width=6)
    licht = [(225, 560, 295, 630), (425, 560, 495, 630)]
    oben = (330, 430, 390, 480)  # Dachfenster
    for i, b in enumerate(licht):
        d.rectangle(b, fill=(255, 206, 120) if dunkel < 0.5 and (i + int(t * 0.4)) % 3 else (14, 14, 20))
    d.rectangle(oben, fill=(14, 14, 20))
    d.rectangle((330, 680, 390, 800), fill=(30, 24, 26))
    d.ellipse((350, 652, 370, 672), fill=(255, 220, 140))
    glut(im, licht + [(350, 652, 370, 672)], (255, 190, 90))
    for x in range(0, W, 34):  # Zaun
        d.rectangle((x, 830, x + 10, 900), fill=(40, 40, 44))
    d.rectangle((0, 846, W, 854), fill=(40, 40, 44))
    if gestalt:
        gestalt_in(ImageDraw.Draw(im), oben, t)
    nebel(im, t, 840, 80)
    return licht


ORTE = {'wohnblock': wohnblock, 'flur': flur, 'schlafzimmer': schlafzimmer, 'haus': haus_wald}
