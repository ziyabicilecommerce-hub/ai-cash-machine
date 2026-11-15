# Akte-Stil (15.11., Vorlage vom Nutzer: "So ungefähr"): Analog-Horror im Infografik-Look.
# Oben links große Uhrzeit, darunter "NACHT 1" und der Ort; je Szene eine Karte passend zum Satz (akte_karten.py);
# unten ein VHS-Balken. Stimme, Ton, Wackeln, Jumpscare und Wort-Untertitel bleiben von story.py.
import re
from PIL import Image, ImageDraw
import akte_karten as K

ORT_TEXT = {'de': {'strasse': 'LANDSTRASSE · KM 14', 'stadt': 'HOCHHAUS · 11. STOCK', 'hotel': 'HOTEL · ZIMMER 309', 'tankstelle': 'TANKSTELLE · A7', 'see': 'SEE · BOOTSSTEG',
                   'haus': 'WOHNUNG · 3. STOCK', 'zug': 'NACHTZUG · WAGEN 4', 'wald': 'WALD · ZELTPLATZ', 'aufzug': 'HOCHHAUS · AUFZUG B', 'flugzeug': 'FLUG 309 · REIHE 14'},
            'en': {'strasse': 'COUNTRY ROAD · MILE 9', 'stadt': 'TOWER · 11TH FLOOR', 'hotel': 'HOTEL · ROOM 309', 'tankstelle': 'GAS STATION · I-80', 'see': 'LAKE · DOCK',
                   'haus': 'APARTMENT · 3RD FLOOR', 'zug': 'NIGHT TRAIN · CAR 4', 'wald': 'FOREST · CAMPSITE', 'aufzug': 'TOWER · ELEVATOR B', 'flugzeug': 'FLIGHT 309 · ROW 14'}}
RAEUME = [('tür', 'TÜR'), ('fenster', 'FENSTER'), ('keller', 'KELLER'), ('flur', 'FLUR'), ('wand', 'WAND'), ('bett', 'BETT'),
          ('bad', 'BAD'), ('küche', 'KÜCHE'), ('zimmer', 'ZIMMER'), ('door', 'DOOR'), ('window', 'WINDOW'), ('wall', 'WALL'), ('room', 'ROOM')]


def karte_fuer(s, nr, gesamt):
    # welche Karte zeigt diese Szene? Erst Stichwörter im Satz, sonst der Reihe nach, nie zweimal dieselbe hintereinander
    t = (s.get('text') or s.get('sprich') or '').lower()
    if s['art'] in ('handy', 'nachricht') or re.search(r'handy|nachricht|schreibt|chat|app|phone|text|message', t):
        return 'chat'
    if re.search(r'hör|stimme|ruft|klopf|flüster|singt|lacht|durchsage|geräusch|hear|voice|knock|whisper', t):
        return 'ton'
    if any(w in t for w, _ in RAEUME):
        return 'plan'
    if re.search(r'\d', t):
        return 'schild'
    return ['portrait', 'regeln', 'plan', 'ton'][nr % 4]


def einrichten(story, g):
    szenen = story['szenen']
    en = story.get('sprache') == 'en'
    ort = story.get('ort', 'haus')
    # 15.11. (Wunsch: "nicht immer Häuser, andere Orte auch"): Illustration nach Stichwörtern in der Geschichte
    alles = ' '.join(str(s.get('text') or s.get('sprich') or '') for s in szenen).lower()
    for w, o in (('tankstelle', 'tankstelle'), ('raststätte', 'tankstelle'), ('hotel', 'hotel'), ('zimmerservice', 'hotel'), ('auto', 'strasse'), ('fahr', 'strasse'), ('straße', 'strasse'), ('anhalter', 'strasse'), ('taxi', 'strasse'), ('tunnel', 'strasse'),
                 ('tankstelle', 'tankstelle'), ('raststätte', 'tankstelle'), ('hotel', 'hotel'), ('zimmerservice', 'hotel'), ('ferienwohnung', 'hotel'),
                 ('see\\b', 'see'), ('steg\\b', 'see'), ('pilot', 'flugzeug'), ('flug', 'flugzeug'), ('aufzug', 'aufzug'),
                 ('zug\\b', 'zug'), ('nachtbus', 'zug'), ('car ', 'strasse'), ('road', 'strasse'), ('hotel', 'hotel'), ('lake', 'see')):
        if re.search(rf'\b{w}', alles):
            ort = o
            break
    else:
        if ort == 'haus':  # Wohnungs-Geschichten ohne Stichwort: abwechselnd Haus oder Hochhäuser
            ort = 'stadt' if sum(map(ord, story.get('titel', ''))) % 2 else 'haus'
    hook = next((s.get('text') or '' for s in szenen if s['art'] == 'blitz'), '')
    regel = hook.split(',')[-1].strip(' .!').capitalize() if ',' in hook else ('Nicht antworten' if not en else 'Do not answer')
    regeln = [regel[:22], 'Licht aus' if not en else 'Lights off', 'Warten bis 6:12' if not en else 'Wait until 6:12']
    absender = next((s['absender'] for s in szenen if s.get('absender')), 'Mama' if not en else 'Mom')
    nachricht = next((s['nachricht'] for s in szenen if s.get('nachricht')), None)
    monster = next((s['monster'] for s in szenen if s.get('monster')), None)
    chat_text = [nachricht or ('Bist du wach?' if not en else 'Are you awake?'), ('Geh nicht raus.' if not en else 'Do not go out.')]
    vorher, minute = None, 12
    for nr, s in enumerate(szenen):
        k = karte_fuer(s, nr, len(szenen))
        if k == vorher and s['art'] not in ('handy', 'nachricht'):
            k = {'chat': 'ton', 'ton': 'plan', 'plan': 'portrait', 'schild': 'regeln', 'portrait': 'regeln', 'regeln': 'portrait'}[k]
        s['akte'] = 'ort' if s['art'] == 'blitz' else 'warnung' if s['art'] == 'ende' else k
        vorher = s['akte']
        s['akte_zeit'] = f'3:{minute:02d}'
        minute = min(59, minute + 3 + nr * 2)
        tx = (s.get('text') or '').lower()
        s['akte_raum'] = next((n for w, n in RAEUME if w in tx), 'SICHERSTER RAUM' if not en else 'SAFEST ROOM')
        s['akte_zahl'] = (re.findall(r'\d+', tx) or ['3'])[0]
    story['kamera'] = False
    story['uhr'] = False
    story['hell'] = True
    for s in szenen:  # Blitz-Bilder des alten Gesichts im Hook weg - der Schock kommt einmal, im eigenen Stil
        s.pop('blitzbild', None)  # klarer, farbiger Look wie die Vorlage: kein Kino-Filter, keine Rotfärbung, kein Flackern
    alt_bild, alt_fratze = g['bild'], g['fratze']
    kopf = ORT_TEXT['en' if en else 'de'].get(ort, ORT_TEXT['de']['haus'])
    gesamt = [0.0]

    def bild(s, t, lt):
        if s['art'] == 'fratze':  # eigener Schock im Akte-Look statt des alten Comic-Gesichts (passte nicht zum Stil)
            im = Image.new('RGB', (K.W, K.H))
            K.schock(im, lt, en)
            return im
        im = Image.new('RGB', (K.W, K.H), K.GRUND)
        art = s.get('akte', 'ort')
        if s['art'] == 'teil2' and s.get('wahl'):
            K.wahl_karten(im, lt, s['wahl'][0], s['wahl'][1], 'Schreib es in die Kommentare' if not en else 'Tell me in the comments')
        elif s['art'] == 'teil2':
            K.ort_bild(im, ort, t, dunkel=0.5, gestalt=1)
        elif art == 'ort':
            K.ort_bild(im, ort, t, gestalt=0.0)
        elif art == 'warnung':
            K.ort_bild(im, ort, t, dunkel=0.75, gestalt=1)
            K.warnung(im, lt, 'NOTFALLWARNUNG' if not en else 'EMERGENCY ALERT')
        elif art == 'chat':
            K.chat(im, lt, absender, chat_text, notfall=monster or ('Antworte nicht.' if not en else 'Do not reply.'))
        elif art == 'ton':
            K.lautsprecher(im, lt, ('GERÄUSCH · ' if not en else 'SOUND · ') + kopf.split(' · ')[0])
        elif art == 'plan':
            K.bauplan(im, ort, s.get('akte_raum', 'TÜR'), lt)
        elif art == 'schild':
            K.schild(im, s.get('akte_zahl', '3'), kopf.split(' · ')[-1][:12], ('UHR' if not en else 'AM') if s.get('akte_zahl') == '3' else ('NUMMER' if not en else 'NUMBER'))
        elif art == 'regeln':
            K.checkliste(im, regeln, lt)
        else:
            K.portrait(im, lt, 'DU' if not en else 'YOU', angst=0.5 + 0.4 * min(lt / 2, 1))
        if lt < 0.35 and s['art'] != 'blitz':  # Karte federt von unten rein (wie in der Vorlage)
            e = 1 - (1 - lt / 0.35) ** 3
            neu = Image.new('RGB', (K.W, K.H), K.GRUND)
            neu.paste(im, (0, int((1 - e) * 140)))
            im = Image.blend(Image.new('RGB', (K.W, K.H), K.GRUND), neu, 0.35 + 0.65 * e)
        kopfzeile(im, s, t, kopf, en)
        return im

    def kopfzeile(im, s, t, kopf_, en_):
        d = ImageDraw.Draw(im)
        d.text((40, 60), 'NACHT 1' if not en_ else 'NIGHT 1', font=K.f(22, True), fill=K.ROT)
        d.text((40, 86), s.get('akte_zeit', '3:12'), font=K.f(76, True), fill=(236, 238, 244))
        d.text((40 + K.f(76, True).getlength(s.get('akte_zeit', '3:12')) + 8, 132), 'AM', font=K.f(26, True), fill=(236, 238, 244))
        d.text((40, 176), kopf_, font=K.f(20, True), fill=(160, 166, 184))
        d.rectangle((0, K.H - 90, K.W, K.H - 60), fill=(0, 0, 0))
        d.text((30, K.H - 86), '▶ PLAY', font=K.f(20, True), fill=(220, 220, 220))
        sek = int(t)
        d.text((K.W - 30, K.H - 86), f'SP 0:{sek // 60:02d}:{sek % 60:02d}', font=K.f(20, True), fill=(220, 220, 220), anchor='ra')

    g['bild'] = bild
    g['nah'] = lambda im, s, lt: im
