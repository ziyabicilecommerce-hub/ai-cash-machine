#!/usr/bin/env bash
# Machbarkeitstest mit Zeitmessung pro Schritt
set -uo pipefail
t() { date +%s; }
S=$(t); echo "== apt"; timeout 300 sudo apt-get install -y -qq --no-install-recommends ffmpeg fonts-dejavu-core >/dev/null 2>&1 || { timeout 300 sudo apt-get update -qq && timeout 300 sudo apt-get install -y -qq --no-install-recommends ffmpeg fonts-dejavu-core >/dev/null; }
echo "apt: $(( $(t)-S ))s"; ffmpeg -version | head -1
S=$(t); timeout 180 pip install -q "edge-tts==7.*"; echo "pip: $(( $(t)-S ))s"
edge-tts --list-voices | grep -E "^de-DE" | head -20
mkdir -p vt && cd vt
S=$(t)
echo "Dieser Gaming-Stuhl verändert alles. Ergonomisch, bequem und in drei Minuten aufgebaut. Hol ihn dir jetzt bei DeskRebel." > text.txt
for v in de-DE-KatjaNeural de-DE-AmalaNeural de-DE-SeraphinaMultilingualNeural; do timeout 60 edge-tts --voice $v --file text.txt --write-media "$v.mp3" --write-subtitles "$v.srt" && echo "$v ok $(ffprobe -v error -show_entries format=duration -of csv=p=0 $v.mp3)s"; done
echo "tts: $(( $(t)-S ))s"
S=$(t)
for i in 1 2 3; do timeout 100 curl -sS -m 90 -o "b$i.jpg" -w "bild$i %{http_code} %{size_download}B %{time_total}s\n" "https://image.pollinations.ai/prompt/product%20photo%20of%20a%20black%20ergonomic%20gaming%20chair%20studio%20light%20$i?width=1080&height=1920&nologo=true&seed=$RANDOM"; done
echo "bilder: $(( $(t)-S ))s"
S=$(t)
timeout 300 ffmpeg -loglevel error -y -i b1.jpg -i de-DE-SeraphinaMultilingualNeural.mp3 -vf "scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,zoompan=z='min(zoom+0.0009,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=1080x1920:fps=30,subtitles=de-DE-SeraphinaMultilingualNeural.srt:force_style='FontName=DejaVu Sans,FontSize=12,Bold=1,Outline=3,Alignment=2,MarginV=36'" -t 8 -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -shortest szene.mp4
echo "ffmpeg-szene: $(( $(t)-S ))s rc=$?"; ls -la szene.mp4 2>&1
