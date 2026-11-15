# Posen je Szene (15.11., Wunsch: "die sollen sich anders verhalten, nicht die ganze Zeit dieselbe Animation").
# Die Hauptfigur bekommt pro Szene eine Pose, passend zum Satz (Handy -> schaut aufs Handy, Stimme/Klopfen -> lauscht,
# hinter mir -> dreht sich um, renn/weg -> weicht zurück ...). Nie zweimal dieselbe Pose hintereinander.
import re

MIT_FIGUR = ('innen', 'handy', 'ende', 'licht', 'decke', 'dunkel')
REGELN = [
    ('handy', r'handy|nachricht|app|foto|chat|schreibt|anruf|klingelt|story|video|kamera|bildschirm|profil|phone|text|camera|message'),
    ('lauschen', r'hör|stimme|ruft|klopf|flüster|geräusch|singt|lacht|atmen|echo|kratzt|hear|voice|knock|whisper|calls'),
    ('umsehen', r'hinter|dreh|umdreh|rücken|schaut|blick|behind|turn|look'),
    ('zurueck', r'renn|weg|raus|flieh|zurück|tür|run|door|leave'),
    ('zeigen', r'da steht|dort|fenster|ecke|decke|spiegel|window|corner|there'),
    ('ducken', r'versteck|bett|decke über|zitter|hide|bed|shaking'),
]
WECHSEL = ['sitzen', 'umsehen', 'abwehr', 'handy', 'ducken', 'lauschen', 'zeigen']


def pose_fuer(text, vorher=None, nr=0):
    t = (text or '').lower()
    for pose, muster in REGELN:
        if pose != vorher and re.search(muster, t):
            return pose
    for i in range(len(WECHSEL)):  # kein Stichwort: der Reihe nach wechseln
        p = WECHSEL[(nr + i) % len(WECHSEL)]
        if p != vorher:
            return p
    return 'sitzen'


def posen_verteilen(szenen):
    vorher = None
    for nr, sz in enumerate(szenen):
        if sz.get('art') not in MIT_FIGUR or 'pose' in sz:
            continue
        sz['pose'] = 'handy' if sz['art'] == 'handy' else 'abwehr' if sz['art'] == 'ende' else pose_fuer(sz.get('text') or sz.get('sprich'), vorher, nr)
        sz['pose2'] = {'handy': 'umsehen', 'lauschen': 'abwehr', 'umsehen': 'abwehr', 'sitzen': 'umsehen', 'zeigen': 'zurueck',
                       'abwehr': 'zurueck', 'ducken': 'lauschen', 'zurueck': 'ducken'}[sz['pose']]
        vorher = sz['pose2']
    return szenen


def fort(s, lt):
    return min(max(lt / max(s.get('dauer', 4), 0.5), 0.0), 1.0)


def pose_kw(s, lt):  # Pose der Szene + Fortschritt 0..1; lange Szenen wechseln nach 60 % in eine zweite Pose
    if not s.get('pose'):
        return {}
    f = fort(s, lt)
    return {'pose': s['pose2'] if s.get('pose2') and f > 0.6 and s.get('dauer', 0) > 3.2 else s['pose'], 'fort': f}
