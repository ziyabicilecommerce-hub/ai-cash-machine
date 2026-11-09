// Muster 15 "Zahl" (einer zu viel): unsere TikTok-Hits vom 07./08.11. - "Wir waren zu dritt, auf jedem Foto sind wir vier" (774),
// "13 Stufen, ich höre 14 Schritte" (744), "Aufzug fährt allein in den Keller" (739). Ziffern im Hook, Twist am Ende.
// Gleiche Regeln wie Muster 1-14: Hook höchstens 70 Zeichen, die zwei wichtigsten Sätze am Ende, Du-Hook, Teil 2.

const zahl = (v) => ({
  titel: v.titel, ort: v.ort, boesewicht: v.boese, stimme: v.stimme || 'mann',
  hook: v.hook, saetze: ['Ich zähle nochmal.', v.zweifel, v.beweis, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Hättest du nachgezählt?', wahl: ['Nachzählen', 'Wegrennen'],
});
const ZAHL = [
  { titel: 'Einer zu viel auf dem Foto', ort: 'wald', boese: 'schatten', hook: 'Im Wald waren wir zu 3. Auf jedem Foto sind wir aber 4.',
    zweifel: 'Wir sind wirklich nur zu dritt.', beweis: 'Auf jedem Foto steht jemand hinter mir.', dann: 'Er ist auf jedem Bild etwas näher.',
    monster: 'Ich gehöre dazu.', ende: 'Auf dem letzten Foto sind wir nur noch zu zweit. Ich fehle.' },
  { titel: 'Vierzehn Stufen', ort: 'haus', boese: 'schatten', hook: 'Meine Treppe hat 13 Stufen. Heute Nacht höre ich aber 14 Schritte.',
    zweifel: 'Ich bleibe auf Stufe 13 stehen.', beweis: 'Die Schritte gehen weiter. Eine Stufe mehr.', dann: 'Die Stufe ist direkt hinter mir.',
    monster: 'Vierzehn.', ende: 'Am Morgen hat die Treppe 14 Stufen. Die neue ist warm.' },
  { titel: 'Das Klassenfoto', ort: 'haus', boese: 'gremlin', hook: 'Mein Klassenfoto hat 24 Kinder. Die App zählt aber 25 Gesichter.',
    zweifel: 'Ich zähle die Kinder selbst. Es sind 24.', beweis: 'Die App markiert ein Gesicht ganz hinten.', dann: 'Es ist mein Gesicht. Als Kind.',
    monster: 'Ich bin noch in der Schule.', ende: 'Auf dem Foto dreht sich das Kind langsam zur Kamera.' },
  { titel: 'Der dritte Teller', ort: 'haus', boese: 'frau', stimme: 'frau', hook: 'Ich decke für 2. Heute Nacht steht aber ein 3. Teller da.',
    zweifel: 'Mein Freund schwört, er war es nicht.', beweis: 'Der dritte Teller ist benutzt.', dann: 'Daneben liegt ein Messer. Abgeleckt.',
    monster: 'Lecker.', ende: 'Morgens stehen 3 Zahnbürsten im Bad. Eine ist nass.' },
  { titel: 'Das zweite Hotelbett', ort: 'haus', boese: 'frau', hook: 'Im Hotel steht nur 1 Bett. Mein Handy-Foto zeigt aber 2.',
    zweifel: 'Im Zimmer steht wirklich nur ein Bett.', beweis: 'Auf dem Foto liegt im zweiten Bett jemand.', dann: 'Er hat die Decke bis zum Kinn gezogen.',
    monster: 'Gute Nacht.', ende: 'Ich schaue zurück ins Zimmer. In meinem Bett liegt jetzt jemand.' },
  { titel: 'Die Aufzugwaage', ort: 'aufzug', boese: 'schatten', hook: 'Im Aufzug sind wir zu 2. Die Waage zeigt aber 3 Personen an.',
    zweifel: 'Meine Freundin und ich. Sonst niemand.', beweis: 'Die Waage zeigt 80 Kilo zu viel.', dann: 'Etwas atmet in meinen Nacken.',
    monster: 'Etage minus eins.', ende: 'Die Tür geht auf. Meine Freundin steigt aus. Ich nicht.' },
  { titel: 'Der sechste im Chat', ort: 'haus', boese: 'gremlin', hook: 'Mein Gruppenchat hat 5 Leute. Heute Nacht schreiben aber 6.',
    zweifel: 'Wir sind nur fünf in der Gruppe.', beweis: 'Die sechste Nachricht kommt von meinem Handy.', dann: 'Ich habe nichts geschrieben. Ich lag im Bett.',
    monster: 'Hallo Leute.', ende: 'Die Nachricht lautet: Er schläft. Kommt jetzt.' },
  { titel: 'Zwei Kinokarten', ort: 'haus', boese: 'schatten', hook: 'Im Kino sitze ich allein in Reihe 13. Die App zeigt aber 2 Karten.',
    zweifel: 'Ich bin wirklich allein im Saal.', beweis: 'Der Sitz neben mir klappt herunter.', dann: 'Popcorn knistert. Direkt neben mir.',
    monster: 'Psst, der Film fängt an.', ende: 'Im Abspann steht mein Name. Und daneben: Begleitung.' },
  { titel: 'Einunddreißig Kerzen', ort: 'haus', boese: 'frau', stimme: 'frau', hook: 'Heute hat meine Torte 30 Kerzen. Auf dem Foto brennen aber 31.',
    zweifel: 'Ich werde 30. Es waren 30 Kerzen.', beweis: 'Auf dem Foto brennt eine Kerze mehr.', dann: 'Sie steht genau vor meinem Gesicht.',
    monster: 'Puste.', ende: 'Ich puste alle aus. Die letzte brennt weiter.' },
  { titel: 'Der dritte Schlafsack', ort: 'wald', boese: 'hirsch', hook: 'Im Zelt liegen wir zu 2. Um 3 Uhr zähle ich aber 3 Schlafsäcke.',
    zweifel: 'Mein Kumpel schläft neben mir.', beweis: 'Drei Schlafsäcke. Einer bewegt sich nicht.', dann: 'Aus dem dritten ragt ein Huf.',
    monster: 'Schlaf weiter.', ende: 'Am Morgen ist der dritte Schlafsack leer. Mein Kumpel auch.' },
  { titel: 'Das fünfte Fenster', ort: 'haus', boese: 'frau', hook: 'Mein Haus hat 4 Fenster nach vorn. Nachts leuchten aber 5.',
    zweifel: 'Ich gehe raus und zähle von der Straße.', beweis: 'Das fünfte Fenster ist zwischen Küche und Bad.', dann: 'Da ist innen nur Wand.',
    monster: 'Ich sehe dich.', ende: 'Im fünften Fenster steht jemand und winkt. Mit meiner Hand.' },
  { titel: 'Der vierte Schlüssel', ort: 'haus', boese: 'schatten', hook: 'Ich habe 3 Schlüssel. Heute Nacht hängen aber 4 am Brett.',
    zweifel: 'Ich habe nur drei machen lassen.', beweis: 'Der vierte Schlüssel ist noch warm.', dann: 'Er passt in meine Schlafzimmertür. Von innen.',
    monster: 'Ich habe auch einen.', ende: 'Am Morgen fehlt der vierte Schlüssel. Und meine Tür ist abgeschlossen.' },
];

export const MUSTER5 = { zahl: [zahl, ZAHL] };

export const TEIL2_5 = {
  zahl: () => ({ hook: 'Ich zähle nichts mehr. Heute Nacht zählt jemand mich.', saetze: ['Nachts höre ich eine Stimme.', 'Sie zählt ganz langsam.', 'Bei jeder Zahl ein Schritt.', 'Sie ist bei drei. Ich bin der dritte.'],
    ende: 'Ich halte die Luft an. Die Stimme sagt: Da fehlt einer.', monster: 'Gefunden.', frage: 'Hättest du dich versteckt?', wahl: ['Verstecken', 'Rennen'] }),
};

export const DU_HOOKS5 = {
  'Einer zu viel auf dem Foto': 'Zähl nach einer Wanderung die Leute auf deinen Fotos.',
  'Vierzehn Stufen': 'Zähl heute Nacht die Schritte auf deiner Treppe.',
  'Das Klassenfoto': 'Lass eine App die Gesichter auf deinem Klassenfoto zählen.',
  'Der dritte Teller': 'Steht bei dir nachts ein Teller zu viel, schau nicht unter den Tisch.',
  'Das zweite Hotelbett': 'Mach im Hotel ein Foto von deinem Bett, bevor du schläfst.',
  'Die Aufzugwaage': 'Zeigt die Aufzug-Waage mehr an, als du wiegst, steig sofort aus.',
  'Der sechste im Chat': 'Schreibt in deinem Gruppenchat einer zu viel, lies es nicht.',
  'Zwei Kinokarten': 'Klappt im leeren Kino der Sitz neben dir runter, bleib sitzen.',
  'Einunddreißig Kerzen': 'Zähl die Kerzen auf deinem Geburtstagsfoto.',
  'Der dritte Schlafsack': 'Zähl im Zelt nie die Schlafsäcke, wenn du nachts wach wirst.',
  'Das fünfte Fenster': 'Geh raus und zähl die Fenster deiner Wohnung von außen.',
  'Der vierte Schlüssel': 'Hast du einen Schlüssel mehr, als du machen lassen hast, lauf.',
};
