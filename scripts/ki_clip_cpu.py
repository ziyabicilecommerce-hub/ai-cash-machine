#!/usr/bin/env python3
"""Versuch: KI-Videoclip NUR mit dem Prozessor (GitHub-Runner ohne Grafikkarte) - kostenlos und ohne Tageslimit.
Modell: AnimateDiff-Lightning (ByteDance, 4 Rechenschritte) auf einem Stable-Diffusion-1.5-Modell. Text -> ~2 s Clip (16 Bilder).
  python3 scripts/ki_clip_cpu.py "<prompt>" <ziel.mp4> [schritte=4] [breite=384] [hoehe=672]
Gibt die gemessenen Zeiten aus (Laden, Rechnen) - daran sieht man, ob das für den täglichen Betrieb taugt.
"""
import json, sys, time

import torch
from diffusers import AnimateDiffPipeline, EulerDiscreteScheduler, MotionAdapter
from diffusers.utils import export_to_video
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file

prompt, ziel = sys.argv[1], sys.argv[2]
schritte = int(sys.argv[3]) if len(sys.argv) > 3 else 4
breite, hoehe = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (384, 672)
torch.set_num_threads(4)

t0 = time.time()
adapter = MotionAdapter()
adapter.load_state_dict(load_file(hf_hub_download('ByteDance/AnimateDiff-Lightning', f'animatediff_lightning_{schritte}step_diffusers.safetensors')))
pipe = AnimateDiffPipeline.from_pretrained('emilianJR/epiCRealism', motion_adapter=adapter, torch_dtype=torch.float32)
pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing='trailing', beta_schedule='linear')
pipe.enable_vae_slicing()
t1 = time.time()
bilder = pipe(prompt=prompt, negative_prompt='text, watermark, logo, bright, cartoon', guidance_scale=1.0,
              num_inference_steps=schritte, num_frames=16, width=breite, height=hoehe,
              generator=torch.Generator().manual_seed(7)).frames[0]
t2 = time.time()
export_to_video(bilder, ziel, fps=8)
print(json.dumps({'laden_s': round(t1 - t0), 'rechnen_s': round(t2 - t1), 'bilder': len(bilder), 'groesse': f'{breite}x{hoehe}', 'schritte': schritte}))
