"""Eigener Clip vorne dran (26.11.): setzt einen kurzen Clip des Nutzers (Gesicht/Stimme) vor ein fertiges Video.

  python3 automations/lib/intro_vorne.py <video.mp4> <schluessel> [<schluessel2> ...]

Sucht docs/intro/<schluessel>.mp4 (oder .mov), z. B. docs/intro/futureflowx3.mp4 oder docs/intro/6ae8f39a....mp4.
Gibt es keinen Clip, passiert nichts (Exit 0) - die Bots laufen dann wie bisher.
Der Clip wird auf das Format des Videos zugeschnitten und auf höchstens 3,5 s gekürzt; das Video wird ersetzt.
"""
import json, os, subprocess, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ORDNER = os.path.join(REPO, 'docs', 'intro')
MAX_SEK = 3.5
# Buffer-Kanal-IDs -> Kontoname (der Verteiler kennt nur die IDs)
NAMEN = {'6ac7cb606a5c39ccb6535fab': 'futureflowx3', '6ac7cae66a5c39ccb6535c40': 'zyx_7851',
         '6ac7ca226a5c39ccb65356a5': 'futureflowxx', '6ae8f441e29c69a1713e44f3': 'desk.rebel',
         '6ae8f3dbe29c69a1713e416a': 'purivelle.785', '6ae8f39ae29c69a1713e3f33': 'giyuuu-sama'}


def clip_fuer(schluessel):
    schluessel = [x for s in schluessel for x in (s, NAMEN.get(str(s), ''))]
    for s in schluessel:
        name = str(s).strip().lstrip('@').replace(' ', '-')
        for ext in ('.mp4', '.mov', '.MP4', '.MOV'):
            pfad = os.path.join(ORDNER, name + ext)
            if name and os.path.exists(pfad):
                return pfad
    return None


def dauer(datei):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', datei],
                         capture_output=True, text=True).stdout.strip()
    return float(out or 0)


def info(datei):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate',
                          '-of', 'json', datei], capture_output=True, text=True).stdout
    streams = json.loads(out or '{}').get('streams', [])
    v = next((s for s in streams if s.get('codec_type') == 'video'), {})
    hat_ton = any(s.get('codec_type') == 'audio' for s in streams)
    zaehler, _, nenner = str(v.get('r_frame_rate', '30/1')).partition('/')
    fps = round(float(zaehler) / float(nenner or 1)) if zaehler else 30
    return int(v.get('width', 1080)), int(v.get('height', 1920)), fps or 30, hat_ton


def main(video, schluessel):
    clip = clip_fuer(schluessel)
    if not clip or not os.path.exists(video):
        print('Kein eigener Clip für', ', '.join(schluessel), '- Video bleibt unverändert.')
        return
    w, h, fps, video_ton = info(video)
    _, _, _, clip_ton = info(clip)
    # Beide Teile auf gleiches Format bringen; fehlender Ton wird durch Stille ersetzt, damit concat klappt
    a_clip = '[0:a]' if clip_ton else '[stc]'
    a_vid = '[1:a]' if video_ton else '[stv]'
    stille = ''
    if not clip_ton:
        stille += f'anullsrc=r=44100:cl=stereo,atrim=0:{MAX_SEK}[stc];'
    if not video_ton:
        stille += f'anullsrc=r=44100:cl=stereo,atrim=0:{dauer(video):.2f}[stv];'
    filt = (stille +
            f'[0:v]trim=0:{MAX_SEK},setpts=PTS-STARTPTS,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps},setsar=1[v0];'
            f'{a_clip}atrim=0:{MAX_SEK},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo[a0];'
            f'[1:v]fps={fps},setsar=1[v1];'
            f'{a_vid}aresample=44100,aformat=channel_layouts=stereo[a1];'
            '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]')
    ziel = video + '.mit-intro.mp4'
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', clip, '-i', video, '-filter_complex', filt,
           '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart']
    subprocess.run(cmd + [ziel], check=True)
    os.replace(ziel, video)
    print('Eigener Clip vorne dran:', os.path.basename(clip))


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit('Aufruf: intro_vorne.py <video.mp4> <schluessel> [...]')
    try:
        main(sys.argv[1], sys.argv[2:])
    except Exception as e:  # nie den Bot stoppen - dann eben ohne Clip
        print('Clip konnte nicht vorgesetzt werden:', str(e)[:200])
