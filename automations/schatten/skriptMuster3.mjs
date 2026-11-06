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


// 12) Doppelgänger: andere haben mich gesehen, wo ich nie war
const doppel = (v) => ({
  titel: v.titel, ort: v.ort || 'haus', boesewicht: 'schatten', stimme: 'mann',
  hook: v.hook, saetze: ['Ich lache darüber.', 'Ich war die ganze Zeit zu Hause.', v.beweis, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Was hättest du gemacht?', wahl: ['Nachsehen', 'Abschließen'],
});
const DOPPEL = [
  { titel: 'Ich im Supermarkt', hook: 'Mein Kumpel schickt ein Foto. Ich im Supermarkt. Um 3 Uhr nachts.',
    beweis: 'Auf dem Foto trage ich meine Jacke. Sie hängt hier am Haken.', dann: 'Die Jacke am Haken ist nass. Draußen regnet es.',
    monster: 'Ich war einkaufen.', ende: 'Im Kühlschrank stehen Sachen, die ich nie gekauft habe. Und mein Lieblingsessen. Zweimal.' },
  { titel: 'Zwei Mal im Chat', hook: 'Meine Freundin schreibt: Danke für heute Abend. Ich war nicht da.',
    beweis: 'Sie schickt ein Selfie von uns beiden. Ich lächle darauf.', dann: 'Ich lächle nie so. Mit so vielen Zähnen.',
    monster: 'Sie mag mich mehr.', ende: 'Jetzt schreibt sie: Warum stehst du schon wieder vor meiner Tür?' },
  { titel: 'Die Nachbarin grüßt', hook: 'Meine Nachbarin sagt: Du hast mich heute Nacht gegrüßt. Um 3 Uhr.',
    beweis: 'Sie sagt, ich stand im Treppenhaus. Barfuß.', dann: 'Unten im Treppenhaus sind nasse Fußabdrücke. Sie führen zu meiner Tür.',
    monster: 'Guten Abend.', ende: 'Sie führen nicht hinaus. Sie führen hinein.' },
  { titel: 'Die Kamera im Laden', hook: 'Im Laden zeigt die Kamera einen Mann hinter mir. Mit meinem Gesicht.',
    beweis: 'Ich drehe mich um. Da ist niemand.', dann: 'Auf dem Bildschirm dreht er sich auch um. Aber langsamer.',
    monster: 'Geh nach Hause.', ende: 'Zu Hause ist das Licht an. Ich habe es ausgemacht.', ort: 'haus' },
  { titel: 'Zwei Schlüssel', hook: 'Um 3 Uhr schließe ich auf. Von innen schließt jemand zu. Allein.',
    beweis: 'Ich höre das Klicken genau gleichzeitig.', dann: 'Durch die Tür sagt meine eigene Stimme: Besetzt.',
    monster: 'Besetzt.', ende: 'Ich klingle bei mir. Ich mache mir auf.' },
];

// 13) Nachtschicht: allein bei der Arbeit, nachts
const schicht = (v) => ({
  titel: v.titel, ort: v.ort || 'haus', boesewicht: v.boese, stimme: 'mann',
  hook: v.hook, saetze: ['Ich bin allein in der Nachtschicht.', 'Alle Türen sind abgeschlossen.', v.sieht, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Hättest du nachgesehen?', wahl: ['Nachsehen', 'Abhauen'],
});
const SCHICHT = [
  { titel: 'Der Wachmann', boese: 'schatten', hook: 'Um 3 Uhr zeigt Kamera 4 jemanden im leeren Büro. Ich bin der Wachmann.',
    sieht: 'Er sitzt an meinem Schreibtisch.', dann: 'Er dreht sich zur Kamera und winkt.',
    monster: 'Schöne Schicht.', ende: 'Ich schaue auf meinen Schreibtisch. Auf meinem Stuhl ist es noch warm.' },
  { titel: 'Zimmer 9', boese: 'frau', hook: 'Um 3 Uhr klingelt Zimmer 9 im Pflegeheim. Zimmer 9 steht leer.',
    sieht: 'Ich gehe hin. Das Bett ist frisch gemacht.', dann: 'Die Klingel läutet wieder. Diesmal aus dem Schrank.',
    monster: 'Schwester.', ende: 'Im Dienstplan steht für Zimmer 9 ein Name. Meiner.' },
  { titel: 'Tankstelle', boese: 'gremlin', hook: 'Um 3 Uhr tankt jemand an Säule 2. Die Säule ist seit Jahren kaputt.',
    sieht: 'Auf dem Monitor läuft die Zahl hoch.', dann: 'Dann steht er an der Scheibe. Er tippt mit einem Finger dagegen.',
    monster: 'Mach auf.', ende: 'Auf der Rechnung steht: Bezahlt. Von dir. Morgen.' },
  { titel: 'Das Museum', boese: 'schatten', hook: 'Im Museum zähle ich nachts die Figuren. Heute ist eine mehr da.',
    sieht: 'Sie steht in der Ecke. Ohne Schild.', dann: 'Bei der nächsten Runde steht sie näher am Ausgang.',
    monster: 'Noch eine Runde.', ende: 'Bei der dritten Runde ist sie weg. Und mein Platz im Wachraum ist besetzt.' },
  { titel: 'Die Bäckerei', boese: 'frau', hook: 'Um 3 Uhr backe ich allein. Heute liegt ein fertiges Brot im Ofen.',
    sieht: 'Ich habe den Ofen nicht angemacht.', dann: 'Im Mehl auf dem Tisch sind Handabdrücke. Kleine.',
    monster: 'Für dich.', ende: 'Hinter mir kichert jemand. Auf Höhe meiner Knie.' },
];

// 14) Sprachmemo: das Handy nimmt nachts etwas auf
const memo = (v) => ({
  titel: v.titel, ort: 'haus', boesewicht: v.boese, stimme: 'frau',
  hook: v.hook, saetze: ['Ich habe nichts aufgenommen.', 'Ich spiele es trotzdem ab.', v.hoert, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Hättest du weitergehört?', wahl: ['Weiterhören', 'Löschen'],
});
const MEMO = [
  { titel: 'Schlafgeräusche', boese: 'schatten', hook: 'Meine Schlaf-App hat heute Nacht etwas aufgenommen. Um 3:12 Uhr.',
    hoert: 'Erst höre ich mich atmen.', dann: 'Dann atmet jemand anderes. Viel näher am Handy.',
    monster: 'Schlaf weiter.', ende: 'Am Ende flüstert es: Morgen nehme ich dich auf.' },
  { titel: 'Sprachnachricht an Mama', boese: 'frau', hook: 'Mama fragt, warum ich ihr um 3 Uhr eine Sprachnachricht schickte.',
    hoert: 'Ich höre sie mir an.', dann: 'Es ist meine Stimme. Sie sagt: Ich bin nicht mehr allein hier.',
    monster: 'Hallo Mama.', ende: 'Dann eine zweite Stimme: Sag ihr nichts.' },
  { titel: 'Das Diktiergerät', boese: 'gremlin', hook: 'Mein Handy hat 6 Stunden aufgenommen. Ich lag die ganze Nacht im Bett.',
    hoert: 'Ich höre Schritte. Durch alle Zimmer.', dann: 'Sie bleiben vor meinem Bett stehen. Eine Stunde lang.',
    monster: 'Wach auf.', ende: 'Dann sagt jemand meinen Namen. Und ich antworte. Im Schlaf.' },
  { titel: 'Die Mailbox', boese: 'frau', hook: 'Meine Mailbox hat eine neue Nachricht. Von meiner eigenen Nummer.',
    hoert: 'Erst rauscht es.', dann: 'Dann sagt meine Stimme: Wenn du das hörst, schau nicht in den Flur.',
    monster: 'Zu spät.', ende: 'Im Flur geht das Licht an. Ich habe es nicht angemacht.' },
  { titel: 'Babys Lachen', boese: 'gremlin', hook: 'Meine Diktier-App hat ein Lachen aufgenommen. Ich habe kein Baby.',
    hoert: 'Das Lachen kommt aus dem Kinderzimmer.', dann: 'Wir haben kein Kinderzimmer. Nur eine Abstellkammer.',
    monster: 'Spiel mit mir.', ende: 'Die Tür der Abstellkammer steht offen. Und es lacht wieder.' },
];

export const MUSTER3 = { lieferung: [lieferung, LIEFERUNG], wand: [wand, WAND], doppel: [doppel, DOPPEL], schicht: [schicht, SCHICHT], memo: [memo, MEMO] };

const t2 = (hook, saetze, ende, monster, frage, wahl) => ({ hook, saetze, ende, monster, frage, wahl });
export const TEIL2_3 = {
  lieferung: () => t2('Ich nehme keine Pakete mehr an. Heute liegt eins in meinem Bett.', ['Die Tür war abgeschlossen.', 'Auf dem Paket steht: Zugestellt an Mitbewohner.', 'Ich habe keinen Mitbewohner.', 'Im Bad läuft das Wasser.'],
    'Auf dem Spiegel steht: Danke, dass ich bleiben darf.', 'Ich bleibe.', 'Hättest du ins Bad geschaut?', ['Ins Bad', 'Raus hier']),
  doppel: () => t2('Ich habe die Schlösser getauscht. Heute stehe ich trotzdem in meinem Flur.', ['Ich sehe mich durch den Türspion.', 'Ich trage meine Kleidung von morgen.', 'Ich rufe die Polizei.', 'Die Polizei sagt: Sie haben gerade selbst angerufen.'],
    'Hinter mir sagt meine Stimme: Ich habe schon aufgelegt.', 'Ich bin schon da.', 'Hättest du die Tür aufgemacht?', ['Aufmachen', 'Zulassen']),
  schicht: () => t2('Ich habe gekündigt. Heute ruft mein alter Chef an. Ich wäre im Dienst.', ['Ich bin zu Hause.', 'Er schickt ein Foto von der Kamera.', 'Ich sitze am Schreibtisch und arbeite.', 'Auf dem Foto drehe ich mich zur Kamera.'],
    'Und winke. Mit der Hand, die gerade mein Handy hält.', 'Schicht beginnt.', 'Wärst du hingefahren?', ['Hinfahren', 'Zu Hause']),
  memo: () => t2('Ich habe die App gelöscht. Heute Nacht hat sie trotzdem aufgenommen.', ['Die Datei heißt: Danke.', 'Sie ist 8 Stunden lang.', 'Ich spule ans Ende.', 'Da sagt jemand: Jetzt bist du dran.'],
    'Mein Handy zeigt: Aufnahme läuft. Ich habe nichts gedrückt.', 'Weiter so.', 'Hättest du das Handy weggeworfen?', ['Wegwerfen', 'Behalten']),
  wand: () => t2('Ich bin ausgezogen. In der neuen Wohnung klopft es an derselben Stelle.', ['Gleiche Uhrzeit. Gleicher Takt.', 'Ich klopfe nicht zurück.', 'Dann klopft es an meiner Tür.', 'Im Takt meines Herzschlags.'],
    'Durch den Türspion sehe ich niemanden. Nur ein Auge, ganz nah.', 'Du hast nicht zurückgeklopft.', 'Hättest du aufgemacht?', ['Aufmachen', 'Zulassen']),
};

export const DU_HOOKS3 = {
  'Ich im Supermarkt': 'Wenn dir jemand ein Foto von dir schickt, wo du nie warst, renn.',
  'Zwei Mal im Chat': 'Dankt dir jemand für einen Abend, an dem du nie da warst, renn.',
  'Die Nachbarin grüßt': 'Wenn deine Nachbarin sagt, du hast sie nachts gegrüßt, schließ ab.',
  'Die Kamera im Laden': 'Schau nie auf die Ladenkamera, wenn du allein im Gang stehst.',
  'Zwei Schlüssel': 'Wenn jemand von innen zuschließt, während du aufschließt, lauf.',
  'Der Wachmann': 'Wenn du nachts ein leeres Büro bewachst, schau nie auf Kamera 4.',
  'Zimmer 9': 'Wenn dich nachts ein leeres Zimmer ruft, geh nicht hin.',
  'Tankstelle': 'Wenn an deiner Tankstelle nachts eine kaputte Säule tankt, renn.',
  'Das Museum': 'Zähl nachts im Museum nie die Figuren. Du findest eine zu viel.',
  'Die Bäckerei': 'Wenn nachts schon Brot in deinem Ofen liegt, dreh dich nicht um.',
  'Schlafgeräusche': 'Hör dir nie an, was deine Schlaf-App um 3:12 Uhr aufgenommen hat.',
  'Sprachnachricht an Mama': 'Wenn deine Mama fragt, warum du ihr nachts geschrieben hast, hör nach.',
  'Das Diktiergerät': 'Lass dein Handy heute Nacht aufnehmen. Hör es dir morgen an. Allein.',
  'Die Mailbox': 'Wenn deine eigene Nummer dir auf die Mailbox spricht, hör nicht hin.',
  'Babys Lachen': 'Nimmt dein Handy nachts ein Babylachen auf und du hast keins, renn.',
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
