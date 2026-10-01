#!/usr/bin/env python3
"""3D-Kamerafahrt aus einem Standbild (kostenlos, CPU, ohne Key).

Depth Anything V2 Small (24,8 Mio. Parameter, Apache-2.0) schaetzt die Tiefe im Bild; danach
faehrt eine virtuelle Kamera durch die Szene: Nahes bewegt sich staerker als Fernes (Parallaxe),
das Bild wirkt wie ein echter 3D-Raum. Ohne Modell (kein torch/transformers, kein Netz) gibt es
eine einfache Tiefenschaetzung (unten = nah) - das Video entsteht trotzdem.

  python3 scripts/tiefe3d.py BILD ZIEL.mp4 DAUER BREITE HOEHE [ART]
  ART: dolly (heranfahren) | orbit (seitlich vorbei) | kran (von unten nach oben)
"""
import math
import subprocess
import sys

import cv2
import numpy as np

MODELL = 'depth-anything/Depth-Anything-V2-Small-hf'


def tiefe_schaetzen(bild_bgr):
    """Tiefe 0..1 (1 = nah). Erst Depth Anything V2, sonst Rueckfall auf eine einfache Schaetzung."""
    h, w = bild_bgr.shape[:2]
    try:
        from PIL import Image
        from transformers import pipeline
        pipe = pipeline('depth-estimation', model=MODELL, device=-1)
        roh = np.array(pipe(Image.fromarray(cv2.cvtColor(bild_bgr, cv2.COLOR_BGR2RGB)))['depth'], dtype=np.float32)
        tiefe = cv2.resize(roh, (w, h), interpolation=cv2.INTER_CUBIC)
        quelle = 'Depth Anything V2'
    except Exception as err:  # kein Modell verfuegbar - einfache Schaetzung
        print(f'[tiefe3d] Modell nicht verfuegbar ({str(err)[:80]}) - einfache Tiefe', file=sys.stderr)
        ys = np.linspace(0, 1, h, dtype=np.float32)[:, None]
        grau = cv2.cvtColor(bild_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        tiefe = np.repeat(ys, w, axis=1) * 0.8 + cv2.GaussianBlur(grau, (0, 0), 25) * 0.2
        quelle = 'einfach'
    tiefe -= tiefe.min()
    tiefe /= max(float(tiefe.max()), 1e-6)
    # Weiche Kanten in der Tiefe verhindern Risse an Objektkanten.
    return cv2.GaussianBlur(tiefe, (0, 0), max(w, h) / 300), quelle


def main():
    if len(sys.argv) < 6:
        print(__doc__)
        sys.exit(2)
    bild, ziel, dauer, breite, hoehe = sys.argv[1], sys.argv[2], float(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    art = sys.argv[6] if len(sys.argv) > 6 else 'dolly'
    roh = cv2.imread(bild, cv2.IMREAD_COLOR)
    if roh is None:
        sys.exit(f'Bild nicht lesbar: {bild}')
    # 8 % Rand, damit die Kamera nie ueber den Bildrand hinausschaut.
    W, H = int(breite * 1.08), int(hoehe * 1.08)
    f = max(W / roh.shape[1], H / roh.shape[0])
    gross = cv2.resize(roh, (math.ceil(roh.shape[1] * f), math.ceil(roh.shape[0] * f)), interpolation=cv2.INTER_LANCZOS4)
    y0, x0 = (gross.shape[0] - H) // 2, (gross.shape[1] - W) // 2
    quelle_bild = np.ascontiguousarray(gross[y0:y0 + H, x0:x0 + W])
    tiefe, quelle = tiefe_schaetzen(quelle_bild)

    fps = 30
    n = max(2, round(dauer * fps))
    xs, ys = np.meshgrid(np.arange(breite, dtype=np.float32), np.arange(hoehe, dtype=np.float32))
    cx, cy = W / 2, H / 2
    # Tiefe im Ausgabe-Raster (fuer die Rueckwaerts-Abbildung, Naeherung bei kleinen Verschiebungen).
    t_aus = cv2.resize(tiefe, (breite, hoehe))
    nah = t_aus - 0.5
    enc = subprocess.Popen([
        'ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{breite}x{hoehe}', '-r', str(fps), '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', ziel,
    ], stdin=subprocess.PIPE)
    for i in range(n):
        p = i / (n - 1)
        e = 0.5 - 0.5 * math.cos(math.pi * p)  # weich an- und auslaufen
        zoom, dx, dy = 1.0, 0.0, 0.0
        if art == 'orbit':
            dx = (e - 0.5) * breite * 0.07
            zoom = 1.02
        elif art == 'kran':
            dy = (0.5 - e) * hoehe * 0.05
            zoom = 1.02 + 0.03 * e
        else:  # dolly: heranfahren - Nahes waechst schneller als Fernes
            zoom = 1.0 + 0.07 * e
        # Parallaxe: nahe Pixel werden staerker verschoben/vergroessert als ferne.
        z = zoom * (1 + 0.05 * e * nah if art == 'dolly' else 1)
        map_x = cx + (xs - breite / 2) / z - dx * (0.4 + nah)
        map_y = cy + (ys - hoehe / 2) / z - dy * (0.4 + nah)
        frame = cv2.remap(quelle_bild, map_x.astype(np.float32), map_y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        enc.stdin.write(frame.tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        sys.exit('ffmpeg fehlgeschlagen')
    print(f'[tiefe3d] {ziel}: {n} Bilder, {art}, Tiefe: {quelle}')


if __name__ == '__main__':
    main()
