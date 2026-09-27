import json, os, subprocess, sys, urllib.request, urllib.parse, time
from concurrent.futures import ThreadPoolExecutor

PROMPT = "anime style, a sleek RGB gaming keyboard glowing on a desk at night, cinematic camera slowly orbiting"
IMG = "input.jpg"

TESTS = [
 ("zai-org/CogVideoX-2B-Space", "/generate", {"prompt": PROMPT}),
 ("TIGER-Lab/T2V-Turbo-V2", "/predict", {"prompt": PROMPT}),
 ("hysts/zeroscope-v2", "/run", {"prompt": PROMPT}),
 ("mediasynthesismuseum/modelscope-text-to-video", "/generate", {"prompt": PROMPT}),
 ("Upsampler/wan-2-2-14b-text-to-video", "/generate_video", {"prompt": PROMPT, "aspect_ratio": "9:16 (480x832)"}),
 ("ByteDance/AnimateDiff-Lightning", "/generate_image", {"prompt": PROMPT}),
 ("Lightricks/ltx-video-distilled", "/text_to_video", {"prompt": PROMPT, "mode": "text-to-video"}),
 ("Pyramid-Flow/pyramid-flow", "/generate_video", {"prompt": PROMPT}),
 ("zerogpu-aoti/wan2-2-fp8da-aoti-faster", "/generate_video", {"input_image": "IMG", "prompt": "the keyboard lights pulse, slow camera orbit"}),
 ("aidealab/AnimeGen-I2V", "/generate_video", {"image": "IMGPATH", "prompt": "the lights pulse softly"}),
 ("KingNish/wan2-2-fast", "/generate_video", {"input_image": "IMG", "prompt": "the keyboard lights pulse, slow camera orbit"}),
 ("Lightricks/ltx-video-distilled", "/image_to_video", {"prompt": "the keyboard lights pulse, slow camera orbit", "input_image_filepath": "IMG", "mode": "image-to-video"}),
 ("mediasynthesismuseum/stable-video-diffusion", "/video", {"image": "IMG"}),
 ("zachwel/wan-i2v-long", "/generate_video", {"input_image": "IMG", "prompt": "the keyboard lights pulse, slow camera orbit"}),
]

WORKER = r'''
import json, sys
from gradio_client import Client, handle_file
space, ep, kw = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
for k, v in list(kw.items()):
    if v == "IMG": kw[k] = handle_file("input.jpg")
    if v == "IMGPATH": kw[k] = handle_file("input.jpg")
c = Client(space, verbose=False)
res = c.predict(api_name=ep, **kw)
vids = []
def walk(x):
    if isinstance(x, str) and x.lower().split("?")[0].endswith((".mp4", ".webm", ".gif", ".mov")): vids.append(x)
    elif isinstance(x, dict): [walk(v) for v in x.values()]
    elif isinstance(x, (list, tuple)): [walk(v) for v in x]
walk(res)
print("VIDEOS:" + json.dumps(vids))
'''

def probe(path):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", path], capture_output=True, text=True, timeout=30).stdout
        j = json.loads(out); st = [s for s in j.get("streams", []) if s.get("width")]
        return f'{float(j["format"]["duration"]):.1f}s {st[0]["width"]}x{st[0]["height"]}' if st else "?"
    except Exception as e:
        return f"probe-fehler {e}"

def run(t):
    space, ep, kw = t
    t0 = time.time()
    try:
        p = subprocess.run([sys.executable, "-c", WORKER, space, ep, json.dumps(kw)], capture_output=True, text=True, timeout=330)
        dt = time.time() - t0
        line = [l for l in p.stdout.splitlines() if l.startswith("VIDEOS:")]
        if line:
            vids = json.loads(line[0][7:])
            if vids:
                return f"OK      {space} {ep} ({dt:.0f}s) -> {probe(vids[0])}"
            return f"LEER    {space} {ep} ({dt:.0f}s) kein Video im Ergebnis"
        err = (p.stderr.strip().splitlines() or ["?"])[-1]
        return f"FEHLER  {space} {ep} ({dt:.0f}s) {err[:220]}"
    except subprocess.TimeoutExpired:
        return f"TIMEOUT {space} {ep} (>330s)"

urllib.request.urlretrieve("https://image.pollinations.ai/prompt/" + urllib.parse.quote("RGB gaming keyboard on a desk, anime style, neon lights") + "?width=768&height=768&nologo=true&seed=7", IMG)
print("Eingabebild:", os.path.getsize(IMG), "Bytes")
with ThreadPoolExecutor(4) as ex:
    for r in ex.map(run, TESTS):
        print(r, flush=True)
