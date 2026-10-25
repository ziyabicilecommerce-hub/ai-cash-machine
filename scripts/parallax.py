# 3D-Kamerafahrt (Parallax) aus einem Standbild - kostenlos auf der GitHub-CPU, ohne Schlüssel, ohne Tageslimit.
# Eine kleine Tiefen-KI (Depth Anything V2 Small) schätzt, was vorne und was hinten ist; dann fährt die Kamera so
# durchs Bild, dass sich Vordergrund stärker bewegt als Hintergrund - wirkt wie echte 3D-Bewegung statt flachem Zoom.
#   python3 scripts/parallax.py <bild> <ziel.mp4> <sekunden> <rein|rein-schnell|raus|schwenk|hoch> [breite hoehe fps]
# PARALLAX_TIEFE=verlauf: Test ohne Tiefen-KI (oben fern, unten nah). Exit 0 = Video fertig.
import os, subprocess, sys

import cv2
import numpy as np

bild, ziel, sekunden, art = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
B = int(sys.argv[5]) if len(sys.argv) > 5 else 1080
H = int(sys.argv[6]) if len(sys.argv) > 6 else 1920
FPS = int(sys.argv[7]) if len(sys.argv) > 7 else 30
RAND = 1.16  # Reserve um das Bild, damit beim Fahren nie der Rand sichtbar wird

img = cv2.imread(bild, cv2.IMREAD_COLOR)
if img is None:
    sys.exit("Bild nicht lesbar")
gb, gh = int(B * RAND) // 2 * 2, int(H * RAND) // 2 * 2
faktor = max(gb / img.shape[1], gh / img.shape[0])
img = cv2.resize(img, (round(img.shape[1] * faktor), round(img.shape[0] * faktor)), interpolation=cv2.INTER_LANCZOS4)
y0, x0 = (img.shape[0] - gh) // 2, (img.shape[1] - gb) // 2
gross = img[y0:y0 + gh, x0:x0 + gb]


def tiefe_schaetzen(rgb):
    if os.environ.get("PARALLAX_TIEFE") == "verlauf":
        return np.tile(np.linspace(0, 1, rgb.shape[0], dtype=np.float32)[:, None], (1, rgb.shape[1]))
    from PIL import Image
    from transformers import pipeline
    schaetzer = pipeline("depth-estimation", model=os.environ.get("PARALLAX_MODELL", "depth-anything/Depth-Anything-V2-Small-hf"), device=-1)
    t = np.asarray(schaetzer(Image.fromarray(rgb))["predicted_depth"].squeeze(), dtype=np.float32)
    t = cv2.resize(t, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_CUBIC)
    return (t - t.min()) / max(float(t.max() - t.min()), 1e-6)  # 1 = nah


tiefe = tiefe_schaetzen(cv2.cvtColor(gross, cv2.COLOR_BGR2RGB))
tiefe = cv2.GaussianBlur(tiefe, (0, 0), sigmaX=gb / 120)  # weiche Kanten = weniger Risse am Objektrand

n = max(int(round(sekunden * FPS)), 2)
xs, ys = np.meshgrid(np.arange(B, dtype=np.float32) - B / 2, np.arange(H, dtype=np.float32) - H / 2)
cx, cy = gb / 2, gh / 2


def kamera(p):
    """(zoom_basis, zoom_tiefe, dx_tiefe, dy_tiefe) für Fortschritt p (0..1)."""
    weich = p * p * (3 - 2 * p)
    if art == "rein-schnell":
        q = p * p
        return 1 + 0.10 * q, 0.16 * q, 0, 0
    if art == "raus":
        return 1.12 - 0.10 * weich, 0.12 * (1 - weich), 0, 0
    if art == "schwenk":
        return 1.04, 0.02, (weich - 0.5) * B * 0.07, 0
    if art == "hoch":
        return 1.04 + 0.03 * weich, 0.03 * weich, 0, (0.5 - weich) * H * 0.06
    return 1 + 0.06 * weich, 0.09 * weich, 0, 0  # rein


rohr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{B}x{H}", "-r", str(FPS), "-i", "-",
                         "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", ziel], stdin=subprocess.PIPE)
for i in range(n):
    zb, zt, dx, dy = kamera(i / (n - 1))
    # 1. Durchgang: Tiefe an der Stelle, die ohne Parallax zu sehen wäre; 2.: Verschiebung je nach Tiefe.
    d = cv2.remap(tiefe, xs / zb + cx, ys / zb + cy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    z = zb + zt * d
    mx = xs / z + cx - dx * (0.3 + d) / z
    my = ys / z + cy - dy * (0.3 + d) / z
    rohr.stdin.write(cv2.remap(gross, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT).tobytes())
rohr.stdin.close()
sys.exit(rohr.wait())
