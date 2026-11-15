# KI-Bilder für die Schatten-Story: kostenlos über Pollinations/FLUX, mit Kamerafahrt; abschaltbar per "ki_bilder": false.
import os, time, urllib.parse, urllib.request
from PIL import Image, ImageOps

W, H = 720, 1280
NACHT = (2, 3, 8)


def ki_bilder_laden(story, ordner):
    # Kostenlose KI-Bilder (Pollinations/FLUX, ohne Key) für Szenen mit "ki"-Prompt. Klappt eins nicht,
    # bleibt die gezeichnete Szene - das Video wird in jedem Fall fertig.
    if not story.get('ki_bilder', True):  # aus = gezeichnete Figuren
        return
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
