"""Tag 1/100: baut Einzelbilder (1080x1920) und rendert daraus mit ffmpeg ein Video."""
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = os.path.dirname(os.path.abspath(__file__))
REPO = '/home/user/ai-cash-machine'
W, H = 1080, 1920
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
GOLD, RED, WHITE, BG = (255, 196, 61), (255, 70, 70), (255, 255, 255), (8, 9, 14)

def font(p, s): return ImageFont.truetype(p, s)

def text_center(d, y, txt, size, color, stroke=8):
    f = font(BOLD, size)
    w = d.textlength(txt, font=f)
    d.text(((W - w) / 2, y), txt, font=f, fill=color, stroke_width=stroke, stroke_fill=(0, 0, 0))

def card(lines, name):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    total = sum(s for _, s, _ in lines) + 40 * (len(lines) - 1)
    y = (H - total) / 2
    for txt, size, col in lines:
        text_center(d, y, txt, size, col, stroke=0)
        y += size + 40
    im.save(f'{S}/f_{name}.png')

def shot(src, caption, name, sub=None):
    im = Image.open(src).convert('RGB').resize((W, H))
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle([0, 1180, W, 1620], fill=(0, 0, 0, 175))
    text_center(d, 1250, caption, 74, WHITE)
    if sub: text_center(d, 1370, sub, 58, GOLD, stroke=6)
    im.save(f'{S}/f_{name}.png')

def terminal():
    files = sorted(os.listdir(f'{REPO}/automations'))
    files = [f for f in files if f.endswith('.mjs')]
    im = Image.new('RGB', (W, H * 3), (12, 14, 20))
    d = ImageDraw.Draw(im)
    f = font(MONO, 34)
    d.text((40, 40), '$ ls automations/', font=f, fill=(120, 220, 140))
    for i, n in enumerate(files):
        d.text((40, 110 + i * 46), n, font=f, fill=(210, 214, 222))
    im.save(f'{S}/term.png')
    return len(files)

n = terminal()
card([(f'{n} KI-BOTS.', 130, WHITE), ('0 € VERDIENT.', 130, RED)], 'hook')
card([('TAG 1', 170, GOLD), ('VON 100', 110, WHITE), ('Ab heute ändert', 70, WHITE), ('sich das.', 70, WHITE)], 'ende')
shot(f'{S}/s0.png', 'Mein Kontrollzentrum.', 'kontrolle', 'Läuft 24/7. Ohne mich.')
shot(f'{S}/s1.png', 'Bots, die TikToks', 'tiktok', 'selbst testen.')
shot(f'{S}/s2.png', 'Bots, die nachts', 'reselling', 'Deals finden.')
shot(f'{S}/s3.png', 'Und auf dem Konto?', 'mission', '0,00 €')

FPS = 30
def seg(img, dur, out, zoom=True):
    frames = int(dur * FPS)
    vf = (f"scale=1188:2112,zoompan=z='min(zoom+0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
          if zoom else f"scale={W}:{H},fps={FPS}")
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', img, '-t', str(dur), '-vf', vf,
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(FPS), out], check=True)

def scroll_seg(out, dur=3.2):
    # Terminal-Liste scrollt schnell durch, mit Zähler-Overlay
    th = Image.open(f'{S}/term.png').height
    vf = (f"crop={W}:{H}:0:'min(t/{dur}*({th}-{H}),{th}-{H})',"
          f"drawbox=x=0:y=1180:w={W}:h=320:color=black@0.7:t=fill,"
          f"drawtext=fontfile={BOLD}:text='{n} Automations':fontcolor=white:fontsize=92:x=(w-text_w)/2:y=1230:borderw=6:bordercolor=black,"
          f"drawtext=fontfile={BOLD}:text='alle selbst gebaut':fontcolor=0xFFC43D:fontsize=60:x=(w-text_w)/2:y=1360:borderw=5:bordercolor=black,fps={FPS}")
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', f'{S}/term.png', '-t', str(dur), '-vf', vf,
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out], check=True)

parts = []
def add(fn, *a):
    out = f'{S}/p{len(parts)}.mp4'; fn(*a, out) if fn is scroll_seg else fn(*a, out); parts.append(out)

seg(f'{S}/f_hook.png', 2.6, f'{S}/p0.mp4', zoom=False); parts.append(f'{S}/p0.mp4')
scroll_seg(f'{S}/p1.mp4'); parts.append(f'{S}/p1.mp4')
for i, nm in enumerate(['kontrolle', 'tiktok', 'reselling', 'mission']):
    out = f'{S}/p{i + 2}.mp4'; seg(f'{S}/f_{nm}.png', 2.6, out); parts.append(out)
seg(f'{S}/f_ende.png', 3.0, f'{S}/p6.mp4', zoom=False); parts.append(f'{S}/p6.mp4')

with open(f'{S}/liste.txt', 'w') as fh:
    fh.writelines(f"file '{p}'\n" for p in parts)
final = sys.argv[1] if len(sys.argv) > 1 else f'{S}/tag-01.mp4'
# stille Tonspur, damit Plattformen das Video sicher annehmen
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', f'{S}/liste.txt',
                '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart', final], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '1', '-i', final, '-frames:v', '1', f'{S}/cover.jpg'], check=True)
print('fertig', final)
