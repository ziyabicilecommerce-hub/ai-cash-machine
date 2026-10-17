# Echter KI-Clip aus einem Standbild (Bild-zu-Video) über kostenlose Hugging-Face-Spaces (ZeroGPU), ohne Schlüssel.
# Optional HF_TOKEN (kostenloses Konto) für mehr Tageskontingent.
#   python3 scripts/ki_clip.py <bild> <prompt> <ziel.mp4> <wan|ltx|wan14|ltx23|real|anisora|k6|animegen>
# Exit 0 = Clip liegt in <ziel>; Exit 3 = Kontingent erschöpft; sonst Fehler.
import os, shutil, sys

from gradio_client import Client, handle_file

bild, prompt, ziel, modell = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
token = os.environ.get("HF_TOKEN") or None


def client(space):
    # Ohne Schlüssel kein Token-Argument; je nach gradio_client-Version heißt es token oder hf_token.
    if not token:
        return Client(space, verbose=False)
    try:
        return Client(space, token=token, verbose=False)
    except TypeError:
        return Client(space, hf_token=token, verbose=False)
# Ziya Studio setzt eigene Werte (z. B. Menschen erlaubt, längere Clips, mehr Schritte).
NEG = os.environ.get("KI_CLIP_NEG") or "static, still image, blurry, distorted, deformed, text, watermark, subtitles, people, faces"
DAUER = float(os.environ.get("KI_CLIP_DAUER") or 3.5)
SCHRITTE = int(os.environ.get("KI_CLIP_SCHRITTE") or 6)
# Optionales Endbild (Wan 2.2 14B): = Startbild ergibt einen nahtlosen Loop.
ENDE = os.environ.get("KI_CLIP_ENDE") or None
try:
    if modell in ("wan14", "real"):
        # Kleine Gratis-Spaces, im Oktober 2026 per Weltsuche gefunden und getestet: Wan 2.2 14B mit bis zu 5 s
        # und Endbild bzw. ein realistisches Wan-2.2-Finetune.
        if modell == "wan14":
            c = client(os.environ.get("KI_CLIP_WAN14", "Upsampler/wan-2-2-14b-image-to-video"))
            extra = {"end_image": handle_file(ENDE) if ENDE else None}
        else:
            c = client(os.environ.get("KI_CLIP_REAL", "hugging-apps/ksyjawan-realistic-i2v"))
            extra = {}
        r = c.predict(input_image=handle_file(bild), prompt=prompt, steps=SCHRITTE, negative_prompt=NEG, duration_seconds=min(DAUER, 5),
                      guidance_scale=1, guidance_scale_2=1, seed=42, randomize_seed=True, api_name="/generate_video", **extra)
    elif modell == "anisora":
        # AniSora V3.2 (Bilibili, Open Source, auf Anime trainiert) - 5 s, Gratis-GPU.
        c = client(os.environ.get("KI_CLIP_ANISORA", "thanh14536/anisora-v3-2-zero"))
        r = c.predict(image=handle_file(bild), prompt=prompt, seed=42, randomize_seed=True, api_name="/generate")
    elif modell == "k6":
        # Kandinsky 6.0 Pro (Okt. 2026, offizieller Space) - 5 s Video MIT passendem Ton.
        c = client(os.environ.get("KI_CLIP_K6", "kandinskylab/Kandinsky-6.0-Pro-distill-5s"))
        r = c.predict(prompt=prompt, use_beautifier=True, seed=42, image=handle_file(bild), api_name="/generate")
    elif modell == "animegen":
        c = client(os.environ.get("KI_CLIP_ANIMEGEN", "aidealab/AnimeGen-I2V"))
        r = c.predict(image=handle_file(bild), prompt=prompt, negative_prompt="3d, cg, photo, stop, wait", api_name="/generate_video")
    elif modell == "ltx23":
        # LTX 2.3 in nativer Hochkant-Auflösung 704x1280 (24 fps) - deutlich schärfer, weniger Hochrechnen nötig.
        c = client(os.environ.get("KI_CLIP_LTX23", "Ash1004/ltx23-i2v-fullres"))
        r = c.predict(start_image=handle_file(bild), prompt=prompt, negative_prompt=NEG, width=704, height=1280, seconds=min(DAUER, 5),
                      fps=24, steps=8, cfg=1.0, shift=13.0, sampler_name="euler_ancestral_cfg_pp", scheduler="linear_quadratic",
                      seed=42, gpu_seconds=0, api_name="/generate")
    elif modell == "wan":
        c = client(os.environ.get("KI_CLIP_WAN", "zerogpu-aoti/wan2-2-fp8da-aoti-faster"))
        r = c.predict(input_image=handle_file(bild), prompt=prompt, steps=SCHRITTE, negative_prompt=NEG, duration_seconds=DAUER,
                      guidance_scale=1, guidance_scale_2=1, seed=42, randomize_seed=True, api_name="/generate_video")
    else:
        c = client(os.environ.get("KI_CLIP_LTX", "Lightricks/ltx-video-distilled"))
        r = c.predict(prompt=prompt, negative_prompt=NEG, input_image_filepath=handle_file(bild), input_video_filepath=None,
                      height_ui=704, width_ui=512, mode="image-to-video", duration_ui=min(DAUER, 5), ui_frames_to_use=9, seed_ui=42,
                      randomize_seed=True, ui_guidance_scale=1, improve_texture_flag=True, api_name="/image_to_video")
    pfad = r[0] if isinstance(r, (list, tuple)) else r
    if isinstance(pfad, dict):
        pfad = pfad.get("video") or pfad.get("path")
    shutil.copy(pfad, ziel)
    print("ok", ziel)
except Exception as e:
    text = repr(e)
    print(text[:300], file=sys.stderr)
    sys.exit(3 if any(w in text.lower() for w in ("quota", "exceeded", "zerogpu", "rate limit", "too many")) else 1)
