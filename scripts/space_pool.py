# Space-Pool: sucht wöchentlich alle laufenden Video-KIs auf Hugging Face (Gratis-GPU "ZeroGPU"), prüft ihre
# Schnittstelle und schreibt bis zu 100 nutzbare in ki-video/spaces.json. scripts/ki_clip.py kann jeden davon
# ansprechen - fällt ein Space aus oder ist er besetzt, nimmt der Router den nächsten.
# Hinweis: Das Gratis-Kontingent gilt pro Nutzer/IP für alle Spaces zusammen - der Pool macht robuster, nicht mehr.
#   python3 scripts/space_pool.py [ziel.json]
import json, re, sys, time, urllib.parse, urllib.request

from gradio_client import Client

ZIEL = sys.argv[1] if len(sys.argv) > 1 else "ki-video/spaces.json"
# Katalog: ALLE gerade laufenden Gratis-Video-KIs (bis 1000), auch ohne bekannte Schnittstelle - zum Stöbern.
KATALOG = sys.argv[2] if len(sys.argv) > 2 else "ki-video/katalog.json"
SUCHE = ["video", "animate", "motion", "text-to-video", "t2v", "talking", "lipsync", "dance", "avatar", "upscale video", "video edit",
         "image-to-video", "i2v", "wan2.2", "wan 2.2", "wan2", "ltx-2", "ltx 2.5", "ltx2", "animegen", "anime video", "framepack",
         "video generation", "img2vid", "image to video", "kandinsky", "hunyuan video", "skyreels", "cogvideo"]
NAME = re.compile(r"video|i2v|t2v|wan|ltx|anime|animat|framepack|kandinsky|hunyuan|skyreel|cogvideo|motion|talking|lipsync|dance|avatar", re.I)
TABU = re.compile(r"nsfw|uncensor|eros|lewd|porn|hentai|nude|18\+|xxx|adult", re.I)


def holen(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode())


def typ_von(info):
    """Ordnet die Schnittstelle einem bekannten Aufruf-Typ zu (siehe scripts/ki_clip.py, Modell 'pool')."""
    for name, ep in (info.get("named_endpoints") or {}).items():
        p = {x.get("parameter_name") for x in ep.get("parameters", [])}
        if name == "/generate_video" and {"input_image", "prompt", "duration_seconds"} <= p:
            return "wan", name
        if name in ("/run", "/generate_video") and {"prompt", "image_path"} <= p and ({"duration_s"} <= p or {"duration_seconds"} <= p):
            return "ltx25", name
        if name == "/generate_video" and {"image", "prompt", "negative_prompt"} <= p and len(p) <= 4:
            return "animegen", name
    return None, None


def main():
    gesehen = {}
    for q in SUCHE:
        for sort in ("likes", "lastModified"):
            try:
                for s in holen(f"https://huggingface.co/api/spaces?search={urllib.parse.quote(q)}&sort={sort}&direction=-1&limit=200"):
                    if NAME.search(s["id"]) and not TABU.search(s["id"]):
                        gesehen[s["id"]] = s
            except Exception as e:
                print("Suche", q, e)
    kandidaten = sorted(gesehen.values(), key=lambda s: -(s.get("likes") or 0))[:2500]
    print(f"{len(gesehen)} Video-Spaces gefunden, prüfe {len(kandidaten)}", flush=True)
    pool, katalog = [], []
    for s in kandidaten:
        if len(katalog) >= 1000:
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
        titel = f"{karte.get('title', '')} {karte.get('short_description', '')}".strip()
        if TABU.search(titel):
            continue
        katalog.append({"space": s["id"], "titel": titel[:120], "gpu": hw, "likes": d.get("likes", 0), "geaendert": str(d.get("lastModified", ""))[:10]})
        # Schnittstelle nur für die beliebtesten prüfen (Router-Pool), sonst sprengt es das Abfragelimit.
        if len(pool) < 100 and len(katalog) <= 250:
            try:
                typ, ep = typ_von(Client(s["id"], verbose=False).view_api(return_format="dict", print_info=False))
                if typ:
                    pool.append({"space": s["id"], "typ": typ, "endpoint": ep, "likes": d.get("likes", 0)})
                    print("✓", s["id"], typ, flush=True)
            except Exception as e:
                if "429" in str(e):
                    time.sleep(90)
        if len(katalog) % 50 == 0:
            print(f"Katalog: {len(katalog)}", flush=True)
    pool.sort(key=lambda x: -x["likes"])
    with open(ZIEL, "w") as f:
        json.dump({"stand": time.strftime("%Y-%m-%d"), "anzahl": len(pool), "spaces": pool}, f, indent=1)
    print(f"Pool: {len(pool)} nutzbare Video-Spaces -> {ZIEL}")
    katalog.sort(key=lambda x: -x["likes"])
    with open(KATALOG, "w") as f:
        json.dump({"stand": time.strftime("%Y-%m-%d"), "anzahl": len(katalog), "spaces": katalog}, f, indent=1, ensure_ascii=False)
    print(f"Katalog: {len(katalog)} laufende Gratis-Video-KIs -> {KATALOG}")


if __name__ == "__main__":
    main()
