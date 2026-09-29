#!/usr/bin/env bash
# KI-Moderatorin (kostenlos, ohne Key): Porträt einer KI-Frau (Pollinations, fester Seed) +
# Stimme (edge-tts) -> Lippensynchron sprechendes Video mit Wav2Lip auf CPU.
#   scripts/moderatorin.sh einrichten                     -> Wav2Lip + Modelle holen (einmal pro Lauf)
#   scripts/moderatorin.sh sprechen AUDIO.mp3 ZIEL.mp4 [BILD]
set -euo pipefail
W2L="${W2L_DIR:-$HOME/wav2lip}"
BILD_STANDARD="${W2L_DIR:-$HOME/wav2lip}/moderatorin.jpg"

hf_datei() { # sucht eine Datei in oeffentlichen Hugging-Face-Modellen und laedt sie
  local name="$1" ziel="$2"
  for repo in $(curl -s "https://huggingface.co/api/models?search=wav2lip&sort=downloads&limit=40" | python3 -c "import sys,json;print(' '.join(m['id'] for m in json.load(sys.stdin)))"); do
    local pfad
    pfad=$(curl -s "https://huggingface.co/api/models/$repo" | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((s['rfilename'] for s in d.get('siblings',[]) if s['rfilename'].endswith('/$name') or s['rfilename']=='$name'),''))" 2>/dev/null || true)
    if [ -n "$pfad" ] && curl -sfL -o "$ziel" "https://huggingface.co/$repo/resolve/main/$pfad" && [ "$(stat -c%s "$ziel")" -gt 1000000 ]; then
      echo "  $name aus $repo"; return 0
    fi
  done
  return 1
}

if [ "${1:-}" = "einrichten" ]; then
  [ -d "$W2L" ] || git clone -q --depth 1 https://github.com/Rudrabha/Wav2Lip "$W2L"
  # Alte librosa-API an neuere Versionen anpassen.
  sed -i 's/librosa.filters.mel(hp.sample_rate, hp.n_fft,/librosa.filters.mel(sr=hp.sample_rate, n_fft=hp.n_fft,/' "$W2L/audio.py"
  mkdir -p "$W2L/checkpoints" "$W2L/face_detection/detection/sfd"
  [ -s "$W2L/checkpoints/wav2lip_gan.pth" ] || hf_datei wav2lip_gan.pth "$W2L/checkpoints/wav2lip_gan.pth"
  [ -s "$W2L/face_detection/detection/sfd/s3fd.pth" ] || curl -sfL -o "$W2L/face_detection/detection/sfd/s3fd.pth" https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth || hf_datei s3fd.pth "$W2L/face_detection/detection/sfd/s3fd.pth"
  if [ ! -s "$BILD_STANDARD" ]; then
    PROMPT="photorealistic portrait of a friendly young woman presenting a product, looking straight into the camera, natural smile, closed mouth, head and shoulders, modern bright studio, soft light, fully clothed, casual sweater, sharp focus, 50mm"
    curl -sfL -o "$BILD_STANDARD" "https://image.pollinations.ai/prompt/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$PROMPT")?width=768&height=1024&nologo=true&seed=${MODERATORIN_SEED:-2468}&model=flux"
  fi
  ls -la "$W2L/checkpoints" "$W2L/face_detection/detection/sfd" "$BILD_STANDARD"
  exit 0
fi

if [ "${1:-}" = "sprechen" ]; then
  audio="$(realpath "$2")"; ziel="$(realpath -m "$3")"; bild="$(realpath "${4:-$BILD_STANDARD}")"
  wav="$(mktemp --suffix=.wav)"
  ffmpeg -loglevel error -y -i "$audio" -ar 16000 -ac 1 "$wav"
  (cd "$W2L" && python3 inference.py --checkpoint_path checkpoints/wav2lip_gan.pth --face "$bild" --audio "$wav" --outfile "$ziel" --static True --pads 0 15 0 0 --resize_factor 1 --nosmooth >/dev/null)
  rm -f "$wav"
  exit 0
fi
echo "Aufruf: $0 einrichten | sprechen AUDIO ZIEL [BILD]"; exit 1
