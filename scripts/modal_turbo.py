# Modal-Turbo: dasselbe wie Kaggle-Turbo (scripts/kaggle/turbo.py), aber auf einer Modal-GPU (Standard L40S, 48 GB).
# Modal schenkt jeden Monat 30 $ Guthaben - ohne Warteschlange und mit genug Speicher für 720p direkt.
# Aufruf (macht automations/lib/modalTurbo.mjs): modal run scripts/modal_turbo.py --job job.json --out ordner
# Anmeldung über MODAL_TOKEN_ID / MODAL_TOKEN_SECRET. Die Modellgewichte bleiben im Volume ziya-hf-cache liegen.
import os
import subprocess
import sys

import modal

TURBO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kaggle", "turbo.py")
GPU = os.environ.get("ZIYA_MODAL_GPU", "L40S")

app = modal.App("ziya-turbo")
bild = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install("torch==2.5.1", "diffusers>=0.35", "transformers", "accelerate", "ftfy", "imageio", "imageio-ffmpeg", "sentencepiece")
    .add_local_file(TURBO, "/root/turbo.py")
)
cache = modal.Volume.from_name("ziya-hf-cache", create_if_missing=True)


@app.function(image=bild, gpu=GPU, timeout=3 * 3600, volumes={"/cache": cache})
def clips(job_json: str) -> dict:
    os.environ["HF_HOME"] = "/cache/hf"
    out = "/tmp/out"
    os.makedirs(out, exist_ok=True)
    code = open("/root/turbo.py").read()
    code = code.replace("__JOB__", f"json.loads({job_json!r})").replace('OUT = "/kaggle/working"', f'OUT = "{out}"')
    open("/tmp/turbo_modal.py", "w").write(code)
    subprocess.run([sys.executable, "/tmp/turbo_modal.py"], check=False)
    cache.commit()
    return {n: open(os.path.join(out, n), "rb").read() for n in os.listdir(out) if n.endswith((".mp4", ".json"))}


@app.local_entrypoint()
def main(job: str, out: str):
    ergebnis = clips.remote(open(job).read())
    os.makedirs(out, exist_ok=True)
    for name, daten in ergebnis.items():
        with open(os.path.join(out, name), "wb") as f:
            f.write(daten)
    print(f"[modal-turbo] {sum(n.endswith('.mp4') for n in ergebnis)} Clips zurück")
