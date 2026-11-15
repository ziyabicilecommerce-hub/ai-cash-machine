# Ich-Perspektive (15.11., Wunsch: "die Bewegungen sind Müll, such was anderes" -> POV-Probe -> "Ja mach so weiter").
# Statt einer gezeichneten Figur sieht man durch ihre Augen: die eigenen Hände halten das Handy, auf dem der Chat der
# Geschichte läuft, im Hintergrund wechseln die Räume und in der dunklen Öffnung kommt das Wesen Szene für Szene näher.
# story.py übernimmt Stimme, Ton, Kamera-Wackeln und Effekte - hier wird nur das Bild gemalt (einrichten() tauscht bild()).
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pov_raum import RAEUME, raeume_fuer, W, H
from figuren import schatten, ZEIT

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
_F = {}


def font(gr):
    if gr not in _F:
        _F[gr] = ImageFont.truetype(FONT, gr)
    return _F[gr]


def zeilen(text, f, breite):
    aus, z = [], ''
    for w in text.split():
        if z and f.getlength(f'{z} {w}') > breite:
            aus.append(z); z = w
        else:
            z = f'{z} {w}'.strip()
    return aus + ([z] if z else [])


def caption(im, text, gelb=''):
    # ganzer Satz oben, gut lesbar (statt einzelner Wörter in der Mitte)
    if not text:
        return
    d = ImageDraw.Draw(im)
    gr = 54
    while gr > 34 and len(zeilen(text, font(gr), 620)) > 3:
        gr -= 4
    zs = zeilen(text, font(gr), 620)
    gelbe = {w.strip('.,!?:') for w in str(gelb).split()}
    for i, z in enumerate(zs):
        y = 150 + i * gr * 1.18
        x = W / 2 - font(gr).getlength(z) / 2
        for w in z.split():
            farbe = (255, 212, 0) if w.strip('.,!?:') in gelbe else (255, 255, 255)
            d.text((x, y), w, font=font(gr), fill=farbe, stroke_width=5, stroke_fill=(0, 0, 0))
            x += font(gr).getlength(w + ' ')


def handy(im, t, kopf, nachrichten, tippt, unten=0.0, sperr=None):
    # Hände + Handy mit Chat; unten > 0 lässt das Handy sinken (Schreck), sperr = Sperrbildschirm mit Mitteilung
    lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lage)
    cx = W // 2 + math.sin(t * 1.1) * 6
    cy = H - 240 + math.sin(t * 1.6) * 5 + unten * 520
    haut, sch = (232, 194, 170), (190, 148, 128)
    for sx in (-1, 1):  # Ärmel
        d.polygon([(cx + sx * 380, H + 40), (cx + sx * 170, cy + 140), (cx + sx * 100, cy + 190), (cx + sx * 230, H + 40)], fill=(40, 46, 66))
    for sx in (-1, 1):  # Handballen hinter dem Handy
        d.ellipse((cx + sx * 150 - 80, cy - 20, cx + sx * 150 + 60, cy + 190), fill=haut)
    d.rounded_rectangle((cx - 138, cy - 330, cx + 138, cy + 170), 38, fill=(10, 10, 14))
    hell = (238, 241, 248)
    d.rounded_rectangle((cx - 126, cy - 318, cx + 126, cy + 158), 30, fill=hell if not sperr else (18, 22, 40))
    if sperr:  # Sperrbildschirm: Uhrzeit + Mitteilung
        d.text((cx, cy - 250), '3:12', font=font(64), fill=(240, 240, 250), anchor='mm')
        d.rounded_rectangle((cx - 114, cy - 160, cx + 114, cy - 60), 20, fill=(60, 64, 84))
        d.text((cx - 100, cy - 146), sperr[0], font=font(18), fill=(200, 204, 220))
        for i, z in enumerate(zeilen(sperr[1], font(20), 200)[:2]):
            d.text((cx - 100, cy - 118 + i * 24), z, font=font(20), fill=(255, 255, 255))
    else:
        d.rectangle((cx - 126, cy - 318, cx + 126, cy - 262), fill=(214, 219, 230))
        d.ellipse((cx - 112, cy - 306, cx - 80, cy - 274), fill=(30, 30, 36))
        d.text((cx - 70, cy - 290), kopf, font=font(22), fill=(25, 25, 35), anchor='lm')
        y = cy + 140
        blasen = list(nachrichten) + ([('...', True)] if tippt else [])
        for txt, links in reversed(blasen):  # unten anfangen, wie im echten Chat
            zs = zeilen(txt, font(19), 170)[:3]
            h = 22 * len(zs) + 22
            y -= h + 10
            if y < cy - 255:
                break
            bw = max(font(19).getlength(z) for z in zs) + 28
            x0 = cx - 116 if links else cx + 116 - bw
            d.rounded_rectangle((x0, y, x0 + bw, y + h), 16, fill=(222, 226, 236) if links else (52, 120, 246))
            for i, z in enumerate(zs):
                d.text((x0 + 14, y + 11 + i * 22), z, font=font(19), fill=(20, 20, 30) if links else (255, 255, 255))
    for sx in (-1, 1):  # Daumen über dem Rand
        d.ellipse((cx + sx * 124 - 30, cy + 10, cx + sx * 124 + 30, cy + 120), fill=sch)
        d.ellipse((cx + sx * 124 - 22, cy + 18, cx + sx * 124 + 22, cy + 70), fill=haut)
    im.paste(lage, (0, 0), lage)
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((cx - 460, cy - 700, cx + 460, cy + 300), fill=(130, 160, 230, 46))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    im.paste(glow, (0, 0), glow)


def einrichten(story, g):
    # story.py: Bild-Funktion tauschen, Banner/Uhr aus, Untertitel übernimmt caption()
    szenen = story['szenen']
    alles = ' '.join(str(s.get('text') or s.get('sprich') or '') for s in szenen)
    raeume = raeume_fuer(story.get('ort', 'haus'), alles)
    absender = next((s['absender'] for s in szenen if s.get('absender')), 'Unbekannt')
    erste = next((s['nachricht'] for s in szenen if s.get('nachricht')), None) or ('Are you awake?' if story.get('sprache') == 'en' else 'Bist du wach?')
    monster = next((s['monster'] for s in szenen if s.get('monster')), None)
    en = story.get('sprache') == 'en'
    chat = [(erste, True), ('Who is this?' if en else 'Wer ist da?', False), (monster or ('I see you.' if en else 'Ich sehe dich.'), True),
            ('Turn around.' if en else 'Dreh dich um.', True)]
    mit_bild = [s for s in szenen if s['art'] not in ('fratze', 'teil2')]
    for i, s in enumerate(szenen):
        s['pov_text'], s['text'] = s.get('text', ''), ''
        nr = mit_bild.index(s) if s in mit_bild else 0
        s['pov_raum'] = raeume[nr % 2]
        s['pov_naeher'] = nr / max(len(mit_bild) - 1, 1)
        s['pov_chat'] = min(len(chat), 1 + nr)
    story['kamera'] = False
    story['uhr'] = False
    alt_bild, alt_fratze = g['bild'], g['fratze']

    def bild(s, t, lt):
        if s['art'] == 'teil2':
            return alt_bild(s, t, lt)
        im = Image.new('RGB', (W, H))
        if s['art'] == 'fratze':
            alt_fratze(im, lt)
            return im
        ZEIT[0] = t
        x, y, gr = RAEUME[s.get('pov_raum', 'zimmer')](im, t)
        n = s.get('pov_naeher', 0)
        if s['art'] == 'ende':
            n = 1.0
        if n > 0.05:  # das Wesen: erst kaum zu sehen, dann immer größer und deutlicher
            lage = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            groesse = gr * (1 + 1.4 * n ** 2) * (1 + 0.15 * min(lt / 3, 1))
            schatten(lage, x, y + 60 * n ** 2, s=groesse, alpha=int(70 + 185 * n), augen=n > 0.25)
            im.paste(lage, (0, 0), lage)
        dunkel = 0.35 + 0.25 * n
        im = Image.blend(im, Image.new('RGB', (W, H), (2, 3, 8)), dunkel)
        k = s.get('pov_chat', 1)
        tippt = s['art'] != 'blitz' and k < 4 and lt % 1.4 < 0.7
        if s['art'] == 'blitz':
            handy(im, t, absender, [], False, sperr=(absender, s.get('nachricht') or chat[0][0]))
        elif s['art'] == 'ende':
            handy(im, t, absender, chat, False, unten=min(1.0, lt / 0.6))  # Handy fällt runter
        else:
            handy(im, t, absender, chat[:k], tippt)
        caption(im, s.get('pov_text', ''), s.get('gelb', ''))
        return im

    g['bild'] = bild
    g['nah'] = lambda im, s, lt: im
