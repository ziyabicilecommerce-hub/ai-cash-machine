"""2-Satz-Horror als Instagram-Story-Kacheln (1080x1920).
python3 storyKachel.py <kurz.json> <cover.jpg|-> <ausgabeordner>  ->  kachel1.jpg, kachel2.jpg (+ kachel2.mp4)
Hintergrund = Titelbild des neuen Reels, unscharf und abgedunkelt (Kachel 2 rot getönt) - ohne Titelbild: dunkler Verlauf.
Kachel 1 versteckt zwei schwach leuchtende Augen im Dunkeln. Kachel 2 gibt es zusätzlich als 6-s-Video:
Satz 2 tippt sich Buchstabe für Buchstabe, das Licht flackert, Herzschlag wird schneller - dann ein Glitch-Schock.
Ton komplett selbst erzeugt (ffmpeg-Generatoren), keine fremde Musik.
"""
import json, math, random, shutil, subprocess, sys
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


def layout(text, d):
    gr = 74
    while gr > 44:
        f = schrift(gr)
        zz = zeilen(text, f, W - 160, d)
        if len(zz) * gr * 1.3 <= 900:
            break
        gr -= 4
    return f, gr, zz


def augen(im, rnd):
    """Zwei schwach rot glühende Augen in einer dunklen Ecke - wer genau hinschaut, sieht sie."""
    x, y = rnd.choice([(170, 560), (880, 600), (190, 1640), (860, 1660)])
    glut = Image.new('RGB', (W, H), (0, 0, 0))
    g = ImageDraw.Draw(glut)
    for dx in (-30, 30):
        g.ellipse((x + dx - 13, y - 6, x + dx + 13, y + 6), fill=(150, 20, 20))
        g.ellipse((x + dx - 4, y - 3, x + dx + 4, y + 3), fill=(255, 120, 90))
    glut = glut.filter(ImageFilter.GaussianBlur(3))
    return Image.blend(im, Image.composite(glut, im, glut.convert('L').point(lambda v: 255 if v > 8 else 0)), 0.55)


def zeichne(im, f, gr, zz, rot, oben, unten, zeichen=None, wackel=(0, 0)):
    d = ImageDraw.Draw(im)
    y = (H - len(zz) * gr * 1.3) / 2 + wackel[1]
    rest = sum(len(z) for z in zz) if zeichen is None else zeichen
    for z in zz:
        teil = z[:max(0, rest)]
        rest -= len(z)
        if teil:
            # linksbündig von der Zeilenmitte aus, damit beim Tippen nichts springt
            x0 = W / 2 - d.textlength(z, font=f) / 2 + wackel[0]
            d.text((x0, y + gr * 0.65), teil, font=f, fill=(255, 235, 235) if rot else (245, 245, 245), stroke_width=4, stroke_fill=(0, 0, 0), anchor='lm')
        y += gr * 1.3
    d.text((W / 2, 300), oben, font=schrift(40), fill=(225, 25, 25), stroke_width=4, stroke_fill=(0, 0, 0), anchor='mm')
    if unten:
        f2 = schrift(52)
        for i, z in enumerate(zeilen(unten, f2, W - 200, d)):
            d.text((W / 2, 1460 + i * 68), z, font=f2, fill=(255, 210, 60), stroke_width=4, stroke_fill=(0, 0, 0), anchor='mm')
    d.text((W / 2, H - 230), 'KI-generiert · frei erfundene Geschichte', font=schrift(28), fill=(170, 170, 170), anchor='mm')
    return im


def kachel(text, cover, rot, oben, unten, ziel, mit_augen=False):
    im = hintergrund(cover, rot)
    if mit_augen:
        im = augen(im, random.Random(text))
    f, gr, zz = layout(text, ImageDraw.Draw(im))
    zeichne(im, f, gr, zz, rot, oben, unten).save(ziel, quality=90)


def glitch(im, rnd, stark):
    """RGB-Verschiebung + versetzte Streifen + roter Blitz."""
    r, g, b = im.split()
    v = int(18 * stark)
    im = Image.merge('RGB', (r.transform(im.size, Image.AFFINE, (1, 0, -v, 0, 1, 0)), g, b.transform(im.size, Image.AFFINE, (1, 0, v, 0, 1, 0))))
    for _ in range(int(9 * stark)):
        y, h = rnd.randint(0, H - 60), rnd.randint(12, 90)
        streifen = im.crop((0, y, W, y + h))
        im.paste(streifen, (rnd.randint(-80, 80), y))
    return Image.blend(im, Image.new('RGB', im.size, (200, 0, 0)), 0.25 * stark)


FPS, DAUER, TIPP_BIS, SCHOCK = 30, 6.0, 3.6, 4.0


def ton(ziel):
    """Brummen + schneller werdender Herzschlag, bei SCHOCK ein Rausch-Knall - alles synthetisch."""
    herz = f"0.9*sin(2*PI*52*t)*exp(-28*mod(t*(1.1+t*0.35),1))+0.6*sin(2*PI*48*t)*exp(-28*mod(t*(1.1+t*0.35)-0.22,1))"
    expr = f"if(lt(t,{SCHOCK}),0.25*sin(2*PI*41*t)+{herz},0)+if(between(t,{SCHOCK},{SCHOCK}+0.6),(random(0)*2-1)*exp(-5*(t-{SCHOCK})),0)"
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f"aevalsrc='{expr}':s=44100:d={DAUER}",
                    '-af', 'lowpass=f=3000,volume=0.55,alimiter=limit=0.89', ziel], check=True)


def video(text, frage, cover, ziel):
    basis = hintergrund(cover, True)
    f, gr, zz = layout(text, ImageDraw.Draw(basis))
    alle = sum(len(z) for z in zz)
    rnd = random.Random(text)
    wav = str(ziel) + '.wav'
    ton(wav)
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-i', wav, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-shortest',
                          '-movflags', '+faststart', str(ziel)], stdin=subprocess.PIPE)
    for i in range(int(FPS * DAUER)):
        t = i / FPS
        zeichen = int(alle * min(1, max(0, (t - 0.4) / (TIPP_BIS - 0.4))))
        im = basis.copy()
        if t < SCHOCK:
            # Flackern wie eine kaputte Lampe: ab und zu kurz dunkler
            if rnd.random() < 0.08:
                im = Image.blend(im, Image.new('RGB', im.size, (0, 0, 0)), 0.55)
            zeichne(im, f, gr, zz, True, '2-SATZ-HORROR', '', zeichen)
        else:
            s = max(0.0, 1 - (t - SCHOCK) / 0.5)
            wackel = (int(rnd.uniform(-14, 14) * s), int(rnd.uniform(-14, 14) * s))
            zeichne(im, f, gr, zz, True, '2-SATZ-HORROR', frage, None, wackel)
            if s > 0:
                im = glitch(im, rnd, s)
        p.stdin.write(im.tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError('ffmpeg fehlgeschlagen')
    Path(wav).unlink(missing_ok=True)


def main():
    daten = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    cover, aus = sys.argv[2], Path(sys.argv[3])
    aus.mkdir(parents=True, exist_ok=True)
    kachel(daten['a'], cover, False, '2-SATZ-HORROR', 'Tippen für Satz 2 ...', aus / 'kachel1.jpg', mit_augen=True)
    kachel(daten['b'], cover, True, '2-SATZ-HORROR', daten.get('frage', ''), aus / 'kachel2.jpg')
    if shutil.which('ffmpeg'):
        try:  # Video ist die Kür - klappt es nicht, bleibt das Standbild
            video(daten['b'], daten.get('frage', ''), cover, aus / 'kachel2.mp4')
        except Exception as e:
            print(f'Video-Kachel übersprungen: {e}')
            (aus / 'kachel2.mp4').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
