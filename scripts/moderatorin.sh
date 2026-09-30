#!/usr/bin/env bash
# KI-Moderatorin (kostenlos, ohne Key): Porträt einer KI-Frau (Pollinations, fester Seed) +
# Stimme (edge-tts) -> Lippensynchron sprechendes Video mit Wav2Lip auf CPU.
#   scripts/moderatorin.sh einrichten                     -> Wav2Lip + Modelle holen (einmal pro Lauf)
#   scripts/moderatorin.sh sprechen AUDIO.mp3 ZIEL.mp4 [NR 1-6 | BILD]
set -euo pipefail
W2L="${W2L_DIR:-$HOME/wav2lip}"
BILD_STANDARD="$W2L/moderatorin-1.jpg"

# Sechs feste KI-Moderatorinnen (je eigener Seed = immer dieselbe Person), abwechselnd eingesetzt.
BASIS="photorealistic portrait, looking straight into the camera, friendly natural smile, closed mouth, head and shoulders, fully clothed, sharp focus, 50mm, soft light"
MODERATORINNEN=(
  "young woman with long dark hair, cozy light grey sweater, bright modern living room|2468"
  "young woman with blonde wavy hair, white blouse, sunny minimalist kitchen|1357"
  "young black woman with curly afro hair, mustard yellow turtleneck, creative studio with plants|9753"
  "young woman with short red bob haircut, denim jacket, urban loft with brick wall|8642"
  "young south asian woman with long braided hair, emerald green top, elegant boutique background|5173"
  "sporty young woman with brown ponytail, black athletic zip jacket, modern gym background|3690"
)

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
  for i in "${!MODERATORINNEN[@]}"; do
    bild="$W2L/moderatorin-$((i + 1)).jpg"
    [ -s "$bild" ] && continue
    beschreibung="${MODERATORINNEN[$i]%%|*}"; seed="${MODERATORINNEN[$i]##*|}"
    roh="$(mktemp --suffix=.jpg)"
    # Die Gratis-Bild-KI bremst schnelle Anfragen - daher Pausen und bis zu 5 Versuche.
    for versuch in 1 2 3 4 5; do
      if curl -sfL -m 150 -o "$roh" "https://image.pollinations.ai/prompt/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$beschreibung, $BASIS")?width=768&height=1024&nologo=true&seed=$seed&model=flux" && [ "$(stat -c%s "$roh")" -gt 20000 ]; then break; fi
      echo "  Moderatorin $((i + 1)): Versuch $versuch fehlgeschlagen, warte"; sleep $((versuch * 20))
    done
    # Unten den Rand abschneiden (dort sitzt sonst das kleine Pollinations-Logo).
    ffmpeg -loglevel error -y -i "$roh" -vf "crop=iw:ih*0.92:0:0" -q:v 2 "$bild" || echo "  Moderatorin $((i + 1)) nicht verfuegbar"
    rm -f "$roh"; sleep 8
  done
  ls -la "$W2L/checkpoints" "$W2L/face_detection/detection/sfd" "$W2L"/moderatorin-*.jpg || true
  exit 0
fi

if [ "${1:-}" = "sprechen" ]; then
  audio="$(realpath "$2")"; ziel="$(realpath -m "$3")"; wahl="${4:-1}"
  if [[ "$wahl" =~ ^[1-6]$ ]]; then bild="$W2L/moderatorin-$wahl.jpg"; else bild="$(realpath "$wahl")"; fi
  # Fehlt ein Portraet (Download gescheitert), spricht die erste verfuegbare Moderatorin.
  [ -s "$bild" ] || bild="$(ls "$W2L"/moderatorin-*.jpg 2>/dev/null | head -1)"
  [ -s "$bild" ] || { echo "Keine Moderatorin verfuegbar"; exit 1; }
  wav="$(mktemp --suffix=.wav)"
  ffmpeg -loglevel error -y -i "$audio" -ar 16000 -ac 1 "$wav"
  (cd "$W2L" && python3 inference.py --checkpoint_path checkpoints/wav2lip_gan.pth --face "$bild" --audio "$wav" --outfile "$ziel" --static True --pads 0 15 0 0 --resize_factor 1 --nosmooth >/dev/null)
  rm -f "$wav"
  exit 0
fi
echo "Aufruf: $0 einrichten | sprechen AUDIO ZIEL [BILD]"; exit 1
