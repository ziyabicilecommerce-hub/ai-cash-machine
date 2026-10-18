# Kaggle-Turbo: läuft als Kaggle-Notebook auf der kostenlosen Kaggle-GPU (30 h/Woche) und macht aus jedem
# Startbild einen echten KI-Clip mit Wan 2.2 (TI2V-5B, nativ 720p) - ohne Tageslimit pro Clip.
# Der GitHub-Workflow setzt JOB unten ein (Shots mit Bild-URL und Bewegungs-Prompt), schiebt das Notebook zu
# Kaggle, wartet und holt die Clips aus /kaggle/working ab. Jeder Schritt schreibt ins Log (bericht.json).
import json, os, subprocess, sys, time, traceback, urllib.request

JOB = __JOB__
OUT = "/kaggle/working"
bericht = {"start": time.time(), "shots": [], "fehler": []}


def speichern():
    with open(os.path.join(OUT, "bericht.json"), "w") as f:
        json.dump(bericht, f, indent=2)


def log(*a):
    print("[kaggle-turbo]", *a, flush=True)


subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-U", "diffusers>=0.35", "transformers", "accelerate", "ftfy", "imageio", "imageio-ffmpeg"], check=False)

import torch  # noqa: E402
from diffusers import AutoencoderKLWan  # noqa: E402
from diffusers.utils import export_to_video, load_image  # noqa: E402

gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "keine"
# T4/P100 können kein schnelles bfloat16 -> float16; neuere Karten bfloat16.
dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16
bericht.update(gpu=gpu, dtype=str(dtype))
log("GPU:", gpu, dtype)
speichern()

MODELL = JOB.get("modell") or "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
try:
    from diffusers import WanImageToVideoPipeline
    vae = AutoencoderKLWan.from_pretrained(MODELL, subfolder="vae", torch_dtype=torch.float32)
    pipe = WanImageToVideoPipeline.from_pretrained(MODELL, vae=vae, torch_dtype=dtype)
except Exception:
    bericht["fehler"].append("I2V-Pipeline: " + traceback.format_exc()[-600:])
    from diffusers import WanPipeline
    vae = AutoencoderKLWan.from_pretrained(MODELL, subfolder="vae", torch_dtype=torch.float32)
    pipe = WanPipeline.from_pretrained(MODELL, vae=vae, torch_dtype=dtype)
pipe.enable_model_cpu_offload()
try:
    pipe.vae.enable_tiling()
except Exception:
    pass
log("Modell geladen:", type(pipe).__name__)

breite, hoehe = JOB.get("breite", 704), JOB.get("hoehe", 1280)
for s in JOB["shots"]:
    t = time.time()
    eintrag = {"nr": s["nr"]}
    try:
        bild = os.path.join(OUT, f"shot{s['nr']}.jpg")
        urllib.request.urlretrieve(s["bild_url"], bild)
        img = load_image(bild).resize((breite, hoehe))
        argumente = dict(prompt=s["prompt"], negative_prompt=JOB.get("negativ", ""), height=hoehe, width=breite,
                         num_frames=JOB.get("frames", 81), guidance_scale=JOB.get("guidance", 5.0),
                         num_inference_steps=JOB.get("schritte", 30))
        try:
            frames = pipe(image=img, **argumente).frames[0]
        except TypeError:
            frames = pipe(**argumente).frames[0]
        ziel = os.path.join(OUT, f"shot{s['nr']}-roh.mp4")
        export_to_video(frames, ziel, fps=JOB.get("fps", 24))
        eintrag.update(ok=True, sekunden=round(time.time() - t))
        log(f"Shot {s['nr']} fertig in {eintrag['sekunden']} s")
    except Exception:
        eintrag.update(ok=False, fehler=traceback.format_exc()[-800:])
        log(f"Shot {s['nr']} fehlgeschlagen")
    bericht["shots"].append(eintrag)
    speichern()
bericht["ende"] = time.time()
speichern()
