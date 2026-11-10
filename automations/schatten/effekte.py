# Bildeffekte für die Schatten-Story (ausgelagert aus story.py): kalter Einstieg mit Rücklauf, Endlos-Schleife,
# Bild folgt dem 3D-Ton, Suchbild (versteckte Augen), Banner, weiche Kurven und federnde Schrift.
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 720, 1280
FONTDATEI = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
GELB = (255, 212, 0)
from ton import raum_winkel  # noqa: E402

def rotverschiebung(im, px):
    r, g, b = im.split()
    return Image.merge('RGB', (r.transform(im.size, Image.AFFINE, (1, 0, -px, 0, 1, 0)), g, b.transform(im.size, Image.AFFINE, (1, 0, px, 0, 1, 0))))


def weich(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


_POP = {}
def popfont(groesse):
    groesse = int(round(groesse))
    if groesse not in _POP:
        _POP[groesse] = ImageFont.truetype(FONTDATEI, groesse)
    return _POP[groesse]



def suchzeiten(plan):
    # 3 Zeitpunkte zwischen Hook (ab 2,8 s) und Jumpscare, nie in Fratze/Nachricht/Endkarte, mind. 0,8 s auseinander
    bis = next((x['start'] for x in plan if x['art'] == 'fratze'), plan[-1]['start'])
    gesperrt = [(x['start'], x['start'] + x['dauer']) for x in plan if x['art'] in ('fratze', 'teil2', 'nachricht', 'zeitung_nah')]
    frei = [round(2.8 + i / 10, 1) for i in range(int((bis - 3.1) * 10))]
    frei = [z for z in frei if not any(v - 0.2 <= z < b for v, b in gesperrt)]
    zeiten = []
    for ziel in (0.3, 0.58, 0.85):
        for z in sorted(frei, key=lambda z: abs(z - bis * ziel)):
            if all(abs(z - y) >= 0.8 for y in zeiten):
                zeiten.append(z); break
    return sorted(zeiten) if len(zeiten) == 3 else []


KALT_BIS = 0.8  # so lange zeigt der kalte Einstieg das Ende
SCHLEIFE = 0.45  # Überblendung am Schluss zurück ins erste Bild - das Video läuft nahtlos von vorne

_SCHATTEN = []
def _schattenbild():
    # weicher dunkler Fleck (einmal berechnet): die "Gestalt", die mit dem Flüstern um dich herumgeht
    if not _SCHATTEN:
        g = Image.new('L', (520, 900), 0)
        ImageDraw.Draw(g).ellipse((90, 90, 430, 810), fill=235)
        _SCHATTEN.append(g.filter(ImageFilter.GaussianBlur(70)))
    return _SCHATTEN[0]


def raum_bild(im, z, t):
    # Bild folgt dem 3D-Ton: Schatten am Bildrand dort, wo gerade geflüstert wird; Klopfer lassen die Seite zucken
    if z['von'] <= t < z['bis']:
        w = raum_winkel(z, t)
        staerke = min((t - z['von']) / 2, 1) * (0.75 - 0.2 * math.cos(w))  # hinter dir: dunkler, näher
        x = int(W / 2 + math.sin(w) * W * 0.62 - 260)
        maske = _schattenbild().point(lambda v: int(v * max(0.0, min(1.0, staerke))))
        im.paste((0, 0, 0), (x, int(H * 0.22)), maske)
    for k, seite in ((z['klopf_links'], -1), (z['klopf_rechts'], 1)):
        if 0 <= t - k < 0.18:
            st = 1 - (t - k) / 0.18
            im = im.transform((W, H), Image.AFFINE, (1, 0, -seite * 14 * st, 0, 1, 0), Image.BILINEAR)
            hell = Image.new('RGB', (W // 3, H), (200, 210, 230))
            im.paste(Image.blend(im.crop((0 if seite < 0 else W - W // 3, 0, W // 3 if seite < 0 else W, H)), hell, 0.25 * st), (0 if seite < 0 else W - W // 3, 0))
    return im


def zurueckspulen(im, x, sprache='de'):
    # Videokassetten-Rücklauf: Bild zittert, Streifen reißen, "◀◀ VORHER" oben links
    st = random.Random(int(x * 1000))
    im = rotverschiebung(im, 6)
    for _ in range(5):
        y = st.randint(120, H - 200)
        im.paste(im.crop((0, y, W, y + st.randint(8, 30))), (st.randint(-60, 60), y))
    d = ImageDraw.Draw(im)
    d.rectangle((0, H - 120 - st.randint(0, 40), W, H - 104), fill=(230, 230, 230))
    d.text((28, 98), '◀◀ EARLIER' if sprache == 'en' else '◀◀ VORHER', font=ImageFont.truetype(FONTDATEI, 32), fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0))
    return im


def kopfhoerer(im, sprache='de'):
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONTDATEI, 28)
    text = 'HEADPHONES ON' if sprache == 'en' else 'KOPFHÖRER AUF'
    b = d.textlength(text, font=f)
    d.rounded_rectangle(((W - b) / 2 - 14, 258, (W + b) / 2 + 14, 300), 12, fill=(20, 20, 20), outline=GELB, width=3)
    d.text((W / 2, 279), text, font=f, fill=GELB, anchor='mm')


def suchbanner(im, sprache='de'):
    d = ImageDraw.Draw(im)
    text = 'HIS EYES ARE HIDDEN 3x' if sprache == 'en' else 'SEINE AUGEN SIND 3x VERSTECKT'
    f = ImageFont.truetype(FONTDATEI, 32)
    b = d.textlength(text, font=f)
    d.rounded_rectangle(((W - b) / 2 - 16, 196, (W + b) / 2 + 16, 246), 14, fill=GELB)
    d.text((W / 2, 221), text, font=f, fill=(10, 10, 10), anchor='mm')


def hinweise(im, t, story, such, sprache='de'):
    """Oben im Bild: erst die Schlagzeile (bis 2,6 s, höchstens 6 Wörter), danach die Hinweise (Augen, Kopfhörer)."""
    if t < 2.6:
        text = story.get('schlag') or ''
        if not text:
            return
        d = ImageDraw.Draw(im)
        gr = 58
        while gr > 34 and d.textlength(text, font=ImageFont.truetype(FONTDATEI, gr)) > W - 110:
            gr -= 4
        f = ImageFont.truetype(FONTDATEI, gr)
        b = d.textlength(text, font=f)
        wachs = min(1.0, 0.86 + t / 0.25 * 0.14)  # springt in den ersten 0,25 s leicht auf
        hb, hh = (b / 2 + 26) * wachs, (gr / 2 + 20) * wachs
        d.rounded_rectangle((W / 2 - hb, 250 - hh, W / 2 + hb, 250 + hh), 16, fill=(215, 20, 20))
        d.text((W / 2, 250), text, font=f, fill=(255, 255, 255), stroke_width=2, stroke_fill=(90, 0, 0), anchor='mm')
    elif t < 5.2:
        if such:
            suchbanner(im, sprache)
        if story.get('raum'):
            kopfhoerer(im, sprache)


# Kino-Look für die fertige Bildspur (ffmpeg -vf): Bloom (Lichter leuchten weich), Teal-Orange-Farbgebung,
# leichte Linsen-Farbsäume, Filmkorn, Vignette - wirkt teurer, kostet beim Rendern nur Sekunden
KINO_LOOK = ('split[a][b];[b]gblur=sigma=14[g];[a][g]blend=all_mode=screen:all_opacity=0.16,'
             'colorbalance=rs=-0.05:gs=-0.01:bs=0.07:rh=0.06:gh=0.02:bh=-0.05,eq=contrast=1.07:saturation=0.88,'
             'scale=1080:1920:flags=lanczos,rgbashift=rh=-2:bh=2,unsharp=5:5:0.5,vignette=PI/4.5,noise=alls=6:allf=t+u,format=yuv420p')
