// Gewinner-Fortsetzung (#100): läuft ein "Was wäre wenn?"-Video deutlich besser als der Schnitt seines Kontos,
// kommt auf demselben Konto als Nächstes "TEIL 2" mit dem passenden Folge-Szenario. TikTok zeigt Teil 2 gern den
// Zuschauern von Teil 1 - und wer Teil 1 mochte, folgt für Teil 3. Reine Funktionen (ohne Netz testbar).

// Welches Szenario passt als Teil 2 (Titel -> Titel), möglichst in derselben Nische wie das Original.
export const FOLGEN = {
  'Wenn der Mond verschwindet': 'Wenn die Sonne verschwindet',
  'Wenn die Sonne verschwindet': 'Wenn die Erde stehen bleibt',
  'Wenn die Erde stehen bleibt': 'Der Dino-Asteroid',
  'Sturz ins Schwarze Loch': 'Ein Löffel Neutronenstern',
  'Ein Löffel Neutronenstern': 'Sturz ins Schwarze Loch',
  'Ohne Raumanzug im All': 'Ohne Anzug auf dem Mars',
  'Ohne Anzug auf dem Mars': 'Ein Tag auf der Venus',
  'Ein Tag auf der Venus': 'Landen auf dem Jupiter',
  'Landen auf dem Jupiter': 'Ein Tag auf der Venus',
  'Der Dino-Asteroid': 'Die Tunguska-Explosion',
  'Die Tunguska-Explosion': 'Der Dino-Asteroid',
  'Der große Sonnensturm': 'Wenn die Sonne verschwindet',
  'Sternschnuppen der Orioniden': 'Die Tunguska-Explosion',
  'Wenn alle Bienen verschwinden': 'Die Erde ohne Menschen',
  'Die Erde ohne Menschen': 'Wenn alle Bienen verschwinden',
  'Wenn alles Eis schmilzt': 'Der Supervulkan bricht aus',
  'Der Supervulkan bricht aus': 'Der Vesuv bricht aus',
  'Der Vesuv bricht aus': 'Der Supervulkan bricht aus',
  'Ein Loch durch die Erde': 'Der Supervulkan bricht aus',
  'Vom Blitz getroffen': 'Gefangen im Treibsand',
  'Gefangen im Treibsand': 'Vom Blitz getroffen',
  'Der Zombie-Pilz': 'Biss einer Vampirfledermaus',
  'Biss einer Vampirfledermaus': 'Der Zombie-Pilz',
  'Riesen-Libellen': 'Stark wie eine Ameise',
  'Stark wie eine Ameise': 'Schnell wie ein Gepard',
  'Schnell wie ein Gepard': 'Ein Tag als Faultier',
  'Ein Tag als Faultier': 'Schnell wie ein Gepard',
  'Tagelang ohne Schlaf': 'Luft anhalten bis zum Ende',
  'Luft anhalten bis zum Ende': 'Tagelang ohne Schlaf',
  'Ein Monat im All': 'Ohne Raumanzug im All',
  'Wenn du dich gruselst': 'Gesichter im Dunkeln',
  'Gesichter im Dunkeln': 'Gänsehaut',
  'Gänsehaut': 'Wenn du dich gruselst',
  'Jede Sekunde ein Euro': 'Ein Cent, jeden Tag verdoppelt',
  'Ein Cent, jeden Tag verdoppelt': 'Jede Sekunde ein Euro',
  'Ein Stern explodiert': 'Der Gammablitz',
  'Der Gammablitz': 'Ein Stern explodiert',
  'Die Sonne stirbt': 'Wenn die Sonne verschwindet',
  'Verloren im All': 'Ohne Raumanzug im All',
  'Der Killer-See': 'Der Feuer-Tornado',
  'Der Feuer-Tornado': 'Der Killer-See',
  'Der Schnecken-Parasit': 'Die Zombie-Grille',
  'Die Zombie-Grille': 'Der Zombie-Pilz',
  'Der Riesenkalmar': 'Der Anglerfisch',
  'Der Anglerfisch': 'Der Riesenkalmar',
  'Die Schlafparalyse': 'Das Déjà-vu',
  'Die Gummihand': 'Die fremde Hand',
  'Die fremde Hand': 'Die Gummihand',
  'Das Déjà-vu': 'Die Schlafparalyse',
  'Milben im Gesicht': 'Der Schnecken-Parasit',
};

const norm = (t) => String(t || '').replace(/🚀 Echte NASA-Aufnahmen!/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const kontoGleich = (a, b) => norm(a) === norm(b);

// posts: [{konto, text, aufrufe, zeit}] (TikTok-Zentrale). Gewinner = in den letzten `tage` Tagen mindestens
// `faktor`-mal so viele Aufrufe wie der Schnitt des Kontos und mindestens `mindest`.
export function gewinnerFinden(posts, konto, { jetzt = Date.now(), tage = 4, faktor = 2, mindest = 500 } = {}) {
  const eigene = (posts || []).filter((p) => kontoGleich(p.konto, konto) && Number(p.aufrufe) > 0);
  if (eigene.length < 3) return [];
  const schnitt = eigene.reduce((s, p) => s + Number(p.aufrufe), 0) / eigene.length;
  return eigene
    .filter((p) => jetzt - Date.parse(p.zeit) <= tage * 864e5 && Number(p.aufrufe) >= Math.max(schnitt * faktor, mindest))
    .sort((a, b) => b.aufrufe - a.aufrufe);
}

// Nächste Fortsetzung für ein Konto oder null. erlaubt(e): darf der Eintrag gerade laufen (Saison, Zeitfenster)?
export function fortsetzungFuer(konto, posts, bank, { verwendet = [], fortgesetzt = [], erlaubt = () => true, jetzt = Date.now() } = {}) {
  for (const p of gewinnerFinden(posts, konto, { jetzt })) {
    const text = norm(p.text);
    const vorbild = bank.find((e) => e.typ === 'waswaere' && e.frage && text.includes(norm(e.frage)));
    if (!vorbild || fortgesetzt.includes(vorbild.id)) continue;
    const folge = bank.find((e) => e.titel === FOLGEN[vorbild.titel]);
    if (folge && !verwendet.includes(folge.id) && erlaubt(folge)) return { eintrag: folge, vorbild, aufrufe: p.aufrufe };
  }
  return null;
}
