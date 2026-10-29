# Fahrgäste, die nichts merken: ein Mann hinter seiner Zeitung und eine Frau, die mit Kopfhörern im Stehen schläft.
# Dazu die Zeitung in Nahaufnahme (Twist: die eigene Vermisstenmeldung mit dem Datum von morgen).
import math
from PIL import Image, ImageDraw, ImageFont
from figuren import mensch, glied, _ss, ZEIT, W, H

SCHRIFT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
PAPIER, TINTE = (228, 224, 210), (40, 40, 46)
MANTEL, JACKE = (128, 112, 98), (112, 128, 104)


def _zeitung_malen(d, box, s, schlagzeile, foto=False):
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=PAPIER, outline=(170, 166, 150), width=max(1, int(2 * s)))
    mx = (x0 + x1) / 2
    d.line((mx, y0, mx, y1), fill=(190, 186, 170), width=max(1, int(2 * s)))
    d.rectangle((x0 + 6 * s, y0 + 6 * s, x1 - 6 * s, y0 + 22 * s), fill=TINTE)
    if schlagzeile:
        f = ImageFont.truetype(SCHRIFT, max(8, int(11 * s)))
        d.text((mx, y0 + 14 * s), schlagzeile, font=f, fill=PAPIER, anchor='mm')
    for spalte in (0, 1):
        sx0 = x0 + 8 * s + spalte * (x1 - x0) / 2
        for i in range(9):
            yy = y0 + 32 * s + i * 11 * s
            if yy < y1 - 8 * s:
                d.line((sx0, yy, sx0 + (x1 - x0) / 2 - 18 * s, yy), fill=(150, 148, 140), width=max(1, int(2 * s)))


def zeitungsleser(lage, x, y, t):
    # sitzt, Beine übereinander, Zeitung vor dem Gesicht - blättert ab und zu, sonst völlig ruhig
    mensch(lage, x, y, farbe=MANTEL, gesicht=False)
    wackel = math.sin(t * 0.9) * 2

    def zeichne(cv, T):
        d = ImageDraw.Draw(cv)
        a = 2
        x0, y0 = T(x - 78, y - 342 + wackel)
        x1, y1 = T(x + 78, y - 168 + wackel)
        _zeitung_malen(d, (x0, y0, x1, y1), a, 'STADTBLATT')
        for sx in (-1, 1):
            hx, hy = T(x + sx * 80, y - 250 + wackel)
            d.ellipse((hx - 9 * a, hy - 11 * a, hx + 9 * a, hy + 11 * a), fill=(230, 214, 200))
        return cv
    _ss(lage, (x - 100, y - 360, x + 100, y - 150), zeichne)


def schlaeferin(lage, x, y):
    # steht an der Haltestange, Kopf zur Seite, Kopfhörer auf - schläft
    mensch(lage, x, y, s=0.95, sitzen=False, farbe=JACKE, blick=0.6, schlaf=True)

    def zeichne(cv, T):
        d = ImageDraw.Draw(cv)
        a = 2
        kx, ky = T(x + 0.6 * 7 * 0.95, y - 270 * 0.95)
        d.arc((kx - 38 * a, ky - 44 * a, kx + 38 * a, ky + 20 * a), 190, 350, fill=(30, 32, 40), width=6 * a)
        for sx in (-1, 1):
            d.rounded_rectangle((kx + sx * 36 * a - 9 * a, ky - 12 * a, kx + sx * 36 * a + 9 * a, ky + 14 * a), radius=6 * a, fill=(30, 32, 40))
        return cv
    _ss(lage, (x - 70, y - 340, x + 70, y - 200), zeichne)


def fahrgaeste_malen(lage, t, liste):
    # 'zeitung' = Mann mit Zeitung auf dem Sitz, 'schlaf' = Frau mit Kopfhörern im Stehen, 'schlaf_sitz' = schläft im Sitzen
    for wer in liste:
        if wer == 'zeitung':
            zeitungsleser(lage, 470, 812, t)
        elif wer == 'schlaf':
            schlaeferin(lage, 640, 905)
        elif wer == 'schlaf_sitz':
            mensch(lage, 470, 812, farbe=JACKE, blick=0.7, schlaf=True)


def zeitung_nah(im, lt, z=None):
    # Nahaufnahme der Titelseite: "Fahrgast verschwunden" - mit dem Foto der Person und dem Datum von morgen
    zoom = 1 + 0.25 * min(lt / 3, 1)
    papier = Image.new('RGB', (W, H), PAPIER)
    d = ImageDraw.Draw(papier)
    gross, mittel, klein = (ImageFont.truetype(SCHRIFT, n) for n in (76, 40, 26))
    d.rectangle((30, 40, W - 30, 160), fill=TINTE)
    d.text((W / 2, 100), 'STADTBLATT', font=gross, fill=PAPIER, anchor='mm')
    d.text((W / 2, 200), z.get('datum', 'DONNERSTAG, 30. OKTOBER'), font=klein, fill=(120, 30, 30), anchor='mm')
    d.line((30, 228, W - 30, 228), fill=TINTE, width=4)
    z = z or {}
    for i, zeile in enumerate(z.get('zeilen', ['FAHRGAST IM', 'LETZTEN ZUG', 'VERSCHWUNDEN'])):
        d.text((W / 2, 290 + i * 54), zeile, font=mittel, fill=TINTE, anchor='mm')
    d.rectangle((150, 460, W - 150, 860), fill=(70, 72, 80), outline=TINTE, width=6)
    foto = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    mensch(foto, W / 2, 1120, s=1.5, sitzen=False, farbe=(205, 208, 214), angst=0.2)
    grau = foto.convert('LA').convert('RGBA')
    maske = Image.new('L', (W, H), 0)
    ImageDraw.Draw(maske).rectangle((156, 466, W - 156, 854), fill=255)
    papier.paste(grau, (0, 0), Image.composite(grau.split()[3], Image.new('L', (W, H), 0), maske))
    d.text((W / 2, 900), z.get('unter', 'Zuletzt gesehen: Linie 7, 23:58 Uhr'), font=klein, fill=TINTE, anchor='mm')
    for i in range(6):
        d.line((60, 950 + i * 30, W - 60, 950 + i * 30), fill=(160, 156, 146), width=4)
    cw, ch = int(W / zoom), int(H / zoom)
    x0, y0 = (W - cw) // 2, int(470 - ch * 0.35)
    y0 = max(0, min(H - ch, y0))
    return papier.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.BILINEAR)
