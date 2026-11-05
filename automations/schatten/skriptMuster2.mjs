// Weitere Muster für den Skript-Bot (#Skript-Bot) und die Fortsetzungen ("Teil 2") für ALLE Muster.
// Gleiche Regeln wie in skriptBot.mjs: die zwei wichtigsten Sätze stehen am Ende, Hook kurz und konkret.

// 6) Das Haustier merkt es zuerst
const tier = (v) => ({
  titel: v.titel, ort: 'haus', boesewicht: v.boese, stimme: 'mann',
  hook: v.hook, saetze: ['Erst denke ich, es ist eine Maus.', 'Ich schaue genau hin. Da ist nichts.', v.tut, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Was hättest du gemacht?', wahl: ['Nachsehen', 'Rausrennen'],
});
const TIER = [
  { titel: 'Der Hund knurrt', boese: 'schatten', hook: 'Mein Hund knurrt seit einer Stunde die leere Wand an.',
    tut: 'Er weicht keinen Schritt zurück.', dann: 'Dann wedelt er plötzlich. Als würde er jemanden kennen.',
    monster: 'Braver Hund.', ende: 'Er läuft zur Wand und legt sich hin. Als würde ihn jemand streicheln.' },
  { titel: 'Die Katze starrt', boese: 'gremlin', hook: 'Meine Katze starrt jede Nacht um 3 Uhr unter mein Bett.',
    tut: 'Heute faucht sie und rennt weg.', dann: 'Unter dem Bett zieht jemand meine Decke langsam nach unten.',
    monster: 'Sie mag mich nicht.', ende: 'Ich ziehe die Decke zurück. Unter dem Bett liegt meine Katze. Sie war die ganze Zeit dort.' },
  { titel: 'Der Papagei', boese: 'frau', hook: 'Mein Papagei sagt seit heute einen Namen. Ich kenne ihn nicht.',
    tut: 'Er ruft immer wieder: Marie, komm runter.', dann: 'Der Vormieter erzählt mir, dass Marie hier im Keller verschwunden ist.',
    monster: 'Ich komme.', ende: 'Heute Nacht antwortet jemand aus dem Keller. Mit Namen.' },
  { titel: 'Der Hund will nicht rein', boese: 'schatten', hook: 'Mein Hund will nicht mehr ins Haus. Seit heute Nacht.',
    tut: 'Er bellt das Schlafzimmerfenster an.', dann: 'Am Fenster bewegt sich der Vorhang. Das Fenster ist zu.',
    monster: 'Lass ihn draußen.', ende: 'Ich schaue durchs Fenster nach draußen. Mein Hund sitzt neben einem Mann. Der Mann bin ich.' },
  { titel: 'Nasse Fotos', boese: 'gremlin', hook: 'Meine Katze bringt mir jede Nacht ein Foto. Heute war ich darauf.',
    tut: 'Die Fotos sind alt und nass.', dann: 'Auf dem neuen Foto schlafe ich. Es wurde letzte Nacht gemacht.',
    monster: 'Lächeln.', ende: 'Hinter mir auf dem Foto steht jemand. Er hält meine Katze im Arm.' },
];

// 7) Das Spiegelbild macht etwas anders
const spiegel = (v) => ({
  titel: v.titel, ort: v.ort || 'haus', boesewicht: v.boese, stimme: 'frau',
  hook: v.hook, saetze: ['Ich putze mir die Zähne wie immer.', 'Erst fällt mir nichts auf.', v.anders, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Wärst du stehen geblieben?', wahl: ['Stehen bleiben', 'Licht aus'],
});
const SPIEGEL = [
  { titel: 'Zu spät geblinzelt', boese: 'frau', hook: 'Mein Spiegelbild hat um 3 Uhr nachts zu spät geblinzelt.',
    anders: 'Ich blinzle noch einmal. Diesmal blinzelt es gar nicht.', dann: 'Es lächelt. Ich lächle nicht.',
    monster: 'Jetzt du.', ende: 'Ich drehe mich weg. Im Spiegel bleibt sie stehen und schaut mir nach.' },
  { titel: 'Es tippt', boese: 'frau', hook: 'Im Spiegel tippt mein Spiegelbild etwas in mein Handy. Ich nicht.',
    anders: 'Mein Handy liegt neben dem Waschbecken. Es leuchtet.', dann: 'Eine neue Nachricht von mir an mich: Lass mich raus.',
    monster: 'Lass mich raus.', ende: 'Ich schaue wieder in den Spiegel. Sie hält ihr Handy hoch. Darauf steht: Danke.' },
  { titel: 'Beschlagen', boese: 'schatten', hook: 'Im Spiegel steht nachts: Du bist nicht allein. Ich war das nicht.',
    anders: 'Ich wohne allein. Ich habe nichts geschrieben.', dann: 'Unter dem Satz erscheint langsam ein zweiter Handabdruck.',
    monster: 'Hinter dir.', ende: 'Der Abdruck ist von innen. Und er wird größer.' },
  { titel: 'Falsche Hand', boese: 'frau', hook: 'Ich hebe die rechte Hand. Mein Spiegelbild nicht.',
    anders: 'Es hält die Hände hinter dem Rücken.', dann: 'Dann zeigt es mir, was es hält. Meinen Wohnungsschlüssel.',
    monster: 'Ich gehe jetzt.', ende: 'Ich greife in meine Tasche. Mein Schlüssel ist weg. Die Haustür fällt ins Schloss.' },
  { titel: 'Spiegel im Aufzug', ort: 'aufzug', boese: 'schatten', hook: 'Im Aufzug zeigt der Spiegel eine Person mehr. Ich bin allein.',
    anders: 'Der Mann im Spiegel steht direkt hinter mir.', dann: 'Er hebt einen Finger an die Lippen.',
    monster: 'Psst.', ende: 'Die Tür geht auf. Ich steige aus. Im Spiegel fährt er mit mir zusammen weiter.' },
];

// 8) Eine App / ein Gerät weiß zu viel
const geraet = (v) => ({
  titel: v.titel, ort: 'haus', boesewicht: v.boese, stimme: 'mann',
  hook: v.hook, saetze: ['Ich halte es für einen Fehler.', 'Ich starte alles neu.', v.zeigt, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Was hättest du gemacht?', wahl: ['Nachsehen', 'Rausrennen'],
});
const GERAET = [
  { titel: 'Schrittzähler', boese: 'schatten', hook: 'Meine Fitness-App zählt jede Nacht 3000 Schritte. Ich schlafe.',
    zeigt: 'Heute zeigt sie die Strecke auf der Karte.', dann: 'Sie führt von meinem Bett in den Keller. Und zurück.',
    monster: 'Wir gehen spazieren.', ende: 'Heute Nacht bleibe ich wach. Um drei Uhr steht mein Körper auf. Ohne mich.' },
  { titel: 'Sprachassistent', boese: 'gremlin', hook: 'Mein Sprachassistent lacht nachts um 3 Uhr. Ohne Grund.',
    zeigt: 'Ich frage ihn, warum er lacht.', dann: 'Er antwortet: Weil du nicht siehst, wer hinter dir steht.',
    monster: 'Hallo.', ende: 'Ich drehe mich um. Da ist niemand. Er lacht wieder. Diesmal aus dem Flur.' },
  { titel: 'Handy-Ortung', boese: 'frau', hook: 'Meine Handy-Ortung zeigt zwei Handys. Ich habe nur eins.',
    zeigt: 'Das zweite Handy ist bei mir in der Wohnung.', dann: 'Es bewegt sich. Langsam. Auf mein Zimmer zu.',
    monster: 'Gefunden.', ende: 'Der Punkt bleibt vor meiner Tür stehen. Dann klingelt mein Handy. Der Anruf kommt von dort.' },
  { titel: 'Babyphone-App', boese: 'gremlin', hook: 'Meine Babyphone-App überträgt Atmen. Ich habe kein Baby.',
    zeigt: 'Ich habe die App nur zum Testen installiert.', dann: 'Das Atmen ist nah am Mikrofon. Das Handy liegt auf meinem Kissen.',
    monster: 'Schlaf gut.', ende: 'Ich drehe mich zum Kissen. Das Atmen hört auf. Dann flüstert es meinen Namen.' },
  { titel: 'Smarte Lampe', boese: 'schatten', hook: 'Meine smarte Lampe geht jede Nacht um 3:12 Uhr an. Im Gästezimmer.',
    zeigt: 'In der App steht: Eingeschaltet von Gast.', dann: 'Ich habe keinen Gast. Ich habe nie einen eingetragen.',
    monster: 'Danke für das Licht.', ende: 'Heute geht das Licht aus. Und unter meiner Tür wird es dunkel.' },
];

// 9) Ein Kind sagt etwas, das es nicht wissen kann
const kind = (v) => ({
  titel: v.titel, ort: v.ort || 'haus', boesewicht: v.boese, stimme: 'frau',
  hook: v.hook, saetze: ['Ich lache und frage nach.', 'Das Lachen vergeht mir schnell.', v.sagt, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Hättest du nachgeschaut?', wahl: ['Nachschauen', 'Nicht hinsehen'],
});
const KIND = [
  { titel: 'Der Mann im Schrank', boese: 'schatten', hook: 'Im Kinderzimmer sagt das Kind: Der Mann im Schrank ist nicht böse.',
    sagt: 'Es flüstert: Er hat gesagt, du darfst ihn nicht sehen.', dann: 'Die Schranktür ist einen Spalt offen. Dahinter ist es dunkel.',
    monster: 'Gute Nacht.', ende: 'Die Eltern kommen heim. Sie haben keinen Schrank im Kinderzimmer.' },
  { titel: 'Wer winkt da', boese: 'frau', hook: 'Meine Nichte winkt jeden Abend aus dem Fenster. Ins Leere.',
    sagt: 'Sie sagt: Die Frau im Garten winkt zurück.', dann: 'Heute sagt sie: Sie kommt jetzt rein.',
    monster: 'Ich bin da.', ende: 'Hinter uns geht die Haustür auf. Und meine Nichte winkt. Diesmal zu mir.' },
  { titel: 'Malen', boese: 'gremlin', hook: 'Mein Bruder malt unser Haus. Mit drei Leuten. Wir sind nur zwei.',
    sagt: 'Ich frage, wer die dritte Figur ist.', dann: 'Er zeigt auf die dritte Figur und sagt: Der wohnt oben.',
    monster: 'Ich wohne oben.', ende: 'Wir haben kein Oben. Aber heute Nacht hören wir Schritte über der Decke.' },
  { titel: 'Unter dem Bett', boese: 'schatten', hook: 'Mein Neffe sagt: Unter deinem Bett wohnt auch einer. Nachts um 3.',
    sagt: 'Ich frage, woher er das weiß.', dann: 'Er sagt: Der hat mir erzählt, dass du nicht nachschaust.',
    monster: 'Schau nicht nach.', ende: 'Ich schaue unters Bett. Es ist leer. Über mir kichert jemand an der Decke.' },
  { titel: 'Im Zug', ort: 'zug', boese: 'schatten', hook: 'Im Nachtzug zeigt ein Kind auf meinen Platz: Da sitzt doch schon wer.',
    sagt: 'Ich setze mich trotzdem.', dann: 'Das Kind fängt an zu weinen und sagt: Jetzt sitzt du auf ihm.',
    monster: 'Steh auf.', ende: 'Der Sitz unter mir ist warm. Und er atmet.' },
];

export const MUSTER2 = { tier: [tier, TIER], spiegel: [spiegel, SPIEGEL], geraet: [geraet, GERAET], kind: [kind, KIND] };

// Teil 2 je Muster: kommt automatisch, wenn eine Geschichte ein Hit war. Bekommt die Variante des Teils 1.
const t2 = (hook, saetze, ende, monster, frage, wahl) => ({ hook, saetze, ende, monster, frage, wahl });
export const TEIL2 = {
  allein: (v) => t2(`Neue Wohnung. Und wieder ${v.doppelt}.`, ['Ich habe niemandem die Adresse gegeben.', 'Trotzdem schreibt mir jemand.', 'Die Nachricht: Du hast mich vergessen.', 'Ich zähle die Schlüssel. Es sind zwei.'],
    'Den zweiten Schlüssel habe ich nie nachmachen lassen. Er passt in meine neue Tür.', 'Ich ziehe immer mit.', 'Wärst du nochmal umgezogen?', ['Nochmal weg', 'Bleiben']),
  fremd: () => t2('Ich habe die Nummer blockiert. Jetzt schreibt sie von meinem Handy.', ['Die Nachricht steht in meinem eigenen Chat.', 'Ich habe sie nicht geschrieben.', 'Sie lautet: Du hast dich umgedreht.', 'Mein Handy macht ein Foto. Von selbst.'],
    'Auf dem Foto bin ich. Und hinter mir hält jemand mein Handy.', 'Jetzt bin ich du.', 'Hättest du das Handy weggeworfen?', ['Wegwerfen', 'Behalten']),
  kamera: () => t2('Ich habe die Kamera abgebaut. Heute Nacht hat sie trotzdem gefilmt.', ['Sie liegt ausgeschaltet in der Schublade.', 'Trotzdem ist ein neues Video drauf.', 'Es zeigt mein Schlafzimmer. Von der Schublade aus.', 'Im Video geht die Schublade auf. Langsam.'],
    'Ich schaue zur Schublade. Sie steht offen. Die Kamera ist weg.', 'Ich filme jetzt selbst.', 'Hättest du das Video angeschaut?', ['Anschauen', 'Löschen']),
  anruf: () => t2('Ich habe mein Handy ausgemacht. Trotzdem klingelt es wieder.', ['Der Akku ist raus.', 'Es klingelt weiter.', 'Ich gehe ran, damit es aufhört.', 'Die Stimme sagt: Du hast mich letztes Mal nicht ausreden lassen.'],
    'Dann klingelt es an der Tür. Im selben Takt.', 'Mach auf.', 'Hättest du aufgemacht?', ['Aufmachen', 'Zulassen']),
  regel: () => t2('Ich bin abgereist. Heute hängt der Zettel an meiner eigenen Tür.', ['Es ist dieselbe Schrift.', 'Darunter steht eine neue Regel.', 'Schau nachts nicht in den Spiegel.', 'Um drei Uhr muss ich ins Bad.'],
    'Ich halte die Augen zu. Aber im Spiegel klopft jemand von innen.', 'Mach die Augen auf.', 'Hättest du hingeschaut?', ['Hinschauen', 'Augen zu']),
  tier: () => t2('Ich habe das Tier weggegeben. Heute Nacht ist es wieder da.', ['Es sitzt am Fußende meines Bettes.', 'Die neue Besitzerin schreibt mir.', 'Sie schickt ein Foto. Das Tier schläft bei ihr.', 'Bei mir am Fußende bewegt sich etwas.'],
    'Es hebt den Kopf. Es ist kein Tier.', 'Jetzt bin ich dein Tier.', 'Hättest du das Licht angemacht?', ['Licht an', 'Augen zu']),
  spiegel: () => t2('Ich habe alle Spiegel abgehängt. Heute spiegelt mein Handy-Display.', ['Das Display ist schwarz.', 'Darin sehe ich mein Gesicht.', 'Es bewegt den Mund. Ich nicht.', 'Es sagt: Du hast mich nur umgedreht.'],
    'Ich lege das Handy weg. Im Fenster steht sie jetzt. Draußen.', 'Ich finde immer einen Spiegel.', 'Hättest du das Handy zerstört?', ['Zerstören', 'Behalten']),
  geraet: () => t2('Ich habe alles gelöscht und den Router ausgesteckt. Die App läuft weiter.', ['Ohne Internet.', 'Ohne Strom.', 'Auf dem Display steht: Neues Gerät verbunden.', 'Der Name des Geräts ist mein Name.'],
    'Hinter mir sagt meine eigene Stimme: Verbindung hergestellt.', 'Verbunden.', 'Hättest du dich umgedreht?', ['Umdrehen', 'Weglaufen']),
  kind: () => t2('Das Kind ruft mich an. Es ist mitten in der Nacht.', ['Es flüstert ganz leise.', 'Es sagt, es darf nicht laut sein.', 'Ich frage, warum.', 'Es sagt: Weil er jetzt bei dir ist. Nicht mehr bei mir.'],
    'Der Schrank in meinem Zimmer knarzt. Er war vorher zu.', 'Jetzt bei dir.', 'Hättest du den Schrank aufgemacht?', ['Aufmachen', 'Zulassen']),
};
