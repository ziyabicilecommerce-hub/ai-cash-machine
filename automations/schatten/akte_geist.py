# Geister für den Akte-Stil (16.11., Nutzer: "der Geist ist sehr langweilig" + "wie ist der Geist entstanden").
# Vier eigene, flach gezeichnete Gestalten statt eines schwarzen Umrisses mit zwei Punkten - und ihre Herkunft als
# alter Zeitungsartikel, der in der Geschichte erzählt wird.
import math
from PIL import Image, ImageDraw, ImageFilter

ART = ['schatten']  # Bösewicht der aktuellen Geschichte (akte.einrichten setzt ihn)


def geist(im, x, y, s=1.0, t=0.0, alpha=255, art=None, boese=False):
    # x, y = Fußpunkt; s = Größe (1.0 ~ 560 px hoch)
    art = art or ART[0]
    lage = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    k = lambda px, py: (x + px * s, y + py * s)
    wack = math.sin(t * 7) * 3
    if art == 'mann':  # 16.11. (Nutzer: "wie die ganz anderen, als Unschuldiger"): ein ganz normaler, freundlicher Mann im
        # Stil der anderen Figuren - kurze braune Haare, Hemd, Jeans, lächelt, blinzelt nie, starrt in die Kamera.
        # Erst mit boese=True (Schock) zeigt er sein wahres Gesicht: schwarze Augen, Grinsen bis zu den Ohren.
        haut, hemd, hose, haar = (240, 210, 188, alpha), (70, 96, 140, alpha), (44, 52, 76, alpha), (70, 50, 36, alpha)
        for sx in (-1, 1):
            d.rectangle((*k(sx * 26 - 16, -200), *k(sx * 26 + 16, -10)), fill=hose)
            d.rounded_rectangle((*k(sx * 26 - 20, -16), *k(sx * 26 + 26, 4)), radius=max(1, int(6 * s)), fill=(30, 30, 36, alpha))
        d.rounded_rectangle((*k(-62, -420), *k(62, -190)), radius=max(1, int(26 * s)), fill=hemd)  # Hemd
        d.polygon([k(-18, -420), k(18, -420), k(0, -392)], fill=(236, 238, 242, alpha))  # Kragen
        for i in range(4):
            d.ellipse((*k(-3, -380 + i * 44), *k(3, -374 + i * 44)), fill=(236, 238, 242, alpha))
        for sx in (-1, 1):  # Arme hängen ruhig herab
            d.line([k(sx * 60, -400), k(sx * 74, -300), k(sx * 70, -210)], fill=hemd, width=max(2, int(26 * s)))
            d.ellipse((*k(sx * 70 - 15, -224), *k(sx * 70 + 15, -194)), fill=haut)
        hx, hy = 0, -510
        d.rectangle((*k(-14, -440), *k(14, -410)), fill=(220, 186, 166, alpha))  # Hals
        d.ellipse((*k(hx - 74, hy - 96), *k(hx + 74, hy + 62)), fill=haar)  # Haare
        d.ellipse((*k(hx - 66, hy - 70), *k(hx + 66, hy + 80)), fill=haut)  # rundes Gesicht wie die anderen Figuren
        d.chord((*k(hx - 72, hy - 100), *k(hx + 72, hy - 6)), 180, 360, fill=haar)
        for sx in (-1, 1):
            d.ellipse((*k(hx + sx * 70 - 10, hy - 4), *k(hx + sx * 70 + 10, hy + 26)), fill=(228, 196, 174, alpha))  # Ohren
        if not boese:
            for sx in (-1, 1):  # große freundliche Augen - die Pupillen schauen immer genau in die Kamera
                d.ellipse((*k(hx + sx * 28 - 17, hy - 14), *k(hx + sx * 28 + 17, hy + 16)), fill=(255, 255, 255, alpha), outline=(30, 30, 40, alpha), width=max(1, int(2 * s)))
                d.ellipse((*k(hx + sx * 28 - 6, hy - 5), *k(hx + sx * 28 + 6, hy + 7)), fill=(20, 20, 26, alpha))
                d.line([k(hx + sx * 16, hy - 26), k(hx + sx * 42, hy - 24)], fill=(70, 50, 36, alpha), width=max(1, int(4 * s)))
            d.arc((*k(hx - 26, hy + 18), *k(hx + 26, hy + 50)), 15, 165, fill=(150, 70, 70, alpha), width=max(1, int(4 * s)))  # nettes Lächeln
        else:
            for sx in (-1, 1):  # wahres Gesicht: Augen ganz schwarz, winziger Lichtpunkt
                d.ellipse((*k(hx + sx * 28 - 20, hy - 18), *k(hx + sx * 28 + 20, hy + 18)), fill=(2, 2, 4, alpha))
                d.ellipse((*k(hx + sx * 28 - 3, hy - 6), *k(hx + sx * 28 + 3, hy)), fill=(255, 255, 255, alpha))
            d.chord((*k(hx - 60, hy + 4), *k(hx + 60, hy + 78)), 0, 180, fill=(110, 16, 22, alpha))  # Grinsen bis zu den Ohren
            d.chord((*k(hx - 54, hy + 14), *k(hx + 54, hy + 70)), 0, 180, fill=(14, 4, 6, alpha))
            for i in range(14):
                tx = hx - 50 + i * 7.4
                d.polygon([k(tx, hy + 42), k(tx + 6, hy + 42), k(tx + 3, hy + 56)], fill=(236, 230, 210, alpha))
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
    'mann': ('verschwand {ort} ein freundlicher Nachbar. Danach sahen ihn Zeugen noch jahrelang nachts lächelnd am Fenster stehen.', 'NACHBAR SPURLOS VERSCHWUNDEN'),
    'frau': ('verschwand {ort} eine junge Frau. Gefunden hat man nur ihr weißes Kleid.', 'FRAU SPURLOS VERSCHWUNDEN'),
    'schatten': ('lebte {ort} ein Mann, der nie schlief. Eines Nachts war nur noch sein Schatten da.', 'MANN VERSCHWUNDEN'),
    'hirsch': ('verschwand {ort} ein Jäger. Man fand nur Hufspuren, die aufrecht gingen.', 'JÄGER VERMISST'),
    'gremlin': ('hörten Nachbarn {ort} jede Nacht Kratzen in den Wänden. Dann war die Familie weg.', 'FAMILIE VERSCHWUNDEN'),
}
HERKUNFT_EN = {
    'mann': ('a friendly neighbor vanished {ort}. For years after, witnesses saw him smiling at the window at night.', 'NEIGHBOR VANISHES WITHOUT TRACE'),
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
