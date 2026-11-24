// Serie "100 Tage KI-Firma" (#119): jeden Tag ein Video über die eigenen Bots, auf @futureflowx3 (TikTok) + giyuuu sama (YouTube).
// Reine Funktionen - ohne Netz testbar. Neue Folgen = neue Einträge in FOLGEN (Tag -> Folge) + FOLGEN_EN (serieFolgenEn.mjs).
// Sprache je Kanal (Wochenbericht 22.11.): TikTok Deutsch, YouTube Englisch (Ø 359 statt 15 Aufrufe).
import { FOLGEN_EN, standardEn } from './serieFolgenEn.mjs';
export const START = '2026-11-22';  // Tag 1
export const ZIEL_TAGE = 100;
export const POST_ZEIT = '18:30';   // deutsche Zeit, abends ist auf TikTok am meisten los
// TikTok-Kanal der Serie: Standard futureflowx3. Eigener neuer Account (24.11., Horror-Publikum wischt weg):
// Buffer-Kanal-ID als Repo-Variable SERIE_TIKTOK_KANAL eintragen - dann postet die Serie nur noch dort.
const TIKTOK_KANAL = /^[a-f\d]{24}$/.test(process.env.SERIE_TIKTOK_KANAL || '') ? process.env.SERIE_TIKTOK_KANAL : '6ac7cb606a5c39ccb6535fab';
export const KANAELE = [
  { id: TIKTOK_KANAL, name: TIKTOK_KANAL === '6ac7cb606a5c39ccb6535fab' ? 'futureflowx3' : 'serie-tiktok', dienst: 'tiktok', sprache: 'de' },
  { id: '6ae8f39ae29c69a1713e3f33', name: 'giyuuu sama', dienst: 'youtube', sprache: 'en' },
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
      { seite: 'automations-dashboard/reselling', titel: '{deals} Deals gefunden', unter: 'in nur 24 Stunden' },
      { seite: 'mission-control', titel: 'Verdient?', unter: 'immer noch 0 €. Noch.' }],
    stimme: 'Tag zwei. Während ich schlafe, scannt dieser Bot Shops und Filialen nach Schnäppchen. In den letzten 24 Stunden hat er {deals} Deals gefunden. Verdient habe ich trotzdem noch nichts. Noch nicht.',
    caption: 'Dieser Bot sucht rund um die Uhr Deals für mich. {deals} in 24 Stunden. Verdient: 0 €.',
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
    szenen: [{ liste: ['✗ Reselling-Alerts', '✗ KI-Telefonistin', '✗ Kunden-Radar', '✗ Postkarten-Automat', '✗ Anime-Shop', '✗ Virale App', '✗ Agenten-Kasse', '✗ Streitgericht'], titel: 'Alle abgelehnt.', unter: 'Ich weiß.' },
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
  // Woche 2: das erste Produkt. {produkt} = Gewinner der Abstimmung von Tag 6 (Repo-Variable SERIE_PRODUKT).
  8: {
    hook: ['IHR HABT GEWÄHLT.', '{produkt} WIRD MEIN PRODUKT.'],
    szenen: [{ seite: 'automations-dashboard', titel: 'Gewonnen hat:', unter: '{produkt}' },
      { seite: 'mission-control', titel: 'Ziel diese Woche:', unter: 'der erste Kunde.' }],
    stimme: 'Tag acht. Ihr habt abgestimmt. Gewonnen hat {produkt}. Diese Woche mache ich daraus ein Produkt, das man kaufen kann. Ziel: der erste zahlende Kunde.',
    caption: 'Ihr habt gewählt: {produkt} wird mein erstes Produkt. Ziel diese Woche: der erste Kunde.',
  },
  9: {
    hook: ['WAS KOSTET', 'EIN KI-BOT?'],
    szenen: [{ liste: ['Gratis-Version?', '9 € im Monat?', '29 € einmalig?', '99 € mit Einrichtung?'], titel: 'Was würdest du zahlen?', unter: 'Kommentar = Preis' },
      { seite: 'automations-dashboard', titel: 'Der Preis', unter: 'entscheidet ihr.' }],
    stimme: 'Tag neun. Ich muss einen Preis festlegen und habe keine Ahnung. Gratis, neun Euro im Monat oder neunundzwanzig einmalig? Schreib in die Kommentare, was du zahlen würdest.',
    caption: 'Ich muss einen Preis für {produkt} festlegen. Was würdest du zahlen? 👇',
  },
  10: {
    hook: ['EINE KI BAUT', 'MEINE VERKAUFSSEITE.'],
    szenen: [{ seite: 'zentrale', titel: 'Prompt rein,', unter: 'Seite raus.' },
      { seite: 'automations-dashboard', titel: 'Dauer:', unter: 'unter einer Stunde.' }],
    stimme: 'Tag zehn. Ich lasse eine KI die Verkaufsseite für {produkt} bauen. Texte, Design, Bezahlknopf. Morgen geht sie online.',
    caption: 'Eine KI baut die Verkaufsseite für {produkt}. Morgen geht sie online.',
  },
  11: {
    hook: ['DIE SEITE IST LIVE.', 'JETZT KANN MAN KAUFEN.'],
    szenen: [{ seite: 'mission-control', titel: 'Online seit heute.', unter: 'Link in der Bio.' },
      { seite: 'automations-dashboard', titel: 'Verkäufe:', unter: 'noch 0.' }],
    stimme: 'Tag elf. Die Seite ist online. Ab jetzt kann man {produkt} kaufen. Verkäufe bisher: null. Link ist in der Bio.',
    caption: '{produkt} ist live. Verkäufe bisher: 0. Link in der Bio.',
  },
  12: {
    hook: ['24 STUNDEN ONLINE.', 'SO VIELE HABEN GEKAUFT.'],
    szenen: [{ seite: 'mission-control', titel: 'Besucher, Klicks,', unter: 'Verkäufe' },
      { seite: 'automations-dashboard', titel: 'Was ich jetzt ändere:', unter: 'kommt morgen.' }],
    stimme: 'Tag zwölf. Die Seite ist einen Tag online. Ich zeige euch ehrlich, wie viele geklickt und wie viele gekauft haben. Und was ich jetzt ändere.',
    caption: '24 Stunden online. Hier die ehrlichen Zahlen von {produkt}.',
  },
  13: {
    hook: ['MEIN BOT SUCHT', 'JETZT SELBST KUNDEN.'],
    szenen: [{ seite: 'automations-dashboard/tiktok', titel: 'Der nächste Bot:', unter: 'macht Werbung.' },
      { seite: 'automations-dashboard', titel: 'Bots verkaufen', unter: 'Bots.' }],
    stimme: 'Tag dreizehn. Wenn ich schon hundert Bots habe, kann einer davon auch Werbung für {produkt} machen. Ab heute verkaufen Bots meine Bots.',
    caption: 'Ab heute macht ein Bot Werbung für {produkt}. Bots verkaufen Bots.',
  },
  14: {
    hook: ['ZWEI WOCHEN.', 'DER ERSTE EURO?'],
    szenen: [{ seite: 'mission-control', titel: 'Woche 2', unter: 'Produkt gebaut + online' },
      { seite: 'automations-dashboard', titel: 'Verdient:', unter: 'die Antwort im Video.' }],
    stimme: 'Tag vierzehn. Zwei Wochen Serie. Das Produkt ist gebaut und online. Die große Frage: Habe ich den ersten Euro verdient? Die Antwort kommt jetzt.',
    caption: 'Zwei Wochen. {produkt} ist online. Habe ich den ersten Euro verdient?',
  },
};

// Folge für Tag n in einer Sprache ('de' | 'en'); ohne festen Eintrag eine Standard-Folge mit den aktuellen Zahlen
export function folgeFuer(tag, zahlen = {}, sprache = 'de') {
  const roh = FOLGEN[tag] || {
    hook: [`TAG ${tag}.`, 'DER STAND HEUTE.'],
    szenen: [{ seite: 'automations-dashboard', titel: '{bots} Bots', unter: 'laufen weiter' },
      { seite: 'automations-dashboard/reselling', titel: '{deals} Deals', unter: 'in 24 Stunden' },
      { seite: 'mission-control', titel: `Noch ${ZIEL_TAGE - tag} Tage`, unter: 'bis zum Ziel' }],
    stimme: `Tag ${tag}. {bots} Bots laufen, in den letzten 24 Stunden haben sie {deals} Deals gefunden. Noch ${ZIEL_TAGE - tag} Tage. Folg mir, damit du siehst, wie es ausgeht.`,
    caption: `{bots} Bots, {deals} Deals in 24 Stunden. Noch ${ZIEL_TAGE - tag} Tage.`,
  };
  const en = sprache === 'en';
  const produkt = zahlen.produkt || (en ? 'the winning bot' : 'der Gewinner-Bot');
  const fuell = (s) => String(s).replace(/\{bots\}/g, zahlen.bots ?? '100+').replace(/\{deals\}/g, zahlen.deals ?? (en ? 'new' : 'neue'))
    .replace(/\{produkt\}/g, (m, i, ganz) => {
      const rest = ganz.replace(/\{\w+\}/g, '');  // Hook-Zeilen sind in Großbuchstaben -> Produktname auch
      return /\p{L}/u.test(rest) && rest === rest.toUpperCase() ? produkt.toUpperCase() : produkt;
    });
  const t = en ? (FOLGEN_EN[tag] || standardEn(tag, ZIEL_TAGE)) : null;
  // Englisch: gleiche Bilder, englische Titel; Text-Listen (z. B. die 8 Ideen) aus der englischen Fassung
  const szenen = roh.szenen.map((s, i) => {
    const [titel, unter] = t ? (t.texte[i] || [s.titel, s.unter]) : [s.titel, s.unter];
    const liste = t && Array.isArray(s.liste) ? (t.liste || s.liste) : s.liste;
    return { ...s, ...(liste ? { liste } : {}), titel: fuell(titel), unter: fuell(unter) };
  });
  const quelle = t || roh;
  return {
    tag, sprache, hook: quelle.hook.map(fuell), szenen, stimme: fuell(quelle.stimme),
    ende: en ? [`DAY ${tag}`, `OF ${ZIEL_TAGE}`, tag === 1 ? 'Starting today, that changes.' : 'Follow for tomorrow.']
      : [`TAG ${tag}`, `VON ${ZIEL_TAGE}`, tag === 1 ? 'Ab heute ändert sich das.' : 'Folg mir für morgen.'],
    caption: en ? `Day ${tag} of ${ZIEL_TAGE}: ${fuell(quelle.caption)}` : `Tag ${tag} von ${ZIEL_TAGE}: ${fuell(quelle.caption)}`,
  };
}

// Buffer-Eingabe je Kanal (TikTok braucht nur Video + Text, YouTube Titel + Kategorie)
export function beitragFuer(folge, kanal, videoUrl, dueAt) {
  const en = folge.sprache === 'en';
  const tags = en ? '#ai #aibots #automation #sidehustle #buildinpublic #100days' : '#ki #kibots #automatisierung #nebenverdienst #100tage';
  const zeit = dueAt ? { mode: 'customScheduled', dueAt } : { mode: 'shareNow' };
  const video = { url: videoUrl, metadata: { thumbnailOffset: 1000 } };
  if (kanal.dienst === 'youtube') {
    const titel = `${folge.caption.split(':')[0]}: ${folge.hook.join(' ').replace(/\s+/g, ' ')}`.slice(0, 90);
    return { channelId: kanal.id, schedulingType: 'automatic', ...zeit, assets: [{ video }], text: `${folge.caption}\n\n${tags} #shorts`,
      metadata: { youtube: { title: `${titel} #shorts`.slice(0, 100), categoryId: '28', madeForKids: false, privacy: 'public' } } };
  }
  return { channelId: kanal.id, schedulingType: 'automatic', ...zeit, assets: [{ video }], text: `${folge.caption} ${en ? `Follow for day ${folge.tag + 1}` : `Folg mir für Tag ${folge.tag + 1}`} 🤖💸 ${tags}`,
    metadata: { tiktok: { title: folge.caption.slice(0, 90) } } };
}
