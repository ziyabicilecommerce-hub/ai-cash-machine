# 3D-Kamerafahrt in die KI-Bilder: ein kleines Tiefen-Modell (Depth Anything V2 Small, läuft auf dem Prozessor in
# Sekunden) schätzt für jedes Bild, was vorne und was hinten ist. Beim Rendern wandert Nahes schneller als Fernes -
# die Kamera fährt räumlich INS Bild statt nur zu zoomen. Kostenlos, ohne Grafikkarte, ohne Tageslimit, volle Schärfe.
# Fehlt etwas (kein torch/opencv, Modell nicht ladbar) oder HORROR_TIEFE=aus -> flache Kamerafahrt wie bisher.
import math, os

MODELL = 'depth-anything/Depth-Anything-V2-Small-hf'


def tiefe_laden(story):
    szenen = [s for s in story['szenen'] if s.get('_kibild') is not None]
    if not szenen or os.environ.get('STUMM') == '1' or os.environ.get('HORROR_TIEFE', 'an').lower() in ('aus', '0', 'nein', 'false'):
        return 0
    try:
        import cv2, numpy as np
        from transformers import pipeline
        schaetzer = pipeline('depth-estimation', model=MODELL, device=-1)
    except Exception as e:
        print(f'3D-Kamera aus ({type(e).__name__}: {str(e)[:80]}) - flache Kamerafahrt')
        return 0
    n = 0
    for s in szenen:
        try:
            bild = s['_kibild']
            t = np.asarray(schaetzer(bild)['depth'].resize(bild.size), dtype=np.float32)
            t = (t - t.min()) / max(float(t.max() - t.min()), 1e-6)  # 0 = fern, 1 = nah
            s['_tiefe'] = cv2.GaussianBlur(t, (0, 0), 6)             # weiche Kanten -> kein Zerreißen an Umrissen
            s['_kinp'] = np.asarray(bild)
            n += 1
        except Exception as e:
            print(f'3D-Kamera: Bild übersprungen ({e})')
    print(f'3D-Kamera: Tiefe für {n} Bilder')
    return n


def fahrt(s, p, lt, richtung=0):
    """Ein Bild der 3D-Fahrt. p = Fortschritt 0..1, lt = Sekunden in der Szene, richtung = -1/0/1 (seitliches Gleiten)."""
    import cv2, numpy as np
    from PIL import Image
    bild, t = s['_kinp'], s['_tiefe']
    h, w = t.shape
    if '_netz' not in s:
        s['_netz'] = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    xs, ys = s['_netz']
    sanft = p * p * (3 - 2 * p)
    skala = 1.03 + sanft * (0.05 + 0.26 * t)        # Nahes wächst viel schneller als Fernes = echte Fahrt nach vorn
    # seitliches Gleiten + leichtes Handkamera-Wackeln, beides tiefenabhängig (Parallaxe)
    dx = (richtung * 26 * (sanft - 0.5) + 5 * math.sin(lt * 2.1)) * (t - 0.35)
    dy = 4 * math.sin(lt * 1.7 + 1) * (t - 0.35)
    kx = (xs - w / 2) / skala + w / 2 + dx
    ky = (ys - h / 2) / skala + h / 2 + dy
    return Image.fromarray(cv2.remap(bild, kx, ky, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))


if __name__ == '__main__':  # Probe: python3 tiefe.py bild.jpg probe.mp4 -> 4 s Fahrt (zum Ansehen)
    import subprocess, sys
    from PIL import Image, ImageOps
    s = {'_kibild': ImageOps.fit(Image.open(sys.argv[1]).convert('RGB'), (720, 1280))}
    assert tiefe_laden({'szenen': [s]}) == 1, 'Tiefe nicht berechnet'
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '720x1280', '-r', '30', '-i', '-',
                           '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', sys.argv[2]], stdin=subprocess.PIPE)
    for i in range(120):
        ff.stdin.write(fahrt(s, i / 119, i / 30, 1).tobytes())
    ff.stdin.close(); ff.wait()
    Image.fromarray((s['_tiefe'] * 255).astype('uint8')).save(sys.argv[2] + '.tiefe.jpg')
