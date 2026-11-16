# Geister für den Akte-Stil (16.11., Nutzer: "der Geist ist sehr langweilig" + "wie ist der Geist entstanden").
# Vier eigene, flach gezeichnete Gestalten statt eines schwarzen Umrisses mit zwei Punkten - und ihre Herkunft als
# alter Zeitungsartikel, der in der Geschichte erzählt wird.
import math
from PIL import Image, ImageDraw, ImageFilter

ART = ['schatten']  # Bösewicht der aktuellen Geschichte (akte.einrichten setzt ihn)


def geist(im, x, y, s=1.0, t=0.0, alpha=255, art=None):
    # x, y = Fußpunkt; s = Größe (1.0 ~ 560 px hoch)
    art = art or ART[0]
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    k = lambda px, py: (x + px * s, y + py * s)
    wack = math.sin(t * 7) * 3
    if art == 'mann':  # 16.11. (Nutzer: "mach einen Horror-Mann"): dürrer Mann im Mantel mit Hut, Hals zu lang, Grinsen zu breit
        haut, mantel = (196, 200, 196, alpha), (40, 40, 46, alpha)
        for sx in (-1, 1):  # dünne Beine unter dem Mantel
            d.line([k(sx * 18, -150), k(sx * 22, 0)], fill=(16, 16, 18, alpha), width=max(2, int(12 * s)))
            d.polygon([k(sx * 22 - 10, -6), k(sx * 22 + 26 * sx, -2), k(sx * 22 + 26 * sx, 6), k(sx * 22 - 10, 6)], fill=(10, 10, 12, alpha))
        d.polygon([k(-46, -130), k(46, -130), k(40, -420), k(-40, -420)], fill=mantel)  # langer Mantel
        d.line([k(0, -420), k(0, -140)], fill=(26, 26, 30, alpha), width=max(1, int(4 * s)))
        for sx in (-1, 1):  # Arme bis unter die Knie, knochige Hände mit langen Fingern
            d.line([k(sx * 40, -410), k(sx * 64, -260), k(sx * 60, -110)], fill=mantel, width=max(2, int(18 * s)))
            for fi in range(4):
                fx = sx * (52 + fi * 6)
                d.line([k(sx * 60, -110), k(fx, -60 + fi * 4), k(fx + sx * 4, -30 + fi * 6)], fill=haut, width=max(1, int(4 * s)))
        # Kopf auf eigener Ebene: hängt schief am viel zu langen Hals und zuckt ruckartig (verstörender, Wunsch 16.11.)
        hx, hy = 14, -560
        zuck = 28 + (18 if math.sin(t * 2.3) > 0.85 else 0) + (math.sin(t * 31) * 6 if math.sin(t * 1.7) > 0.6 else 0)
        d.line([k(0, -420), k(hx * 0.6, hy + 70)], fill=haut, width=max(2, int(15 * s)))
        R = int(150 * s) + 4
        kopf = Image.new('RGBA', (R * 2, R * 2), (0, 0, 0, 0))
        kd = ImageDraw.Draw(kopf)
        q = lambda px, py: (R + px * s, R + py * s)
        gruen = (184, 194, 180, alpha)
        kd.ellipse((*q(-40, -66), *q(40, 70)), fill=gruen)  # langes, eingefallenes Gesicht
        for (x1, y1), (x2, y2) in (((-34, -40), (-12, -10)), ((-12, -10), (-20, 20)), ((20, -60), (10, -30)), ((30, 10), (18, 40))):
            kd.line((*q(x1, y1), *q(x2, y2)), fill=(110, 116, 106, alpha), width=max(1, int(2.5 * s)))  # Risse
        for sx, gr_, yy in ((-1, 15, -18), (1, 9, -8)):  # ungleiche, leere Augen auf verschiedener Höhe
            kd.ellipse((*q(sx * 15 - gr_, yy - gr_), *q(sx * 15 + gr_, yy + gr_)), fill=(2, 2, 4, alpha))
            kd.ellipse((*q(sx * 15 - 2, yy - 2), *q(sx * 15 + 2, yy + 2)), fill=(255, 255, 255, alpha))
            tropf = (t * 18 + sx * 7) % 50  # schwarze Flüssigkeit läuft aus den Augen
            kd.line((*q(sx * 15, yy + gr_), *q(sx * 15 + sx * 2, yy + gr_ + 14 + tropf)), fill=(6, 4, 6, alpha), width=max(2, int(4 * s)))
        kd.chord((*q(-46, 0), *q(46, 66)), 0, 180, fill=(120, 20, 28, alpha))  # Grinsen über das ganze Gesicht, rotes Zahnfleisch
        kd.chord((*q(-40, 12), *q(40, 60)), 0, 180, fill=(14, 4, 6, alpha))
        for reihe, y0, h_ in ((0, 34, 10), (1, 46, -9)):  # zwei Reihen spitzer Zähne
            for i in range(12):
                tx = -36 + i * 6.4
                kd.polygon([q(tx, y0), q(tx + 5, y0), q(tx + 2.5, y0 + h_)], fill=(232, 226, 200, alpha))
        kd.rectangle((*q(-30, -122), *q(30, -60)), fill=(14, 14, 16, alpha))  # hoher Hut
        kd.rectangle((*q(-54, -64), *q(54, -54)), fill=(14, 14, 16, alpha))
        kopf = kopf.rotate(-zuck, resample=Image.BICUBIC)
        mx, my = k(hx, hy)
        lage.paste(kopf, (int(mx - R), int(my - R)), kopf)
    elif art == 'frau':  # weißes Kleid, lange schwarze Haare vorm Gesicht, ein Auge schaut durch, Kopf schief
        d.polygon([k(-70, 0), k(70, 0), k(40, -330), k(-40, -330)], fill=(226, 228, 232, alpha))
        for i in range(7):  # zerrissener Saum
            d.polygon([k(-70 + i * 20, 0), k(-60 + i * 20, 24 + (i % 2) * 14), k(-50 + i * 20, 0)], fill=(226, 228, 232, alpha))
        for sx in (-1, 1):  # dünne, zu lange Arme
            d.line([k(sx * 40, -320), k(sx * 62, -170), k(sx * 58, -40)], fill=(214, 216, 222, alpha), width=max(2, int(12 * s)))
            for f in range(4):
                d.line([k(sx * 58, -40), k(sx * (54 + f * 6), -6)], fill=(214, 216, 222, alpha), width=max(1, int(4 * s)))
        hx, hy = 10 + wack, -390
        d.ellipse((*k(hx - 52, hy - 70), *k(hx + 52, hy + 20)), fill=(10, 8, 10, alpha))  # Haar hinten
        for sx in (-1, 1):  # lange Strähnen bis über die Brust
            d.polygon([k(hx + sx * 50, hy - 40), k(hx + sx * 14, hy - 40), k(hx + sx * 22, hy + 170), k(hx + sx * 62, hy + 150)], fill=(10, 8, 10, alpha))
        d.ellipse((*k(hx - 26, hy - 44), *k(hx + 26, hy + 56)), fill=(214, 218, 224, alpha))  # bleiches Gesicht im Spalt
        d.polygon([k(hx - 30, hy - 60), k(hx + 30, hy - 60), k(hx + 8, hy + 10), k(hx - 4, hy - 20), k(hx - 22, hy + 30)], fill=(10, 8, 10, alpha))
        d.ellipse((*k(hx + 4, hy + 2), *k(hx + 20, hy + 14)), fill=(250, 250, 250, alpha))  # ein Auge schaut durch
        d.ellipse((*k(hx + 10, hy + 5), *k(hx + 15, hy + 11)), fill=(0, 0, 0, alpha))
        d.ellipse((*k(hx - 8, hy + 30), *k(hx + 10, hy + 50)), fill=(40, 10, 14, alpha))  # offener Mund
    elif art == 'hirsch':  # Mensch mit Hirschschädel, Geweih, schwarze Augenhöhlen
        d.polygon([k(-50, 0), k(-30, 0), k(-24, -200), k(24, -200), k(30, 0), k(50, 0), k(44, -360), k(-44, -360)], fill=(20, 18, 20, alpha))
        for sx in (-1, 1):
            d.line([k(sx * 44, -350), k(sx * 70, -200), k(sx * 64, -60)], fill=(20, 18, 20, alpha), width=max(2, int(16 * s)))
        hx, hy = wack * 0.5, -420
        d.polygon([k(hx - 34, hy - 40), k(hx + 34, hy - 40), k(hx + 16, hy + 70), k(hx - 16, hy + 70)], fill=(232, 226, 210, alpha))
        for sx in (-1, 1):
            d.ellipse((*k(hx + sx * 18 - 11, hy - 20), *k(hx + sx * 18 + 11, hy + 6)), fill=(6, 6, 8, alpha))
            pts = [k(hx + sx * 26, hy - 40), k(hx + sx * 60, hy - 120), k(hx + sx * 50, hy - 190)]
            d.line(pts, fill=(200, 190, 170, alpha), width=max(2, int(7 * s)))
            for j, (px, py) in enumerate(((40, -100), (70, -150), (36, -160))):
                d.line([k(hx + sx * (26 + j * 10), hy - 60 - j * 30), k(hx + sx * px, hy + py)], fill=(200, 190, 170, alpha), width=max(2, int(5 * s)))
    elif art == 'gremlin':  # krabbelt auf allen vieren, riesige Augen, Maul voller Zähne
        d.ellipse((*k(-120, -150), *k(120, -40)), fill=(18, 22, 18, alpha))
        for i in range(7):  # Stacheln auf dem Rücken
            d.polygon([k(-90 + i * 28, -140), k(-80 + i * 28, -190 - (i % 2) * 20), k(-70 + i * 28, -140)], fill=(18, 22, 18, alpha))
        for i, sx in enumerate((-1, -0.4, 0.4, 1)):
            d.line([k(sx * 100, -90), k(sx * 150, -150 + (i % 2) * 20), k(sx * 170, 0)], fill=(18, 22, 18, alpha), width=max(2, int(12 * s)))
        hx, hy = 110 + wack, -130
        d.ellipse((*k(hx - 70, hy - 60), *k(hx + 70, hy + 60)), fill=(18, 22, 18, alpha))
        for sx in (-1, 1):
            d.ellipse((*k(hx + sx * 30 - 22, hy - 30), *k(hx + sx * 30 + 22, hy + 6)), fill=(240, 60, 50, alpha))
            d.ellipse((*k(hx + sx * 30 - 5, hy - 22), *k(hx + sx * 30 + 5, hy - 2)), fill=(0, 0, 0, alpha))
        d.chord((*k(hx - 48, hy), *k(hx + 48, hy + 50)), 0, 180, fill=(70, 10, 14, alpha))
        for i in range(9):
            d.polygon([k(hx - 44 + i * 11, hy + 24), k(hx - 38 + i * 11, hy + 24), k(hx - 41 + i * 11, hy + 38)], fill=(240, 236, 220, alpha))
    else:  # Schatten: lang, dünn, Arme bis zum Boden, breites weißes Grinsen
        d.polygon([k(-36, 0), k(-14, 0), k(-10, -260), k(10, -260), k(14, 0), k(36, 0), k(30, -470), k(-30, -470)], fill=(6, 6, 8, alpha))
        for sx in (-1, 1):
            d.line([k(sx * 30, -460), k(sx * 60, -280), k(sx * 56, -20)], fill=(6, 6, 8, alpha), width=max(2, int(10 * s)))
            for f in range(4):
                d.line([k(sx * 56, -20), k(sx * (48 + f * 8), 20)], fill=(6, 6, 8, alpha), width=max(1, int(4 * s)))
        hx, hy = wack, -530
        d.ellipse((*k(hx - 40, hy - 64), *k(hx + 40, hy + 64)), fill=(6, 6, 8, alpha))
        d.chord((*k(hx - 30, hy - 4), *k(hx + 30, hy + 40)), 0, 180, fill=(240, 240, 240, alpha))
        for i in range(8):
            d.line([k(hx - 26 + i * 7.5, hy + 16), k(hx - 26 + i * 7.5, hy + 36)], fill=(6, 6, 8, alpha), width=max(1, int(2 * s)))
        for sx in (-1, 1):
            d.ellipse((*k(hx + sx * 16 - 6, hy - 24), *k(hx + sx * 16 + 6, hy - 12)), fill=(255, 255, 255, alpha))
    im.paste(lage, (0, 0), lage)


# Herkunft: wer war der Geist? (Satz zum Vorlesen, Schlagzeile für den Zeitungsausschnitt)
HERKUNFT_DE = {
    'mann': ('verschwand {ort} ein Mann im grauen Mantel. Danach sahen ihn Zeugen noch jahrelang nachts am Fenster stehen.', 'MANN IM MANTEL VERMISST'),
    'frau': ('verschwand {ort} eine junge Frau. Gefunden hat man nur ihr weißes Kleid.', 'FRAU SPURLOS VERSCHWUNDEN'),
    'schatten': ('lebte {ort} ein Mann, der nie schlief. Eines Nachts war nur noch sein Schatten da.', 'MANN VERSCHWUNDEN'),
    'hirsch': ('verschwand {ort} ein Jäger. Man fand nur Hufspuren, die aufrecht gingen.', 'JÄGER VERMISST'),
    'gremlin': ('hörten Nachbarn {ort} jede Nacht Kratzen in den Wänden. Dann war die Familie weg.', 'FAMILIE VERSCHWUNDEN'),
}
HERKUNFT_EN = {
    'mann': ('a man in a grey coat vanished {ort}. For years after, witnesses saw him standing at the window at night.', 'MAN IN GREY COAT MISSING'),
    'frau': ('a young woman vanished {ort}. All they found was her white dress.', 'WOMAN VANISHES WITHOUT TRACE'),
    'schatten': ('a man who never slept lived {ort}. One night only his shadow was left.', 'MAN MISSING'),
    'hirsch': ('a hunter vanished {ort}. They only found hoof prints that walked upright.', 'HUNTER MISSING'),
    'gremlin': ('neighbors {ort} heard scratching in the walls every night. Then the family was gone.', 'FAMILY VANISHES'),
}
ORT_SATZ_DE = {'hotel': 'in diesem Hotel', 'strasse': 'auf dieser Straße', 'tankstelle': 'an dieser Tankstelle', 'wald': 'in diesem Wald',
               'see': 'an diesem See', 'zug': 'in diesem Zug', 'flugzeug': 'auf genau diesem Flug', 'aufzug': 'in diesem Aufzug'}
ORT_SATZ_EN = {'hotel': 'in this hotel', 'strasse': 'on this road', 'tankstelle': 'at this gas station', 'wald': 'in these woods',
               'see': 'at this lake', 'zug': 'on this train', 'flugzeug': 'on this exact flight', 'aufzug': 'in this elevator'}


def herkunft(boese, ort, jahr, en=False):
    satz, kopf = (HERKUNFT_EN if en else HERKUNFT_DE).get(boese, (HERKUNFT_EN if en else HERKUNFT_DE)['schatten'])
    o = (ORT_SATZ_EN if en else ORT_SATZ_DE).get(ort, 'here' if en else 'in diesem Haus')
    vorne = f'Then I find an old article. In {jahr}, ' if en else f'Dann finde ich einen alten Artikel. {jahr} '
    return vorne + satz.format(ort=o), kopf
