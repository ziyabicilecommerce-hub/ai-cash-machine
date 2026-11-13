// Muster 18-20 (13.11., Wunsch: "komplett neue Storys"): drei neue Themen, die es bisher nicht gab.
//   verlauf: das Handy weiß, was nachts passiert ist (Suchverlauf, Standort, Galerie, Kalender ...)
//   fund:    ich finde etwas, das es nicht geben dürfte (Handy, Kamera, Tagebuch, Ausweis ...)
//   nachbar: das Haus, die Nachbarn, das Treppenhaus
// Gleiche Regeln wie Muster 1-17: Hook höchstens 70 Zeichen, Uhrzeit/Zahl und "aber" im Hook, Twist am Ende, Du-Hook, Teil 2.
export const MUSTER6 = {};
export const TEIL2_6 = {};
export const DU_HOOKS6 = {};

const bau = (frage, wahl) => (v) => ({
  titel: v.titel, ort: v.ort || 'haus', boesewicht: v.boese, stimme: v.stimme || 'mann',
  hook: v.hook, saetze: [v.a, v.b, v.c], monster: v.monster, ende: v.ende, frage, wahl,
});

const VERLAUF = [
  { titel: 'Der Suchverlauf', boese: 'schatten', hook: 'Mein Suchverlauf zeigt eine Suche um 3:12 Uhr. Ich schlief aber.',
    a: 'Gesucht wurde: Wie leise kann man atmen.', b: 'Zwei Minuten später: Wie lange schläft er noch.', c: 'Die letzte Suche ist von jetzt.',
    monster: 'Gleich.', ende: 'Sie lautet: Wie öffnet man eine Schlafzimmertür ohne Geräusch.' },
  { titel: 'Der Standortverlauf', ort: 'wald', boese: 'hirsch', hook: 'Meine Standort-App zeigt mich um 3 Uhr im Wald. Ich war aber im Bett.',
    a: 'Die Route führt vom Bett direkt zur Haustür.', b: 'Dann zwei Stunden durch den Wald.', c: 'Und wieder zurück. Bis an mein Bett.',
    monster: 'Morgen gehen wir weiter.', ende: 'Unter meiner Decke liegt nasses Laub. Und ein Huf.' },
  { titel: 'Die neue Galerie', boese: 'frau', hook: 'Meine Galerie hat 40 neue Fotos von heute Nacht. Ich schlief aber.',
    a: 'Alle zeigen mich. Schlafend.', b: 'Jedes Foto ist näher an meinem Gesicht.', c: 'Auf dem letzten sind meine Augen offen.',
    monster: 'Lächeln.', ende: 'Das Foto wurde von außen gemacht. Durch mein Fenster im vierten Stock.' },
  { titel: 'Der leere Akku', boese: 'gremlin', hook: 'Mein Akku ist jeden Morgen leer. Die App zeigt aber 4 Stunden Kamera.',
    a: 'Heute lasse ich die Kamera-App selbst laufen.', b: 'Um 3 Uhr wird das Handy hochgehoben.', c: 'Es filmt mein Gesicht. Ganz lange.',
    monster: 'Nur ich darf das.', ende: 'Auf dem Video hält eine Hand das Handy. Meine Hände liegen unter der Decke.' },
  { titel: 'Die Bildschirmzeit', boese: 'frau', stimme: 'frau', hook: 'Meine Bildschirmzeit zeigt 3 Stunden heute Nacht. Ich schlief aber.',
    a: 'Die meiste Zeit: Chat mit meiner Mutter.', b: 'Meine Mutter ist seit drei Jahren tot.', c: 'Der Chat ist voll. Ich habe jede Nachricht geschrieben.',
    monster: 'Sie lässt grüßen.', ende: 'Ihre letzte Antwort ist von eben: Sie wacht auf. Mach das Licht aus.' },
  { titel: 'Der lachende Lautsprecher', boese: 'gremlin', hook: 'Mein Sprachassistent lacht um 3 Uhr. Gefragt hat ihn aber niemand.',
    a: 'Ich frage ihn, was so lustig ist.', b: 'Er sagt: Du hast mich nicht gefragt.', c: 'Dann flüstert er: Er hat gefragt.',
    monster: 'Wer schläft, verliert.', ende: 'In der App steht die letzte Frage. Wann ist er endlich allein.' },
  { titel: 'Das fremde Gerät', boese: 'schatten', hook: 'Mein WLAN zeigt um 3 Uhr ein Gerät zu viel. Ich wohne aber allein.',
    a: 'Das Gerät heißt: Unter deinem Bett.', b: 'Es ist seit drei Wochen verbunden.', c: 'Heute Nacht schickt es zum ersten Mal etwas.',
    monster: 'Verbunden.', ende: 'Es ist ein Foto. Von unten. Durch meine Matratze.' },
  { titel: 'Das Schlaflied', boese: 'frau', stimme: 'frau', hook: 'Meine Musik-App spielt um 3 Uhr ein Schlaflied. Ich aber nicht.',
    a: 'Das Lied heißt: Schlaf, Kindlein, schlaf.', b: 'Ich habe keine Kinder.', c: 'Heute höre ich es. Aus meinem Kleiderschrank.',
    monster: 'Schlaf.', ende: 'Das Lied endet. Jemand flüstert: Endlich schläft er.' },
  { titel: 'Der Termin um drei', boese: 'schatten', hook: 'Mein Handy hat einen Termin um 3 Uhr. Eingetragen habe ich ihn nicht.',
    a: 'Der Termin heißt: Besuch.', b: 'Ort: dein Schlafzimmer.', c: 'Um 2:59 Uhr kommt die Erinnerung.',
    monster: 'Ich bin pünktlich.', ende: 'Um 3 Uhr klopft es. Von innen an meiner Schlafzimmertür.' },
  { titel: 'Der Entwurf', boese: 'gremlin', hook: 'Mein Postfach hat einen Entwurf von 3 Uhr. Ich schrieb aber nichts.',
    a: 'Er ist an mich selbst adressiert.', b: 'Der Text lautet: Schau unters Bett.', c: 'Ich schaue nicht. Ich lösche ihn.',
    monster: 'Kluger Junge.', ende: 'Ein neuer Entwurf ist da: Gut, dass du nicht schaust. Ich bin über dir.' },
];

const FUND = [
  { titel: 'Das Handy im Zug', ort: 'zug', boese: 'schatten', hook: 'Im Zug finde ich ein Handy. Auf dem Sperrbild ist aber mein Foto.',
    a: 'Das Foto ist von heute. Von hinten.', b: 'Ich drehe mich um. Der Wagen ist leer.', c: 'Das Handy klingelt. Anrufer: meine Nummer.',
    monster: 'Gib es mir zurück.', ende: 'Ich gehe ran. Meine eigene Stimme sagt: Dreh dich nicht um.' },
  { titel: 'Die Wildkamera', ort: 'wald', boese: 'hirsch', hook: 'Im Wald finde ich eine Kamera. Das letzte Foto ist aber von mir.',
    a: 'Ich bin heute zum ersten Mal hier.', b: 'Das Foto ist von vorhin. Von ganz nah.', c: 'Ich blättere zurück. Es sind hunderte.',
    monster: 'Bitte lächeln.', ende: 'Das erste Foto zeigt mich als Baby. In meinem Kinderzimmer.' },
  { titel: 'Der dritte Schlüssel', boese: 'schatten', hook: 'Um 3 Uhr liegt ein Schlüssel im Flur. Er passt aber in meine Tür.',
    a: 'Meinen Schlüssel habe ich noch.', b: 'Den Ersatzschlüssel auch.', c: 'Jemand hat einen dritten nachmachen lassen.',
    monster: 'Danke.', ende: 'Ich schließe zweimal ab. Hinter mir sagt jemand: Jetzt sind wir allein.' },
  { titel: 'Das Tagebuch im Keller', boese: 'frau', hook: 'Im Keller liegt ein Tagebuch. Ein Eintrag ist aber von morgen, 3 Uhr.',
    a: 'Die Schrift ist meine.', b: 'Morgen, 3 Uhr: Ich finde ein Tagebuch im Keller.', c: 'Danach: Ich gehe nie mehr hoch.',
    monster: 'Bleib hier unten.', ende: 'Die Kellertür fällt zu. Von außen dreht sich der Schlüssel.' },
  { titel: 'Der Teddy im Wald', ort: 'wald', boese: 'frau', hook: 'Im Wald finde ich einen Teddy. In ihm kommt aber eine Nachricht an.',
    a: 'In ihm steckt ein Babyphone. Es ist an.', b: 'Darin atmet ein Kind.', c: 'Dann sagt es: Papa, du hast mich gefunden.',
    monster: 'Nimm mich mit.', ende: 'Ich habe keine Kinder. Zuhause blinkt ein zweites Babyphone. In meinem Flur.' },
  { titel: 'Das Sofortbild', boese: 'schatten', hook: 'Um 3 Uhr liegt ein Foto unter meinem Bett. Darauf schlafe ich gerade.',
    a: 'Es ist ein Sofortbild. Noch warm.', b: 'Gemacht von unter dem Bett.', c: 'Unter dem Bett ist jetzt niemand. Nur Platz für einen.',
    monster: 'Rutsch rüber.', ende: 'Am Morgen liegt ein neues Foto da. Darauf liegen wir zu zweit.' },
  { titel: 'Der Koffer mit meinem Namen', ort: 'flugzeug', boese: 'gremlin', hook: 'Im Flugzeug liegt ein Koffer mit meinem Namen. Ich habe aber keinen.',
    a: 'Ich öffne ihn an meinem Platz.', b: 'Darin ist alles aus meinem Kleiderschrank.', c: 'Und ein Zettel: Du brauchst sie nicht mehr.',
    monster: 'Endstation.', ende: 'Der Pilot sagt durch: Wir landen nicht. Bitte bleiben Sie sitzen.' },
  { titel: 'Die Karte im Aufzug', ort: 'aufzug', boese: 'schatten', hook: 'Im Aufzug liegt eine Karte mit meiner Nummer. Ich habe aber keine.',
    a: 'Auf der Rückseite steht: Etage minus 3.', b: 'Der Knopf leuchtet von selbst.', c: 'Mein Handy klingelt. Meine eigene Nummer.',
    monster: 'Steig aus.', ende: 'Die Tür geht auf. Im Flur hängen hunderte Karten. Alle mit meinem Gesicht.' },
  { titel: 'Die Kinderzeichnung', boese: 'gremlin', hook: 'Im Gästezimmer liegt um 3 Uhr ein Kinderbild. Ich habe aber kein Kind.',
    a: 'Sie zeigt unser Haus. Und mich im Bett.', b: 'Neben dem Bett steht eine große schwarze Figur.', c: 'Darunter steht in Kinderschrift: Heute Nacht.',
    monster: 'Ich male gern.', ende: 'Am Morgen liegt ein neues Bild da. Das Bett darauf ist leer.' },
  { titel: 'Der Ausweis', ort: 'flugzeug', boese: 'frau', hook: 'Im Flugzeug finde ich einen Ausweis. Das Foto darauf ist aber meins.',
    a: 'Der Name ist meiner. Das Geburtsdatum auch.', b: 'Gültig bis: heute.', c: 'Heute endet in einer Stunde.',
    monster: 'Abgelaufen.', ende: 'Um Mitternacht leuchtet das Anschnallzeichen. Nur über meinem Sitz.' },
];

const NACHBAR = [
  { titel: 'Schritte über ihm', boese: 'schatten', hook: 'Mein Nachbar sagt, ich laufe um 3 Uhr herum. Ich war aber verreist.',
    a: 'Er hört jede Nacht Schritte über sich.', b: 'Ich stelle eine Kamera in die Wohnung.', c: 'Um 3 Uhr geht jemand im Kreis um mein Bett.',
    monster: 'Ich warte auf dich.', ende: 'Heute Nacht bin ich zuhause. Die Schritte sind trotzdem da.' },
  { titel: 'Der Hauschat', boese: 'gremlin', hook: 'Im Hauschat fragt um 3 Uhr jemand, wer im Keller ist. Niemand weiß es.',
    a: 'Dann schreibt er: Ich sehe euch.', b: 'Er schickt ein Foto. Der Keller ist voller Betten.', c: 'In jedem Bett liegt einer von uns.',
    monster: 'Gute Nacht, Nachbarn.', ende: 'Ich zähle die Betten. Eins ist noch leer. Mit meinem Namen.' },
  { titel: 'Der neue Mieter', boese: 'schatten', hook: 'Im Haus wohnt ein neuer Mieter. Seine Klingel hat aber meinen Namen.',
    a: 'Ich klingele bei ihm.', b: 'In meiner Wohnung klingelt es.', c: 'Durch seinen Türspion sehe ich mein Wohnzimmer.',
    monster: 'Mach auf.', ende: 'Ich stehe draußen. Drinnen geht bei mir das Licht aus.' },
  { titel: 'Wohnung 13', boese: 'frau', hook: 'Mein Hausmeister sagt, Wohnung 13 gibt es nicht. Ich wohne aber dort.',
    a: 'Im Plan geht es von 12 direkt zu 14.', b: 'Ich gehe heim und zähle die Türen.', c: 'Zwischen 12 und 14 ist nur eine Wand.',
    monster: 'Willkommen zurück.', ende: 'Hinter der Wand höre ich meinen Fernseher. Und mein Lachen.' },
  { titel: 'Das Treppenhauslicht', boese: 'schatten', hook: 'Im Treppenhaus geht um 3 Uhr das Licht an. Aber niemand ist da.',
    a: 'Es geht nur an, wenn sich etwas bewegt.', b: 'Es geht Stockwerk für Stockwerk an.', c: 'Jetzt geht es vor meiner Tür an.',
    monster: 'Ich bin da.', ende: 'Das Licht geht aus. Im Türspion ist es trotzdem hell. Ein Auge.' },
  { titel: 'Musik von nebenan', boese: 'frau', stimme: 'frau', hook: 'Nebenan läuft jede Nacht um 3 Uhr Musik. Die Wohnung ist aber leer.',
    a: 'Ich klingele nebenan. Niemand macht auf.', b: 'Der Hausmeister sagt: Dort wohnt seit Jahren keiner.', c: 'Die Musik ist mein Lieblingslied.',
    monster: 'Tanz mit mir.', ende: 'Heute ist die Musik nicht nebenan. Sie kommt aus meinem Schrank.' },
  { titel: 'Die Tür gegenüber', boese: 'schatten', hook: 'Um 3 Uhr steht die Tür gegenüber offen. Dort wohnt aber niemand.',
    a: 'Drinnen ist es stockdunkel.', b: 'Heute steht jemand im Türrahmen.', c: 'Er sieht aus wie ich. Nur älter.',
    monster: 'Komm rein. Du wohnst hier bald.', ende: 'Am Morgen steht meine Tür offen. Die gegenüber ist zu.' },
  { titel: 'Die Waschküche', boese: 'gremlin', hook: 'Im Keller läuft um 3 Uhr meine Waschmaschine. Ich war aber oben.',
    a: 'In der Trommel dreht sich meine Bettwäsche.', b: 'Die, auf der ich gerade geschlafen habe.', c: 'Ich gehe hoch. Mein Bett ist abgezogen.',
    monster: 'Frisch für dich.', ende: 'Auf der Matratze liegt jemand. Er trägt meinen Schlafanzug.' },
  { titel: 'Wer weint bei mir', boese: 'frau', stimme: 'frau', hook: 'Meine Nachbarin fragt, wer um 3 Uhr bei mir weint. Ich wohne allein.',
    a: 'Sie hört es jede Nacht durch die Wand.', b: 'Ich nehme die Nacht mit dem Handy auf.', c: 'Um 3 Uhr weint jemand. Direkt neben dem Handy.',
    monster: 'Nicht hinsehen.', ende: 'Auf der Aufnahme sagt das Weinen meinen Namen. Dann hört es auf.' },
  { titel: 'Der Rauchmelder', boese: 'gremlin', hook: 'Mein Rauchmelder piept um 3 Uhr. Er hat aber keine Batterie.',
    a: 'Ich schraube ihn ab.', b: 'Innen ist kein Rauchmelder. Nur ein kleines Mikrofon.', c: 'Es ist noch an.',
    monster: 'Ich höre dich.', ende: 'In der Wohnung über mir lacht jemand. Mit meiner Stimme.' },
];

MUSTER6.verlauf = [bau('Hättest du nachgeschaut?', ['Nachschauen', 'Handy weg']), VERLAUF];
MUSTER6.fund = [bau('Hättest du es mitgenommen?', ['Mitnehmen', 'Liegen lassen']), FUND];
MUSTER6.nachbar = [bau('Hättest du aufgemacht?', ['Aufmachen', 'Zulassen']), NACHBAR];

TEIL2_6.verlauf = () => ({ hook: 'Seit dieser Nacht ist mein Handy aus. Heute ging es trotzdem an.', saetze: ['Es liegt ausgeschaltet im Flur.', 'Um 3 Uhr leuchtet der Bildschirm.', 'Die Kamera ist auf mein Bett gerichtet.'],
  ende: 'Auf dem Display steht: Aufnahme läuft seit 3 Wochen.', monster: 'Ich sehe alles.', frage: 'Hättest du es zerstört?', wahl: ['Zerstören', 'Liegen lassen'] });
TEIL2_6.fund = () => ({ hook: 'Ich habe es zurückgelegt. Heute Nacht liegt es aber auf meinem Kissen.', saetze: ['Ich habe die Tür abgeschlossen.', 'Alle Fenster sind zu.', 'Trotzdem liegt es da. Noch warm.'],
  ende: 'Darunter liegt ein Zettel: Du hast etwas vergessen. Mich.', monster: 'Behalt mich.', frage: 'Hättest du es behalten?', wahl: ['Behalten', 'Verbrennen'] });
TEIL2_6.nachbar = () => ({ hook: 'Ich bin ausgezogen. Heute klingelt mein alter Nachbar aber bei mir.', saetze: ['Meine neue Adresse kennt niemand.', 'Er steht vor meiner Tür. Im Schlafanzug.', 'Er sagt: Du hast jemanden vergessen.'],
  ende: 'Hinter ihm im Treppenhaus steht meine alte Wohnungstür. Sie geht auf.', monster: 'Willkommen zuhause.', frage: 'Hättest du aufgemacht?', wahl: ['Aufmachen', 'Zulassen'] });

Object.assign(DU_HOOKS6, {
  'Der Suchverlauf': 'Schau morgens in deinen Suchverlauf. Steht da 3:12 Uhr, renn.',
  'Der Standortverlauf': 'Zeigt dein Standort dich nachts im Wald, bleib heute wach.',
  'Die neue Galerie': 'Hat deine Galerie morgens neue Fotos von dir, schau nicht rein.',
  'Der leere Akku': 'Ist dein Akku morgens leer, schau dir die Kamera-App an.',
  'Die Bildschirmzeit': 'Prüf heute deine Bildschirmzeit. Achte auf die Zeit nach 3 Uhr.',
  'Der lachende Lautsprecher': 'Lacht dein Sprachassistent nachts, frag ihn nicht warum.',
  'Das fremde Gerät': 'Zeigt dein WLAN ein Gerät zu viel, schau unter dein Bett.',
  'Das Schlaflied': 'Spielt deine Musik-App nachts ein Schlaflied, öffne den Schrank nicht.',
  'Der Termin um drei': 'Hat dein Kalender einen Termin um 3 Uhr, schließ dein Zimmer ab.',
  'Der Entwurf': 'Findest du einen Entwurf, den du nicht geschrieben hast, lösch ihn.',
  'Das Handy im Zug': 'Findest du ein Handy mit deinem Foto, geh nicht ran.',
  'Die Wildkamera': 'Findest du im Wald eine Kamera, schau dir nie das erste Foto an.',
  'Der dritte Schlüssel': 'Findest du einen Schlüssel, der in deine Tür passt, zieh aus.',
  'Das Tagebuch im Keller': 'Findest du ein Tagebuch in deiner Schrift, lies nicht weiter.',
  'Der Teddy im Wald': 'Findest du im Wald einen Teddy, nimm ihn nicht mit.',
  'Das Sofortbild': 'Liegt unter deinem Bett ein Foto, dreh es nicht um.',
  'Der Koffer mit meinem Namen': 'Steht im Flugzeug ein Koffer mit deinem Namen, mach ihn nicht auf.',
  'Die Karte im Aufzug': 'Liegt im Aufzug eine Karte mit deiner Nummer, steig aus.',
  'Die Kinderzeichnung': 'Findest du ein Kinderbild von deinem Haus, zähl die Figuren.',
  'Der Ausweis': 'Findest du einen Ausweis mit deinem Foto, lies nicht das Datum.',
  'Schritte über ihm': 'Sagt dein Nachbar, du warst nachts laut, stell eine Kamera auf.',
  'Der Hauschat': 'Fragt dein Hauschat nachts, wer im Keller ist, antworte nicht.',
  'Der neue Mieter': 'Steht dein Name an einer fremden Klingel, drück sie nie.',
  'Wohnung 13': 'Sagt dein Hausmeister, deine Wohnung gibt es nicht, glaub ihm.',
  'Das Treppenhauslicht': 'Geht dein Treppenhauslicht nachts an, schau nicht durch den Spion.',
  'Musik von nebenan': 'Hörst du nachts Musik aus einer leeren Wohnung, tanz nicht mit.',
  'Die Tür gegenüber': 'Steht die Tür gegenüber deiner nachts offen, geh nicht rein.',
  'Die Waschküche': 'Läuft deine Waschmaschine nachts von allein, geh nicht hoch.',
  'Wer weint bei mir': 'Fragt deine Nachbarin, wer bei dir weint, nimm die Nacht nicht auf.',
  'Der Rauchmelder': 'Piept dein Rauchmelder ohne Batterie, sag kein Wort.',
});
