// 2-Satz-Horror für Instagram-Stories (#113): einmal am Tag pro Instagram-Kanal zwei Story-Kacheln
// (Satz 1 = harmloser Anfang, Satz 2 = die Wendung + Frage), danach die Story "Neues Video".
// Alle Geschichten frei erfunden und selbst geschrieben. Schlüssel im Stand: "kurz:<slug>".
import { slug } from './videobot.mjs';

export const KURZ_HORROR = [
  { titel: 'Gute Nacht, Mama', a: 'Meine Tochter rief aus ihrem Zimmer: „Gute Nacht, Mama!“', b: 'Ich saß gerade neben ihr auf dem Bett - und sie schlief schon.', frage: 'Wer hat gerufen?' },
  { titel: 'Zwei Zahnbürsten', a: 'Ich wohne seit drei Jahren allein.', b: 'Heute Morgen war die zweite Zahnbürste im Becher wieder nass.', frage: 'Würdest du ausziehen?' },
  { titel: 'Das Babyfon', a: 'Über das Babyfon hörte ich jemanden leise ein Schlaflied summen.', b: 'Wir haben kein Baby mehr, seit dem Umzug liegt das Ding nur im Keller.', frage: 'Würdest du runtergehen?' },
  { titel: 'Spiegel im Flur', a: 'Ich habe im Flur zwinkernd in den Spiegel gelächelt.', b: 'Mein Spiegelbild hat zurückgelächelt - aber erst eine Sekunde später.', frage: 'Hast du das auch schon gesehen?' },
  { titel: 'Klopfen am Fenster', a: 'Die ganze Nacht klopfte es an mein Fenster.', b: 'Ich wohne im vierzehnten Stock.', frage: 'Würdest du den Vorhang aufziehen?' },
  { titel: 'Letzte Nachricht', a: 'Mein Handy zeigte eine neue Nachricht von Opa: „Mach die Tür nicht auf.“', b: 'Opa ist seit zwei Jahren tot - und es klingelte gerade.', frage: 'Machst du auf?' },
  { titel: 'Unter dem Bett', a: 'Ich habe unter das Bett geschaut, um meinem Sohn zu zeigen, dass da nichts ist.', b: 'Da lag mein Sohn und flüsterte: „Papa, oben im Bett liegt jemand anderes.“', frage: 'Wem glaubst du?' },
  { titel: 'Die Fotos', a: 'Auf meinem Handy waren heute früh 40 neue Fotos.', b: 'Alle zeigen mich schlafend, aufgenommen von der Zimmerecke aus.', frage: 'Würdest du die Ecke prüfen?' },
  { titel: 'Kaltes Kissen', a: 'Ich drehe mein Kissen immer auf die kalte Seite.', b: 'Heute Nacht war sie warm - so, als hätte gerade jemand darauf gelegen.', frage: 'Schläfst du heute noch?' },
  { titel: 'Hundekorb', a: 'Mein Hund knurrt jede Nacht die leere Zimmerecke an.', b: 'Heute hat er aufgehört und angefangen, mit dem Schwanz zu wedeln.', frage: 'Was ist schlimmer?' },
  { titel: 'Der Anrufbeantworter', a: 'Auf dem Anrufbeantworter war eine Nachricht von mir selbst.', b: 'Ich sagte nur: „Geh heute nicht in den Keller“ - aufgenommen morgen um 3 Uhr.', frage: 'Gehst du runter?' },
  { titel: 'Zählen', a: 'Im Dunkeln zähle ich immer die Atemzüge in meinem Zimmer, um einzuschlafen.', b: 'Heute waren es zwei verschiedene Rhythmen.', frage: 'Machst du das Licht an?' },
  { titel: 'Nachbarin', a: 'Meine Nachbarin winkt mir jeden Abend aus ihrem Fenster zu.', b: 'Heute stand die Polizei vor ihrer Tür - sie ist seit einer Woche tot.', frage: 'Winkst du zurück?' },
  { titel: 'Kinderzeichnung', a: 'Meine Tochter malte unsere Familie: Mama, Papa, sie selbst.', b: 'Und eine große graue Frau hinter mir, die sie „die Nette von nachts“ nennt.', frage: 'Würdest du nachfragen?' },
  { titel: 'Schritte im Schnee', a: 'Heute Morgen führten Fußspuren durch den Schnee bis zu unserer Haustür.', b: 'Aber keine führten wieder weg.', frage: 'Wo ist er jetzt?' },
  { titel: 'Das Lied', a: 'Im Radio lief ein Lied, das ich als Kind erfunden und nie jemandem vorgesungen habe.', b: 'Am Ende sagte der Moderator meinen Namen und: „Bis gleich.“', frage: 'Machst du das Radio aus?' },
  { titel: 'Aufzug', a: 'Ich drückte im Aufzug auf Erdgeschoss.', b: 'Er fuhr runter, immer weiter, bis die Anzeige „-13“ zeigte und die Tür aufging.', frage: 'Steigst du aus?' },
  { titel: 'Video-Call', a: 'Beim Video-Call mit meiner Freundin war alles normal.', b: 'Bis sie fragte, wer da hinter mir auf dem Sofa sitzt.', frage: 'Drehst du dich um?' },
  { titel: 'Zimmer 9', a: 'Im Hotel hörte ich die ganze Nacht Lachen aus Zimmer 9.', b: 'Die Rezeption sagte morgens, es gibt nur acht Zimmer.', frage: 'Würdest du klopfen?' },
  { titel: 'Kalte Hand', a: 'Im Halbschlaf griff ich nach der Hand meiner Frau.', b: 'Dann hörte ich sie aus der Küche fragen, ob ich auch Kaffee will.', frage: 'Wessen Hand war das?' },
  { titel: 'Der Tisch', a: 'Ich decke für mich jeden Abend nur einen Teller.', b: 'Seit gestern steht morgens ein zweiter benutzter Teller in der Spüle.', frage: 'Würdest du wach bleiben?' },
  { titel: 'Die Puppe', a: 'Ich habe die alte Puppe meiner Schwester endlich in den Müll geworfen.', b: 'Heute Morgen saß sie am Fenster und schaute zur Mülltonne.', frage: 'Was machst du mit ihr?' },
  { titel: 'Rückspiegel', a: 'Auf der leeren Landstraße blickte ich in den Rückspiegel.', b: 'Auf der Rückbank saß niemand - aber der Gurt war eingerastet.', frage: 'Hältst du an?' },
  { titel: 'Smart-Speaker', a: 'Mein Smart-Speaker sagte mitten in der Nacht: „Ich habe ihn reingelassen.“', b: 'Unten fiel die Haustür ins Schloss.', frage: 'Was tust du jetzt?' },
  { titel: 'Feueralarm', a: 'Der Rauchmelder piepte, also stieg ich auf den Stuhl, um ihn auszumachen.', b: 'Dahinter klebte ein Zettel in meiner Schrift: „Er sieht dich durch das Loch.“', frage: 'Würdest du weiterlesen?' },
  { titel: 'Kinder im Garten', a: 'Draußen im Garten spielten Kinder Verstecken und zählten bis zehn.', b: 'Unser Garten ist von einer zwei Meter hohen Mauer umgeben - ohne Tor.', frage: 'Würdest du rausgehen?' },
  { titel: 'Krankenhaus', a: 'Ich wachte im Krankenhaus auf, die Schwester lächelte erleichtert.', b: 'Auf ihrem Namensschild stand mein Name, und ihr Gesicht war meins.', frage: 'Würdest du fliehen?' },
  { titel: 'Kellerlicht', a: 'Das Kellerlicht ging an, während ich oben Zähne putzte.', b: 'Der Schalter ist nur unten im Keller.', frage: 'Gehst du nachsehen?' },
  { titel: 'Kratzen', a: 'Jede Nacht kratzt etwas von innen an meinem Kleiderschrank.', b: 'Heute Nacht hat es aufgehört - und die Schranktür steht offen.', frage: 'Schläfst du weiter?' },
  { titel: 'Sprachnachricht', a: 'Meine Mutter schickte mir eine Sprachnachricht: nur Atmen, zwei Minuten lang.', b: 'Am Ende flüstert eine Männerstimme: „Sie schläft jetzt.“', frage: 'Rufst du sie an?' },
  { titel: 'Schulfoto', a: 'Auf meinem alten Klassenfoto stand ein Mädchen, an das sich keiner erinnert.', b: 'Jedes Jahr, wenn ich es anschaue, steht sie eine Reihe näher an mir.', frage: 'Würdest du es verbrennen?' },
  { titel: 'Pizza', a: 'Der Lieferant brachte zwei Pizzen und sagte: „Für Sie und die Frau am Fenster.“', b: 'Ich wohne allein, und das Fenster war dunkel.', frage: 'Teilst du die zweite?' },
  { titel: 'Wecker', a: 'Mein Wecker klingelte um 3:33, obwohl ich ihn nie gestellt habe.', b: 'Auf dem Display stand statt der Uhrzeit: „Er ist wach.“', frage: 'Wer ist wach?' },
  { titel: 'Die Treppe', a: 'Unsere Treppe hat 13 Stufen, ich zähle sie jeden Abend.', b: 'Heute Nacht im Dunkeln waren es 14.', frage: 'Gehst du weiter?' },
  { titel: 'Babysitter', a: 'Die Kinder sagten, ich soll den Clown in ihrem Zimmer nicht aufwecken.', b: 'Die Eltern sagten am Telefon, sie besitzen keinen Clown.', frage: 'Was würdest du tun?' },
  { titel: 'Waldweg', a: 'Beim Joggen rief jemand aus dem Wald meinen Namen.', b: 'Es war die Stimme meines Bruders - der gerade neben mir lief.', frage: 'Bleibst du stehen?' },
  { titel: 'Türspion', a: 'Es klingelte, ich schaute durch den Türspion, aber alles war rot.', b: 'Dann blinzelte das Rot.', frage: 'Machst du auf?' },
  { titel: 'Abendessen', a: 'Mein Mann sagte beim Essen: „Du schmeckst heute anders.“', b: 'Ich dachte, er meinte das Essen - bis er mir in die Hand biss.', frage: 'Was sagst du dazu?' },
  { titel: 'Dachboden', a: 'Vom Dachboden kam heute Nacht leises Weinen.', b: 'Als ich die Luke öffnete, hörte es auf und jemand flüsterte: „Endlich.“', frage: 'Kletterst du hoch?' },
  { titel: 'Navi', a: 'Das Navi sagte: „In 200 Metern sind Sie am Ziel.“', b: 'Ich hatte kein Ziel eingegeben, und vor mir lag der alte Friedhof.', frage: 'Fährst du weiter?' },
  { titel: 'Gesichtserkennung', a: 'Mein Handy entsperrt sich nur mit meinem Gesicht.', b: 'Heute Nacht hat es sich entsperrt, während ich mit geschlossenen Augen lag.', frage: 'Wer hat es benutzt?' },
  { titel: 'Zwilling', a: 'Meine Mutter erzählte mir endlich, dass ich einen Zwilling hatte, der bei der Geburt starb.', b: 'Das erklärt, warum ich jede Nacht im Traum mit ihm rede - aber nicht, warum er heute zurückgeantwortet hat.', frage: 'Würdest du antworten?' },
  { titel: 'Der Mann im Bus', a: 'Der Mann gegenüber im Nachtbus starrte mich die ganze Fahrt an.', b: 'Als ich ausstieg, sah ich im Busfenster: Er saß neben mir.', frage: 'Steigst du wieder ein?' },
  { titel: 'Handschuh', a: 'Ich fand einen Kinderhandschuh in meiner Jackentasche.', b: 'Er war noch warm.', frage: 'Wem gehört er?' },
  { titel: 'Licht aus', a: 'Ich schalte das Licht aus und sage meinem Kater gute Nacht.', b: 'Aus der Dunkelheit sagte eine tiefe Stimme: „Gute Nacht.“', frage: 'Machst du das Licht wieder an?' },
  { titel: 'Kamera', a: 'Ich habe eine Kamera ins Wohnzimmer gestellt, weil nachts Dinge verrutschen.', b: 'Auf dem Video stehe ich auf, gehe hin und schaue genau in die Linse.', frage: 'Schaust du weiter?' },
  { titel: 'Zettel am Kühlschrank', a: 'Am Kühlschrank hing ein Zettel: „Milch ist alle.“', b: 'Darunter in Kinderschrift: „Und du bald auch.“', frage: 'Gehst du einkaufen?' },
  { titel: 'Neues Haus', a: 'Im neuen Haus haben wir eine Tür hinter der Tapete entdeckt.', b: 'Sie war von innen abgeschlossen.', frage: 'Brichst du sie auf?' },
  { titel: 'Die Stimme', a: 'Mein Freund ruft aus dem Bad, ich soll ihm ein Handtuch bringen.', b: 'Er hat mir gerade geschrieben, dass er noch eine Stunde im Büro ist.', frage: 'Bringst du das Handtuch?' },
  { titel: 'Spielplatz', a: 'Nachts quietscht vor meinem Fenster die Schaukel auf dem Spielplatz.', b: 'Der Spielplatz wurde vor fünf Jahren abgerissen.', frage: 'Schaust du raus?' },
];

// Nächste ungepostete Kurz-Geschichte (gepostet = Schlüssel wie "kurz:<slug>"); null, wenn alle verbraucht sind
export function naechsterKurzHorror(gepostet = [], zufall = Math.random) {
  const weg = new Set(gepostet.filter((k) => String(k).startsWith('kurz:')).map((k) => String(k).slice(5)));
  const frei = KURZ_HORROR.filter((g) => !weg.has(slug(g.titel)));
  return frei.length ? frei[Math.floor(zufall() * frei.length)] : null;
}

// Schon eine Kurz-Story heute auf diesem Kanal? (stand = { "kurz:<slug>": ISO-Zeit, ... }, heute = Beginn des Tages als ISO)
export const kurzHeuteSchon = (standKanal = {}, heute = '') => Object.entries(standKanal).some(([k, t]) => k.startsWith('kurz:') && String(t) >= heute);
