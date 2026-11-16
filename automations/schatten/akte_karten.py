# Karten für den Akte-Stil (15.11., Vorlage vom Nutzer: "So ungefähr" - Analog-Horror im Infografik-Look).
# Eigene Zeichnungen, nur das Format ist übernommen: Ort-Illustration, Bauplan mit markiertem Raum, Checkliste,
# Lautsprecher mit Tonwelle, Porträt im Kreis, Chat mit Notfall-Meldung, Schild mit Zahl, Wahl-Karten, Teil-2-Karte.
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 720, 1280
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
GRUND, ROT, GELB, GRUEN = (22, 26, 38), (230, 40, 50), (255, 206, 40), (120, 220, 90)
_F = {}


def f(gr, mono=False):
    k = (gr, mono)
    if k not in _F:
        _F[k] = ImageFont.truetype(MONO if mono else FONT, gr)
    return _F[k]


def schatten_rand(im, box, r=26):
    s = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(s).rounded_rectangle((box[0] + 8, box[1] + 14, box[2] + 8, box[3] + 14), r, fill=(0, 0, 0, 140))
    im.paste(s.filter(ImageFilter.GaussianBlur(12)), (0, 0), s.filter(ImageFilter.GaussianBlur(12)))


def ort_bild(im, ort, t, dunkel=0.0, gestalt=0.0):
    from akte_orte import ORTE
    if ort in ORTE:  # detaillierte Orte (akte_orte.py): Wohnblock, Hausflur, Schlafzimmer, Haus am Waldrand
        ORTE[ort](im, t, gestalt, dunkel)
        if dunkel:
            im.paste(Image.blend(im, Image.new('RGB', im.size, (4, 4, 10)), dunkel))
        return
    # flache Nacht-Illustration: Mond, Sterne, Haus / Zug / Wald / Hochhaus mit Aufzug; optional Gestalt im Fenster
    d = ImageDraw.Draw(im)
    for y in range(0, 760, 8):
        k = y / 760
        d.rectangle((0, y, W, y + 8), fill=(int(20 + 18 * k), int(24 + 22 * k), int(52 + 30 * k)))
    for i in range(40):
        x, y = (i * 137) % W, (i * 89) % 600 + 120
        if (math.sin(t * 3 + i) > -0.6):
            d.ellipse((x, y, x + 3, y + 3), fill=(220, 225, 255))
    d.ellipse((540, 170, 610, 240), fill=(236, 236, 220))
    d.rectangle((0, 760, W, H), fill=(18, 24, 22))
    fenster = []
    if ort == 'zug':
        for i in range(5):
            x = (i * 190 - t * 60) % (W + 190) - 190
            d.rounded_rectangle((x, 600, x + 180, 740), 14, fill=(170, 176, 196))
            d.rectangle((x, 700, x + 180, 712), fill=(196, 40, 52))
            for j in range(3):
                fenster.append((x + 14 + j * 56, 624, x + 56 + j * 56, 672))
        d.rectangle((0, 742, W, 752), fill=(60, 60, 64))
    elif ort == 'wald':
        for i in range(14):
            x = i * 56 - 20
            hgt = 260 + (i * 47) % 160
            d.polygon([(x + 30, 760 - hgt), (x - 20, 770), (x + 80, 770)], fill=(10 + i % 3 * 4, 30 + i % 4 * 5, 24))
        d.polygon([(250, 770), (360, 640), (470, 770)], fill=(196, 132, 60))  # Zelt
        fenster.append((338, 700, 382, 770))
    elif ort == 'aufzug':
        d.rectangle((220, 220, 500, 770), fill=(44, 48, 62))
        for r in range(9):
            for c in range(4):
                if (r * 4 + c) % 3:
                    fenster.append((240 + c * 64, 240 + r * 58, 284 + c * 64, 276 + r * 58))
    elif ort == 'strasse':  # Landstraße, Auto mit Scheinwerfern, Laternen ziehen vorbei
        d.polygon([(330, 760), (390, 760), (W + 120, H), (-120, H)], fill=(34, 34, 40))
        for i in range(6):
            z = ((t * 0.7 + i / 6) % 1)
            y0 = 760 + (H - 760) * z * z
            d.rectangle((357 - 4 * z, y0, 363 + 4 * z, y0 + 30 * z + 4), fill=(220, 210, 150))
            for sx in (-1, 1):
                x = 360 + sx * (60 + 520 * z * z)
                d.line((x, y0, x, y0 - 40 - 300 * z * z), fill=(70, 70, 80), width=max(2, int(8 * z)))
                d.ellipse((x - 12 * z - 3, y0 - 46 - 300 * z * z, x + 12 * z + 3, y0 - 34 - 300 * z * z), fill=(255, 220, 140))
        d.rounded_rectangle((250, 960, 470, 1080), 26, fill=(150, 30, 40))
        d.rounded_rectangle((285, 900, 435, 980), 20, fill=(120, 24, 32))
        d.rectangle((300, 912, 420, 960), fill=(30, 36, 52))
        fenster.append((330, 916, 390, 958))
        for sx in (-1, 1):
            d.ellipse((360 + sx * 85 - 16, 1010, 360 + sx * 85 + 16, 1040), fill=(255, 240, 190))
    elif ort == 'stadt':  # Hochhäuser, vereinzelt Licht
        for i, (x, hh) in enumerate(((20, 420), (150, 560), (290, 380), (400, 620), (540, 470), (640, 520))):
            d.rectangle((x, 760 - hh, x + 110, 770), fill=(40 + i % 2 * 8, 44, 60))
            for r in range(hh // 46):
                for c in range(3):
                    fenster.append((x + 12 + c * 34, 780 - hh + r * 46, x + 34 + c * 34, 806 - hh + r * 46))
    elif ort == 'hotel':  # Hotel mit Leuchtschrift
        d.rectangle((150, 300, 570, 770), fill=(60, 50, 64))
        d.rectangle((200, 230, 520, 300), fill=(20, 16, 24))
        an = int(t * 3) % 7 != 0
        d.text((360, 265), 'HOTEL', font=f(56, True), fill=(255, 70, 90) if an else (90, 30, 40), anchor='mm')
        for r in range(6):
            for c in range(5):
                fenster.append((176 + c * 78, 330 + r * 68, 226 + c * 78, 374 + r * 68))
    elif ort == 'tankstelle':
        d.rectangle((90, 520, 630, 560), fill=(230, 230, 236))
        d.rectangle((90, 560, 630, 572), fill=(200, 40, 50))
        for x in (140, 560):
            d.rectangle((x, 572, x + 22, 770), fill=(200, 200, 206))
        for x in (260, 420):
            d.rounded_rectangle((x, 640, x + 46, 770), 8, fill=(200, 40, 50))
            d.rectangle((x + 8, 656, x + 38, 690), fill=(30, 36, 50))
        licht = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(licht).polygon([(90, 572), (630, 572), (720, 900), (0, 900)], fill=(255, 250, 220, 60))
        im.paste(licht.filter(ImageFilter.GaussianBlur(20)), (0, 0), licht.filter(ImageFilter.GaussianBlur(20)))
        fenster.append((300, 600, 330, 640))
    elif ort == 'see':  # See mit Steg, Spiegelung des Mondes
        d.rectangle((0, 700, W, H), fill=(14, 22, 44))
        for i in range(10):
            d.line((560 + math.sin(t * 2 + i) * 20, 720 + i * 26, 600 - math.sin(t * 2 + i) * 20, 720 + i * 26), fill=(200, 200, 190), width=3)
        for i in range(12):
            x = i * 64 - 20
            d.polygon([(x + 30, 700 - 180 - (i * 37) % 90), (x - 10, 704), (x + 70, 704)], fill=(8, 20, 18))
        d.polygon([(250, H), (330, 820), (370, 820), (420, H)], fill=(80, 60, 44))
        fenster.append((340, 760, 362, 818))
    elif ort == 'flugzeug':  # Blick aus dem Flugzeugfenster über Wolken
        d.rectangle((0, 0, W, H), fill=(30, 32, 40))
        d.rounded_rectangle((150, 300, 570, 860), 200, fill=(40, 60, 110))
        for i in range(5):
            d.ellipse((150 + i * 90 - 60, 700 - (i % 2) * 40, 150 + i * 90 + 120, 820), fill=(200, 206, 220))
        d.polygon([(330, 520), (600, 600), (600, 630), (330, 560)], fill=(180, 184, 196))  # Tragfläche
        d.rounded_rectangle((150, 300, 570, 860), 200, outline=(70, 72, 84), width=26)
        fenster.append((440, 560, 470, 600))
    else:  # Haus
        d.polygon([(170, 470), (360, 330), (550, 470)], fill=(52, 46, 58))
        d.rectangle((200, 470, 520, 770), fill=(70, 64, 78))
        d.rectangle((330, 640, 390, 770), fill=(30, 26, 32))
        fenster += [(230, 510, 300, 580), (420, 510, 490, 580), (230, 640, 300, 710), (420, 640, 490, 710)]
    for i, (x0, y0, x1, y1) in enumerate(fenster):
        an = (i * 7 + int(t * 0.5)) % 5 != 0
        d.rectangle((x0, y0, x1, y1), fill=(255, 214, 120) if an and dunkel < 0.5 else (24, 26, 34))
    if gestalt > 0 and fenster:
        x0, y0, x1, y1 = fenster[len(fenster) // 2]
        cx = (x0 + x1) / 2
        d.ellipse((cx - 9, y0 + 4, cx + 9, y0 + 22), fill=(6, 6, 8))
        d.rectangle((cx - 12, y0 + 20, cx + 12, y1), fill=(6, 6, 8))
        for ex in (-4, 4):
            d.ellipse((cx + ex - 2, y0 + 11, cx + ex + 2, y0 + 15), fill=(255, 255, 255))
    if dunkel:
        im.paste(Image.blend(im, Image.new('RGB', im.size, (4, 4, 10)), dunkel))


def bauplan(im, ort, markiert, t):
    # blaues Raster, weiße Strichzeichnung, ein Bereich gelb markiert und beschriftet
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, H), fill=(26, 52, 120))
    for x in range(0, W, 40):
        d.line((x, 0, x, H), fill=(40, 70, 146), width=1)
    for y in range(0, H, 40):
        d.line((0, y, W, y), fill=(40, 70, 146), width=1)
    weiss = (236, 240, 255)
    if ort == 'zug':
        d.rounded_rectangle((70, 520, 650, 740), 30, outline=weiss, width=5)
        for i in range(4):
            d.rectangle((110 + i * 130, 560, 200 + i * 130, 630), outline=weiss, width=4)
        ziel = (330, 540, 460, 720)
    else:
        d.rectangle((100, 300, 620, 720), outline=weiss, width=6)
        d.line((360, 300, 360, 520), fill=weiss, width=5)
        d.line((100, 520, 620, 520), fill=weiss, width=5)
        d.arc((300, 460, 420, 580), 180, 270, fill=weiss, width=4)  # Tür
        ziel = (370, 310, 610, 510)
    p = 0.5 + 0.5 * math.sin(t * 5)
    d.rectangle(ziel, outline=GELB, width=int(6 + 3 * p))
    for i in range(4):
        y = ziel[1] + 20 + i * (ziel[3] - ziel[1] - 40) / 3
        d.line((ziel[0] + 10, y, ziel[2] - 10, y + 30), fill=GELB, width=3)
    d.line((ziel[0], ziel[1], 150, 270), fill=weiss, width=3)
    d.rectangle((110, 210, 110 + f(34).getlength(markiert) + 40, 260), fill=(10, 14, 30))
    d.text((130, 222), markiert, font=f(34), fill=weiss)
    d.text((W / 2, ziel[3] + 70), '— 12 400 mm —', font=f(20, True), fill=weiss, anchor='mm')


def checkliste(im, punkte, t):
    d = ImageDraw.Draw(im)
    box = (90, 380, 630, 400 + 90 * len(punkte))
    schatten_rand(im, box, 18)
    d.rounded_rectangle(box, 18, fill=(246, 236, 210))
    for i, p in enumerate(punkte):
        y = 410 + i * 90
        d.rounded_rectangle((120, y, 160, y + 40), 6, outline=(40, 40, 50), width=4)
        if t > 0.4 + i * 0.5:
            d.line((126, y + 20, 138, y + 34, 158, y + 4), fill=(30, 120, 60), width=7)
        d.text((180, y + 2), p, font=f(32), fill=(30, 30, 40))


def lautsprecher(im, t, label):
    d = ImageDraw.Draw(im)
    cx, cy = W / 2, 420
    d.ellipse((cx - 190, cy - 190, cx + 190, cy + 190), fill=(54, 58, 72), outline=(120, 124, 140), width=6)
    for r in range(10, 180, 18):
        for k in range(0, 360, max(8, int(360 / (r / 3)))):
            a = math.radians(k)
            d.ellipse((cx + math.cos(a) * r - 4, cy + math.sin(a) * r - 4, cx + math.cos(a) * r + 4, cy + math.sin(a) * r + 4), fill=(24, 26, 34))
    d.rectangle((150, 630, 570, 730), fill=(16, 22, 24), outline=(60, 90, 80), width=3)
    d.text((165, 600), label, font=f(18, True), fill=GRUEN)
    pts = [(160 + i * 4, 680 + math.sin(i * 0.3 + t * 9) * 26 * math.sin(i * 0.05 + t)) for i in range(100)]
    d.line(pts, fill=GRUEN, width=3)


def portrait(im, t, name, angst=0.7, held_gesicht=None):
    d = ImageDraw.Draw(im)
    cx, cy = W / 2, 440
    d.ellipse((cx - 210, cy - 210, cx + 210, cy + 210), fill=(46, 120, 90))
    d.ellipse((cx - 190, cy - 190, cx + 190, cy + 190), fill=(226, 230, 236))
    d.ellipse((cx - 130, cy - 170, cx + 130, cy - 10), fill=(56, 40, 32))  # Haare
    d.ellipse((cx - 110, cy - 120, cx + 110, cy + 120), fill=(240, 210, 188))
    d.chord((cx - 120, cy - 175, cx + 120, cy - 30), 180, 360, fill=(56, 40, 32))
    zitter = math.sin(t * 40) * 2 * angst
    for ex in (-45, 45):
        d.ellipse((cx + ex - 24, cy - 30, cx + ex + 24, cy + 18), fill=(255, 255, 255), outline=(30, 30, 40), width=3)
        d.ellipse((cx + ex - 8 + zitter, cy - 14, cx + ex + 8 + zitter, cy + 2), fill=(20, 20, 26))
    d.ellipse((cx - 14, cy + 50, cx + 14, cy + 50 + 30 * angst), fill=(60, 20, 26))
    d.rounded_rectangle((cx - 150, cy + 230, cx + 150, cy + 290), 12, fill=(10, 12, 20))
    d.text((cx, cy + 260), name, font=f(30), fill=(255, 255, 255), anchor='mm')


def chat(im, t, absender, nachrichten, notfall=None):
    d = ImageDraw.Draw(im)
    x0, y0 = 110, 260
    d.rounded_rectangle((x0, y0, x0 + 340, y0 + 470), 30, fill=(30, 32, 40), outline=(70, 72, 84), width=3)
    d.ellipse((x0 + 150, y0 + 30, x0 + 190, y0 + 70), fill=(80, 84, 100))
    d.text((x0 + 170, y0 + 50), absender[:1].upper(), font=f(22), fill=(255, 255, 255), anchor='mm')
    d.text((x0 + 170, y0 + 92), absender, font=f(20), fill=(220, 220, 230), anchor='mm')
    y = y0 + 130
    for i, n in enumerate(nachrichten):
        if t < 0.3 + i * 0.9:
            break
        zeilen = _umbruch(n, f(20), 240)
        h = 26 * len(zeilen) + 20
        d.rounded_rectangle((x0 + 20, y, x0 + 40 + max(f(20).getlength(z) for z in zeilen), y + h), 14, fill=(58, 60, 72))
        for j, z in enumerate(zeilen):
            d.text((x0 + 32, y + 10 + j * 26), z, font=f(20), fill=(240, 240, 245))
        y += h + 14
    if notfall and t > 0.3 + len(nachrichten) * 0.9:
        d.rounded_rectangle((420, 280, 640, 730), 26, fill=(130, 20, 26))
        d.rounded_rectangle((430, 300, 630, 380), 14, fill=(220, 50, 60))
        d.text((445, 318), '⚠ NOTFALL', font=f(22), fill=(255, 255, 255))
        for j, z in enumerate(_umbruch(notfall, f(17), 170)[:2]):
            d.text((445, 348 + j * 20), z, font=f(17), fill=(255, 230, 230))
        if int(t * 3) % 2:
            d.text((530, 580), '!', font=f(140), fill=(240, 60, 70), anchor='mm')


def schild(im, zahl, oben, unten):
    d = ImageDraw.Draw(im)
    d.rectangle((250, 260, 470, 330), fill=(210, 160, 40))
    d.text((360, 295), oben, font=f(34), fill=(20, 20, 20), anchor='mm')
    box = (190, 350, 530, 740)
    schatten_rand(im, box, 30)
    d.rounded_rectangle(box, 30, fill=(236, 238, 240), outline=(120, 124, 130), width=8)
    d.text((360, 520), str(zahl), font=f(180), fill=(22, 24, 30), anchor='mm')
    d.rectangle((215, 650, 505, 715), fill=(200, 40, 50))
    d.text((360, 682), unten, font=f(36), fill=(255, 255, 255), anchor='mm')


def warnung(im, t, text):
    d = ImageDraw.Draw(im)
    if int(t * 4) % 2 == 0:
        d.text((W / 2, 560), text, font=f(42, True), fill=ROT, anchor='mm')
        d.text((W / 2, 620), '• • •', font=f(34), fill=ROT, anchor='mm')


def wahl_karten(im, t, a, b, hinweis):
    d = ImageDraw.Draw(im)
    for i, (txt, farbe, sym) in enumerate(((a, (120, 170, 255), '?'), (b, (255, 170, 60), '!'))):
        if t < 0.2 + i * 0.6:
            continue
        x = 70 + i * 330
        box = (x, 420, x + 250, 720)
        schatten_rand(im, box, 22)
        d.rounded_rectangle(box, 22, fill=(16, 20, 32), outline=farbe, width=5)
        d.text((x + 125, 520), sym, font=f(110), fill=farbe, anchor='mm')
        gr = 40
        while gr > 22 and f(gr).getlength(txt.upper()) > 220:
            gr -= 2
        d.text((x + 125, 660), txt.upper(), font=f(gr), fill=(255, 255, 255), anchor='mm', stroke_width=2, stroke_fill=farbe)
    d.text((W / 2, 570), 'oder', font=f(22), fill=(220, 220, 230), anchor='mm')
    if t > 1.2:
        d.rounded_rectangle((90, 790, 630, 860), 35, fill=(240, 240, 245))
        d.text((W / 2, 825), hinweis, font=f(25), fill=(20, 20, 30), anchor='mm')


def _umbruch(text, font_, breite):
    aus, z = [], ''
    for w in str(text).split():
        if z and font_.getlength(f'{z} {w}') > breite:
            aus.append(z); z = w
        else:
            z = f'{z} {w}'.strip()
    return aus + ([z] if z else [])


def schock(im, lt, en=False, variante=0):
    # Jumpscare im Akte-Stil (15.11., statt des alten Comic-Gesichts): Störung -> rotes Alarmbild -> schwarze Gestalt
    # springt bis vor die Kamera, nur zwei weiße Punkte als Augen. Flach gezeichnet wie die Karten.
    d = ImageDraw.Draw(im)
    if lt < 0.12:  # Signal reißt ab
        for y in range(0, H, 6):
            g = (y * 7919 + int(lt * 1000)) % 255
            d.rectangle((0, y, W, y + 6), fill=(g, g, g))
        d.text((W / 2, 640), 'NO SIGNAL' if en else 'KEIN SIGNAL', font=f(56, True), fill=(255, 255, 255), anchor='mm',
               stroke_width=4, stroke_fill=(0, 0, 0))
        return
    p = min(1.0, (lt - 0.12) / 0.25)
    e = 1 - (1 - p) ** 3
    if variante == 1:  # nur Augen im Schwarz: erst winzig weit weg, dann riesig direkt vor dir
        d.rectangle((0, 0, W, H), fill=(2, 2, 4))
        r, ab = 6 + 70 * e, 30 + 150 * e
        for ex in (-1, 1):
            d.ellipse((W / 2 + ex * ab - r, 620 - r * 0.6, W / 2 + ex * ab + r, 620 + r * 0.6), fill=(255, 255, 255))
            d.ellipse((W / 2 + ex * ab - r * 0.25, 620 - r * 0.25, W / 2 + ex * ab + r * 0.25, 620 + r * 0.25), fill=(0, 0, 0))
        if e > 0.6:
            d.text((W / 2, 1000), 'SIEHST DU MICH?' if not en else 'CAN YOU SEE ME?', font=f(52, True), fill=(230, 40, 50), anchor='mm')
        return
    if variante == 2:  # hinter dir: dein Porträt, über deiner Schulter taucht ein Kopf auf
        d.rectangle((0, 0, W, H), fill=(18, 20, 28))
        hx, hy = 500, 250 + 160 * (1 - e)  # Kopf hinter dem Porträt - er schaut über den Rand
        d.ellipse((hx - 130, hy - 160, hx + 130, hy + 160), fill=(4, 4, 6))
        d.polygon([(hx - 200, hy + 120), (hx + 200, hy + 120), (hx + 260, H), (hx - 260, H)], fill=(4, 4, 6))
        for ex in (-45, 45):
            d.ellipse((hx + ex - 10, hy - 50, hx + ex + 10, hy - 30), fill=(255, 255, 255))
        portrait(im, lt * 4, 'DU' if not en else 'YOU', angst=1.0)
        if int(lt * 8) % 2:
            d.text((W / 2, 1000), 'DREH DICH UM' if not en else 'TURN AROUND', font=f(56, True), fill=(230, 40, 50), anchor='mm')
        return
    d.rectangle((0, 0, W, H), fill=(150, 10, 18) if int(lt * 12) % 2 else (90, 6, 12))
    from akte_geist import geist
    gs = 1.0 + 2.6 * e  # der Geist springt nach vorn, bis sein Kopf das Bild füllt
    geist(im, W / 2, 640 + 470 * gs, s=gs, t=lt)
    d = ImageDraw.Draw(im)
    if int(lt * 8) % 2:
        d.text((W / 2, 150), '⚠ ' + ('HE IS HERE' if en else 'ER IST DA'), font=f(48, True), fill=(255, 230, 230), anchor='mm')


def spion(im, t, lt):
    # 16.11. (statt Bauplan, Nutzer: "das juckt keinen"): Blick durch den Türspion - Fischauge auf den Flur,
    # jemand steht direkt vor der Tür und kommt näher
    import pov_raum
    from figuren import schatten, ZEIT
    flur = Image.new('RGB', (W, H))
    pov_raum.flur(flur, t)
    ZEIT[0] = t
    lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    n = min(1.0, lt / 2.2)
    from akte_geist import geist
    gr = 0.5 + 0.9 * n
    geist(flur, W / 2, 380 + 420 * gr * 1.25, s=gr * 1.25, t=t)  # Kopf bleibt im Spion, er kommt näher
    from PIL import ImageEnhance
    flur = ImageEnhance.Brightness(Image.blend(flur, Image.new('RGB', (W, H), (60, 44, 16)), 0.2)).enhance(1.6)
    gross = flur.resize((int(W * 1.25), int(H * 1.25)))  # Linse vergrößert die Mitte
    flur = gross.crop(((gross.width - W) // 2, (gross.height - H) // 2, (gross.width - W) // 2 + W, (gross.height - H) // 2 + H))
    maske = Image.new('L', (W, H), 0)
    ImageDraw.Draw(maske).ellipse((W / 2 - 300, 560 - 300, W / 2 + 300, 560 + 300), fill=255)
    maske = maske.filter(ImageFilter.GaussianBlur(26))
    im.paste((0, 0, 0), (0, 0, W, H))
    im.paste(flur, (0, 0), maske)
    d = ImageDraw.Draw(im)
    d.ellipse((W / 2 - 304, 256, W / 2 + 304, 864), outline=(30, 30, 34), width=10)


def kamera(im, t, lt, ort):
    # Überwachungskamera: schwarz-weißes CAM-Bild mit Zeitstempel, nach ~1 s steht die Gestalt im Bild
    from akte_orte import ORTE
    from figuren import schatten, ZEIT
    bild = Image.new('RGB', (W, H))
    (ORTE.get(ort) or ORTE['flur'])(bild, t, 0.0, 0.0) if ort in ORTE else ORTE['flur'](bild, t, 0.0, 0.0)
    if lt > 1.0 and int(lt * 10) % 7:
        ZEIT[0] = t
        from akte_geist import geist
        geist(bild, W * 0.72, 900, s=0.8, t=t, alpha=235)
    grau = bild.convert('L').convert('RGB')
    bild = Image.blend(grau, Image.new('RGB', (W, H), (30, 60, 40)), 0.18)
    bild = bild.crop((0, 120, W, 1000)).resize((W - 80, 780))
    im.paste((10, 10, 12), (0, 0, W, H))
    im.paste(bild, (40, 240))
    d = ImageDraw.Draw(im)
    for y in range(240, 1020, 6):
        d.line((40, y, W - 40, y), fill=(0, 0, 0), width=1)
    d.rectangle((40, 240, W - 40, 1020), outline=(80, 84, 90), width=4)
    d.text((60, 256), 'CAM 02', font=f(30, True), fill=(240, 240, 240))
    sek = int(lt * 10) % 60
    d.text((W - 60, 256), f'03:12:{sek:02d}', font=f(30, True), fill=(240, 240, 240), anchor='ra')
    if int(lt * 2) % 2 == 0:
        d.ellipse((60, 980, 80, 1000), fill=(230, 30, 40))


def zeitung(im, kopf, jahr, lt, en=False):
    # vergilbter Zeitungsausschnitt: wer der Geist war (akte_geist.herkunft)
    from akte_geist import geist
    d = ImageDraw.Draw(im)
    box = (70, 280, 650, 1000)
    schatten_rand(im, box, 6)
    d.rectangle(box, fill=(226, 214, 180))
    d.text((W / 2, 320), 'NIGHT HERALD' if en else 'TAGESBLATT', font=f(44, True), fill=(40, 34, 28), anchor='mm')
    d.line((100, 352, 620, 352), fill=(40, 34, 28), width=3)
    d.text((W / 2, 372), f'{jahr}', font=f(22, True), fill=(80, 70, 60), anchor='mm')
    gr = 46
    zeilen = _umbruch(kopf, f(gr), 520)
    while len(zeilen) > 2 and gr > 28:
        gr -= 4
        zeilen = _umbruch(kopf, f(gr), 520)
    for i, z in enumerate(zeilen):
        d.text((W / 2, 420 + i * (gr + 6)), z, font=f(gr), fill=(20, 16, 14), anchor='mm')
    foto = (130, 540, 590, 860)
    d.rectangle(foto, fill=(140, 132, 116))
    bild = Image.new('RGB', (W, H), (150, 142, 126))
    geist(bild, W / 2, 900, s=0.6, t=lt, alpha=int(120 + 100 * min(1, lt / 1.5)))
    bild = bild.convert('L').convert('RGB').crop((W / 2 - 230, 540, W / 2 + 230, 860))
    im.paste(bild, (130, 540))
    d.rectangle(foto, outline=(40, 34, 28), width=3)
    for i in range(5):
        d.line((110, 890 + i * 20, 610 - (i % 2) * 90, 890 + i * 20), fill=(110, 100, 86), width=6)
    if lt > 1.0:  # roter Kreis um die Gestalt auf dem Foto
        d.ellipse((W / 2 - 110, 560, W / 2 + 110, 860), outline=(200, 30, 40), width=7)
