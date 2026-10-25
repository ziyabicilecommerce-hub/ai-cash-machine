# Bild-Pool: sucht jede Woche alle laufenden Gratis-Bild-KIs (Text-zu-Bild) auf Hugging Face mit GPU, prüft die
# Schnittstelle (Endpunkt mit "prompt", liefert ein Bild) und speichert sie in ki-video/bild-spaces.json.
# Der Bild-Retter (scripts/ki_bild.py) probiert sie der Reihe nach, wenn der Bilddienst ausfällt.
#   python3 scripts/bild_pool.py [ziel.json] [max]
import json, re, sys, time, urllib.parse, urllib.request


ZIEL = sys.argv[1] if len(sys.argv) > 1 else "ki-video/bild-spaces.json"
MAX = int(sys.argv[2]) if len(sys.argv) > 2 else 400
SUCHE = ["flux", "text-to-image", "text to image", "stable diffusion", "sdxl", "sd3", "image generation", "image generator",
         "hidream", "qwen-image", "sana", "kolors", "playground", "lumina", "pixart", "hunyuan image", "z-image", "chroma",
         "illustrious", "anime diffusion", "realvis", "juggernaut", "lightning", "turbo", "schnell", "imagen", "dalle"]
NAME = re.compile(r"flux|diffus|sdxl|sd3|sd-|image|img|hidream|sana|kolors|playground|lumina|pixart|z-image|chroma|illustrious|anime|realvis|juggernaut|lightning|turbo|schnell|txt2|t2i|art", re.I)
TABU = re.compile(r"nsfw|uncensor|eros|lewd|porn|hentai|nude|18\+|xxx|adult|undress|deepnude|faceswap|face-swap|deepfake", re.I)


def holen(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "bild-pool"}), timeout=30) as r:
        return json.loads(r.read().decode())


def endpunkt_von(info):
    """Endpunkt mit Text-Prompt, der ein Bild liefert - so wie ki_bild.py ihn befüllen kann."""
    for name, ep in (info.get("named_endpoints") or {}).items():
        p = {x.get("parameter_name") for x in ep.get("parameters", [])}
        aus = json.dumps(ep.get("returns", [])).lower()
        bild_rein = any("image" in str(x.get("component", "")).lower() for x in ep.get("parameters", []))
        if "prompt" in p and not bild_rein and ("image" in aus or "gallery" in aus):
            return name
    return None


def main():
    from gradio_client import Client
    gesehen = {}
    for q in SUCHE:
        for sort in ("likes", "lastModified"):
            try:
                for s in holen(f"https://huggingface.co/api/spaces?search={urllib.parse.quote(q)}&sort={sort}&direction=-1&limit=200"):
                    if NAME.search(s["id"]) and not TABU.search(s["id"]):
                        gesehen[s["id"]] = s
            except Exception as e:
                print("Suche", q, e)
    kandidaten = sorted(gesehen.values(), key=lambda s: -(s.get("likes") or 0))[:3000]
    print(f"{len(gesehen)} Bild-Spaces gefunden, prüfe {len(kandidaten)}", flush=True)
    pool = []
    for s in kandidaten:
        if len(pool) >= MAX:
            break
        try:
            d = holen(f"https://huggingface.co/api/spaces/{s['id']}")
        except Exception as e:
            if "429" in str(e):
                time.sleep(90)
            continue
        hw = str((d.get("runtime") or {}).get("hardware", {}).get("current"))
        if (d.get("runtime") or {}).get("stage") != "RUNNING" or not re.search(r"zero|a10|a100|l4|l40|h100|h200|t4", hw):
            continue
        karte = d.get("cardData") or {}
        if TABU.search(f"{karte.get('title', '')} {karte.get('short_description', '')}"):
            continue
        try:
            ep = endpunkt_von(Client(s["id"], verbose=False).view_api(return_format="dict", print_info=False))
        except Exception as e:
            if "429" in str(e):
                time.sleep(90)
            continue
        if ep:
            pool.append({"space": s["id"], "endpoint": ep, "likes": d.get("likes", 0), "gpu": hw})
            print("✓", s["id"], ep, flush=True)
    pool.sort(key=lambda x: -x["likes"])
    with open(ZIEL, "w") as f:
        json.dump({"stand": time.strftime("%Y-%m-%d"), "anzahl": len(pool), "spaces": pool}, f, indent=1)
    print(f"Bild-Pool: {len(pool)} nutzbare Gratis-Bild-KIs -> {ZIEL}")


if __name__ == "__main__":
    main()
