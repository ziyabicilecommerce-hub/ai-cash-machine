# KI-Bilder für die Schatten-Story: kostenlos über Pollinations/FLUX, mit Kamerafahrt; abschaltbar per "ki_bilder": false.
import os, random, subprocess, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageOps
import tiefe

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
    ki_clip_laden(story, ordner)
    tiefe.tiefe_laden(story)


CLIP_FPS = 15  # Einzelbilder des KI-Clips pro Sekunde (spart Speicher; der Renderer zeigt sie bei 60 fps je 4x)


BEWEGUNG = {  # was sich im Clip bewegen soll, je Szene
    'ende': 'the dark silhouette slowly steps toward the camera and tilts its head, flickering light, cinematic horror',
}


def ki_clip_laden(story, ordner):
    # ECHTE bewegte KI-Clips: kostenlose Hugging-Face-GPUs (Wan 2.2 / LTX, Bild-zu-Video, scripts/ki_clip.py).
    # 1. der Einstieg (erste KI-Szene) - dort wischen die Leute sonst nach 2 s weg
    # 2. die Auflösung am Ende (Szene "ende") - nur mit HORROR_KI_CLIP_ENDE=an und wenn der erste Clip geklappt hat
    # Kontingent leer, Space besetzt oder kein gradio_client -> Standbild mit 3D-Kamerafahrt (tiefe.py).
    if os.environ.get('STUMM') == '1' or os.environ.get('HORROR_KI_CLIP', 'an').lower() in ('aus', '0', 'nein', 'false'):
        return
    mit_bild = [x for x in story['szenen'] if x.get('_kibild') is not None]
    skript = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts', 'ki_clip.py')
    if not mit_bild or not os.path.exists(skript):
        return
    # Der zweite Clip ist vorerst AUS (12.11.): im ersten echten Lauf war das Gratis-Kontingent beim dritten Video leer -
    # der Einstieg ist wichtiger als das Ende. Einschalten: HORROR_KI_CLIP_ENDE=an.
    ende_an = os.environ.get('HORROR_KI_CLIP_ENDE', 'aus').lower() in ('an', '1', 'ja', 'true')
    ziele = mit_bild[:1] + ([x for x in mit_bild[1:] if x.get('art') == 'ende'][-1:] if ende_an else [])
    for nr, s in enumerate(ziele):
        if not ein_clip(s, ordner, nr, skript, vorrat=nr == 0):
            break


def ein_clip(s, ordner, nr, skript, vorrat=False):
    bild = os.path.join(ordner, f'ki-clip-start-{nr}.jpg')
    s['_kibild'].save(bild, quality=95)
    ziel = os.path.join(ordner, f'ki-clip-{nr}.mp4')
    prompt = f"{s['ki']}, {BEWEGUNG.get(s.get('art'), 'slow creeping camera push-in, subtle horror movement, flickering light, cinematic')}"
    for modell in ('wan', 'ltx'):
        try:
            r = subprocess.run([sys.executable, skript, bild, prompt, ziel, modell], capture_output=True, text=True, timeout=300)
        except Exception as e:
            print(f'KI-Clip {modell}: {e}')
            continue
        if r.returncode == 0 and os.path.exists(ziel):
            break
        print(f'KI-Clip {modell}: {"Kontingent für heute leer" if r.returncode == 3 else (r.stderr or r.stdout).strip()[-160:]}')
    if not os.path.exists(ziel) and not (vorrat and vorrat_clip(s['ki'], ziel)):
        return False
    roh = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', ziel, '-vf',
                          f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={CLIP_FPS}',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    groesse = W * H * 3
    s['_kiclip'] = [Image.frombytes('RGB', (W, H), roh[i:i + groesse]) for i in range(0, len(roh) - groesse + 1, groesse)][:CLIP_FPS * 6]
    if not s['_kiclip']:
        del s['_kiclip']
        return False
    print(f'KI-Clip ok: {len(s["_kiclip"])} Bilder ({len(s["_kiclip"]) / CLIP_FPS:.1f} s) für Szene „{s["art"]}“')
    return True


VORRAT_ORTE = (('train', 'zug'), ('forest', 'wald'), ('elevator', 'aufzug'), ('airplane', 'flugzeug'))


def vorrat_ort(prompt):
    # Schauplatz aus dem Bild-Prompt lesen (videobot.mjs KI_ORT); alles andere spielt im Haus
    return next((ort for wort, ort in VORRAT_ORTE if wort in prompt.lower()), 'haus')


def vorrat_clip(prompt, ziel, laden=urllib.request.urlopen, zufall=random):
    # Eigener Clip-Vorrat (Release "clip-vorrat", vom GitHub-Rechner ohne Grafikkarte vorgerechnet, kein Tageslimit):
    # springt ein, wenn Hugging Face heute nichts mehr hergibt - aber nur mit HORROR_KI_VORRAT=an. Standard ist AUS (11.11.):
    # die Vorrats-Clips sind unscharf, fast ohne Bewegung und ohne Gestalt - das scharfe KI-Bild mit 3D-Kamerafahrt (tiefe.py) ist besser. Plätze <ort>-0..23.mp4, zufällig einen vorhandenen nehmen.
    repo = os.environ.get('GITHUB_REPOSITORY')
    if not repo or os.environ.get('HORROR_KI_VORRAT', 'aus').lower() not in ('an', '1', 'ja', 'true'):
        return False
    ort = vorrat_ort(prompt)
    for nr in zufall.sample(range(24), 24):
        try:
            with laden(f'https://github.com/{repo}/releases/download/clip-vorrat/{ort}-{nr}.mp4', timeout=60) as r:
                daten = r.read()
            if len(daten) > 20000:
                open(ziel, 'wb').write(daten)
                print(f'KI-Clip aus dem eigenen Vorrat: {ort}-{nr}.mp4')
                return True
        except Exception:
            continue  # Platz noch leer
    print(f'KI-Clip: Vorrat für „{ort}“ noch leer')
    return False


def ki_szene(s, lt):
    # echtes Bild mit langsamer Kamerafahrt; je nach Szene dunkler oder rot flackernd
    clip = s.get('_kiclip')
    # echter KI-Clip: Bild für Bild abspielen, danach das letzte Bild stehen lassen (die Kamerafahrt läuft weiter)
    bild_ = clip[min(int(lt * CLIP_FPS), len(clip) - 1)] if clip else s['_kibild']
    p = min(lt / max(s.get('dauer', 3), 0.5), 1)
    if clip and s.get('_gestalt') and s.get('_tiefe') is not None:
        bild_ = tiefe.auf_clip(s, bild_, p)  # Einstieg: die Gestalt steht schon im echten KI-Clip und kommt näher
    zoom = 1.02 + 0.12 * p
    cw, ch = int(W / zoom), int(H / zoom)
    richtung = (hash(s.get('ki', '')) % 3) - 1
    x0 = int((W - cw) / 2 + richtung * (W - cw) / 2 * (p - 0.5))
    if not clip and s.get('_tiefe') is not None:
        im = tiefe.fahrt(s, p, lt, richtung)  # 3D-Kamerafahrt: Nahes bewegt sich schneller als Fernes
    else:
        im = bild_.crop((x0, (H - ch) // 2, x0 + cw, (H - ch) // 2 + ch)).resize((W, H), Image.BILINEAR)
    # Einstieg (10.11.): das erste Bild war schwarz und die Szene blitzte alle 0,4 s dunkel - genau in den 2 Sekunden,
    # in denen die Leute wegwischen. Jetzt: die ersten 1,5 s immer Bild; mit echtem KI-Clip gar kein Schwarz-Blitzen.
    if s['art'] == 'blitz' and not clip and lt >= 1.5 and int(lt * 10) % 4 == 0:
        return Image.new('RGB', (W, H), NACHT)
    if s['art'] in ('dunkel', 'blitz'):
        im = Image.blend(im, Image.new('RGB', (W, H), (40, 0, 0) if s['art'] == 'blitz' else NACHT), 0.15 if clip else 0.35)
    return im
