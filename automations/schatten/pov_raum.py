# Räume für die Ich-Perspektive (15.11.): Zimmer, Flur, Auto, Zelt, Aufzug - jeweils mit einer dunklen Öffnung,
# in der das Wesen auftaucht. Jede Funktion malt in ein W x H Bild und gibt (x, y, s) zurück: Fußpunkt und Größe des Wesens.
import math
from PIL import ImageDraw, ImageFilter, Image

W, H = 720, 1280


def _flimmern(t, k=1.0):
    return 1.0 - 0.06 * k * (math.sin(t * 13) > 0.92)


def zimmer(im, t):
    d = ImageDraw.Draw(im)
    fx, fy = W // 2, 470
    d.rectangle((0, 0, W, H), fill=(22, 24, 34))
    d.polygon([(0, H), (W, H), (fx + 170, fy + 200), (fx - 170, fy + 200)], fill=(28, 24, 26))  # Boden
    d.polygon([(0, 0), (fx - 170, fy - 280), (fx - 170, fy + 200), (0, H)], fill=(34, 37, 50))
    d.polygon([(W, 0), (fx + 170, fy - 280), (fx + 170, fy + 200), (W, H)], fill=(28, 31, 43))
    d.rectangle((fx - 170, fy - 280, fx + 170, fy + 200), fill=(40, 43, 58))
    for i in range(6):  # Dielen
        x = fx - 170 + i * 68
        d.line((x, fy + 200, (x - fx) * 4 + fx, H), fill=(36, 31, 33), width=3)
    d.rectangle((fx - 70, fy - 190, fx + 70, fy + 200), fill=(3, 3, 5))  # offene Tür
    d.rectangle((fx - 78, fy - 198, fx + 78, fy + 200), outline=(64, 66, 80), width=8)
    d.polygon([(W, 360), (W - 120, 400), (W - 120, 640), (W, 700)], fill=(52, 60, 86))  # Fenster rechts mit Mondlicht
    d.line((W - 60, 380, W - 60, 670), fill=(30, 34, 48), width=6)
    d.polygon([(0, H - 300), (330, H - 360), (420, H), (0, H)], fill=(52, 58, 84))  # Bett
    d.polygon([(0, H - 300), (330, H - 360), (340, H - 330), (0, H - 268)], fill=(70, 78, 108))
    return fx, fy + 198, 0.62


def flur(im, t):
    d = ImageDraw.Draw(im)
    fx, fy = W // 2, 430
    d.rectangle((0, 0, W, H), fill=(18, 19, 27))
    d.polygon([(0, H), (W, H), (fx + 70, fy + 120), (fx - 70, fy + 120)], fill=(30, 26, 24))
    d.polygon([(0, 0), (fx - 70, fy - 150), (fx - 70, fy + 120), (0, H)], fill=(38, 36, 44))
    d.polygon([(W, 0), (fx + 70, fy - 150), (fx + 70, fy + 120), (W, H)], fill=(32, 30, 38))
    d.rectangle((fx - 70, fy - 150, fx + 70, fy + 120), fill=(4, 4, 6))  # dunkles Ende des Flurs
    for i, z in enumerate((0.25, 0.5, 0.72)):  # Türen links und rechts
        for sx in (-1, 1):
            x0 = fx + sx * (70 + (W / 2 - 70) * (1 - z)) * 0.98
            x1 = fx + sx * (70 + (W / 2 - 70) * (1 - z - 0.12))
            d.polygon([(x0, fy - 150 * (1 + (1 - z) * 3)), (x1, fy - 150 * (1 + (1 - z - 0.12) * 3)),
                       (x1, fy + 120 * (1 + (1 - z - 0.12) * 4.5)), (x0, fy + 120 * (1 + (1 - z) * 4.5))], fill=(52, 44, 40))
    licht = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(licht).ellipse((fx - 60, fy - 230, fx + 60, fy - 190), fill=(255, 240, 200, int(140 * _flimmern(t, 3))))
    im.paste(licht.filter(ImageFilter.GaussianBlur(14)), (0, 0), licht.filter(ImageFilter.GaussianBlur(14)))
    return fx, fy + 118, 0.36


def auto(im, t):
    d = ImageDraw.Draw(im)
    fx, fy = W // 2, 520
    d.rectangle((0, 0, W, fy), fill=(8, 10, 18))
    d.rectangle((0, fy, W, H), fill=(10, 10, 12))
    d.polygon([(fx - 12, fy), (fx + 12, fy), (W + 200, H), (-200, H)], fill=(34, 34, 38))  # Straße
    for i in range(6):  # Mittelstreifen ziehen vorbei
        z = ((t * 0.9 + i / 6) % 1) ** 2
        y0, y1 = fy + (H - fy) * z, fy + (H - fy) * min(1, z + 0.05)
        d.polygon([(fx - 2 - 14 * z, y0), (fx + 2 + 14 * z, y0), (fx + 2 + 16 * z, y1), (fx - 2 - 16 * z, y1)], fill=(210, 200, 140))
    for sx in (-1, 1):  # Bäume am Rand
        for i in range(5):
            z = ((t * 0.9 + i / 5) % 1) ** 2
            x = fx + sx * (40 + 600 * z)
            h = 60 + 900 * z
            d.polygon([(x, fy - h * 0.9), (x - h * 0.25, fy + h * 0.1), (x + h * 0.25, fy + h * 0.1)], fill=(6, 12, 10))
    kegel = Image.new('RGBA', im.size, (0, 0, 0, 0))  # Scheinwerfer
    ImageDraw.Draw(kegel).polygon([(fx - 40, fy + 20), (fx + 40, fy + 20), (W, H), (0, H)], fill=(255, 240, 200, 40))
    im.paste(kegel.filter(ImageFilter.GaussianBlur(30)), (0, 0), kegel.filter(ImageFilter.GaussianBlur(30)))
    d.polygon([(0, 0), (W, 0), (W, 140), (0, 110)], fill=(4, 4, 6))  # Dach
    d.polygon([(0, 0), (90, 0), (40, 900), (0, 900)], fill=(4, 4, 6))  # A-Säulen
    d.polygon([(W, 0), (W - 90, 0), (W - 40, 900), (W, 900)], fill=(4, 4, 6))
    d.rectangle((0, 880, W, H), fill=(14, 14, 18))  # Armaturenbrett
    d.ellipse((W - 250, 760, W - 90, 920), fill=(10, 10, 12), outline=(40, 40, 46), width=8)
    d.rounded_rectangle((W // 2 - 70, 92, W // 2 + 70, 140), 10, fill=(18, 18, 24))  # Rückspiegel
    return fx, fy + 30, 0.42


def zelt(im, t):
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, H), fill=(40, 48, 36))
    fx, fy = W // 2, 520
    d.polygon([(fx - 150, H - 360), (fx, 230), (fx + 150, H - 360)], fill=(6, 10, 12))  # Öffnung nach draußen
    for i in range(7):  # Bäume draußen
        x = fx - 120 + i * 40
        d.polygon([(x, 380 + (i % 3) * 30), (x - 26, 720), (x + 26, 720)], fill=(14, 20, 18))
    d.polygon([(0, 0), (fx, 160), (fx - 150, H - 360), (0, H)], fill=(58, 70, 52))  # Zeltwände
    d.polygon([(W, 0), (fx, 160), (fx + 150, H - 360), (W, H)], fill=(50, 62, 46))
    d.line((fx, 160, fx - 150, H - 360), fill=(80, 92, 70), width=6)
    d.line((fx, 160, fx + 150, H - 360), fill=(80, 92, 70), width=6)
    d.rectangle((0, H - 360, W, H), fill=(38, 46, 70))  # Schlafsack
    return fx, H - 380, 0.5


def aufzug(im, t):
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, H), fill=(54, 56, 62))
    fx = W // 2
    auf = min(1.0, max(0.0, (math.sin(t * 0.6) + 0.4)))  # die Tür geht einen Spalt auf
    spalt = 30 + 140 * auf
    d.rectangle((90, 160, W - 90, 1000), fill=(4, 4, 6))
    d.rectangle((90, 160, fx - spalt, 1000), fill=(120, 124, 132), outline=(80, 82, 90), width=4)
    d.rectangle((fx + spalt, 160, W - 90, 1000), fill=(120, 124, 132), outline=(80, 82, 90), width=4)
    d.rectangle((0, 1000, W, H), fill=(40, 38, 40))
    d.rectangle((W - 80, 400, W - 20, 700), fill=(30, 30, 34))  # Tastenfeld
    for i in range(6):
        d.ellipse((W - 62, 420 + i * 46, W - 38, 444 + i * 46), fill=(255, 120, 60) if i == 5 else (90, 90, 96))
    licht = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(licht).rectangle((0, 0, W, 60), fill=(255, 250, 230, int(160 * _flimmern(t, 4))))
    im.paste(licht.filter(ImageFilter.GaussianBlur(20)), (0, 0), licht.filter(ImageFilter.GaussianBlur(20)))
    return fx, 1000, 0.95


RAEUME = {'zimmer': zimmer, 'flur': flur, 'auto': auto, 'zelt': zelt, 'aufzug': aufzug}


def raeume_fuer(ort, text=''):
    # je Ort zwei Räume im Wechsel - damit sich das Bild von Szene zu Szene ändert
    t = (text or '').lower()
    if ort == 'aufzug' or 'aufzug' in t or 'elevator' in t:
        return ['aufzug', 'flur']
    if any(w in t for w in ('auto', 'fahr', 'straße', 'tankstelle', 'taxi', 'navi', 'anhalter', 'rückspiegel', 'rücksitz', 'blitzer', 'tunnel',
                            ' car', 'road', 'driv', 'hitchhik', 'mirror', 'highway')):
        return ['auto', 'auto']
    if ort == 'wald' or 'zelt' in t or 'tent' in t:
        return ['zelt', 'zelt']
    if ort in ('zug', 'flugzeug'):
        return ['flur', 'zimmer']
    return ['zimmer', 'flur']
