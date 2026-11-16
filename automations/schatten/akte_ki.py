# Echtes Gruselbild vom Geist für den Akte-Stil (16.11., Nutzer zum gezeichneten Mann: "tot langweilig").
# Zwei kostenlose KI-Fotos je Geschichte (Pollinations, ohne Schlüssel - wie ki.py): Gesicht ganz nah und ganze Gestalt im Flur.
# Sie ersetzen die Zeichnung dort, wo sie im Analog-Horror Sinn ergeben: Türspion, Überwachungskamera, Beweisfoto, Schock.
# Klappt der Abruf nicht (Tempolimit, kein Netz), bleibt die Zeichnung aus akte_geist.py - das Video wird immer fertig.
import os, time, urllib.parse, urllib.request
from io import BytesIO
from PIL import Image

STIL = 'grainy found footage photo, 1980s, flash photography at night, analog horror, realistic, unsettling, no text, no watermark'
MOTIVE = {
    'nah': 'extreme close up of a gaunt pale man with an unnaturally wide grin full of teeth, hollow pitch black eyes, black liquid '
           'running from the eyes, head tilted at a wrong angle, old top hat, staring straight into the camera, pitch dark background',
    'ganz': 'a very tall thin pale man in a long dark coat and top hat standing at the end of a dark apartment hallway at night, '
            'unnaturally long arms and fingers, wide grin, hollow black eyes, head tilted, staring at the camera',
}


def laden(seed=7, versuche=3):
    if os.environ.get('STUMM') == '1' or os.environ.get('AKTE_KI') == 'aus':
        return {}
    bilder = {}
    for name, motiv in MOTIVE.items():
        url = 'https://image.pollinations.ai/prompt/' + urllib.parse.quote(f'{motiv}, {STIL}') + '?' + urllib.parse.urlencode(
            {'width': 720, 'height': 1280, 'model': 'flux', 'nologo': 'true', 'seed': seed})
        for v in range(versuche):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=150) as r:
                    if not r.headers.get_content_type().startswith('image/'):
                        raise ValueError(r.headers.get_content_type())
                    bilder[name] = Image.open(BytesIO(r.read())).convert('RGB').resize((720, 1280))
                    print(f'Akte-KI {name} ok')
                    break
            except Exception as e:
                print(f'Akte-KI {name} Versuch {v + 1}: {e}')
                time.sleep(20)
        time.sleep(5)
    return bilder
