# Echter KI-Clip aus einem Standbild (Bild-zu-Video) über kostenlose Hugging-Face-Spaces (ZeroGPU), ohne Schlüssel.
# Optional HF_TOKEN (kostenloses Konto) für mehr Tageskontingent.
#   python3 scripts/ki_clip.py <bild> <prompt> <ziel.mp4> <wan|ltx>
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
NEG = "static, still image, blurry, distorted, deformed, text, watermark, subtitles, people, faces"
try:
    if modell == "wan":
        c = client(os.environ.get("KI_CLIP_WAN", "zerogpu-aoti/wan2-2-fp8da-aoti-faster"))
        r = c.predict(input_image=handle_file(bild), prompt=prompt, steps=6, negative_prompt=NEG, duration_seconds=3.5,
                      guidance_scale=1, guidance_scale_2=1, seed=42, randomize_seed=True, api_name="/generate_video")
    else:
        c = client(os.environ.get("KI_CLIP_LTX", "Lightricks/ltx-video-distilled"))
        r = c.predict(prompt=prompt, negative_prompt=NEG, input_image_filepath=handle_file(bild), input_video_filepath=None,
                      height_ui=704, width_ui=512, mode="image-to-video", duration_ui=3, ui_frames_to_use=9, seed_ui=42,
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
