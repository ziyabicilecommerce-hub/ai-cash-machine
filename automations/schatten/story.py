# Schatten-Horror-Story: Silhouetten im Nachtzug, Erzählerstimme (edge-tts), große Untertitel mit einem gelben Wort.
# Aufruf: python3 story.py <story.json> <ausgabe-ordner>   ->  <ordner>/video.mp4 und cover.jpg
# Ohne Netz (oder STUMM=1) wird ohne Stimme gerendert - zum lokalen Testen.
import asyncio, json, math, os, random, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

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


def leuchten(radius, farbe, staerke=255):
    g = Image.new('RGBA', (radius * 2, radius * 2), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse((radius * 0.4, radius * 0.4, radius * 1.6, radius * 1.6), fill=farbe + (staerke,))
    return g.filter(ImageFilter.GaussianBlur(radius * 0.35))


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


def glied(d, a, b, w, f):
    d.line((a, b), fill=f, width=w)
    for p in (a, b):
        d.ellipse((p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2), fill=f)


def mensch(lage, x, y, s=1.0, sitzen=True, farbe=HAUT):
    # gefüllte, realistische Silhouette (Kopf, Hals, Schultern, Arme, Beine) mit weichem Leuchten
    d = ImageDraw.Draw(lage)
    k = lambda px, py: (x + px * s, y + py * s)
    d.ellipse((*k(-24, -300), *k(24, -244)), fill=farbe)
    d.rectangle((*k(-9, -250), *k(9, -232)), fill=farbe)
    d.polygon([k(-46, -232), k(46, -232), k(36, -120), k(-36, -120)], fill=farbe)
    glied(d, k(-42, -226), k(-56, -150), int(22 * s), farbe)
    glied(d, k(-56, -150), k(-20, -110), int(19 * s), farbe)
    glied(d, k(42, -226), k(56, -150), int(22 * s), farbe)
    glied(d, k(56, -150), k(22, -112), int(19 * s), farbe)
    if sitzen:
        for dx in (-16, 16):
            glied(d, k(dx, -122), k(dx + 78, -116), int(30 * s), farbe)
            glied(d, k(dx + 78, -116), k(dx + 84, -20), int(25 * s), farbe)
    else:
        for dx in (-18, 18):
            glied(d, k(dx, -122), k(dx * 1.3, -10), int(28 * s), farbe)


def schatten(ziel, x, y, s=1.0, wink=0.0, alpha=255, augen=True):
    lage = Image.new('RGBA', ziel.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    f = (0, 0, 0, alpha)
    k = lambda px, py: (x + px * s, y + py * s)
    d.ellipse((*k(-26, -470), *k(26, -400)), fill=f)
    d.polygon([k(-34, -400), k(34, -400), k(24, -150), k(16, 0), k(-16, 0), k(-24, -150)], fill=f)
    glied(d, k(-30, -390), k(-60, -60), int(14 * s), f)
    a = -1.25 + wink
    glied(d, k(30, -390), (x + 30 * s + math.cos(a) * 230 * s, y - 390 * s + math.sin(a) * 230 * s), int(14 * s), f)
    ziel.alpha_composite(lage.filter(ImageFilter.GaussianBlur(3)))
    if augen:
        for ex in (-10, 10):
            ziel.alpha_composite(AUGE, (int(x + ex * s - 18), int(y - 440 * s - 18)))


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


def bild(s, t, lt):
    art = s['art']
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
    if art == 'dunkel':
        for ex in (-10, 10):
            im.paste(AUGE, (int(520 + ex - 18), int(330 - 18)), AUGE)
        return Image.blend(im, Image.new('RGB', (W, H), NACHT), 0.3 + 0.3 * math.sin(lt * 3) ** 2)
    if art in ('innen', 'ende', 'handy'):
        zug_innen(im, t, lt, augen_im_fenster=(art == 'innen'))
        mensch(lage, 250, 812)
        if art == 'handy':
            zit = random.randint(-3, 3) if (lt % 0.8) < 0.3 else 0
            im.paste(HANDYLICHT, (int(300 - 90 + zit), int(650 - 90)), HANDYLICHT)
            ImageDraw.Draw(lage).rounded_rectangle((285 + zit, 640, 325 + zit, 700), 6, fill=(190, 215, 255, 255))
        if art == 'ende' and lt > 0.5:
            schatten(lage, 520, 905, s=1.45, wink=3.7, alpha=int(255 * min((lt - 0.5) / 0.3, 1)))
    elif art in ('station', 'schatten', 'winken'):
        bahnsteig(im, t, lt, '00:00' if art == 'station' else '? ? ?')
        if art != 'station':
            schatten(lage, 480, 830, s=0.95, wink=0.55 * math.sin(lt * 7) if art == 'winken' else 0.0)
        im.paste(lage, (0, 0), lage); lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        fensterrahmen(im)
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
        mensch(lage, 250, 812)
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


def untertitel(im, satz, key, k=None):
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
                f = GELB if w.strip('".,:!?') == key else WEISS
                gross = FONT_POP if (k is not None and nr == k) else FONT
                d.text((x + d.textlength(w, font=FONT) / 2, y), w, font=gross, fill=f, stroke_width=6, stroke_fill=(0, 0, 0), anchor='mm')
            x += d.textlength(w + ' ', font=FONT)
        y += 72


async def stimme(text, datei, sprecher, tempo):
    import edge_tts
    await edge_tts.Communicate(text, sprecher, rate=tempo, pitch='-12Hz').save(datei)


def dauer_von(datei):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', datei]))


def tonspur(plan, gesamt, ordner):
    # Brummen + Rumpeln, Herzschlag wird schneller, Schläge bei Schrecks, Kreischen beim Jumpscare,
    # Flüstern, und Stille direkt vor dem Schreck (alles kostenlos aus ffmpeg erzeugt)
    herz = next((s['start'] for s in plan if s['art'] == 'schatten'), gesamt)
    ph = f"(t*(1+max(t-{herz:.2f},0)/18))"
    teile = [f"0.18*sin(2*PI*55*t)*(0.7+0.3*sin(2*PI*0.2*t))+0.1*sin(2*PI*82.4*t+sin(2*PI*0.5*t))",
             f"0.45*gte(t,{herz:.2f})*exp(-16*mod({ph},1))*sin(2*PI*48*t)",
             f"0.35*gte(t,{herz:.2f})*gte(mod({ph},1),0.25)*exp(-16*(mod({ph},1)-0.25))*sin(2*PI*44*t)"]
    for s in plan:
        a = f"{s['start']:.2f}"
        if s.get('schreck'):
            teile.append(f"0.9*gte(t,{a})*exp(-3.5*(t-{a}))*sin(2*PI*38*t)")
        if s['art'] == 'fratze':
            teile.append(f"0.6*gte(t,{a})*exp(-2.2*(t-{a}))*sin(2*PI*(1300+700*sin(2*PI*11*t))*t)")
            teile.append(f"0.5*gte(t,{a})*exp(-2.2*(t-{a}))*sin(2*PI*(1750+500*sin(2*PI*17*t))*t)")
    stille = [s for s in plan if s.get('stille')]
    leise = '+'.join(f"between(t,{s['start']:.2f},{s['start'] + s['dauer']:.2f})" for s in stille) or '0'
    fluester = '+'.join(f"between(t,{s['start']:.2f},{s['start'] + s['dauer']:.2f})" for s in plan if s.get('fluestern')) or '0'
    eingaben = ['-f', 'lavfi', '-i', f"aevalsrc='{'+'.join(teile)}':s=44100:d={gesamt:.2f}",
                '-f', 'lavfi', '-i', f'anoisesrc=color=brown:amplitude=0.2:d={gesamt:.2f}',
                '-f', 'lavfi', '-i', f'anoisesrc=color=white:amplitude=0.5:d={gesamt:.2f}']
    filter_ = (f"[0]volume='if(gt({leise},0),0.03,1)':eval=frame[b];[1]lowpass=f=160,volume='if(gt({leise},0),0.05,1)':eval=frame[n];"
               f"[2]bandpass=f=2800:w=1800,volume='0.5*gt({fluester},0)*(0.4+0.6*abs(sin(2*PI*2.3*t)))':eval=frame,aecho=0.8:0.7:90:0.4[w];")
    mix = ['[b]', '[n]', '[w]']
    for i, s in enumerate(x for x in plan if x['datei']):
        eingaben += ['-i', s['datei']]
        ms = int(s['start'] * 1000) + 120
        filter_ += f'[{i + 3}]aresample=44100,aecho=0.8:0.6:70|140:0.25|0.12,volume=2.4,adelay={ms}|{ms}[v{i}];'
        mix.append(f'[v{i}]')
    filter_ += f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0,afade=t=out:st={gesamt - 1.5:.2f}:d=1.5,alimiter=limit=0.92[a]"
    ton = os.path.join(ordner, 'ton.m4a')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *eingaben, '-filter_complex', filter_, '-map', '[a]', '-ac', '2', '-c:a', 'aac', '-b:a', '192k', ton], check=True)
    return ton


def main():
    story, ordner = json.load(open(sys.argv[1], encoding='utf-8')), sys.argv[2]
    os.makedirs(ordner, exist_ok=True)
    stumm = os.environ.get('STUMM') == '1'
    plan, start = [], 0.0
    for i, s in enumerate(story['szenen']):
        datei, sprech = os.path.join(ordner, f'sprich-{i:02d}.mp3'), 0.0
        if s.get('sprich') and not stumm:
            try:
                asyncio.run(stimme(s['sprich'], datei, story.get('stimme', 'de-DE-ConradNeural'), s.get('tempo', '-8%')))
                sprech = dauer_von(datei)
            except Exception as e:
                print('Stimme fehlt:', e); stumm = True
        if not sprech and s.get('sprich'):
            sprech = len(s['sprich']) / 14
        dauer = s.get('dauer') or max(sprech + s.get('pause', 0.35), 1.8)
        plan.append({**s, 'start': start, 'dauer': dauer, 'sprech': sprech, 'datei': datei if (s.get('sprich') and not stumm) else None})
        start += dauer
    gesamt = start

    bildspur = os.path.join(ordner, 'bild.mp4')
    p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-vf', 'scale=1080:1920:flags=lanczos,vignette=PI/4.5,noise=alls=6:allf=t+u,format=yuv420p',
                          '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '6M', '-bufsize', '12M', bildspur], stdin=subprocess.PIPE)
    cover = None
    for s in plan:
        n = int(round(s['dauer'] * FPS))
        worte = len(s.get('text', '').split())
        for f in range(n):
            lt, t = f / FPS, s['start'] + f / FPS
            im = bild(s, t, lt)
            zoom = 1 + (0.18 * min(lt / 0.2, 1) if s['art'] == 'fratze' else 0.07 * (f / n))
            cw, ch = int(W / zoom), int(H / zoom)
            im = im.crop(((W - cw) // 2, (H - ch) // 2, (W - cw) // 2 + cw, (H - ch) // 2 + ch)).resize((W, H), Image.BILINEAR)
            if s.get('schreck') and lt < 0.6:
                st = 26 if s['art'] == 'fratze' else 12
                im = im.rotate(random.uniform(-1.5, 1.5) if s['art'] == 'fratze' else 0, translate=(random.randint(-st, st), random.randint(-st, st)), fillcolor=NACHT)
                im = rotverschiebung(im, 10 if s['art'] == 'fratze' else 5)
            if s['art'] == 'fratze' and f < 3:
                im = Image.blend(im, Image.new('RGB', (W, H), (255, 255, 255)), 0.7 - f * 0.25)
            if s['art'] == 'ende' and f == int(1.2 * FPS):
                cover = im.copy()
            if s.get('text'):
                k = worte if not s['sprech'] else min(worte, 1 + int(lt / max(s['sprech'], 0.3) * worte * 1.1))
                untertitel(im, s['text'], s.get('gelb', ''), k)
            if f < 3 and s['start'] > 0 and s['art'] not in ('fratze', 'blitz'):
                im = Image.blend(im, Image.new('RGB', (W, H), NACHT), 0.6 - f * 0.2)
            p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
    if cover:
        untertitel(cover, story.get('titelbild', 'ER SITZT HINTER DIR'), story.get('titelbild_gelb', 'HINTER'))
        cover.resize((1080, 1920), Image.LANCZOS).save(os.path.join(ordner, 'cover.jpg'), quality=90)
    ton = tonspur(plan, gesamt, ordner)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', bildspur, '-i', ton, '-c', 'copy', '-shortest', '-movflags', '+faststart',
                    os.path.join(ordner, 'video.mp4')], check=True)
    print(f'fertig: {gesamt:.1f} s, Stimme: {"nein" if stumm else "ja"}')


if __name__ == '__main__':
    main()
