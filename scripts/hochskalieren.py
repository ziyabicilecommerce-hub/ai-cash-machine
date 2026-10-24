# KI-Hochskalierer für Videoclips: Real-ESRGAN (x4) auf der CPU, kostenlos, ohne Schlüssel.
# Kleine KI-Clips (z. B. 464x832) werden Bild für Bild echt hochgerechnet statt nur gestreckt -> scharfes 1080p.
#   python3 scripts/hochskalieren.py <quelle.mp4> <ziel.mp4> [anime|allgemein]
# Exit 0 = fertig; sonst Fehler (der Aufrufer nimmt dann den Originalclip).
import os, subprocess, sys, json, urllib.request

import numpy as np
import torch
from spandrel import ModelLoader

quelle, ziel = sys.argv[1], sys.argv[2]
art = sys.argv[3] if len(sys.argv) > 3 else "anime"
MODELLE = {
    "anime": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth",
    "allgemein": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth",
}
ordner = os.path.expanduser("~/.cache/real-esrgan")
os.makedirs(ordner, exist_ok=True)
pfad = os.path.join(ordner, os.path.basename(MODELLE[art]))
if not os.path.exists(pfad):
    urllib.request.urlretrieve(MODELLE[art], pfad)

torch.set_num_threads(os.cpu_count() or 4)
modell = ModelLoader().load_from_file(pfad).model.eval()

info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                                  "-of", "json", quelle], capture_output=True, text=True, check=True).stdout)["streams"][0]
b, h, fps = info["width"], info["height"], info["r_frame_rate"]
# Schon große Clips (z. B. 704x1280 vom Turbo-Space) bringt x4 kaum etwas, kostet auf der CPU aber 13 min pro Clip -
# dann lieber Lanczos (Exit 3 = "nicht nötig", der Aufrufer nimmt den Originalclip).
if min(b, h) >= 600:
    print(f"schon {b}x{h} - KI-Hochskalierung nicht nötig")
    sys.exit(3)
# Ziel: kurze Seite höchstens 1080 (x4 wird danach sauber auf Full HD verkleinert).
faktor = min(4, 1080 / min(b, h)) if min(b, h) < 1080 else 1
nb, nh = int(b * faktor) // 2 * 2, int(h * faktor) // 2 * 2

lesen = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", quelle, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
schreiben = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{b * 4}x{h * 4}", "-r", fps, "-i", "-",
                              "-vf", f"scale={nb}:{nh}:flags=lanczos", "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", ziel],
                             stdin=subprocess.PIPE)
groesse = b * h * 3
n = 0
with torch.inference_mode():
    while True:
        roh = lesen.stdout.read(groesse)
        if len(roh) < groesse:
            break
        x = torch.from_numpy(np.frombuffer(roh, np.uint8).reshape(h, b, 3).copy()).permute(2, 0, 1).float().div(255).unsqueeze(0)
        y = modell(x).clamp(0, 1).mul(255).round().byte().squeeze(0).permute(1, 2, 0).numpy()
        schreiben.stdin.write(y.tobytes())
        n += 1
schreiben.stdin.close()
schreiben.wait()
lesen.wait()
if n == 0 or schreiben.returncode != 0:
    sys.exit(1)
print(f"ok {n} Bilder {b}x{h} -> {nb}x{nh}", flush=True)
