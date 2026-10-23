# Bild-Retter: fällt der Bilddienst (Pollinations) aus (#201: HTTP 503), holt dieser Bot das Startbild ohne Schlüssel
# von freien FLUX-Spaces auf Hugging Face (ZeroGPU). Liest die Schnittstelle selbst aus und füllt die Felder.
#   python3 scripts/ki_bild.py "<prompt>" ziel.jpg [breite] [hoehe] [seed]
# Exit 0 = Bild da, 1 = kein Space hat geliefert. Optional HF_TOKEN für mehr Kontingent.
import os, shutil, sys

from gradio_client import Client

prompt, ziel = sys.argv[1], sys.argv[2]
breite = int(sys.argv[3]) if len(sys.argv) > 3 else 768
hoehe = int(sys.argv[4]) if len(sys.argv) > 4 else 1344
seed = int(sys.argv[5]) if len(sys.argv) > 5 else 42
token = os.environ.get("HF_TOKEN") or None
SPACES = [s for s in os.environ.get("KI_BILD_SPACES", "black-forest-labs/FLUX.1-schnell,black-forest-labs/FLUX.1-dev,stabilityai/stable-diffusion-3.5-large-turbo").split(",") if s.strip()]


def client(space):
    if not token:
        return Client(space, verbose=False)
    try:
        return Client(space, token=token, verbose=False)
    except TypeError:
        return Client(space, hf_token=token, verbose=False)


def wert(name, standard, hat):
    n = name.lower()
    if n == "prompt":
        return prompt
    if n == "width":
        return breite
    if n == "height":
        return hoehe
    if n == "seed":
        return seed
    if n == "randomize_seed":
        return False
    return standard if hat else None


def bild_aus(ergebnis):
    # Antworten sind (pfad, seed), {"path": ...} oder eine Liste davon.
    if isinstance(ergebnis, (list, tuple)) and ergebnis:
        return bild_aus(ergebnis[0])
    if isinstance(ergebnis, dict):
        return ergebnis.get("path") or ergebnis.get("url") or ""
    return ergebnis if isinstance(ergebnis, str) else ""


for space in SPACES:
    space = space.strip()
    try:
        c = client(space)
        endpunkte = (c.view_api(return_format="dict", print_info=False).get("named_endpoints") or {})
        ep = next((e for e in ("/infer", "/generate", "/predict", "/run") if e in endpunkte), next(iter(endpunkte), None))
        if not ep:
            continue
        argumente = {p["parameter_name"]: wert(p["parameter_name"], p.get("parameter_default"), p.get("parameter_has_default", False))
                     for p in endpunkte[ep].get("parameters", [])}
        pfad = bild_aus(c.predict(api_name=ep, **argumente))
        if pfad and os.path.exists(pfad):
            if pfad.lower().endswith((".jpg", ".jpeg")):
                shutil.copyfile(pfad, ziel)
            else:
                import subprocess
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", pfad, "-q:v", "2", ziel], check=True)
            print(f"[bild-retter] {space}{ep} ok", flush=True)
            sys.exit(0)
    except Exception as e:  # nächster Space
        print(f"[bild-retter] {space} fehlgeschlagen: {str(e)[:160]}", flush=True)
sys.exit(1)
