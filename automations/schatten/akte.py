# Akte-Stil (15.11., Vorlage vom Nutzer: "So ungefähr"): Analog-Horror im Infografik-Look.
# Oben links große Uhrzeit, darunter "NACHT 1" und der Ort; je Szene eine Karte passend zum Satz (akte_karten.py);
# unten ein VHS-Balken. Stimme, Ton, Wackeln, Jumpscare und Wort-Untertitel bleiben von story.py.
import re
from PIL import Image, ImageDraw
import akte_karten as K

ORT_TEXT = {'de': {'wohnblock': 'WOHNBLOCK · 4. STOCK', 'flur': 'TREPPENHAUS · TÜR 3B', 'schlafzimmer': 'SCHLAFZIMMER · 3:12',
                   'strasse': 'LANDSTRASSE · KM 14', 'stadt': 'HOCHHAUS · 11. STOCK', 'hotel': 'HOTEL · ZIMMER 309', 'tankstelle': 'TANKSTELLE · A7', 'see': 'SEE · BOOTSSTEG',
                   'haus': 'HAUS AM WALDRAND', 'zug': 'NACHTZUG · WAGEN 4', 'wald': 'WALD · ZELTPLATZ', 'aufzug': 'HOCHHAUS · AUFZUG B', 'flugzeug': 'FLUG 309 · REIHE 14'},
            'en': {'wohnblock': 'APARTMENT BLOCK · 4TH FLOOR', 'flur': 'STAIRWELL · DOOR 3B', 'schlafzimmer': 'BEDROOM · 3:12 AM',
                   'strasse': 'COUNTRY ROAD · MILE 9', 'stadt': 'TOWER · 11TH FLOOR', 'hotel': 'HOTEL · ROOM 309', 'tankstelle': 'GAS STATION · I-80', 'see': 'LAKE · DOCK',
                   'haus': 'HOUSE BY THE WOODS', 'zug': 'NIGHT TRAIN · CAR 4', 'wald': 'FOREST · CAMPSITE', 'aufzug': 'TOWER · ELEVATOR B', 'flugzeug': 'FLIGHT 309 · ROW 14'}}
RAEUME = [('tür', 'TÜR'), ('fenster', 'FENSTER'), ('keller', 'KELLER'), ('flur', 'FLUR'), ('wand', 'WAND'), ('bett', 'BETT'),
          ('bad', 'BAD'), ('küche', 'KÜCHE'), ('zimmer', 'ZIMMER'), ('door', 'DOOR'), ('window', 'WINDOW'), ('wall', 'WALL'), ('room', 'ROOM')]


REGELN_DE = {
    'haus': ['Tür abschließen', 'Nicht durch den Spion', 'Handy auf lautlos', 'Licht anlassen', 'Unter der Decke bleiben', 'Keinem antworten'],
    'strasse': ['Nicht anhalten', 'Türen verriegeln', 'Nicht in den Spiegel', 'Fahren bis zum Licht', 'Fenster zu lassen'],
    'wald': ['Zelt zu lassen', 'Kein Feuer machen', 'Nicht antworten', 'Taschenlampe aus', 'Bis zum Morgen warten'],
    'reise': ['Nicht aussteigen', 'Keinem öffnen', 'Nicht umdrehen', 'Sitzen bleiben', 'Nicht einschlafen']}
REGELN_EN = {
    'haus': ['Lock the door', 'Do not use the peephole', 'Phone on silent', 'Keep the lights on', 'Stay under the blanket', 'Do not answer'],
    'strasse': ['Do not stop', 'Lock the doors', 'Do not check the mirror', 'Drive to the light', 'Keep windows shut'],
    'wald': ['Keep the tent shut', 'No fire', 'Do not answer', 'Flashlight off', 'Wait for sunrise'],
    'reise': ['Do not get off', 'Do not open', 'Do not turn around', 'Stay seated', 'Do not fall asleep']}
for _r in (REGELN_DE, REGELN_EN):
    for _o in ('wohnblock', 'flur', 'schlafzimmer', 'stadt'):
        _r[_o] = _r['haus']
    _r['tankstelle'] = _r['strasse']; _r['see'] = _r['wald']
    for _o in ('hotel', 'aufzug', 'zug', 'flugzeug'):
        _r[_o] = _r['reise']


# 16.11. (Wunsch: "änder alles bei jedem Video, hauptsächlich geil"): jede Geschichte bekommt ihre eigene Farbwelt
THEMEN = [  # Hintergrund, Farbe des gesprochenen Worts, Farbstich über dem ganzen Bild
    {'grund': (22, 26, 38), 'akzent': (255, 212, 0), 'stich': None},          # Mitternacht
    {'grund': (34, 12, 16), 'akzent': (255, 86, 86), 'stich': (130, 10, 20)},  # Blutmond
    {'grund': (8, 24, 14), 'akzent': (150, 255, 120), 'stich': (20, 130, 40)},  # Nachtsicht
    {'grund': (26, 14, 40), 'akzent': (210, 150, 255), 'stich': (90, 30, 150)},  # Gift
    {'grund': (30, 24, 18), 'akzent': (255, 170, 60), 'stich': (130, 80, 30)},  # VHS
    {'grund': (12, 24, 36), 'akzent': (120, 220, 255), 'stich': (20, 90, 140)},  # Eis
]


def karte_fuer(s, nr, gesamt):
    # welche Karte zeigt diese Szene? Erst Stichwörter im Satz, sonst der Reihe nach, nie zweimal dieselbe hintereinander
    t = (s.get('text') or s.get('sprich') or '').lower()
    if s['art'] in ('handy', 'nachricht') or re.search(r'handy|nachricht|schreibt|chat|app|phone|text|message', t):
        return 'chat'
    if re.search(r'hör|stimme|ruft|klopf|flüster|singt|lacht|durchsage|geräusch|hear|voice|knock|whisper', t):
        return 'ton'
    if re.search(r'tür|klopf|klingel|spion|door|knock', t):
        return 'spion'
    if any(w in t for w, _ in RAEUME):
        return 'kamera'
    if re.search(r'\d', t):
        return 'schild'
    return None  # kein Stichwort: einrichten() nimmt die nächste Karte aus der gemischten Reihe dieses Videos


# Stichwort -> Ort; die genaueren zuerst (Tankstelle vor Auto, Auto vor Tür)
ORT_WOERTER = [('tankstelle', 'tankstelle'), ('raststätte', 'tankstelle'), ('hotel', 'hotel'), ('zimmerservice', 'hotel'), ('ferienwohnung', 'hotel'),
               ('auto', 'strasse'), ('fahr', 'strasse'), ('straße', 'strasse'), ('anhalter', 'strasse'), ('taxi', 'strasse'), ('tunnel', 'strasse'),
               ('car\\b', 'strasse'), ('road', 'strasse'), ('pilot', 'flugzeug'), ('flug', 'flugzeug'), ('aufzug', 'aufzug'), ('elevator', 'aufzug'),
               ('zug\\b', 'zug'), ('nachtbus', 'zug'), ('train', 'zug'), ('see\\b', 'see'), ('steg\\b', 'see'), ('lake', 'see'),
               ('zelt', 'wald'), ('tent', 'wald'), ('wald', 'wald'), ('forest', 'wald'),
               ('nebenan', 'wohnblock'), ('nachbar', 'wohnblock'), ('wand\\b', 'wohnblock'), ('neighbor', 'wohnblock'), ('wall\\b', 'wohnblock'),
               ('treppenhaus', 'flur'), ('flur', 'flur'), ('hallway', 'flur'), ('bett', 'schlafzimmer'), ('schrank', 'schlafzimmer'),
               ('schlaf', 'schlafzimmer'), ('kinderzimmer', 'schlafzimmer'), ('bed\\b', 'schlafzimmer'), ('closet', 'schlafzimmer'),
               ('tür', 'flur'), ('door', 'flur')]


def ort_von(text, zuletzt=False):
    # zuletzt=True: der Ort, der im Satz als letzter genannt wird ("nicht mehr an der Wand, sondern an meiner Tür" -> Tür)
    treffer = [(m.start(), o) for w, o in ORT_WOERTER for m in [re.search(rf'\b{w}', text)] if m]
    if not treffer:
        return None
    return max(treffer)[1] if zuletzt else next(o for w, o in ORT_WOERTER if re.search(rf'\b{w}', text))


def einrichten(story, g):
    szenen = story['szenen']
    en = story.get('sprache') == 'en'
    ort = story.get('ort', 'haus')
    # 15.11. (Wunsch: "nicht immer Häuser, andere Orte auch"): Illustration nach Stichwörtern in der Geschichte
    alles = ' '.join(str(s.get('text') or s.get('sprich') or '') for s in szenen).lower()
    gefunden = ort_von(alles)
    if gefunden:
        ort = gefunden
    elif ort == 'haus':  # Wohnungs-Geschichten ohne Stichwort: Hochhäuser, Haus am Waldrand oder Wohnblock
        ort = ['stadt', 'haus', 'wohnblock'][sum(map(ord, story.get('titel', ''))) % 3]
    for s in szenen:  # die Schluss-Szene darf woanders spielen, wenn ihr Satz es sagt ("...an meiner Tür" -> Hausflur)
        s['akte_ort'] = (ort_von(str(s.get('text') or '').lower(), zuletzt=True) or ort) if s['art'] in ('ende', 'teil2') else ort
    hook = next((s.get('text') or '' for s in szenen if s['art'] == 'blitz'), '')
    regel = hook.split(',')[-1].strip(' .!').capitalize() if ',' in hook else ('Nicht antworten' if not en else 'Do not answer')
    # 16.11. (Nutzer: "bei jedem Video ist das"): Regeln je Geschichte verschieden - Regel aus dem Hook + zwei passende zum Ort
    zahl = sum(map(ord, story.get('titel', '')))
    pool = (REGELN_EN if en else REGELN_DE).get(ort, (REGELN_EN if en else REGELN_DE)['haus'])
    regeln = [regel[:22]] + [pool[(zahl + i * 3) % len(pool)] for i in (1, 2)]
    if len(set(regeln)) < 3:
        regeln = list(dict.fromkeys(regeln + pool))[:3]
    reihe = ['ort_nah', 'kamera', 'portrait', 'spion', 'ton', 'schild', 'regeln']
    reihe = reihe[zahl % len(reihe):] + reihe[:zahl % len(reihe)]  # jede Geschichte mischt die Karten anders
    if ',' not in hook:  # Checkliste nur bei echten Regel-Hooks
        reihe.remove('regeln')
    absender = next((s['absender'] for s in szenen if s.get('absender')), 'Mama' if not en else 'Mom')
    nachricht = next((s['nachricht'] for s in szenen if s.get('nachricht')), None)
    monster = next((s['monster'] for s in szenen if s.get('monster')), None)
    chat_text = [nachricht or ('Bist du wach?' if not en else 'Are you awake?'), ('Geh nicht raus.' if not en else 'Do not go out.')]
    vorher, minute, benutzt = None, 7 + zahl % 20, set()
    thema = THEMEN[(zahl * 7) % len(THEMEN)]
    K.GRUND = thema['grund']
    import effekte
    effekte.GELB = thema['akzent']
    nacht = 1 + zahl % 6
    import akte_geist
    import akte_ki
    K.KI.clear()
    K.KI.update(akte_ki.laden(seed=zahl % 100000))  # echte Gruselbilder; ohne Netz bleibt die Zeichnung
    akte_geist.ART[0] = 'mann'  # 16.11. (Nutzer: "mach einen Horror-Mann, die sieht langweilig aus"): der Geist ist immer der Mann im Mantel
    # 16.11. (Nutzer: "mach wie ein Bericht - früher ist es passiert, wurde dokumentiert, dann wurde der Vorfall gestrichen,
    # ich habe davon gelesen und bin selbst hingefahren"): nach dem Hook drei Szenen - Polizeibericht von damals,
    # derselbe Bericht geschwärzt (FALL GESTRICHEN), "also bin ich selbst hingefahren" - dann passiert es ihm.
    # 16.11. (Nutzer: "die Geschichte ergibt keinen Sinn"): der Bericht kommt nur noch aus der Geschichte selbst (skriptAkte.mjs:
    # Jahr, Schlagzeile, was damals passierte, warum gestrichen, warum er hingeht). Geschichten ohne eigene Akte bekommen keinen
    # zusammengesetzten Bericht mehr - sie laufen ohne, damit nichts widersprüchlich wird.
    akte_d = story.get('akte') or {}
    jahr = int(akte_d.get('jahr', 1971 + zahl % 29))
    if akte_d and not any(x.get('akte') == 'bericht' for x in szenen):
        neu = [
            {'art': 'innen', 'akte': 'bericht', 'sprich': ((f'File {int(story["fall_nr"])}. ' if en else f'Akte {int(story["fall_nr"])}. ') if story.get('fall_nr') else '') + (f'There is a police report from {jahr}. ' if en else f'Es gibt einen Polizeibericht von {jahr}. ') + akte_d['satz'],
             'kopf': akte_d['kopf'], 'jahr': jahr},
            {'art': 'innen', 'akte': 'gestrichen', 'sprich': akte_d['gestrichen'], 'kopf': akte_d['kopf'], 'jahr': jahr},
            {'art': 'innen', 'akte': 'ort', 'sprich': akte_d['hin']},
        ]
        for x in neu:
            x.update({'text': x['sprich'].upper(), 'gelb': str(jahr), 'pause': 0.25, 'pov_text': ''})
        start = next((i + 1 for i, x in enumerate(szenen) if x['art'] == 'blitz'), 0)
        szenen[start:start] = neu
    story['stimme'] = 'en-US-GuyNeural' if en else 'de-DE-ConradNeural'  # "mach ein Mann": immer ein Mann erzählt
    # 16.11. Akte-Universum: feste Fallnummer je Geschichte (skriptAkte.mjs fall_nr) - Zuschauer erkennen die Serie wieder
    fall = int(story.get('fall_nr') or 100 + zahl % 900)
    for i, sz in enumerate([x for x in szenen if x['art'] not in ('blitz', 'fratze', 'teil2', 'ende')]):
        sz['akte_nr'] = i + 1

    def alt_ort(o, t, gestalt=0.0):
        im2 = Image.new('RGB', (K.W, K.H), K.GRUND)
        K.ort_bild(im2, o, t, gestalt=gestalt)
        return im2

    def stempel(im, text, farbe):
        # schräger Stempel unten rechts auf Beweis-Karten
        lage = Image.new('RGBA', (360, 110), (0, 0, 0, 0))
        dd = ImageDraw.Draw(lage)
        dd.rounded_rectangle((6, 6, 354, 104), 12, outline=farbe + (210,), width=6)
        dd.text((180, 55), text, font=K.f(40, True), fill=farbe + (220,), anchor='mm')
        lage = lage.rotate(-9, expand=True, resample=Image.BICUBIC)
        im.paste(lage, (K.W - lage.width - 30, 1000), lage)
    schock_art = (zahl // 3) % 3
    for nr, s in enumerate(szenen):
        if s.get('akte') in ('zeitung', 'bericht', 'gestrichen', 'ort'):  # Bericht-Szenen behalten ihre Karte
            s['akte_zeit'] = f'3:{minute:02d}'
            vorher = s['akte']
            continue
        k = karte_fuer(s, nr, len(szenen))
        if k is None or k == vorher or (k in benutzt and k != 'chat'):  # jede Karte höchstens einmal pro Video
            k = next((x for x in reihe if x != vorher and x not in benutzt), reihe[nr % len(reihe)])
        benutzt.add(k)
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
            K.schock(im, lt, en, schock_art)
            return im
        im = Image.new('RGB', (K.W, K.H), K.GRUND)
        art = s.get('akte', 'ort')
        if s['art'] == 'teil2' and s.get('wahl'):
            K.wahl_karten(im, lt, s['wahl'][0], s['wahl'][1], 'Schreib es in die Kommentare' if not en else 'Tell me in the comments')
        elif s['art'] == 'teil2':
            K.ort_bild(im, s.get('akte_ort', ort), t, dunkel=0.35, gestalt=1)
        elif art == 'ort':  # Hook: die Gestalt ist schon schwach zu sehen - wer sie entdeckt, schaut weiter
            K.ort_bild(im, ort, t, gestalt=1)
            im = Image.blend(im, alt_ort(ort, t), 0.55)
        elif art == 'warnung':
            K.ort_bild(im, s.get('akte_ort', ort), t, dunkel=0.45, gestalt=1)
            K.warnung(im, lt, 'NOTFALLWARNUNG' if not en else 'EMERGENCY ALERT')
            if story.get('fall_nr'):  # Serien-Haken: die nächste Akte kommt morgen
                ImageDraw.Draw(im).text((K.W // 2, K.H - 150), 'NEXT FILE: TOMORROW' if en else 'NÄCHSTE AKTE: MORGEN',
                                        font=K.f(34, True), fill=thema['akzent'], anchor='mm')
        elif art == 'chat':
            K.chat(im, lt, absender, chat_text, notfall=monster or ('Antworte nicht.' if not en else 'Do not reply.'))
        elif art == 'ton':
            K.lautsprecher(im, lt, ('GERÄUSCH · ' if not en else 'SOUND · ') + kopf.split(' · ')[0])
        elif art in ('bericht', 'gestrichen'):
            K.bericht(im, s.get('kopf', ''), s.get('jahr', 1987), fall, lt, art == 'gestrichen', en)
        elif art == 'zeitung':
            K.zeitung(im, s.get('zeitung_kopf', ''), s.get('jahr', 1987), lt, en)
        elif art == 'spion':
            K.spion(im, t, lt)
        elif art in ('kamera', 'plan'):
            K.kamera(im, t, lt, ort)
        elif art == 'schild':
            K.schild(im, s.get('akte_zahl', '3'), kopf.split(' · ')[-1][:12], ('UHR' if not en else 'AM') if s.get('akte_zahl') == '3' else ('NUMMER' if not en else 'NUMBER'))
        elif art == 'ort_nah':  # der Ort, die Gestalt taucht langsam auf
            K.ort_bild(im, ort, t, dunkel=0.2, gestalt=1)
            im = Image.blend(alt_ort(ort, t, 0.2), im, min(1.0, lt / 1.5))
        elif art == 'regeln':
            K.checkliste(im, regeln, lt)
        else:
            K.portrait(im, lt, 'DU' if not en else 'YOU', angst=0.5 + 0.4 * min(lt / 2, 1))
        if lt < 0.35 and s['art'] != 'blitz':  # Karte federt von unten rein (wie in der Vorlage)
            e = 1 - (1 - lt / 0.35) ** 3
            neu = Image.new('RGB', (K.W, K.H), K.GRUND)
            neu.paste(im, (0, int((1 - e) * 140)))
            im = Image.blend(Image.new('RGB', (K.W, K.H), K.GRUND), neu, 0.35 + 0.65 * e)
        if thema['stich']:  # Farbwelt dieser Geschichte über das ganze Bild
            im = Image.blend(im, Image.new('RGB', (K.W, K.H), thema['stich']), 0.13)
        kopfzeile(im, s, t, kopf, en)
        return im

    def kopfzeile(im, s, t, kopf_, en_):
        d = ImageDraw.Draw(im)
        d.text((40, 60), f'NACHT {nacht}' if not en_ else f'NIGHT {nacht}', font=K.f(22, True), fill=thema['akzent'])
        d.text((40, 86), s.get('akte_zeit', '3:12'), font=K.f(76, True), fill=(236, 238, 244))
        d.text((40 + K.f(76, True).getlength(s.get('akte_zeit', '3:12')) + 8, 132), 'AM', font=K.f(26, True), fill=(236, 238, 244))
        d.text((40, 176), kopf_, font=K.f(20, True), fill=(160, 166, 184))
        # Fallnummer oben rechts (Serien-Gefühl) + blinkender REC-Punkt
        d.text((K.W - 36, 64), f'AKTE {fall:03d}' if not en_ else f'FILE {fall:03d}', font=K.f(22, True), fill=(200, 204, 216), anchor='ra')
        if int(t * 2) % 2 == 0:
            d.ellipse((K.W - 150, 100, K.W - 132, 118), fill=(230, 30, 40))
        d.text((K.W - 36, 98), 'REC', font=K.f(22, True), fill=(230, 230, 236), anchor='ra')
        if s['art'] not in ('blitz', 'fratze', 'teil2') and s.get('akte') not in ('ort', 'ort_nah', 'warnung'):
            stempel(im, ('BEWEIS' if not en_ else 'EVIDENCE') + f' #{s.get("akte_nr", 1)}', thema['akzent'])
        d.rectangle((0, K.H - 90, K.W, K.H - 60), fill=(0, 0, 0))
        d.text((30, K.H - 86), '▶ PLAY', font=K.f(20, True), fill=(220, 220, 220))
        sek = int(t)
        d.text((K.W - 30, K.H - 86), f'SP 0:{sek // 60:02d}:{sek % 60:02d}', font=K.f(20, True), fill=(220, 220, 220), anchor='ra')

    # 16.11. ("mach's noch intensiver"): Steigerung zum Ende - Herzschlag-Rand, Zittern, kurze Störungen mit dem Gesicht
    import akte_intens
    intens = akte_intens.einrichten(szenen, lambda im, lt, v: K.schock(im, lt, en, v), schock_art)
    g['bild'] = lambda s, t, lt: intens(bild(s, t, lt), s, t)
    g['nah'] = lambda im, s, lt: im
