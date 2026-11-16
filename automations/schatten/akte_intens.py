# Steigerung für den Akte-Stil (16.11., Nutzer: "mach's noch intensiver"): je weiter die Geschichte, desto mehr Druck.
# Ab der Hälfte: roter Herzschlag-Rand, dann leichtes Kamerazittern, im letzten Drittel kurze Bildstörungen, in denen das
# böse Gesicht für 2-3 Bilder durchblitzt. Höchstens ein Blitz alle ~2,3 s (kein Stroboskop). Antwort-Karten bleiben ruhig.
import math
from PIL import Image, ImageChops, ImageDraw, ImageFilter


def _rand(w, h, farbe, staerke):
    # weicher roter Rand (Vignette) als Maske
    m = Image.new('L', (w // 8, h // 8), 0)
    d = ImageDraw.Draw(m)
    d.rectangle((0, 0, w // 8, h // 8), fill=int(255 * staerke))
    d.ellipse((-w // 40, h // 40, w // 8 + w // 40, h // 8 - h // 40), fill=0)
    return Image.new('RGB', (w, h), farbe), m.filter(ImageFilter.GaussianBlur(9)).resize((w, h))


def einrichten(szenen, schock, art):
    # schock(im, lt, variante) zeichnet das böse Gesicht (akte_karten.schock); art = Variante dieser Geschichte
    n = max(1, len(szenen))
    for i, s in enumerate(szenen):  # in die Szene selbst schreiben - story.py arbeitet mit Kopien der Szenen
        s['_stufe'] = round(i / n, 3)
    cache = {}

    def intens(im, s, t):
        if s['art'] == 'teil2':
            return im
        lv = s.get('_stufe', 0)
        if s.get('akte') == 'warnung':
            lv = max(lv, 0.8)
        w, h = im.size
        if lv >= 0.45:  # Herzschlag: zwei kurze Schläge pro Sekunde, wird zum Ende stärker
            schlag = max(math.sin(t * 2 * math.pi * 1.2), 0) ** 10 + 0.6 * max(math.sin(t * 2 * math.pi * 1.2 - 0.9), 0) ** 10
            k = round(min(0.5, (lv - 0.35) * 0.6 + 0.3 * schlag), 2)
            if k not in cache:
                cache[k] = _rand(w, h, (150, 0, 10), k)
            rot, maske = cache[k]
            im = Image.composite(rot, im, maske)
        if lv >= 0.6:  # Kamerazittern
            a = 4 + 10 * (lv - 0.6)
            dx, dy = int(a * math.sin(t * 37.0)), int(a * math.cos(t * 29.0))
            im = ImageChops.offset(im, dx, dy)
        if lv >= 0.68 and (t % 2.3) < 0.09:  # Bildstörung mit durchblitzendem Gesicht
            g = Image.new('RGB', (w, h))
            schock(g, 0.6, art)
            r, gg, b = Image.blend(im, g, 0.55).split()
            im = Image.merge('RGB', (ImageChops.offset(r, 14, 0), gg, ImageChops.offset(b, -14, 0)))
        return im
    return intens
