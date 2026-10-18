# Echter KI-Clip aus einem Standbild (Bild-zu-Video) über kostenlose Hugging-Face-Spaces (ZeroGPU), ohne Schlüssel.
# Optional HF_TOKEN (kostenloses Konto) für mehr Tageskontingent.
#   python3 scripts/ki_clip.py <bild> <prompt> <ziel.mp4> <wan|ltx|turbo|wan14|ltx23|ltx25|real|anisora|k6|animegen|pool:space:typ:endpoint>
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
# Pool-Modell aus ki-video/spaces.json: "pool:<space>:<typ>:<endpoint>" (siehe scripts/space_pool.py).
if modell.startswith("pool:"):
    _, pool_space, modell, pool_ep = modell.split(":", 3)
else:
    pool_space, pool_ep = None, None


def ltx25(space, ep):
    # LTX-2.5 (Lightricks): nativ 832x1472 hochkant, mit Prompt-Veredelung.
    c = client(space)
    if ep == "/run":
        return c.predict(prompt=prompt, image_path=handle_file(bild), height=1472, width=832, duration_s=min(DAUER, 5) if token else 2.0,
                         seed=42, decoder="conv", auto_len=False, randomize_seed=True, do_enhance=True, api_name=ep)
    return c.predict(prompt=prompt, image_path=handle_file(bild), width=832, height=1472, duration_seconds=min(DAUER, 5) if token else 2.0,
                     auto_length=False, seed=42, randomize_seed=True, decoder="conv", api_name=ep)


# Universal-Adapter für Pool-Spaces: liest die Schnittstelle aus und füllt genau die Felder, die der Space erwartet
# (Startbild, Prompt, Dauer ...); unbekannte Felder bekommen ihren Standardwert, fehlende ein None.
BILD_FELDER = {"input_image", "image", "image_path", "first_frame", "start_image", "input_image_filepath", "img"}
LEER_FELDER = {"last_image", "end_image", "end_frame", "input_video", "input_video_filepath", "audio_path"}


def wert_fuer(name, standard, hat_standard):
    n = name.lower()
    if n in BILD_FELDER:
        return handle_file(bild)
    if n in LEER_FELDER:
        return None
    if n == "prompt":
        return prompt
    if n in ("negative_prompt", "n_prompt"):
        return NEG
    if n in ("duration_seconds", "duration_s", "duration", "seconds", "duration_ui"):
        return min(DAUER, 5)
    if n in ("steps", "num_inference_steps"):
        return SCHRITTE
    if n in ("randomize_seed",):
        return True
    return standard if hat_standard else None


def generisch(space, ep):
    c = client(space)
    info = c.view_api(return_format="dict", print_info=False)
    params = (info.get("named_endpoints") or {}).get(ep, {}).get("parameters", [])
    if not params:
        raise RuntimeError(f"Endpunkt {ep} fehlt")
    argumente = {p["parameter_name"]: wert_fuer(p["parameter_name"], p.get("parameter_default"), p.get("parameter_has_default", False)) for p in params}
    return c.predict(api_name=ep, **argumente)


try:
    if pool_space:
        r = generisch(pool_space, pool_ep)
    elif modell == "turbo":
        # LTX-2 Turbo (alexnasa): getestet 22 s, 1024x1536 hochkant, mit Ton; Endbild für Loops möglich.
        r = client(os.environ.get("KI_CLIP_TURBO", "alexnasa/ltx-2-TURBO")).predict(
            first_frame=handle_file(bild), end_frame=handle_file(ENDE) if ENDE else None, prompt=prompt, input_video=None,
            generation_mode="Image-to-Video", enhance_prompt=False, seed=42, randomize_seed=True, height=768, width=512,
            camera_lora="No LoRA", audio_path=None, api_name="/generate_video")
    elif modell == "ltx25":
        r = ltx25(pool_space or os.environ.get("KI_CLIP_LTX25", "Lightricks/LTX-2.5"), pool_ep or "/run")
    elif modell in ("wan14", "real"):
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
