#!/usr/bin/env bash
for u in video-feed/ video-feed/videos.json automations-dashboard/; do
  curl -sS -o body -w "$u HTTP %{http_code} %{size_download} Bytes\n" "https://ziyabicilecommerce-hub.github.io/ai-cash-machine/$u?x=$RANDOM"
done
grep -c 'class="num">94' body
curl -sS "https://ziyabicilecommerce-hub.github.io/ai-cash-machine/video-feed/videos.json?x=$RANDOM" | python3 -c "import sys,json;d=json.load(sys.stdin);[print(v['titel']) for v in d['videos']]"
U=$(curl -sS "https://ziyabicilecommerce-hub.github.io/ai-cash-machine/video-feed/videos.json?x=$RANDOM" | python3 -c "import sys,json;print(json.load(sys.stdin)['videos'][0]['url'])")
curl -sSL -o /dev/null -w "video HTTP %{http_code} %{size_download} Bytes %{content_type}\n" "$U"
