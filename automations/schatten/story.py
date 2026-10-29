# Schatten-Horror-Story: Silhouetten im Nachtzug, Erzählerstimme (edge-tts), große Untertitel mit einem gelben Wort.
# Aufruf: python3 story.py <story.json> <ausgabe-ordner>   ->  <ordner>/video.mp4 und cover.jpg
# Ohne Netz (oder STUMM=1) wird ohne Stimme gerendert - zum lokalen Testen.
import asyncio, json, math, os, random, subprocess, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps
from ton import tonspur
from figuren import leuchten, glied, mensch, schatten, hand, ZEIT

W, H, FPS = 720, 1280, 30
FONTDATEI = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT, KLEIN, FONT_POP = ImageFont.truetype(FONTDATEI, 60), ImageFont.truetype(FONTDATEI, 34), ImageFont.truetype(FONTDATEI, 64)
WEISS, GELB, HAUT, NACHT = (245, 245, 245), (255, 212, 0), (214, 219, 230), (2, 3, 8)
random.seed(11)
STERNE = [(random.randrange(W * 2), random.randrange(H), random.random() * 6.3, random.choice([1, 1, 2])) for _ in range(140)]


def verlauf(oben, unten):
    im = Image.new('RGB', (1, H))
    for y in range(H):
        k = y / H
        im.putpixel((0, y), tuple(int(oben[i] + (unten[i] - oben[i]) * k) for i in range(3)))
    return im.resize((W, H))


HIMMEL, WAND = verlauf((10, 16, 40), (1, 2, 6)), verlauf((22, 26, 40), (8, 9, 14))
LAMPE, AUGE, NEBEL, STREIF = leuchten(220, (255, 214, 150), 150), leuchten(18, (255, 255, 255)), leuchten(260, (170, 180, 205), 45), leuchten(60, (255, 190, 90), 200)
AUGE_LEISE, HANDYLICHT, AUGE_GROSS = leuchten(14, (255, 255, 255), 70), leuchten(90, (170, 200, 255), 170), leuchten(120, (255, 255, 255))


def sterne(d, t, dx=0.0, box=None):
    for x, y, p, r in STERNE:
        xx = (x - dx) % (W * 2) - W / 2
        if box and not (box[0] < xx < box[2] and box[1] < y < box[3]):
            continue
        a = int(90 + 140 * (0.5 + 0.5 * math.sin(t * 2 + p)))
        d.ellipse((xx - r, y - r, xx + r, y + r), fill=(a, a, min(255, a + 25)))


def zug_innen(im, t, lt, licht=1.0, fahrt=True, augen_im_fenster=False):
    im.paste(WAND)
    d = ImageDraw.Draw(im)
    for fx in (40, 380):
        box = (fx, 180, fx + 300, 470)
        d.rounded_rectangle(box, 28, fill=(4, 6, 16))
        sterne(d, t, dx=t * 420 if fahrt else 0, box=box)
        if fahrt:
            for i in range(3):
                sx = (fx + 330 - ((t * 900 + i * 260 + fx) % 420))
                if box[0] < sx < box[2] - 40:
                    im.paste(STREIF, (int(sx) - 60, 260 + i * 50 - 60), STREIF)
        d.rounded_rectangle(box, 28, outline=(120, 128, 150), width=6)
    if augen_im_fenster:  # verstecktes Detail zum Nochmal-Anschauen: er schaut schon die ganze Zeit rein
        for ex in (-9, 9):
            im.paste(AUGE_LEISE, (560 + ex - 14, 330 - 14), AUGE_LEISE)
    hell = int(200 * licht)
    d.rectangle((150, 70, 570, 86), fill=(hell, hell, min(255, hell + 20)))
    d.rectangle((0, 900, W, H), fill=(14, 15, 22))
    d.rounded_rectangle((60, 700, 660, 780), 20, fill=(34, 40, 60))
    d.rounded_rectangle((60, 520, 660, 710), 26, fill=(28, 33, 50))
    d.line((690, 90, 690, 900), fill=(140, 145, 160), width=10)


def bahnsteig(im, t, lt, kz):
    im.paste(HIMMEL)
    d = ImageDraw.Draw(im)
    sterne(d, t)
    d.rectangle((0, 830, W, H), fill=(18, 19, 26))
    d.line((0, 830, W, 830), fill=(200, 200, 210), width=4)
    d.line((470, 830, 470, 360), fill=(60, 62, 72), width=12)
    im.paste(LAMPE, (470 - 220, 360 - 120), LAMPE)
    d.rectangle((130, 420, 330, 480), fill=(30, 32, 44), outline=(190, 190, 200), width=4)
    d.text((230, 450), kz, font=KLEIN, fill=WEISS, anchor='mm')
    for i in range(3):
        nx = int((t * 30 + i * 300) % (W + 500)) - 400
        im.paste(NEBEL, (nx, 650 + i * 40), NEBEL)


def fensterrahmen(im):
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 120), fill=(16, 18, 28)); d.rectangle((0, 1060, W, H), fill=(16, 18, 28))
    d.rectangle((0, 0, 50, H), fill=(16, 18, 28)); d.rectangle((W - 50, 0, W, H), fill=(16, 18, 28))
    d.rounded_rectangle((50, 120, W - 50, 1060), 40, outline=(130, 136, 156), width=10)


def zettel(im, t, lt, nah, zeilen):
    bahnsteig(im, t, lt, '? ? ?')
    fensterrahmen(im)
    z = 1.0 + (0.4 * min(lt / 2.5, 1) if nah else 0)
    blatt = Image.new('RGBA', (int(430 * z), int(80 * z + 62 * z * len(zeilen))), (228, 222, 204, 255))
    f = ImageFont.truetype(FONTDATEI, int(40 * z))
    bd = ImageDraw.Draw(blatt)
    for i, zl in enumerate(zeilen):
        bd.text((blatt.width / 2, 40 * z + 31 * z + i * 62 * z), zl, font=f, fill=(140, 0, 0), anchor='mm')
    blatt = blatt.rotate(-4, expand=True, resample=Image.BICUBIC)
    im.paste(blatt, (int(W / 2 - blatt.width / 2), int(560 - blatt.height / 2)), blatt)


def handy_nah(im, lt, absender, nachricht):
    d = ImageDraw.Draw(im)
    im.paste(HANDYLICHT.resize((900, 1300)), (-90, -20), HANDYLICHT.resize((900, 1300)))
    zit = (random.randint(-6, 6) if lt < 0.6 else 0)
    x0, y0 = 120 + zit, 70
    d.rounded_rectangle((x0, y0, x0 + 480, y0 + 720), 50, fill=(12, 12, 16), outline=(90, 90, 100), width=8)
    d.rounded_rectangle((x0 + 20, y0 + 20, x0 + 460, y0 + 700), 36, fill=(232, 236, 244))
    d.text((x0 + 240, y0 + 80), absender, font=KLEIN, fill=(20, 20, 30), anchor='mm')
    d.line((x0 + 20, y0 + 120, x0 + 460, y0 + 120), fill=(200, 200, 210), width=2)
    sichtbar = nachricht[:max(1, int(len(nachricht) * min(1, (lt - 0.4) / 1.4)))] if lt > 0.4 else ''
    if lt <= 0.4 or len(sichtbar) < len(nachricht):
        d.rounded_rectangle((x0 + 40, y0 + 160, x0 + 140, y0 + 210), 24, fill=(205, 208, 216))
        for i in range(3):
            a = 120 + int(80 * (0.5 + 0.5 * math.sin(lt * 9 - i)))
            d.ellipse((x0 + 62 + i * 24, y0 + 178, x0 + 76 + i * 24, y0 + 192), fill=(a, a, a))
    if sichtbar:
        f = ImageFont.truetype(FONTDATEI, 34)
        zeilen, z = [], ''
        for w in sichtbar.split():
            if d.textlength((z + ' ' + w).strip(), font=f) > 330 and z:
                zeilen.append(z); z = w
            else:
                z = (z + ' ' + w).strip()
        zeilen.append(z)
        h = 30 + 44 * len(zeilen)
        d.rounded_rectangle((x0 + 40, y0 + 240, x0 + 410, y0 + 240 + h), 26, fill=(205, 208, 216))
        for i, zl in enumerate(zeilen):
            d.text((x0 + 62, y0 + 262 + i * 44), zl, font=f, fill=(15, 15, 20))


def fratze(im, lt):
    # Jumpscare: riesiger Schattenkopf, Augen, aufgerissenes Maul
    im.paste(Image.new('RGB', (W, H), (40, 0, 0) if int(lt * 12) % 2 else (0, 0, 0)))
    lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    g = 1.0 + 0.25 * min(lt / 0.25, 1)
    cx, cy = W / 2, 620
    d.ellipse((cx - 330 * g, cy - 470 * g, cx + 330 * g, cy + 470 * g), fill=(10, 9, 12, 255), outline=(120, 0, 0, 255), width=8)
    zacken = []
    for i in range(15):
        x = cx - 200 * g + i * (400 * g / 14)
        zacken.append((x, cy + 60 * g + (0 if i % 2 else 50 * g)))
    for i in range(14, -1, -1):
        x = cx - 200 * g + i * (400 * g / 14)
        zacken.append((x, cy + 260 * g - (0 if i % 2 else 50 * g)))
    d.polygon(zacken, fill=(25, 0, 0, 255), outline=(235, 235, 235, 255), width=6)
    im.paste(lage.filter(ImageFilter.GaussianBlur(4)), (0, 0), lage.filter(ImageFilter.GaussianBlur(4)))
    gr = AUGE_GROSS.resize((int(240 * g), int(240 * g)))
    for ex in (-130, 130):
        ax, ay = cx + ex * g, cy - 150 * g
        im.paste(gr, (int(ax - gr.width / 2), int(ay - gr.height / 2)), gr)
        ad = ImageDraw.Draw(im)
        ad.ellipse((ax - 52 * g, ay - 30 * g, ax + 52 * g, ay + 30 * g), fill=(255, 255, 255))
        ad.ellipse((ax - 9 * g, ay - 9 * g, ax + 9 * g, ay + 9 * g), fill=(0, 0, 0))


def uhr(im, t, bis, gesamt):
    # tickende Uhr oben: läuft bis 00:00:00, bleibt dann stehen und blinkt rot
    d = ImageDraw.Draw(im)
    if t < bis:
        sek = 23 * 3600 + 58 * 60 + 40 + int(80 * t / bis)
        text, farbe = f'{sek // 3600:02d}:{sek // 60 % 60:02d}:{sek % 60:02d}', WEISS
    else:
        text, farbe = '00:00:00', (230, 30, 30) if int(t * 2.5) % 2 else (90, 0, 0)
    d.text((W / 2, 140), text, font=KLEIN, fill=farbe, stroke_width=4, stroke_fill=(0, 0, 0), anchor='mm')


def warnung(im, text, lt):
    if int(lt * 3) % 2:
        ImageDraw.Draw(im).text((W / 2, 200), text, font=ImageFont.truetype(FONTDATEI, 46), fill=(225, 20, 20), stroke_width=6, stroke_fill=(0, 0, 0), anchor='mm')


def ki_bilder_laden(story, ordner):
    # Kostenlose KI-Bilder (Pollinations/FLUX, ohne Key) für Szenen mit "ki"-Prompt. Klappt eins nicht,
    # bleibt die gezeichnete Szene - das Video wird in jedem Fall fertig.
    stil = story.get('ki_stil', '')
    for i, s in enumerate(story['szenen']):
        if not s.get('ki') or os.environ.get('STUMM') == '1':
            continue
        url = 'https://image.pollinations.ai/prompt/' + urllib.parse.quote(f"{s['ki']}, {stil}") + '?' + urllib.parse.urlencode(
            {'width': W, 'height': H, 'model': 'flux', 'nologo': 'true', 'seed': story.get('ki_seed', 7) + i})
        for versuch in range(6):  # kostenlos = Tempolimit: bei 402/429 länger warten und nochmal
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=180) as r:
                    if not r.headers.get_content_type().startswith('image/'):
                        raise ValueError(r.headers.get_content_type())
                    ziel = os.path.join(ordner, f'ki-{i:02d}.jpg')
                    open(ziel, 'wb').write(r.read())
                    s['_kibild'] = ImageOps.fit(Image.open(ziel).convert('RGB'), (W, H))
                    print(f'KI-Bild {i} ({s["art"]}) ok')
                    time.sleep(20)
                    break
            except Exception as e:
                print(f'KI-Bild {i} Versuch {versuch + 1}: {e}')
                time.sleep(30)


def ki_szene(s, lt):
    # echtes Bild mit langsamer Kamerafahrt; je nach Szene dunkler oder rot flackernd
    bild_ = s['_kibild']
    p = min(lt / max(s.get('dauer', 3), 0.5), 1)
    zoom = 1.02 + 0.12 * p
    cw, ch = int(W / zoom), int(H / zoom)
    richtung = (hash(s.get('ki', '')) % 3) - 1
    x0 = int((W - cw) / 2 + richtung * (W - cw) / 2 * (p - 0.5))
    im = bild_.crop((x0, (H - ch) // 2, x0 + cw, (H - ch) // 2 + ch)).resize((W, H), Image.BILINEAR)
    if s['art'] == 'blitz' and int(lt * 10) % 4 == 0:
        return Image.new('RGB', (W, H), NACHT)
    if s['art'] in ('dunkel', 'blitz'):
        im = Image.blend(im, Image.new('RGB', (W, H), (40, 0, 0) if s['art'] == 'blitz' else NACHT), 0.35)
    return im


def bild(s, t, lt):
    art = s['art']
    if s.get('_kibild') is not None:
        return ki_szene(s, lt)
    im = Image.new('RGB', (W, H), NACHT)
    lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if art == 'teil2':
        sterne(ImageDraw.Draw(im), t)
        return im
    if art == 'fratze':
        fratze(im, lt)
        return im
    if art == 'nachricht':
        handy_nah(im, lt, s.get('absender', 'Mama'), s.get('nachricht', ''))
        return im
    if art == 'blitz':
        if int(lt * 10) % 4 == 0:
            return im
        art = 'ende'
        lt = 2.0
    if art == 'gesicht':
        # Nahaufnahme der Person: zitternd, große Augen, schaut sich panisch um - hinter ihr leuchten seine Augen auf
        zug_innen(im, t, lt, licht=0.6, fahrt=False)
        im = Image.blend(Image.new('RGB', (W, H), NACHT), im, 0.5)
        if lt > s.get('augen_bei', 1.4):
            for ex in (-12, 12):
                im.paste(AUGE, (int(585 + ex - 18), int(250 - 18)), AUGE)
        mensch(lage, 360, 1600, s=4.2, sitzen=False, angst=s.get('angst', 0.72), blick=math.sin(lt * 2.4) * 0.9)
        verlauf_maske = Image.linear_gradient('L').resize((W, H)).point(lambda v: 255 if v < 115 else max(0, 255 - (v - 115) * 6))
        lage.putalpha(Image.composite(lage.split()[3], Image.new('L', (W, H), 0), verlauf_maske))
        glow = lage.filter(ImageFilter.GaussianBlur(14))
        im.paste(glow, (0, 0), glow); im.paste(lage, (0, 0), lage)
        return im
    if art == 'dunkel':
        # die Figur im Dunkeln, seine Augen kommen langsam immer näher an ihren Kopf
        mensch(lage, 250, 812, farbe=(52, 56, 68), angst=0.9, blick=min(lt / max(s.get('dauer', 4), 1) * 1.4, 1))
        im.paste(lage, (0, 0), lage)
        p = min(lt / max(s.get('dauer', 4), 1), 1) ** 1.5
        a = AUGE.resize((int(36 + 50 * p), int(36 + 50 * p)))
        for ex in (-10, 10):
            ax, ay = 520 - 190 * p + ex * (1 + 2.5 * p), 330 + 190 * p
            im.paste(a, (int(ax - a.width / 2), int(ay - a.height / 2)), a)
        return Image.blend(im, Image.new('RGB', (W, H), NACHT), 0.3 + 0.3 * math.sin(lt * 3) ** 2)
    if art in ('innen', 'ende', 'handy', 'spiegel'):
        zug_innen(im, t, lt, augen_im_fenster=(art == 'innen'), fahrt=(art != 'spiegel'))
        if art == 'spiegel':
            geist = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            mensch(geist, 520, 470, s=0.55, farbe=(150, 160, 185), gesicht=False)
            schatten(geist, 565, 470, s=0.5, alpha=int(230 * min(lt / 2.0, 1)))
            maske = Image.new('L', (W, H), 0)
            ImageDraw.Draw(maske).rounded_rectangle((386, 186, 674, 464), 24, fill=110)
            im.paste(geist, (0, 0), Image.composite(geist.split()[3], Image.new('L', (W, H), 0), maske).point(lambda v: min(v, 110)))
        if s.get('naeher') is not None:  # er sitzt schon die ganze Zeit hinter ihr und kommt näher
            v = s['naeher']
            schatten(lage, 560 - 150 * v, 905, s=1.0 + 0.4 * v, alpha=int(35 + 120 * v), augen=v > 0.35)
        mensch(lage, 250, 812, angst=s.get('angst', 0.0), blick=s.get('blick', 0.0))
        if art == 'handy':
            zit = random.randint(-3, 3) if (lt % 0.8) < 0.3 else 0
            im.paste(HANDYLICHT, (int(300 - 90 + zit), int(650 - 90)), HANDYLICHT)
            ImageDraw.Draw(lage).rounded_rectangle((285 + zit, 640, 325 + zit, 700), 6, fill=(190, 215, 255, 255))
        if art == 'ende' and lt > 0.5:
            schatten(lage, 520, 905, s=1.45, wink=3.7, alpha=int(255 * min((lt - 0.5) / 0.3, 1)))
    elif art in ('station', 'schatten', 'winken', 'leer'):
        bahnsteig(im, t, lt, '00:00' if art == 'station' else '? ? ?')
        if art == 'schatten':
            schatten(lage, 480, 830, s=0.95)
        if art == 'winken':
            nah = 0.95 + 0.45 * min(lt / 3.0, 1)
            schatten(lage, 450, 830 + 140 * (nah - 0.95), s=nah, wink=0.55 * math.sin(lt * 7))
        im.paste(lage, (0, 0), lage); lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        fensterrahmen(im)
    elif art == 'klopfen':
        bahnsteig(im, t, lt, '? ? ?')
        fensterrahmen(im)
        if lt >= s.get('schreck_bei', 0.55):
            hand(im, 360, 560, min((lt - s.get('schreck_bei', 0.55)) / 0.08, 1))
    elif art in ('zettel', 'zettel2'):
        zettel(im, t, lt, art == 'zettel2', s.get('zettel', ['STEIG', 'NICHT AUS']))
    elif art == 'tueren':
        im.paste(HIMMEL)
        d = ImageDraw.Draw(im)
        auf = min(lt / 1.8, 1) ** 2 * 300
        d.rectangle((60, 120, 660, 1060), fill=(0, 0, 0))
        im.paste(NEBEL, (100, 700), NEBEL)
        if lt > 1.2:
            for ex in (-10, 10):
                im.paste(AUGE, (360 + ex - 18, 560 - 18), AUGE)
        for x0, x1 in ((60 - auf, 360 - auf), (360 + auf, 660 + auf)):
            d.rectangle((x0, 120, x1, 1060), fill=(70, 74, 86), outline=(170, 174, 186), width=6)
            d.rounded_rectangle((x0 + 60, 250, x1 - 60, 560), 20, fill=(10, 12, 20))
    elif art == 'licht':
        flacker = 1.0 if lt < 0.6 else (0.0 if lt > 1.3 else float(int(lt * 20) % 3 != 0))
        zug_innen(im, t, lt, licht=flacker, fahrt=False)
        mensch(lage, 250, 812, angst=s.get('angst', 0.6))
        im.paste(lage, (0, 0), lage); lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        im = Image.blend(Image.new('RGB', (W, H), NACHT), im, 0.15 + 0.85 * flacker)
        if lt > 1.3:
            for ex in (-10, 10):
                im.paste(AUGE, (430 + ex - 18, 470 - 18), AUGE)
    glow = lage.filter(ImageFilter.GaussianBlur(10))
    im.paste(glow, (0, 0), glow)
    im.paste(lage, (0, 0), lage)
    if s['art'] == 'blitz':
        im = Image.blend(im, Image.new('RGB', (W, H), (120, 0, 0)), 0.3)
    return im


def rotverschiebung(im, px):
    r, g, b = im.split()
    return Image.merge('RGB', (r.transform(im.size, Image.AFFINE, (1, 0, -px, 0, 1, 0)), g, b.transform(im.size, Image.AFFINE, (1, 0, px, 0, 1, 0))))


def untertitel(im, satz, key, k=None, basis=WEISS):
    # Wort für Wort: die Positionen stehen fest, sichtbar sind nur die ersten k Wörter (das neueste etwas größer)
    d = ImageDraw.Draw(im)
    zeilen, z = [], ''
    for w in satz.split():
        probe = (z + ' ' + w).strip()
        if d.textlength(probe, font=FONT) > 620 and z:
            zeilen.append(z); z = w
        else:
            z = probe
    zeilen.append(z)
    y, nr = 980 - (len(zeilen) - 1) * 36, 0
    for zl in zeilen:
        x = (W - d.textlength(zl, font=FONT)) / 2
        for w in zl.split():
            nr += 1
            if k is None or nr <= k:
                f = GELB if w.strip('".,:!?') == key else basis
                gross = FONT_POP if (k is not None and nr == k) else FONT
                d.text((x + d.textlength(w, font=FONT) / 2, y), w, font=gross, fill=f, stroke_width=6, stroke_fill=(0, 0, 0), anchor='mm')
            x += d.textlength(w + ' ', font=FONT)
        y += 72


async def stimme(text, datei, sprecher, tempo, tonhoehe='-12Hz'):
    import edge_tts
    await edge_tts.Communicate(text, sprecher, rate=tempo, pitch=tonhoehe).save(datei)


def dauer_von(datei):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', datei]))


def main():
    story, ordner = json.load(open(sys.argv[1], encoding='utf-8')), sys.argv[2]
    os.makedirs(ordner, exist_ok=True)
    ki_bilder_laden(story, ordner)
    fratze_ki = next((x['_kibild'] for x in story['szenen'] if x['art'] == 'fratze' and x.get('_kibild') is not None), None)
    stumm = os.environ.get('STUMM') == '1'
    plan, start = [], 0.0
    for i, s in enumerate(story['szenen']):
        datei, sprech = os.path.join(ordner, f'sprich-{i:02d}.mp3'), 0.0
        if s.get('sprich') and not stumm:
            try:
                tempo, hoehe = s.get('tempo', story.get('tempo', '+0%')), story.get('tonhoehe', '-12Hz')
                try:
                    asyncio.run(stimme(s['sprich'], datei, story.get('stimme', 'de-DE-ConradNeural'), tempo, hoehe))
                except Exception as e:  # Ersatzstimme, falls die gewünschte nicht verfügbar ist
                    print('Stimme nicht verfügbar, nehme Conrad:', e)
                    story['stimme'] = 'de-DE-ConradNeural'
                    asyncio.run(stimme(s['sprich'], datei, 'de-DE-ConradNeural', tempo, hoehe))
                sprech = dauer_von(datei)
            except Exception as e:
                print('Stimme fehlt:', e); stumm = True
        if not sprech and s.get('sprich'):
            sprech = len(s['sprich']) / 14
        mdatei, mdauer = os.path.join(ordner, f'monster-{i:02d}.mp3'), 0.0
        if s.get('monster') and not stumm:
            try:
                schlicht = story.get('ton') == 'schlicht'
                asyncio.run(stimme(s['monster'], mdatei, story.get('monsterstimme', 'de-DE-KillianNeural'), '-15%' if schlicht else '-30%', '-18Hz' if schlicht else '-35Hz'))
                mdauer = dauer_von(mdatei) / (1 if schlicht else 0.82)
            except Exception as e:
                print('Monsterstimme fehlt:', e)
        if s.get('monster') and not mdauer:
            mdauer = len(s['monster']) / 8
        mbei = s.get('monster_bei', sprech + 0.3)
        dauer = s.get('dauer') or max(sprech + s.get('pause', 0.25), 1.8, (mbei + mdauer + 0.6) if s.get('monster') else 0)
        plan.append({**s, 'start': start, 'dauer': dauer, 'sprech': sprech, 'datei': datei if (s.get('sprich') and not stumm) else None,
                     'mdatei': mdatei if (s.get('monster') and not stumm and os.path.exists(mdatei)) else None, 'mbei': mbei, 'mdauer': mdauer})
        start += dauer
    gesamt = start

    bildspur = os.path.join(ordner, 'bild.mp4')
    p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-vf', 'scale=1080:1920:flags=lanczos,vignette=PI/4.5,noise=alls=6:allf=t+u,format=yuv420p',
                          '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '6M', '-bufsize', '12M', bildspur], stdin=subprocess.PIPE)
    cover = None
    uhr_bis = next((s['start'] for s in plan if s['art'] in ('station', 'zettel2')), gesamt)
    for s in plan:
        n = int(round(s['dauer'] * FPS))
        worte = len(s.get('text', '').split())
        for f in range(n):
            lt, t = f / FPS, s['start'] + f / FPS
            ZEIT[0] = t
            im = bild(s, t, lt)
            zoom = 1 + (0.18 * min(lt / 0.2, 1) if s['art'] == 'fratze' else 0.07 * (f / n))
            cw, ch = int(W / zoom), int(H / zoom)
            im = im.crop(((W - cw) // 2, (H - ch) // 2, (W - cw) // 2 + cw, (H - ch) // 2 + ch)).resize((W, H), Image.BILINEAR)
            if (s.get('schreck') and lt < 0.6) or ('schreck_bei' in s and 0 <= lt - s['schreck_bei'] < 0.5):
                st = 26 if s['art'] == 'fratze' else 12
                im = im.rotate(random.uniform(-1.5, 1.5) if s['art'] == 'fratze' else 0, translate=(random.randint(-st, st), random.randint(-st, st)), fillcolor=NACHT)
                im = rotverschiebung(im, 10 if s['art'] == 'fratze' else 5)
            if any(0 <= lt - x < 2 / FPS for x in s.get('blitzbild', [])):
                fr = fratze_ki if fratze_ki is not None else Image.new('RGB', (W, H))
                if fratze_ki is None: fratze(fr, 0.3)
                im = Image.blend(im, fr, 0.75)
            if s['art'] == 'fratze' and f < 3:
                im = Image.blend(im, Image.new('RGB', (W, H), (255, 255, 255)), 0.7 - f * 0.25)
            if s['art'] == 'ende' and f == int(1.2 * FPS):
                cover = im.copy()
            fortschritt = t / gesamt
            if fortschritt > 0.45 and s['art'] != 'teil2':
                im = Image.blend(im, Image.new('RGB', (W, H), (45, 0, 4)), min(0.32, (fortschritt - 0.45) * 0.7))
            if s.get('monster') and lt >= s['mbei']:
                mt = s.get('monster_text', s['monster'].upper())
                mw = len(mt.split())
                untertitel(im, mt, '', min(mw, 1 + int((lt - s['mbei']) / max(s['mdauer'], 0.3) * mw * 1.1)), basis=(230, 25, 25))
            elif s.get('text'):
                k = worte if not s['sprech'] else min(worte, 1 + int(lt / max(s['sprech'], 0.3) * worte * 1.1))
                untertitel(im, s['text'], s.get('gelb', ''), k)
            if s.get('warnung'):
                warnung(im, s['warnung'], lt)
            if story.get('uhr', True) and s['art'] not in ('fratze', 'teil2', 'nachricht'):
                uhr(im, t, uhr_bis, gesamt)
            if f < 3 and s['start'] > 0 and s['art'] not in ('fratze', 'blitz'):
                im = Image.blend(im, Image.new('RGB', (W, H), NACHT), 0.6 - f * 0.2)
            p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
    if cover:
        untertitel(cover, story.get('titelbild', 'ER SITZT HINTER DIR'), story.get('titelbild_gelb', 'HINTER'))
        cover.resize((1080, 1920), Image.LANCZOS).save(os.path.join(ordner, 'cover.jpg'), quality=90)
    ton = tonspur(plan, gesamt, ordner, schlicht=story.get('ton') == 'schlicht')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', bildspur, '-i', ton, '-c', 'copy', '-shortest', '-movflags', '+faststart',
                    os.path.join(ordner, 'video.mp4')], check=True)
    print(f'fertig: {gesamt:.1f} s, Stimme: {"nein" if stumm else "ja"}')


if __name__ == '__main__':
    main()
