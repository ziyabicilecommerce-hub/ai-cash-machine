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

// Muster 16 + 17 aus dem Welt-Radar (09.11.): "Klartraum" steigt in Tokio und Paris, "Polarlicht" in Tokio (x6,8) und China.
const traum = (v) => ({
  titel: v.titel, ort: 'haus', boesewicht: v.boese, stimme: v.stimme || 'mann',
  hook: v.hook, saetze: ['Ich weiß, dass ich träume.', v.a, v.b, v.c],
  monster: v.monster, ende: v.ende, frage: 'Hättest du versucht aufzuwachen?', wahl: ['Aufwachen', 'Weiterträumen'],
});
const TRAUM = [
  { titel: 'Aufwachen im Traum', boese: 'schatten', hook: 'Ich wache um 3 Uhr auf. Aber ich bin noch im Traum.',
    a: 'Im Traum klingelt mein Handy.', b: 'Auf dem Display steht: Wach auf.', c: 'Ich wache auf. Das Handy klingelt immer noch.',
    monster: 'Bleib.', ende: 'Auf dem Display steht jetzt: Zu spät.' },
  { titel: 'Die Uhr im Traum', boese: 'gremlin', hook: 'Im Traum zeigt jede Uhr 3:12. Heute aber auch nach dem Aufwachen.',
    a: 'Im Traum kann man Uhren nicht lesen, heißt es.', b: 'Ich lese sie trotzdem. Jede zeigt 3:12.', c: 'Ich wache auf und schaue aufs Handy.',
    monster: 'Schlaf weiter.', ende: 'Es ist 3:12 Uhr. Und neben mir atmet jemand.' },
  { titel: 'Der Mann aus dem Traum', boese: 'schatten', hook: 'Im Traum sehe ich jede Nacht einen Mann. Heute aber nicht im Traum.',
    a: 'Er steht immer am Ende meines Bettes.', b: 'Heute wache ich auf. Er steht immer noch da.', c: 'Er hält mein Handy in der Hand.',
    monster: 'Endlich wach.', ende: 'Er tippt etwas und legt es zurück. Da steht: Jetzt bist du dran.' },
  { titel: 'Das Traumbuch', boese: 'frau', stimme: 'frau', hook: 'Mein Traumbuch hat heute Nacht einen Eintrag. Nicht von mir.',
    a: 'Ich schreibe jeden Morgen meine Träume auf.', b: 'Der neue Eintrag ist in meiner Schrift.', c: 'Er beschreibt, wie ich schlafe. Von oben.',
    monster: 'Lies weiter.', ende: 'Der letzte Satz lautet: Morgen schreibe ich aus deinem Bett.' },
  { titel: 'Schlafparalyse', boese: 'gremlin', hook: 'Ich kann mich um 3 Uhr nicht bewegen. Aber jemand sitzt auf mir.',
    a: 'Meine Augen sind offen.', b: 'Es ist schwer und kalt.', c: 'Es flüstert: Atme leiser.',
    monster: 'Atme leiser.', ende: 'Am Morgen sind auf meiner Brust zwei kleine Handabdrücke.' },
  { titel: 'Der gleiche Traum', boese: 'frau', stimme: 'frau', hook: 'Im Traum sagt meine Schwester: Wach nicht auf. Sie träumte es auch.',
    a: 'Sie sagt, im Traum bin ich sicher.', b: 'Morgens schreibt sie mir: Hast du mich auch gesehen?', c: 'Ich schreibe: Ja. Warum soll ich nicht aufwachen?',
    monster: 'Bleib hier.', ende: 'Sie antwortet: Weil draußen nicht mehr ich auf dich warte.' },
  { titel: 'Das Haus aus dem Traum', boese: 'schatten', hook: 'Ich träume von einem Haus. Heute Nacht steht es aber vor mir.',
    a: 'Ich kenne jede Tür darin.', b: 'Ich finde es auf der Karte. Zwei Straßen weiter.', c: 'Die Tür ist offen. Drinnen brennt Licht.',
    monster: 'Willkommen zurück.', ende: 'Im Schlafzimmer liegt jemand im Bett. Er trägt meinen Schlafanzug.' },
  { titel: 'Viermal aufgewacht', boese: 'frau', hook: 'Ich wache 4 Mal hintereinander auf. Aber nie wirklich.',
    a: 'Jedes Mal ist das Zimmer ein bisschen anders.', b: 'Beim vierten Mal fehlt das Fenster.', c: 'Hinter mir sagt meine Mama: Endlich bist du wach.',
    monster: 'Endlich.', ende: 'Meine Mama ist seit zehn Jahren tot.' },
  { titel: 'Der Spiegel im Traum', boese: 'frau', stimme: 'frau', hook: 'Im Traum sehe ich in den Spiegel. Mein Spiegelbild schläft aber nicht.',
    a: 'Im Traum sehen Spiegel immer falsch aus.', b: 'Mein Spiegelbild lächelt. Ich nicht.', c: 'Ich wache auf und gehe ins Bad.',
    monster: 'Ich bleibe hier.', ende: 'Im Spiegel liegt mein Spiegelbild noch im Bett. Es winkt.' },
  { titel: 'Null Minuten Schlaf', boese: 'gremlin', hook: 'Meine Schlaf-App sagt: 0 Minuten Schlaf. Ich habe aber geträumt.',
    a: 'Ich weiß noch jedes Detail.', b: 'Die App zeigt eine Bewegung um 3:12 Uhr.', c: 'Ich bin aufgestanden und in den Keller gegangen.',
    monster: 'Schlafwandler.', ende: 'Im Keller liegt mein Kissen. Es ist noch warm.' },
];

const himmel = (v) => ({
  titel: v.titel, ort: 'haus', boesewicht: v.boese, stimme: v.stimme || 'mann',
  hook: v.hook, saetze: ['Ich gehe nach draußen.', v.a, v.b, v.c],
  monster: v.monster, ende: v.ende, frage: 'Wärst du draußen geblieben?', wahl: ['Draußen bleiben', 'Reingehen'],
});
const HIMMEL = [
  { titel: 'Polarlicht über meinem Haus', boese: 'schatten', hook: 'Heute Nacht ist Polarlicht. Aber nur über meinem Haus.',
    a: 'Alle Nachbarn filmen den Himmel.', b: 'In dem grünen Licht bewegt sich etwas.', c: 'Es ist groß und schaut nach unten.',
    monster: 'Gefunden.', ende: 'Das Licht geht aus. Und auf meinem Dach knarzt es.' },
  { titel: 'Der Stern, der näher kommt', boese: 'gremlin', hook: 'Um 3 Uhr ist ein Stern heller als alle anderen. Aber er blinkt nicht.',
    a: 'Er wird jede Minute größer.', b: 'Meine Kamera-App erkennt ein Gesicht.', c: 'Der Stern steht jetzt über meinem Garten.',
    monster: 'Mach auf.', ende: 'Er geht aus. Und es klopft an mein Fenster.' },
  { titel: 'Der zweite Mond', boese: 'frau', hook: 'Heute Nacht sehe ich 2 Monde. Auf meinem Handy-Foto aber nur einen.',
    a: 'Meine Freundin sieht auch zwei.', b: 'Der zweite ist kleiner. Und er blinzelt.', c: 'Er dreht sich langsam zu uns.',
    monster: 'Eine reicht.', ende: 'Am Morgen gibt es nur einen Mond. Meine Freundin ist weg.' },
  { titel: 'Die Sternschnuppe antwortet', boese: 'schatten', hook: 'Um 3 Uhr wünsche ich mir etwas. Die Sternschnuppe antwortet aber.',
    a: 'Ich wünsche mir, nie mehr allein zu sein.', b: 'Mein Handy vibriert. Eine Nachricht ohne Absender.', c: 'Sie lautet: Wunsch erfüllt.',
    monster: 'Für immer.', ende: 'Seitdem höre ich nachts ein zweites Atmen. Neben mir.' },
  { titel: 'Dunkel am Mittag', boese: 'schatten', hook: 'Im Radio sagen sie: Heute keine Finsternis. Aber es wird dunkel.',
    a: 'Mitten am Tag wird alles schwarz.', b: 'Die Straßenlaternen gehen nicht an.', c: 'Im Dunkeln flüstern alle Nachbarn meinen Namen.',
    monster: 'Komm raus.', ende: 'Als es hell wird, stehen alle vor meiner Tür. Mit geschlossenen Augen.' },
];
MUSTER5.traum = [traum, TRAUM];
MUSTER5.himmel = [himmel, HIMMEL];

TEIL2_5.traum = () => ({ hook: 'Ich schlafe nicht mehr. Trotzdem träume ich weiter.', saetze: ['Ich sitze wach in der Küche.', 'Plötzlich ist die Küche falsch.', 'Die Fenster sind zugemauert.', 'Am Tisch sitzt der Mann aus meinem Traum.'],
  ende: 'Er schiebt mir einen Kaffee hin. Es ist meine Tasse von morgen.', monster: 'Guten Morgen.', frage: 'Hättest du getrunken?', wahl: ['Trinken', 'Wegrennen'] });
TEIL2_5.himmel = () => ({ hook: 'Seit dieser Nacht schaue ich nicht mehr nach oben. Heute schaut es runter.', saetze: ['Alle Fenster sind verhängt.', 'Trotzdem wird es im Zimmer grün.', 'Das Licht kommt durch die Decke.', 'Darin ein Gesicht. Ganz nah.'],
  ende: 'Es flüstert: Du hast mich gesehen. Jetzt sehe ich dich.', monster: 'Hallo.', frage: 'Wärst du rausgerannt?', wahl: ['Rausrennen', 'Verstecken'] });

Object.assign(DU_HOOKS5, {
  'Aufwachen im Traum': 'Wenn du im Traum aufwachst, bleib still liegen.',
  'Die Uhr im Traum': 'Schau im Traum auf deine Uhr. Steht sie auf 3:12, wach auf.',
  'Der Mann aus dem Traum': 'Siehst du im Traum jede Nacht denselben Mann, sprich ihn nicht an.',
  'Das Traumbuch': 'Schreib deine Träume auf und lies morgens jeden Eintrag.',
  'Schlafparalyse': 'Kannst du dich nachts nicht bewegen, atme ganz leise.',
  'Der gleiche Traum': 'Sagt dir im Traum jemand, du sollst nicht aufwachen, wach auf.',
  'Das Haus aus dem Traum': 'Steht das Haus aus deinen Träumen vor dir, geh nicht rein.',
  'Viermal aufgewacht': 'Wachst du mehrmals hintereinander auf, zähl deine Fenster.',
  'Der Spiegel im Traum': 'Schau im Traum nie in deinen Spiegel.',
  'Null Minuten Schlaf': 'Zeigt deine Schlaf-App 0 Minuten Schlaf, prüf deinen Keller.',
  'Polarlicht über meinem Haus': 'Gibt es Polarlicht nur über deinem Haus, geh sofort rein.',
  'Der Stern, der näher kommt': 'Ist ein Stern über dir heller als alle und blinkt nicht, schau weg.',
  'Der zweite Mond': 'Siehst du nachts zwei Monde, mach kein Foto davon.',
  'Die Sternschnuppe antwortet': 'Wünsch dir nie etwas von einer Sternschnuppe um 3 Uhr nachts.',
  'Dunkel am Mittag': 'Wird es mittags bei dir dunkel, ohne Finsternis, bleib drinnen.',
});
