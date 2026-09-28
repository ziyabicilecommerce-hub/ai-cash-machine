#!/usr/bin/env bash
# Machbarkeitstest: Edge-TTS (ohne Key) + Pollinations-Bilder (ohne Key) + ffmpeg -> 60-s-Video
set -euo pipefail
pip install -q "edge-tts==7.*"
mkdir -p vt && cd vt
T0=$(date +%s)
cat > text.txt <<'TXT'
Willkommen bei DeskRebel. Heute zeigen wir dir, wie du deinen Gaming-Setup in fünf Minuten auf das nächste Level bringst. Erstens: Licht. Eine RGB-Beleuchtung hinter dem Monitor schont die Augen und sieht dabei unfassbar gut aus. Zweitens: Ordnung. Kabelmanagement macht deinen Schreibtisch sofort professioneller. Drittens: Ergonomie. Ein guter Stuhl und die richtige Monitorhöhe schützen deinen Rücken bei langen Sessions. Viertens: Sound. Ein kleines Upgrade beim Headset verändert dein ganzes Spielerlebnis. Und fünftens: Stil. Dein Setup zeigt, wer du bist. Folge uns für mehr Setup-Tipps!
TXT
edge-tts --voice de-DE-ConradNeural --file text.txt --write-media stimme.mp3 --write-subtitles stimme.srt
T1=$(date +%s); echo "TTS: $((T1-T0))s"; ffprobe -v error -show_entries format=duration -of csv=p=0 stimme.mp3
i=0
for p in "anime style gaming desk setup with RGB lights at night" "anime style cable management clean desk" "anime style ergonomic gaming chair" "anime style gamer with headset" "anime style cozy neon room with monitor" "anime style stylish desk accessories"; do
  i=$((i+1)); curl -sS -m 90 -o "b$i.jpg" "https://image.pollinations.ai/prompt/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$p")?width=1080&height=1920&nologo=true&seed=$RANDOM" || true
  file "b$i.jpg" | cut -c1-80
done
T2=$(date +%s); echo "Bilder: $((T2-T1))s"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 stimme.mp3)
N=$(ls b*.jpg | wc -l); SEG=$(python3 -c "print(round($DUR/$N+0.3,2))")
> liste.txt
for f in b*.jpg; do
  ffmpeg -loglevel error -y -loop 1 -i "$f" -vf "scale=1296:2304,zoompan=z='min(zoom+0.0008,1.15)':d=$(python3 -c "print(int($SEG*30))"):s=1080x1920:fps=30,fade=in:0:10" -t "$SEG" -pix_fmt yuv420p -c:v libx264 -preset veryfast "${f%.jpg}.mp4"
  echo "file '${f%.jpg}.mp4'" >> liste.txt
done
ffmpeg -loglevel error -y -f concat -safe 0 -i liste.txt -i stimme.mp3 -vf "subtitles=stimme.srt:force_style='FontSize=14,Alignment=2,MarginV=60,Outline=2'" -c:v libx264 -preset veryfast -c:a aac -shortest -movflags +faststart video.mp4
T3=$(date +%s); echo "Schnitt: $((T3-T2))s"
ffprobe -v error -show_entries format=duration:stream=width,height -of json video.mp4 | tr -d '\n '; echo; ls -la video.mp4
echo "GESAMT: $((T3-T0))s fuer $(printf %.0f $DUR)s Video"
