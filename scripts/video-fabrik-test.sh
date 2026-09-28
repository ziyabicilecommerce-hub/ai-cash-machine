#!/usr/bin/env bash
# Welche kostenlosen Text-Modelle gibt es ohne Key, und wie gut schreiben sie Deutsch?
set -uo pipefail
echo skip; : curl -sS -m 30 https://api.llm7.io/v1/models -H 'Authorization: Bearer unused' | python3 -c "import sys,json;d=json.load(sys.stdin);[print(m.get('id')) for m in d.get('data',d if isinstance(d,list) else [])]" | head -1
echo "== Pollinations Modelle"; curl -sS -m 30 https://text.pollinations.ai/models | python3 -c "import sys,json;d=json.load(sys.stdin);[print(m.get('name'), m.get('tier',''), m.get('description','')[:60]) for m in d]" | head -40
P='Schreibe 2 kurze, fehlerfreie deutsche Werbesaetze fuer einen Massagestab mit texturierten Koepfen. Nur die Saetze.'
for m in mistral-large-3:675b gemini-3-flash gemini-3.1-flash-lite deepseek-v4-flash:0731 deepseek-v4-pro gpt-5.5 glm-5.3 kimi-k2.6 mistral-Small-24B-Instruct-2501 gemma4:31b llama-4-maverick grok-4.5; do
  echo "== LLM7 $m"; curl -sS -m 60 https://api.llm7.io/v1/chat/completions -H 'Authorization: Bearer unused' -H 'content-type: application/json' -d "{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"$P\"}],\"max_tokens\":120}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('model'),'|',(d.get('choices') or [{}])[0].get('message',{}).get('content','')[:220].replace(chr(10),' '), d.get('error',''))"; sleep 2
done

echo "== Pollinations openai-fast"; curl -sS -m 60 https://text.pollinations.ai/openai -H 'content-type: application/json' -d "{\"model\":\"openai-fast\",\"messages\":[{\"role\":\"user\",\"content\":\"$P\"}]}" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('choices') or [{}])[0].get('message',{}).get('content','')[:220].replace(chr(10),' '))"
