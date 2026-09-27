import json, signal
from gradio_client import Client

SPACES = [
 "zai-org/CogVideoX-5B-Space", "zai-org/CogVideoX-2B-Space", "Lightricks/ltx-video-distilled", "Lightricks/LTX-2-3",
 "alexnasa/ltx-2-TURBO", "ByteDance/AnimateDiff-Lightning", "TIGER-Lab/T2V-Turbo-V2", "hysts/zeroscope-v2",
 "Pyramid-Flow/pyramid-flow", "multimodalart/Hunyuan-Video-1-5", "multimodalart/wan2-1-fast", "KingNish/wan2-2-fast",
 "Upsampler/wan-2-2-14b-text-to-video", "aidealab/AIdeaLab-VideoJP", "mediasynthesismuseum/modelscope-text-to-video",
 "FrameAI4687/Omni-Video-Factory", "zerogpu-aoti/wan2-2-fp8da-aoti-faster", "r3gm/wan2-2-fp8da-aoti-preview",
 "mediasynthesismuseum/stable-video-diffusion", "aidealab/AnimeGen-I2V", "linoyts/FramePack-F1",
 "multimodalart/wan-2-2-first-last-frame", "wangfuyun/AnimateLCM-SVD", "Upsampler/wan-2-2-14b-image-to-video",
 "dayona/I2V-EXTENDED", "zachwel/wan-i2v-long",
]

class TO(Exception): pass
def h(*a): raise TO()
signal.signal(signal.SIGALRM, h)

for sp in SPACES:
    print("=" * 20, sp)
    signal.alarm(60)
    try:
        c = Client(sp, verbose=False)
        api = c.view_api(return_format="dict", print_info=False)
        for name, ep in (api.get("named_endpoints") or {}).items():
            params = [(p.get("parameter_name"), (p.get("python_type") or {}).get("type"), p.get("parameter_default")) for p in ep.get("parameters", [])]
            rets = [(r.get("python_type") or {}).get("type") for r in ep.get("returns", [])]
            print(" ", name, "PARAMS:", json.dumps(params, default=str)[:600], "RETURNS:", rets)
    except TO:
        print("  TIMEOUT")
    except Exception as e:
        print("  FEHLER:", type(e).__name__, str(e)[:200])
    finally:
        signal.alarm(0)
