#!/usr/bin/env bash
# Welche kostenlosen Text-Modelle gibt es ohne Key, und wie gut schreiben sie Deutsch?
set -uo pipefail
echo "== LLM7 Modelle"; curl -sS -m 30 https://api.llm7.io/v1/models -H 'Authorization: Bearer unused' | python3 -c "import sys,json;d=json.load(sys.stdin);[print(m.get('id')) for m in d.get('data',d if isinstance(d,list) else [])]" | head -60
echo "== Pollinations Modelle"; curl -sS -m 30 https://text.pollinations.ai/models | python3 -c "import sys,json;d=json.load(sys.stdin);[print(m.get('name'), m.get('tier',''), m.get('description','')[:60]) for m in d]" | head -40
P='Schreibe 2 kurze, fehlerfreie deutsche Werbesaetze fuer einen Massagestab mit texturierten Koepfen. Nur die Saetze.'
for m in default gpt-4.1-nano gpt-4o-mini mistral-small-3.1-24b-instruct-2503 deepseek-v3 qwen2.5-72b-instruct llama-3.3-70b-instruct gemini-2.0-flash; do
  echo "== LLM7 $m"; curl -sS -m 60 https://api.llm7.io/v1/chat/completions -H 'Authorization: Bearer unused' -H 'content-type: application/json' -d "{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"$P\"}],\"max_tokens\":120}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('model'),'|',(d.get('choices') or [{}])[0].get('message',{}).get('content','')[:220].replace(chr(10),' '), d.get('error',''))"; sleep 2
done
