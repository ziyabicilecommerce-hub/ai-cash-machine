# Found-Footage-Look: das Video soll wie eine echte Handy-/Kameraaufnahme wirken ("echt passiert").
# REC-Punkt, laufende Aufnahmedauer, fast leerer Akku, Bildzeilen - bei Angst grüne Nachtsicht.
# Dazu die Teil-Nummer nur klein in der Ecke: der Hook selbst muss für neue Zuschauer allein funktionieren.
import re
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
_zeilen = {}


def _bildzeilen(w, h):
    if (w, h) not in _zeilen:
        z = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(z)
        for y in range(0, h, 4):
            d.line((0, y, w, y), fill=(0, 0, 0, 38))
        _zeilen[(w, h)] = z
    return _zeilen[(w, h)]


def ohne_teil(text):
    """'TEIL 3: MAMA SAGT …' -> 'MAMA SAGT …' (wer Teil 1 nicht kennt, wischt sonst weg)."""
    return re.sub(r'^\s*TEIL\s+\d+\s*[:\-–]\s*', '', str(text or ''), flags=re.I)


def teil_von(titel):
    m = re.search(r'Teil (\d+)', str(titel or ''))
    return int(m.group(1)) if m else None


def nachtsicht(im, staerke):
    """Grünstichige Nachtsicht wie bei einer Überwachungskamera."""
    g = im.convert('L').convert('RGB')
    gruen = Image.merge('RGB', (g.getchannel(0).point(lambda v: v * 0.35), g.getchannel(1).point(lambda v: min(255, v * 1.15 + 12)), g.getchannel(2).point(lambda v: v * 0.4)))
    return Image.blend(im, gruen, staerke)


def overlay(im, t, s, story, teil=None, gesamt_teile=None):
    if s.get('art') in ('teil2',):
        return im
    if s.get('angst', 0) >= 0.6 or s.get('art') in ('gesicht', 'dunkel'):
        im = nachtsicht(im, 0.55)
    w, h = im.size
    im = im.convert('RGBA')
    im.alpha_composite(_bildzeilen(w, h))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, 26)
    if int(t * 2) % 2 == 0:  # REC blinkt
        d.ellipse((28, 34, 50, 56), fill=(235, 25, 25))
    d.text((60, 30), 'REC', font=f, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
    sek = int(t)  # Aufnahmedauer (keine Uhrzeit - die Story hat ihre eigene Uhr)
    d.text((28, 70), f'{sek // 3600:02d}:{sek // 60 % 60:02d}:{sek % 60:02d}', font=ImageFont.truetype(FONT, 22), fill=(230, 230, 230), stroke_width=2, stroke_fill=(0, 0, 0))
    # Akku fast leer, blinkt rot
    x, y = w - 92, 36
    d.rectangle((x, y, x + 52, y + 24), outline=(255, 255, 255), width=3)
    d.rectangle((x + 52, y + 7, x + 58, y + 17), fill=(255, 255, 255))
    if int(t * 1.5) % 2 == 0:
        d.rectangle((x + 5, y + 5, x + 13, y + 19), fill=(235, 25, 25))
    if teil:
        d.text((w - 28, 72), f'TEIL {teil}' + (f'/{gesamt_teile}' if gesamt_teile else ''), font=ImageFont.truetype(FONT, 20), fill=(255, 255, 255), anchor='ra', stroke_width=2, stroke_fill=(0, 0, 0))
    # Sucher-Ecken
    for cx, cy, sx, sy in ((18, 18, 1, 1), (w - 18, 18, -1, 1), (18, h - 18, 1, -1), (w - 18, h - 18, -1, -1)):
        d.line((cx, cy, cx + 44 * sx, cy), fill=(255, 255, 255, 200), width=3)
        d.line((cx, cy, cx, cy + 44 * sy), fill=(255, 255, 255, 200), width=3)
    return im.convert('RGB')
