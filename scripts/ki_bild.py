# Bild-Retter: fällt der Bilddienst (Pollinations) aus (#201: HTTP 503), holt dieser Bot das Startbild ohne Schlüssel
# von freien FLUX-Spaces auf Hugging Face (ZeroGPU). Liest die Schnittstelle selbst aus und füllt die Felder.
#   python3 scripts/ki_bild.py "<prompt>" ziel.jpg [breite] [hoehe] [seed]
# Exit 0 = Bild da, 1 = kein Space hat geliefert. Optional HF_TOKEN für mehr Kontingent.
import json, os, shutil, sys

from gradio_client import Client

prompt, ziel = sys.argv[1], sys.argv[2]
breite = int(sys.argv[3]) if len(sys.argv) > 3 else 768
hoehe = int(sys.argv[4]) if len(sys.argv) > 4 else 1344
seed = int(sys.argv[5]) if len(sys.argv) > 5 else 42
token = os.environ.get("HF_TOKEN") or None
SPACES = [s for s in os.environ.get("KI_BILD_SPACES", "black-forest-labs/FLUX.1-schnell,black-forest-labs/FLUX.1-dev,stabilityai/stable-diffusion-3.5-large-turbo").split(",") if s.strip()]
# Dazu der wöchentliche Bild-Pool (scripts/bild_pool.py): alle laufenden Gratis-Bild-KIs mit geprüfter Schnittstelle.
ENDPUNKT = {}
try:
    with open(os.environ.get("KI_BILD_POOL", "ki-video/bild-spaces.json")) as f:
        for x in json.load(f).get("spaces", [])[: int(os.environ.get("KI_BILD_POOL_MAX", "40"))]:
            if x.get("space") and x["space"] not in SPACES:
                SPACES.append(x["space"])
                ENDPUNKT[x["space"]] = x.get("endpoint")
except Exception:
    pass


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


def cloudflare():
    """Cloudflare Workers AI (FLUX.1 schnell): Gratis-Kontingent pro Tag, braucht CF_ACCOUNT_ID + CF_API_TOKEN als Secret.
    Liefert ein quadratisches Bild - ffmpeg schneidet es auf das Hochformat zu."""
    konto, schluessel = os.environ.get("CF_ACCOUNT_ID", "").strip(), os.environ.get("CF_API_TOKEN", "").strip()
    if not (konto and schluessel):
        return False
    import base64, subprocess, tempfile, urllib.request
    try:
        anfrage = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{konto}/ai/run/@cf/black-forest-labs/flux-1-schnell",
                                         data=json.dumps({"prompt": prompt[:2000], "steps": 6, "seed": seed}).encode(), method="POST",
                                         headers={"Authorization": f"Bearer {schluessel}", "Content-Type": "application/json"})
        with urllib.request.urlopen(anfrage, timeout=120) as r:
            bild = (json.loads(r.read().decode()).get("result") or {}).get("image")
        if not bild:
            return False
        roh = tempfile.mktemp(suffix=".jpg")
        with open(roh, "wb") as f:
            f.write(base64.b64decode(bild))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", roh, "-vf", f"scale={breite}:{hoehe}:force_original_aspect_ratio=increase,crop={breite}:{hoehe}", "-q:v", "2", ziel], check=True)
        print("[bild-retter] Cloudflare Workers AI (FLUX schnell) ok", flush=True)
        return True
    except Exception as e:
        print(f"[bild-retter] Cloudflare fehlgeschlagen: {str(e)[:160]}", flush=True)
        return False


if cloudflare():
    sys.exit(0)

for space in SPACES:
    space = space.strip()
    try:
        c = client(space)
        endpunkte = (c.view_api(return_format="dict", print_info=False).get("named_endpoints") or {})
        ep = ENDPUNKT.get(space) if ENDPUNKT.get(space) in endpunkte else next((e for e in ("/infer", "/generate", "/predict", "/run") if e in endpunkte), next(iter(endpunkte), None))
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
