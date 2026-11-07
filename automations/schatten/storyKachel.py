"""2-Satz-Horror als Instagram-Story-Kacheln (1080x1920).
python3 storyKachel.py <kurz.json> <cover.jpg|-> <ausgabeordner>  ->  kachel1.jpg, kachel2.jpg
Hintergrund = Titelbild des neuen Reels, unscharf und abgedunkelt (Kachel 2 rot getönt) - ohne Titelbild: dunkler Verlauf.
"""
import json, random, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FONTDATEI = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def schrift(gr):
    try:
        return ImageFont.truetype(FONTDATEI, gr)
    except OSError:
        return ImageFont.load_default()


def zeilen(text, f, breite, d):
    out, z = [], ''
    for w in text.split():
        t = f'{z} {w}'.strip()
        if d.textlength(t, font=f) <= breite or not z:
            z = t
        else:
            out.append(z)
            z = w
    return out + ([z] if z else [])


def hintergrund(cover, rot):
    try:
        im = Image.open(cover).convert('RGB')
        s = max(W / im.width, H / im.height)
        im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1))
        im = im.crop(((im.width - W) // 2, (im.height - H) // 2, (im.width - W) // 2 + W, (im.height - H) // 2 + H))
        im = im.filter(ImageFilter.GaussianBlur(18))
    except Exception:
        im = Image.new('RGB', (W, H), (12, 10, 14))
    dunkel = Image.new('RGB', (W, H), (60, 0, 0) if rot else (0, 0, 0))
    im = Image.blend(im, dunkel, 0.72 if rot else 0.68)
    # Vignette + Körnung: wirkt wie ein alter Film statt wie eine Folie
    maske = Image.new('L', (W, H), 0)
    ImageDraw.Draw(maske).ellipse((-W * 0.35, -H * 0.2, W * 1.35, H * 1.2), fill=255)
    maske = maske.filter(ImageFilter.GaussianBlur(160))
    im = Image.composite(im, Image.new('RGB', (W, H), (0, 0, 0)), maske)
    rnd = random.Random(7 if rot else 3)
    korn = Image.new('L', (W // 4, H // 4))
    korn.putdata([rnd.randint(0, 255) for _ in range(korn.width * korn.height)])
    return Image.blend(im, Image.merge('RGB', [korn.resize((W, H))] * 3), 0.06)


def kachel(text, cover, rot, oben, unten, ziel):
    im = hintergrund(cover, rot)
    d = ImageDraw.Draw(im)
    gr = 74
    while gr > 44:
        f = schrift(gr)
        zz = zeilen(text, f, W - 160, d)
        if len(zz) * gr * 1.3 <= 900:
            break
        gr -= 4
    hoehe = len(zz) * gr * 1.3
    y = (H - hoehe) / 2
    for z in zz:
        d.text((W / 2, y + gr * 0.65), z, font=f, fill=(255, 235, 235) if rot else (245, 245, 245), stroke_width=4, stroke_fill=(0, 0, 0), anchor='mm')
        y += gr * 1.3
    d.text((W / 2, 300), oben, font=schrift(40), fill=(225, 25, 25), stroke_width=4, stroke_fill=(0, 0, 0), anchor='mm')
    if unten:
        f2 = schrift(52)
        for i, z in enumerate(zeilen(unten, f2, W - 200, d)):
            d.text((W / 2, 1460 + i * 68), z, font=f2, fill=(255, 210, 60), stroke_width=4, stroke_fill=(0, 0, 0), anchor='mm')
    d.text((W / 2, H - 230), 'KI-generiert · frei erfundene Geschichte', font=schrift(28), fill=(170, 170, 170), anchor='mm')
    im.save(ziel, quality=90)


def main():
    daten = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    cover, aus = sys.argv[2], Path(sys.argv[3])
    aus.mkdir(parents=True, exist_ok=True)
    kachel(daten['a'], cover, False, '2-SATZ-HORROR', 'Tippen für Satz 2 ...', aus / 'kachel1.jpg')
    kachel(daten['b'], cover, True, '2-SATZ-HORROR', daten.get('frage', ''), aus / 'kachel2.jpg')


if __name__ == '__main__':
    main()
