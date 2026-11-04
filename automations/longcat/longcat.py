"""LongCat-Video (Meituan, MIT-Lizenz) kostenlos nutzen - ohne eigene Grafikkarte.

GitHub-Runner haben keine GPU. Deshalb laufen die Clips auf öffentlichen Hugging-Face-Spaces mit ZeroGPU:
jedes kostenlose HF-Konto bekommt dort jeden Tag etwas GPU-Zeit geschenkt (Secret HF_TOKEN, optional).
Kein Umgehen von Limits, keine Fremdkonten - ist das Tageskontingent leer, kommt einfach kein Clip.

  python3 longcat.py --erkunden                 -> welche LongCat-Spaces laufen, welche Eingaben sie haben
  python3 longcat.py --clip "<prompt>" out.mp4   -> einen Clip erzeugen (erster laufender Space, der klappt)
"""
import json, os, shutil, sys, urllib.parse, urllib.request

TOKEN = os.environ.get('HF_TOKEN') or None
SUCHE = ['LongCat-Video', 'longcat video', 'longcat']


def spaces():
    gefunden = {}
    for q in SUCHE:
        url = 'https://huggingface.co/api/spaces?full=true&limit=50&search=' + urllib.parse.quote(q)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'longcat-erkunder'}), timeout=30) as r:
                for s in json.load(r):
                    gefunden[s['id']] = s
        except Exception as e:
            print(f'[longcat] Suche "{q}": {e}')
    liste = []
    for sid, s in gefunden.items():
        rt = s.get('runtime') or {}
        liste.append({'id': sid, 'stufe': rt.get('stage'), 'hardware': (rt.get('hardware') or {}).get('current'),
                      'sdk': s.get('sdk'), 'likes': s.get('likes', 0)})
    return sorted(liste, key=lambda x: (x['stufe'] != 'RUNNING', -(x['likes'] or 0)))


def endpunkte(sid):
    from gradio_client import Client
    c = Client(sid, hf_token=TOKEN, verbose=False)
    api = c.view_api(return_format='dict', print_info=False) or {}
    return c, api.get('named_endpoints') or {}


def erkunden():
    import urllib.parse  # noqa: F401
    liste = spaces()
    print(f'### LongCat-Spaces: {len(liste)} gefunden')
    for s in liste:
        print(f"- {s['id']} | {s['stufe']} | {s['hardware']} | {s['sdk']} | ♥{s['likes']}")
    for s in [x for x in liste if x['stufe'] == 'RUNNING' and x['sdk'] == 'gradio'][:6]:
        try:
            _, ep = endpunkte(s['id'])
            print(f"\n#### {s['id']}")
            for name, info in ep.items():
                params = [(p.get('parameter_name') or p.get('label'), (p.get('python_type') or {}).get('type'), p.get('parameter_default')) for p in info.get('parameters', [])]
                print(f'  {name}: {params}')
        except Exception as e:
            print(f"  {s['id']}: API nicht lesbar ({str(e)[:160]})")


def clip(prompt, ziel):
    import urllib.parse  # noqa: F401
    for s in [x for x in spaces() if x['stufe'] == 'RUNNING' and x['sdk'] == 'gradio'][:6]:
        try:
            c, ep = endpunkte(s['id'])
        except Exception as e:
            print(f"[longcat] {s['id']}: {str(e)[:120]}"); continue
        # Endpunkt mit Text-Eingabe "prompt" suchen; übrige Parameter auf ihren Standardwerten lassen
        for name, info in ep.items():
            params = info.get('parameters', [])
            namen = [(p.get('parameter_name') or '').lower() for p in params]
            if not any('prompt' in n and 'neg' not in n for n in namen):
                continue
            kwargs = {}
            for p in params:
                n = p.get('parameter_name') or ''
                if 'prompt' in n.lower() and 'neg' not in n.lower():
                    kwargs[n] = prompt
            try:
                print(f"[longcat] {s['id']} {name} ...")
                res = c.predict(api_name=name, **kwargs)
                pfad = res if isinstance(res, str) else next((x for x in (res if isinstance(res, (list, tuple)) else [res]) if isinstance(x, (str, dict))), None)
                if isinstance(pfad, dict):
                    pfad = pfad.get('video') or pfad.get('path') or pfad.get('value')
                if isinstance(pfad, dict):
                    pfad = pfad.get('path')
                if pfad and os.path.exists(pfad):
                    shutil.copy(pfad, ziel)
                    print(f"[longcat] Clip von {s['id']}: {ziel}")
                    return True
                print(f'[longcat] unerwartete Antwort: {str(res)[:200]}')
            except Exception as e:
                print(f"[longcat] {s['id']} {name}: {str(e)[:200]}")
    return False


if __name__ == '__main__':
    import urllib.parse  # noqa: F401
    if sys.argv[1:2] == ['--erkunden']:
        erkunden()
    elif sys.argv[1:2] == ['--clip'] and len(sys.argv) >= 4:
        sys.exit(0 if clip(sys.argv[2], sys.argv[3]) else 3)
    else:
        print(__doc__)
