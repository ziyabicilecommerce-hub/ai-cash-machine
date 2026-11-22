"""Serie "100 Tage KI-Firma" (#119): rendert die Folge als Hochformat-Video mit Beat und (wenn möglich) Stimme.

  python3 automations/serie/render.py out/serie-folge.json out/serie

Erwartet in <ordner> die Bildschirmfotos seite-<n>.png (automations/serie/screenshots.js).
Stimme: edge-tts (de-DE-ConradNeural). Klappt sie nicht, läuft das Video nur mit Beat.
Beat: selbst erzeugt mit ffmpeg (Kick, Hi-Hat, Bass) - keine fremde Musik, keine Rechte-Probleme.
Ergebnis: <ordner>/video.mp4 und <ordner>/cover.jpg
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
GOLD, RED, WHITE, BG = (255, 196, 61), (255, 70, 70), (255, 255, 255), (8, 9, 14)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def ff(*args):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], check=True)


def dauer(datei):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', datei],
                         capture_output=True, text=True).stdout.strip()
    return float(out or 0)


def schrift(groesse, mono=False):
    return ImageFont.truetype(MONO if mono else BOLD, groesse)


def zentriert(d, y, txt, groesse, farbe, rand=8):
    f = schrift(groesse)
    while d.textlength(txt, font=f) > W - 80 and groesse > 40:  # zu breit -> kleiner
        groesse -= 6
        f = schrift(groesse)
    d.text(((W - d.textlength(txt, font=f)) / 2, y), txt, font=f, fill=farbe, stroke_width=rand, stroke_fill=(0, 0, 0))
    return groesse


def karte(zeilen, ziel):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    y = (H - sum(g for _, g, _ in zeilen) - 40 * (len(zeilen) - 1)) / 2
    for txt, g, farbe in zeilen:
        zentriert(d, y, txt, g, farbe, rand=0)
        y += g + 40
    im.save(ziel)


def band(im, titel, unter):
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle([0, 1180, W, 1620], fill=(0, 0, 0, 180))
    zentriert(d, 1250, titel, 74, WHITE)
    if unter:
        zentriert(d, 1370, unter, 58, GOLD, rand=6)
    return im


def liste_bild(zeilen, ziel):
    """Lange Liste (z. B. alle Bots) als hohes Bild, das im Video durchscrollt."""
    hoehe = max(H + 200, 120 + len(zeilen) * 46 + 200)
    im = Image.new('RGB', (W, hoehe), (12, 14, 20))
    d = ImageDraw.Draw(im)
    f = schrift(34, mono=True)
    d.text((40, 40), '$ ls automations/', font=f, fill=(120, 220, 140))
    for i, z in enumerate(zeilen):
        d.text((40, 110 + i * 46), z, font=f, fill=(210, 214, 222))
    im.save(ziel)
    return hoehe


def standbild_clip(bild, sek, ziel, zoom=True):
    n = int(sek * FPS)
    vf = (f"scale=1188:2112,zoompan=z='min(zoom+0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}"
          if zoom else f"scale={W}:{H},fps={FPS}")
    ff('-loop', '1', '-i', bild, '-t', f'{sek:.2f}', '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(FPS), ziel)


def scroll_clip(bild, hoehe, sek, titel, unter, ziel):
    tmp = ziel + '.band.png'
    leer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    band(leer, titel, unter).save(tmp)
    ff('-loop', '1', '-i', bild, '-loop', '1', '-i', tmp, '-t', f'{sek:.2f}', '-filter_complex',
       f"[0]crop={W}:{H}:0:'min(t/{sek}*({hoehe}-{H}),{hoehe}-{H})'[a];[a][1]overlay=0:0,fps={FPS}",
       '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ziel)


def beat(sek, ziel):
    """120 BPM: Kick auf jedem Schlag, Hi-Hat dazwischen, Bass-Linie in A-Moll, Einschlag am Anfang."""
    b = 'mod(t,0.5)'
    kick = f"sin(2*PI*45*{b}+16*(1-exp(-{b}*28)))*exp(-{b}*7)*0.9"
    hat = "(random(0)*2-1)*exp(-mod(t+0.25,0.5)*70)*0.16"
    f = "if(lt(mod(t,8),4),55,if(lt(mod(t,8),6),43.65,49))"
    bass = f"0.28*sin(2*PI*{f}*t)*(1-exp(-mod(t,0.25)*40))*exp(-mod(t,0.25)*4)"
    boom = "0.8*sin(2*PI*38*t)*exp(-t*2.5)*lt(t,1.5)"
    ausblenden = f"min(1,({sek}-t)/1.2)"
    ausdruck = f"({kick}+{hat}+{bass}+{boom})*0.7*{ausblenden}"
    ff('-f', 'lavfi', '-i', f"aevalsrc=exprs='{ausdruck}':s=44100:d={sek:.2f}", '-af', 'alimiter=limit=0.9', '-ac', '2', ziel)


def stimme(text, ziel):
    try:
        subprocess.run([sys.executable, '-m', 'edge_tts', '--voice', 'de-DE-ConradNeural', '--rate', '+8%',
                        '--text', text, '--write-media', ziel], check=True, timeout=120, capture_output=True)
        return os.path.getsize(ziel) > 1000
    except Exception as e:  # kein Netz zum Sprachdienst -> nur Beat
        print('Stimme nicht verfügbar:', str(e)[:120])
        return False


def bots():
    return sorted(f for f in os.listdir(os.path.join(REPO, 'automations')) if f.endswith('.mjs'))


def main(folge_datei, ordner):
    folge = json.load(open(folge_datei, encoding='utf8'))
    os.makedirs(ordner, exist_ok=True)
    p = lambda n: os.path.join(ordner, n)

    mit_stimme = stimme(folge['stimme'], p('stimme.mp3'))
    # Szenen-Länge: ohne Stimme 2,6 s; mit Stimme so verteilt, dass die Stimme ganz reinpasst
    szenen = folge['szenen']
    hook_sek, ende_sek = 2.6, 3.0
    s_sek = 2.6
    if mit_stimme:
        s_sek = max(2.4, (dauer(p('stimme.mp3')) + 0.6 - hook_sek - 1.0) / len(szenen))

    clips = []
    karte([(folge['hook'][0], 120, WHITE), (folge['hook'][1], 110, RED)], p('hook.png'))
    standbild_clip(p('hook.png'), hook_sek, p('c0.mp4'), zoom=False)
    clips.append(p('c0.mp4'))
    for i, s in enumerate(szenen):
        ziel = p(f'c{i + 1}.mp4')
        if s.get('liste'):
            zeilen = bots() if s['liste'] == 'bots' else s['liste']
            if len(zeilen) > 30:
                hoehe = liste_bild(zeilen, p(f'liste-{i}.png'))
                scroll_clip(p(f'liste-{i}.png'), hoehe, s_sek + 0.6, s['titel'], s.get('unter'), ziel)
            else:  # kurze Liste: groß als Karte
                karte([(z, 64, WHITE) for z in zeilen] + [(s['titel'], 80, GOLD)], p(f'k{i}.png'))
                standbild_clip(p(f'k{i}.png'), s_sek + 0.6, ziel, zoom=False)
        else:
            src = p(f'seite-{i}.png')
            im = Image.open(src).convert('RGB').resize((W, H)) if os.path.exists(src) else Image.new('RGB', (W, H), BG)
            band(im, s['titel'], s.get('unter')).save(p(f'b{i}.png'))
            standbild_clip(p(f'b{i}.png'), s_sek, ziel)
        clips.append(ziel)
    e = folge['ende']
    karte([(e[0], 170, GOLD), (e[1], 110, WHITE), (e[2], 66, WHITE)], p('ende.png'))
    standbild_clip(p('ende.png'), ende_sek, p('cE.mp4'), zoom=False)
    clips.append(p('cE.mp4'))

    with open(p('liste.txt'), 'w') as fh:
        fh.writelines(f"file '{os.path.abspath(c)}'\n" for c in clips)
    ff('-f', 'concat', '-safe', '0', '-i', p('liste.txt'), '-c', 'copy', p('bild.mp4'))
    gesamt = dauer(p('bild.mp4'))
    beat(gesamt, p('beat.wav'))

    if mit_stimme:  # Beat leiser unter der Stimme, Stimme startet nach dem Hook-Einschlag
        ton = ['-i', p('beat.wav'), '-i', p('stimme.mp3'), '-filter_complex',
               '[1]volume=0.32[m];[2]adelay=900|900,volume=1.6[v];[m][v]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]']
    else:
        ton = ['-i', p('beat.wav'), '-filter_complex', '[1]volume=0.9[a]']
    ff('-i', p('bild.mp4'), *ton, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
       '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', p('video.mp4'))
    ff('-ss', '1', '-i', p('video.mp4'), '-frames:v', '1', p('cover.jpg'))
    print(f"fertig: {p('video.mp4')} ({gesamt:.1f} s, {'mit Stimme' if mit_stimme else 'nur Beat'})")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
