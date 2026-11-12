# 3D-Kamerafahrt in die KI-Bilder: ein kleines Tiefen-Modell (Depth Anything V2 Small, läuft auf dem Prozessor in
# Sekunden) schätzt für jedes Bild, was vorne und was hinten ist. Beim Rendern wandert Nahes schneller als Fernes -
# die Kamera fährt räumlich INS Bild statt nur zu zoomen. Kostenlos, ohne Grafikkarte, ohne Tageslimit, volle Schärfe.
# Dazu die Gestalt: in leeren Szenen taucht hinten im Flur eine schwarze Figur auf und steht bei jedem Lichtflackern näher -
# von Wänden und Türrahmen richtig verdeckt (die Tiefenkarte weiß, was davor liegt).
# Und Dunst (nebel): zieht in zwei Schichten durch den Raum, hinten dicht, vorne dünn; das Licht flackert leicht.
# Zusammen ist das ein eigener kleiner Videogenerator ohne Limit: Kamera, Figur, Dunst und Licht bewegen sich.
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
            s['_fern'] = fernpunkt(s['_tiefe'])
            n += 1
        except Exception as e:
            print(f'3D-Kamera: Bild übersprungen ({e})')
    # Gestalt: nur wo das Bild laut Prompt leer ist ("nobody there"), höchstens 2 Szenen; story "gestalt": false schaltet ab (A/B)
    if story.get('gestalt', True):
        for s in [x for x in szenen if x.get('_tiefe') is not None and 'nobody there' in str(x.get('ki', ''))][:2]:
            s['_gestalt'] = True
        if szenen and szenen[0].get('_gestalt'):
            szenen[0]['_einstieg'] = True                # im Einstieg steht sie schon nach ~0,4 s da (auch ohne KI-Clip)
    print(f"3D-Kamera: Tiefe für {n} Bilder, Gestalt in {sum(1 for x in szenen if x.get('_gestalt'))} Szenen")
    return n


def fernpunkt(t):
    """Fernster Punkt im mittleren Bildbereich (dort endet der Flur) -> (x, y) in Pixeln."""
    import numpy as np
    h, w = t.shape
    y0, y1, x0, x1 = int(h * 0.25), int(h * 0.7), int(w * 0.2), int(w * 0.8)
    aus = t[y0:y1, x0:x1]
    grenze = float(aus.min()) + 0.04
    ys, xs = np.nonzero(aus <= grenze)
    return int(xs.mean()) + x0, int(ys.mean()) + y0


STUFEN = ((0.28, 0.0), (0.50, 0.36), (0.72, 0.80))  # (ab Fortschritt p, wie nah 0..1): bei jedem Flackern ein Stück näher
FLACKERN = 0.035                                    # so lange (in p) wird das Licht beim Sprung dunkel


STUFEN_EINSTIEG = ((0.10, 0.0), (0.40, 0.36), (0.68, 0.80))  # erste Szene: die Gestalt steht schon nach ~0,4 s da


def gestalt_stufe(p, stufen=STUFEN):
    """-> (naehe oder None, licht 0..1). Vor der ersten Stufe ist der Flur leer."""
    naehe, licht = None, 1.0
    for ab, n in stufen:
        if p >= ab:
            naehe = n
        if ab - FLACKERN <= p < ab + FLACKERN * 0.5:
            licht = 0.3
    return naehe, licht


def gestalt_malen(bild, t, fern, naehe):
    """Schwarze, zu lange Gestalt auf dem Flurboden; was im Bild näher ist als sie (Wände, Türrahmen), verdeckt sie."""
    import cv2, numpy as np
    from PIL import Image, ImageDraw, ImageFilter
    h, w = t.shape
    fx, fy = fern
    hoehe = h * (0.095 + 0.47 * naehe ** 1.3)            # weit weg klein, nah groß
    fuss_y = fy + hoehe * 0.42 + (h * 0.90 - fy) * naehe * 0.75
    mx = fx + (w / 2 - fx) * naehe * 0.6
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    oben = fuss_y - hoehe
    k = hoehe * 0.058                                    # Kopf: klein und schmal, leicht schief
    kx_ = mx + k * 0.35
    d.ellipse((kx_ - k * 0.82, oben, kx_ + k * 0.82, oben + 2.25 * k), fill=255)
    sch = hoehe * 0.105                                  # halbe Schulterbreite (schmal = unnatürlich lang)
    sy = oben + 2.55 * k                                 # Schulterhöhe
    d.polygon(((mx - k * 0.45, oben + 1.9 * k), (mx + k * 0.6, oben + 1.9 * k), (mx + sch, sy + k * 0.7), (mx - sch, sy + k * 0.5)), fill=255)  # Hals + hängende Schultern
    huefte = fuss_y - hoehe * 0.47
    d.polygon(((mx - sch, sy + k * 0.5), (mx + sch, sy + k * 0.7), (mx + sch * 0.70, huefte), (mx + sch * 0.62, fuss_y),
               (mx + sch * 0.10, fuss_y), (mx, huefte + hoehe * 0.10), (mx - sch * 0.10, fuss_y), (mx - sch * 0.62, fuss_y),
               (mx - sch * 0.70, huefte)), fill=255)     # Rumpf und Beine aus einem Stück, unten nur ein schmaler Spalt
    arm = max(int(hoehe * 0.036), 2)
    for s_, lang in ((-1, 0.60), (1, 0.64)):             # Arme hängen bis unters Knie, einer etwas länger
        d.line(((mx + s_ * sch * 0.95, sy + k), (mx + s_ * sch * 1.22, oben + hoehe * 0.42), (mx + s_ * sch * 1.12, oben + hoehe * lang)), fill=255, width=arm, joint='curve')
    d.ellipse((mx - sch * 1.5, fuss_y - hoehe * 0.02, mx + sch * 1.5, fuss_y + hoehe * 0.035), fill=150)  # Schatten am Boden
    hof = np.asarray(m.filter(ImageFilter.GaussianBlur(max(hoehe * 0.07, 4))), dtype=np.float32) / 255  # schwacher kalter Lichthof
    m = np.asarray(m.filter(ImageFilter.GaussianBlur(max(hoehe * 0.016, 1.5))), dtype=np.float32) / 255
    zt = float(t[min(int(fy), h - 1), min(int(fx), w - 1)])
    z = zt + (0.62 - zt) * naehe + 0.05                  # Tiefe der Gestalt
    m = m * np.clip((z - t) / 0.06 + 1, 0, 1)            # nähere Bildteile verdecken sie (weicher Übergang)
    m = np.clip(m * (0.84 + 0.16 * naehe) * 1.15, 0, 0.97)[..., None]           # fern etwas durchscheinend (Dunst), nah satt schwarz
    # Lichthof zuerst: in sehr dunklen Bildern verschwamm die Gestalt mit dem Boden - ein Hauch Gegenlicht hebt den Umriss ab
    hof = (hof * np.clip((z - t) / 0.06 + 1, 0, 1) * 0.30)[..., None]
    bild = bild * (1 - hof) + np.array((96, 108, 128), dtype=np.float32) * hof
    return (bild * (1 - m) + np.array((3, 3, 6), dtype=np.float32) * m).astype(np.uint8)


_NEBEL = {}


def nebel(bild, t, lt):
    """Dunst, der durch den Raum zieht: hinten dicht, vorne fast nichts (die Tiefenkarte bestimmt, wo). Zwei Wolkenschichten
    ziehen verschieden schnell - das Standbild lebt, ohne dass ein Videomodell rechnen muss. Dazu flackert das Licht leicht."""
    import cv2, numpy as np
    h, w = t.shape
    if 'wolken' not in _NEBEL:                           # einmal: weiche Wolken, doppelt so breit wie das Bild (zum Verschieben)
        zufall = np.random.default_rng(7)
        klein = zufall.random((h // 40 + 2, w // 20 + 2)).astype(np.float32)
        wolken = cv2.GaussianBlur(cv2.resize(klein, (w * 2, h), interpolation=cv2.INTER_CUBIC), (0, 0), 25)
        _NEBEL['wolken'] = (wolken - wolken.min()) / max(float(wolken.max() - wolken.min()), 1e-6)
    wolken = _NEBEL['wolken']
    x1, x2 = int(lt * 34) % w, int(w - (lt * 19) % w) % w
    schicht = (wolken[:, x1:x1 + w] + wolken[::-1, x2:x2 + w]) * 0.5
    dichte = np.clip(1.0 - t, 0, 1) ** 1.6 * 0.42 * schicht          # fern = dicht
    flackern = 1.0 - 0.10 * max(0.0, math.sin(lt * 23.0) * math.sin(lt * 7.3)) - 0.05 * max(0.0, math.sin(lt * 51.0))
    aus = bild.astype(np.float32) * ((1.0 - dichte) * flackern)[..., None] + (np.array((74, 84, 96), dtype=np.float32) * flackern) * dichte[..., None]
    return np.clip(aus, 0, 255).astype(np.uint8)


def fahrt(s, p, lt, richtung=0):
    """Ein Bild der 3D-Fahrt. p = Fortschritt 0..1, lt = Sekunden in der Szene, richtung = -1/0/1 (seitliches Gleiten)."""
    import cv2, numpy as np
    from PIL import Image
    bild, t = s['_kinp'], s['_tiefe']
    licht = 1.0
    if s.get('_gestalt'):                                # Gestalt kommt bei jedem Flackern näher (nur in leeren Szenen)
        naehe, licht = gestalt_stufe(p, STUFEN_EINSTIEG if s.get('_einstieg') else STUFEN)
        if naehe is not None:
            if s.get('_gbild', (None,))[0] != naehe:     # pro Stufe einmal malen
                s['_gbild'] = (naehe, gestalt_malen(bild, t, s['_fern'], naehe))
            bild = s['_gbild'][1]
    if s.get('_nebel', True):
        bild = nebel(bild, t, lt)                         # ziehender Dunst + Lichtflackern (jedes Bild neu)
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
    aus = cv2.remap(bild, kx, ky, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    if licht < 1:
        aus = (aus * licht).astype(np.uint8)
    return Image.fromarray(aus)


def auf_clip(s, bild, p):
    """Gestalt auf ein Bild des echten KI-Clips setzen (Einstieg). Tiefe und Fluchtpunkt kommen vom Standbild, aus dem
    der Clip entstand - die Clip-Kamera bewegt sich nur wenig, und die Gestalt springt ohnehin von Stufe zu Stufe."""
    import numpy as np
    from PIL import Image
    naehe, licht = gestalt_stufe(p, STUFEN_EINSTIEG)
    if naehe is None and licht >= 1:
        return bild
    merk = s.get('_gclip')
    if merk and merk[0] == (id(bild), naehe, licht):     # der Renderer fragt jedes Clip-Bild mehrmals ab
        return merk[1]
    aus = np.asarray(bild)
    if naehe is not None:
        aus = gestalt_malen(aus, s['_tiefe'], s['_fern'], naehe)
    if licht < 1:
        aus = (aus * licht).astype(np.uint8)
    s['_gclip'] = ((id(bild), naehe, licht), Image.fromarray(aus))
    return s['_gclip'][1]


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
