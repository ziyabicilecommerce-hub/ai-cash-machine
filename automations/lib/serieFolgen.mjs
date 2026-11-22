// Serie "100 Tage KI-Firma" (#119): jeden Tag ein Video über die eigenen Bots, auf @futureflowx3 (TikTok) + giyuuu sama (YouTube).
// Reine Funktionen - ohne Netz testbar. Neue Folgen = neue Einträge in FOLGEN (Tag -> Folge).
export const START = '2026-11-22';  // Tag 1
export const ZIEL_TAGE = 100;
export const POST_ZEIT = '18:30';   // deutsche Zeit, abends ist auf TikTok am meisten los
export const KANAELE = [
  { id: '6ac7cb606a5c39ccb6535fab', name: 'futureflowx3', dienst: 'tiktok' },
  { id: '6ae8f39ae29c69a1713e3f33', name: 'giyuuu sama', dienst: 'youtube' },
];

const berlinDatum = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d);

// Tag der Serie für ein Datum (Tag 1 = START), deutsche Zeit
export function tagNummer(jetzt = new Date()) {
  const tage = Math.round((Date.parse(berlinDatum(jetzt)) - Date.parse(START)) / 86400000);
  return tage + 1;
}

export const zweistellig = (n) => String(n).padStart(2, '0');

// Szenen: { seite: 'pfad/zur/index.html' (Bildschirmfoto), titel, unter } oder { liste: [...Zeilen], titel, unter }
export const FOLGEN = {
  1: {
    hook: ['{bots} KI-BOTS.', '0 € VERDIENT.'],
    szenen: [{ liste: 'bots', titel: '{bots} Automations', unter: 'alle selbst gebaut' },
      { seite: 'automations-dashboard', titel: 'Mein Kontrollzentrum.', unter: 'Läuft 24/7. Ohne mich.' },
      { seite: 'automations-dashboard/tiktok', titel: 'Bots, die TikToks', unter: 'selbst testen.' },
      { seite: 'automations-dashboard/reselling', titel: 'Bots, die nachts', unter: 'Deals finden.' },
      { seite: 'mission-control', titel: 'Und auf dem Konto?', unter: '0,00 €' }],
    stimme: 'Ich habe {bots} KI-Bots gebaut. Verdient habe ich damit: null Euro. Ab heute ändert sich das. Tag eins von hundert.',
    caption: '{bots} KI-Bots gebaut, 0 € verdient. Ab heute zeige ich jeden Tag, ob ich\'s schaffe.',
  },
  2: {
    hook: ['DIESER BOT ARBEITET,', 'WÄHREND ICH SCHLAFE.'],
    szenen: [{ seite: 'automations-dashboard/reselling', titel: 'Reselling-Radar', unter: 'scannt Shops + Filialen' },
      { seite: 'automations-dashboard/reselling', titel: '{deals} Deals gefunden', unter: 'allein heute Nacht' },
      { seite: 'mission-control', titel: 'Verdient?', unter: 'immer noch 0 €. Noch.' }],
    stimme: 'Tag zwei. Während ich schlafe, scannt dieser Bot Shops und Filialen nach Schnäppchen. Heute hat er {deals} Deals gefunden. Verdient habe ich trotzdem noch nichts. Noch nicht.',
    caption: 'Dieser Bot sucht jede Nacht Deals für mich. {deals} Stück heute. Verdient: 0 €.',
  },
  3: {
    hook: ['MEINE KI TESTET SELBST,', 'WELCHE TIKTOKS LAUFEN.'],
    szenen: [{ seite: 'automations-dashboard/tiktok', titel: 'Das Ideen-Labor', unter: 'testet Hooks automatisch' },
      { seite: 'automations-dashboard', titel: 'Gewinner bleiben,', unter: 'Verlierer fliegen raus.' },
      { seite: 'mission-control', titel: 'Und dieses Video?', unter: 'Testet es auch gerade.' }],
    stimme: 'Tag drei. Ich lasse eine KI selbst testen, welche Videos funktionieren. Sie misst Aufrufe und Sehdauer und wirft alles raus, was nicht läuft. Ja, auch dieses Video wird gerade getestet.',
    caption: 'Meine KI entscheidet selbst, welche Videos ich poste. Dieses hier testet sie gerade.',
  },
  4: {
    hook: ['EINE KI HAT MIR', '8 GESCHÄFTSIDEEN GEPITCHT.'],
    szenen: [{ liste: ['❌ Reselling-Alerts', '❌ KI-Telefonistin', '❌ Kunden-Radar', '❌ Postkarten-Automat', '❌ Anime-Shop', '❌ Virale App', '❌ Agenten-Kasse', '❌ Streitgericht'], titel: 'Alle abgelehnt.', unter: 'Ich weiß.' },
      { seite: 'automations-dashboard', titel: 'Was ich stattdessen mache:', unter: 'diese Serie.' }],
    stimme: 'Tag vier. Ich habe mir von einer KI acht Geschäftsideen pitchen lassen. Telefon-KI, Anime-Shop, virale App. Ich habe alle abgelehnt. Welche hättest du genommen? Schreib es in die Kommentare.',
    caption: 'Eine KI hat mir 8 Geschäftsideen gepitcht. Ich hab alle abgelehnt. Welche hättest du genommen? 👇',
  },
  5: {
    hook: ['MEIN KI-CHEF SAGT MIR', 'JEDEN MORGEN, WAS ZU TUN IST.'],
    szenen: [{ seite: 'zentrale', titel: 'Die Zentrale', unter: 'plant meinen Tag' },
      { seite: 'uebersicht', titel: 'Alle Systeme', unter: 'auf einen Blick' },
      { seite: 'mission-control', titel: 'Aufgabe heute:', unter: 'den ersten Euro.' }],
    stimme: 'Tag fünf. Jeden Morgen sagt mir meine KI-Zentrale, was heute zu tun ist. Heute steht da nur eine Sache: Mach endlich den ersten Euro.',
    caption: 'Mein KI-Chef plant jeden Morgen meinen Tag. Heute nur eine Aufgabe: der erste Euro.',
  },
  6: {
    hook: ['{bots} BOTS.', 'WELCHEN SOLL ICH ZU GELD MACHEN?'],
    szenen: [{ liste: 'bots', titel: 'Such dir einen aus.', unter: 'Kommentar = Entscheidung' },
      { seite: 'automations-dashboard', titel: 'Meistgenannter Bot', unter: 'wird mein erstes Produkt.' }],
    stimme: 'Tag sechs. Ich habe {bots} Bots und kann mich nicht entscheiden. Also entscheidest du. Der Bot, der am meisten in den Kommentaren steht, wird mein erstes Produkt.',
    caption: '{bots} Bots. Du entscheidest, welcher mein erstes Produkt wird. Schreib es in die Kommentare 👇',
  },
  7: {
    hook: ['EINE WOCHE.', 'DAS IST DER STAND.'],
    szenen: [{ seite: 'automations-dashboard', titel: 'Woche 1', unter: '{bots} Bots, 7 Videos' },
      { seite: 'automations-dashboard/tiktok', titel: 'Reichweite', unter: 'wächst jeden Tag' },
      { seite: 'mission-control', titel: 'Verdient:', unter: 'kommt diese Woche.' }],
    stimme: 'Tag sieben. Eine Woche Serie. {bots} Bots, sieben Videos, und ihr habt entschieden, welcher Bot mein erstes Produkt wird. Nächste Woche wird gebaut.',
    caption: 'Woche 1 ist rum. Nächste Woche baue ich das erste Produkt. Bleib dran.',
  },
};

// Folge für Tag n; ohne festen Eintrag eine Standard-Folge mit den aktuellen Zahlen
export function folgeFuer(tag, zahlen = {}) {
  const roh = FOLGEN[tag] || {
    hook: [`TAG ${tag}.`, 'DER STAND HEUTE.'],
    szenen: [{ seite: 'automations-dashboard', titel: '{bots} Bots', unter: 'laufen weiter' },
      { seite: 'automations-dashboard/reselling', titel: '{deals} Deals', unter: 'heute gefunden' },
      { seite: 'mission-control', titel: `Noch ${ZIEL_TAGE - tag} Tage`, unter: 'bis zum Ziel' }],
    stimme: `Tag ${tag}. {bots} Bots laufen, heute haben sie {deals} Deals gefunden. Noch ${ZIEL_TAGE - tag} Tage. Folg mir, damit du siehst, wie es ausgeht.`,
    caption: `Tag ${tag}: {bots} Bots, {deals} Deals heute. Noch ${ZIEL_TAGE - tag} Tage.`,
  };
  const fuell = (s) => String(s).replace(/\{bots\}/g, zahlen.bots ?? '100+').replace(/\{deals\}/g, zahlen.deals ?? 'neue');
  const szenen = roh.szenen.map((s) => ({ ...s, titel: fuell(s.titel), unter: fuell(s.unter) }));
  return {
    tag, hook: roh.hook.map(fuell), szenen, stimme: fuell(roh.stimme),
    ende: [`TAG ${tag}`, `VON ${ZIEL_TAGE}`, tag === 1 ? 'Ab heute ändert sich das.' : 'Folg mir für morgen.'],
    caption: `Tag ${tag} von ${ZIEL_TAGE}: ${fuell(roh.caption)}`,
  };
}

// Buffer-Eingabe je Kanal (TikTok braucht nur Video + Text, YouTube Titel + Kategorie)
export function beitragFuer(folge, kanal, videoUrl, dueAt) {
  const tags = '#ki #kibots #automatisierung #nebenverdienst #100tage';
  const zeit = dueAt ? { mode: 'customScheduled', dueAt } : { mode: 'shareNow' };
  const video = { url: videoUrl, metadata: { thumbnailOffset: 1000 } };
  if (kanal.dienst === 'youtube') {
    const titel = `${folge.caption.split(':')[0]}: ${folge.hook.join(' ').replace(/\s+/g, ' ')}`.slice(0, 90);
    return { channelId: kanal.id, schedulingType: 'automatic', ...zeit, assets: [{ video }], text: `${folge.caption}\n\n${tags} #shorts`,
      metadata: { youtube: { title: `${titel} #shorts`.slice(0, 100), categoryId: '28', madeForKids: false, privacy: 'public' } } };
  }
  return { channelId: kanal.id, schedulingType: 'automatic', ...zeit, assets: [{ video }], text: `${folge.caption} Folg mir für Tag ${folge.tag + 1} 🤖💸 ${tags}`,
    metadata: { tiktok: { title: folge.caption.slice(0, 90) } } };
}
