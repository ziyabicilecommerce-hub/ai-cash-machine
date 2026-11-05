// Muster 10 + 11 für den Skript-Bot: Lieferung (Paketbote, Lieferdienst) und Wand (Klopfen, Stimmen von nebenan).
// Gleiche Regeln: die zwei wichtigsten Sätze stehen am Ende, Hook höchstens 70 Zeichen. Mit Du-Hook und Teil 2.

const lieferung = (v) => ({
  titel: v.titel, ort: 'haus', boesewicht: v.boese, stimme: 'mann',
  hook: v.hook, saetze: ['Ich habe nichts bestellt.', 'Ich frage nach.', v.sagt, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Hättest du aufgemacht?', wahl: ['Aufmachen', 'Zulassen'],
});
const LIEFERUNG = [
  { titel: 'Die Unterschrift', boese: 'schatten', hook: 'Heute sagt der Bote, mein Mitbewohner hat signiert. Ich wohne allein.',
    sagt: 'Er zeigt mir die Unterschrift auf dem Display.', dann: 'Es ist meine Unterschrift. Von vor fünf Minuten.',
    monster: 'Danke für das Paket.', ende: 'Ich war die ganze Zeit unter der Dusche. Im Flur steht das offene Paket.' },
  { titel: 'Essen für zwei', boese: 'gremlin', hook: 'Um 3 Uhr klingelt der Lieferdienst. Bestellung für zwei Personen.',
    sagt: 'Auf dem Zettel steht meine Adresse. Und: Für die Person im Schrank.', dann: 'Aus dem Schlafzimmer höre ich, wie eine Schranktür aufgeht.',
    monster: 'Ich habe Hunger.', ende: 'Der Fahrer schaut über meine Schulter. Dann rennt er weg.' },
  { titel: 'Das warme Paket', boese: 'schatten', hook: 'Um 3 Uhr steht ein warmes Paket vor meiner Tür. Mit meinem Namen.',
    sagt: 'Kein Absender. Nur eine Notiz: Nicht öffnen vor 3 Uhr.', dann: 'Um 2:59 Uhr klopft es. Von innen.',
    monster: 'Mach auf.', ende: 'Ich öffne nicht. Am Morgen ist das Paket leer. Und mein Bett ist warm.' },
  { titel: 'Der Pizzabote', boese: 'frau', hook: 'Um 3 Uhr klingelt der Pizzabote. Ich hätte angerufen, sagt er.',
    sagt: 'Er spielt mir die Sprachnachricht vor.', dann: 'Es ist meine Stimme. Sie flüstert: Bring zwei. Er hat auch Hunger.',
    monster: 'Zwei.', ende: 'Ich drehe mich um. Im dunklen Flur steht jemand und winkt dem Boten.' },
  { titel: 'Die Rücksendung', boese: 'gremlin', hook: 'Ich bekomme ein Paket zurück. Ich habe nichts verschickt.',
    sagt: 'Darin liegt mein Hausschlüssel.', dann: 'Meiner hängt am Haken. Beide passen.',
    monster: 'Ich habe noch einen.', ende: 'Auf dem Schein steht als Absender meine Adresse. Datum: morgen.' },
];

const wand = (v) => ({
  titel: v.titel, ort: 'haus', boesewicht: v.boese, stimme: 'frau',
  hook: v.hook, saetze: ['Ich wohne seit einem Monat hier.', 'Bisher war es immer ruhig.', v.hoert, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Hättest du zurückgeklopft?', wahl: ['Zurückklopfen', 'Leise sein'],
});
const WAND = [
  { titel: 'Klopfen nebenan', boese: 'schatten', hook: 'Jede Nacht um 3 Uhr klopft es an meiner Wand. Nebenan wohnt keiner.',
    hoert: 'Heute klopfe ich zurück.', dann: 'Es klopft genau so zurück. Dann flüstert jemand: Endlich.',
    monster: 'Endlich.', ende: 'Am Morgen ist in der Wand ein kleines Loch. Auf meiner Seite.' },
  { titel: 'Mein Name durch die Wand', boese: 'frau', hook: 'Um 3 Uhr ruft jemand durch die Wand meinen Namen. Nebenan ist es leer.',
    hoert: 'Die Stimme klingt wie meine Mutter.', dann: 'Mama ist zu Hause. Sie schreibt mir gerade.',
    monster: 'Komm rüber.', ende: 'Ich lege das Ohr an die Wand. Von drüben legt jemand auch sein Ohr an.' },
  { titel: 'Der Fernseher nebenan', boese: 'schatten', hook: 'Um 3 Uhr läuft nebenan ein Fernseher. Dort wohnt seit Jahren niemand.',
    hoert: 'Ich höre die Nachrichten.', dann: 'Der Sprecher sagt meine Adresse. Und: Er ist schon drin.',
    monster: 'Er ist drin.', ende: 'Der Fernseher geht aus. In meinem Flur geht das Licht an.' },
  { titel: 'Kratzen in der Wand', boese: 'gremlin', hook: 'Um 3 Uhr kratzt etwas in meiner Wand. Genau an meinem Kopfende.',
    hoert: 'Ich rücke das Bett weg.', dann: 'Das Kratzen folgt dem Bett.',
    monster: 'Lass mich rein.', ende: 'Unter der Tapete steht mein Name. Von innen geritzt.' },
  { titel: 'Schritte oben', boese: 'schatten', hook: 'Um 3 Uhr laufen Schritte über mir. Ich wohne ganz oben.',
    hoert: 'Über mir ist nur der Dachboden.', dann: 'Die Schritte bleiben genau über meinem Bett stehen.',
    monster: 'Ich sehe dich.', ende: 'Durch die Decke tropft etwas. Es ist warm.' },
];

export const MUSTER3 = { lieferung: [lieferung, LIEFERUNG], wand: [wand, WAND] };

const t2 = (hook, saetze, ende, monster, frage, wahl) => ({ hook, saetze, ende, monster, frage, wahl });
export const TEIL2_3 = {
  lieferung: () => t2('Ich nehme keine Pakete mehr an. Heute liegt eins in meinem Bett.', ['Die Tür war abgeschlossen.', 'Auf dem Paket steht: Zugestellt an Mitbewohner.', 'Ich habe keinen Mitbewohner.', 'Im Bad läuft das Wasser.'],
    'Auf dem Spiegel steht: Danke, dass ich bleiben darf.', 'Ich bleibe.', 'Hättest du ins Bad geschaut?', ['Ins Bad', 'Raus hier']),
  wand: () => t2('Ich bin ausgezogen. In der neuen Wohnung klopft es an derselben Stelle.', ['Gleiche Uhrzeit. Gleicher Takt.', 'Ich klopfe nicht zurück.', 'Dann klopft es an meiner Tür.', 'Im Takt meines Herzschlags.'],
    'Durch den Türspion sehe ich niemanden. Nur ein Auge, ganz nah.', 'Du hast nicht zurückgeklopft.', 'Hättest du aufgemacht?', ['Aufmachen', 'Zulassen']),
};

export const DU_HOOKS3 = {
  'Die Unterschrift': 'Wenn der Bote sagt, dein Mitbewohner hat unterschrieben, renn.',
  'Essen für zwei': 'Wenn um 3 Uhr Essen für zwei kommt, schau in deinen Schrank.',
  'Das warme Paket': 'Öffne nie ein warmes Paket ohne Absender vor deiner Tür.',
  'Der Pizzabote': 'Wenn der Pizzabote deine Stimme abspielt, dreh dich um.',
  'Die Rücksendung': 'Kommt ein Paket zurück, das du nie verschickt hast, öffne es nicht.',
  'Klopfen nebenan': 'Wenn es nachts an deiner Wand klopft, klopf nie zurück.',
  'Mein Name durch die Wand': 'Wenn jemand durch deine Wand deinen Namen ruft, antworte nicht.',
  'Der Fernseher nebenan': 'Wenn du nachts nebenan einen Fernseher hörst, hör nicht hin.',
  'Kratzen in der Wand': 'Wenn es nachts an deinem Kopfende kratzt, rück das Bett nicht weg.',
  'Schritte oben': 'Wenn du ganz oben wohnst und über dir Schritte sind, schau nicht hoch.',
};
