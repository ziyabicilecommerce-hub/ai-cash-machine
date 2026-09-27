import json, urllib.request, urllib.parse, collections

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "scan"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

seen = {}
queries = []
for tag in ["text-to-video", "image-to-video", "video-generation"]:
    queries.append(("filter", tag))
for term in ["video", "wan", "ltx", "cogvideo", "hunyuan", "animatediff", "anime video", "i2v", "t2v", "svd", "framepack", "mochi", "opensora", "pyramid flow", "kandinsky video", "skyreels", "vidu", "zeroscope"]:
    queries.append(("search", term))

for kind, val in queries:
    params = [(kind, val), ("sort", "likes"), ("direction", "-1"), ("limit", "500")] + [("expand[]", f) for f in ["runtime", "sdk", "likes", "tags", "subdomain"]]
    try:
        data = get("https://huggingface.co/api/spaces?" + urllib.parse.urlencode(params))
    except Exception as e:
        print("ERR", kind, val, e); continue
    for s in data:
        seen[s["id"]] = s

rows = []
stages = collections.Counter()
hw = collections.Counter()
for sid, s in seen.items():
    rt = s.get("runtime") or {}
    stage = rt.get("stage")
    hardware = (rt.get("hardware") or {}).get("current")
    stages[stage] += 1
    tags = " ".join(s.get("tags") or []).lower()
    name = sid.lower()
    videoish = any(k in name or k in tags for k in ["video", "wan", "ltx", "cogvideo", "hunyuan", "animatediff", "i2v", "t2v", "svd", "framepack", "mochi", "opensora", "pyramid", "skyreels", "zeroscope"])
    if stage == "RUNNING" and videoish and s.get("sdk") == "gradio":
        hw[hardware] += 1
        rows.append((s.get("likes", 0), sid, hardware, s.get("subdomain")))

rows.sort(reverse=True)
print("TOTAL gefunden:", len(seen))
print("Stages:", dict(stages))
print("Laufend + Video + Gradio:", len(rows))
print("Hardware:", dict(hw))
gpu = [r for r in rows if r[2] and r[2] != "cpu-basic" and r[2] != "cpu-upgrade"]
print("davon mit GPU:", len(gpu))
print("=== TOP (likes, id, hardware) ===")
for r in gpu[:300]:
    print(r[0], r[1], r[2], r[3])
json.dump([{"id": r[1], "likes": r[0], "hardware": r[2], "subdomain": r[3]} for r in gpu], open("spaces.json", "w"))
print("=== SAMPLE KEYS ===", list(next(iter(seen.values())).keys()))
