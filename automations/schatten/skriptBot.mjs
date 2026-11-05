// Viral-Skripte-Bot: baut neue Horror-Geschichten aus bewährten Mustern - ohne KI, also immer verfügbar und immer sauberes Deutsch.
// Die zwei wichtigsten Sätze stehen immer am Ende - der Kurz-Modus behält nur die letzten zwei.
// Jedes Muster ist ein Aufbau, der bei uns funktioniert hat (allein + Widerspruch, fremde Nachricht, Kamera, Anruf, Zettel-Regel),
// jede Variante eine eigene, in sich stimmige Geschichte. Nur Geschichten mit starkem Hook (>= 4 von 6 Punkten) gehen raus.
//   node automations/schatten/skriptBot.mjs   -> zeigt alle Geschichten mit Hook-Punkten
import { pruefen, slug } from './videobot.mjs';
import { hookPunkte } from './horrorKi.mjs';
import { MUSTER2, TEIL2 } from './skriptMuster2.mjs';
import { DU_HOOKS } from './skriptHooks2.mjs';

const WAHL = { flucht: ['Nachsehen', 'Rausrennen'], tuer: ['Aufmachen', 'Zulassen'], handy: ['Antworten', 'Handy weg'], ran: ['Rangehen', 'Wegdrücken'] };

// 1) Ich wohne allein - und plötzlich ist etwas doppelt da
const allein = (v) => ({
  titel: v.titel, ort: 'haus', boesewicht: v.boese, stimme: v.stimme || 'mann',
  hook: `Ich wohne allein. Heute ${v.doppelt}.`,
  saetze: ['Ich denke erst, ich habe mich vertan.', `Dann schreibt ${v.wer}.`, 'Ich drehe mich um. Da ist niemand.', v.fragt, `Aber ${v.zeichen}.`],
  absender: v.absender, nachricht: v.nachricht, monster: v.monster, ende: v.ende,
  frage: 'Was hättest du gemacht?', wahl: WAHL.flucht,
});
const ALLEIN = [
  { titel: 'Zwei Kaffeetassen', doppelt: 'stehen zwei warme Kaffeetassen auf dem Tisch', wer: 'mein Nachbar', absender: 'Nachbar', boese: 'schatten',
    nachricht: 'Wer sitzt da bei dir in der Küche?', fragt: 'Mein Nachbar fragt, wer da bei mir in der Küche sitzt.', zeichen: 'der zweite Stuhl ist noch warm',
    monster: 'Der Kaffee war gut.', ende: 'Ich habe nur eine Tasse gekocht. Die andere ist leer getrunken.' },
  { titel: 'Fremde Schuhe', doppelt: 'stehen zwei Paar Schuhe vor meiner Tür', wer: 'meine Mama', absender: 'Mama', boese: 'schatten',
    nachricht: 'Wer ist der Mann, der vor deiner Tür wartet?', fragt: 'Mama fragt, wer der Mann vor meiner Tür ist.', zeichen: 'im Flur knarzt der Boden',
    monster: 'Ich wohne jetzt hier.', ende: 'Die fremden Schuhe sind nass. Und sie stehen jetzt vor meinem Bett.' },
  { titel: 'Zwei Kissen', doppelt: 'sind in meinem Bett zwei Kissen eingedrückt', wer: 'meine Schwester', absender: 'Schwester', boese: 'frau', stimme: 'frau',
    nachricht: 'Wer liegt da neben dir auf deinem Foto?', fragt: 'Meine Schwester fragt, wer auf meinem Foto neben mir liegt.', zeichen: 'unter der Decke atmet etwas',
    monster: 'Ich war schon immer hier.', ende: 'Ich habe nie ein Foto gemacht. Es wurde aus meinem Bett aufgenommen.' },
  { titel: 'Die zweite Jacke', doppelt: 'hängen zwei nasse Jacken an meiner Garderobe', wer: 'mein Kumpel', absender: 'Kumpel', boese: 'schatten',
    nachricht: 'Wer hat mir gerade bei dir die Tür aufgemacht?', fragt: 'Mein Kumpel fragt, wer ihm eben bei mir die Tür aufgemacht hat.', zeichen: 'die fremde Jacke tropft noch',
    monster: 'Ich habe ihn reingelassen.', ende: 'In der fremden Jacke steckt mein Haustürschlüssel. Meiner ist weg.' },
  { titel: 'Zwei Teller', doppelt: 'stehen zwei Teller auf dem Esstisch', wer: 'mein Vermieter', absender: 'Vermieter', boese: 'frau', stimme: 'frau',
    nachricht: 'Wer ist die zweite Person, die bei Ihnen wohnt?', fragt: 'Mein Vermieter fragt, wer die zweite Person in meiner Wohnung ist.', zeichen: 'vom zweiten Teller fehlt ein Bissen',
    monster: 'Du bist hier der Gast.', ende: 'Laut Vertrag bin ich die zweite Person. Die erste wohnt schon länger hier.' },
];

// 2) Eine fremde Nummer weiß genau, wo ich bin
const fremd = (v) => ({
  titel: v.titel, ort: v.ort, boesewicht: v.boese, stimme: 'mann',
  hook: `Um 3:12 Uhr schreibt eine fremde Nummer: ${v.text}`,
  saetze: ['Ich schaue mich um.', 'Ich schreibe zurück: Wer bist du?', v.lage, 'Sofort kommt die Antwort: Dreh dich nicht um.'],
  absender: 'Unbekannt', nachricht: v.text, monster: 'Zu spät.', ende: v.ende,
  frage: 'Hättest du dich umgedreht?', wahl: ['Umdrehen', 'Weglaufen'],
});
const FREMD = [
  { titel: 'Schönes Buch', ort: 'zug', boese: 'schatten', text: 'Schönes Buch.', lage: 'Ich sitze allein im letzten Wagen. Und ich lese wirklich.',
    ende: 'Im dunklen Fenster sehe ich mich. Und eine Hand auf meiner Schulter.' },
  { titel: 'Falscher Knopf', ort: 'aufzug', boese: 'schatten', text: 'Falscher Knopf.', lage: 'Ich stehe allein im Aufzug. Ich habe Etage vier gedrückt.',
    ende: 'Der Aufzug fährt an Etage null vorbei. Die Anzeige zeigt minus drei.' },
  { titel: 'Leere Lampe', ort: 'wald', boese: 'hirsch', text: 'Deine Lampe ist fast leer.', lage: 'Ich bin allein im Wald. Meine Taschenlampe flackert.',
    ende: 'Die Lampe geht aus. Etwas nimmt meine Hand. Es hat Hufe.' },
  { titel: 'Offenes Fenster', ort: 'haus', boese: 'frau', text: 'Mach das Fenster zu.', lage: 'Alle Fenster sind zu. Ich habe es zweimal geprüft.',
    ende: 'Ich gehe ins Schlafzimmer. Das Fenster steht offen. Von innen.' },
  { titel: 'Platz 13', ort: 'flugzeug', boese: 'gremlin', text: 'Schlechter Platz.', lage: 'Ich sitze auf Platz 13. Mein Handy ist im Flugmodus.',
    ende: 'Die Nachricht kam ohne Netz. Und der Platz neben mir ist nicht mehr leer.' },
];

// 3) Eine Kamera hat etwas aufgenommen, das nicht da sein kann
const kamera = (v) => ({
  titel: v.titel, ort: v.ort, boesewicht: v.boese, stimme: 'mann',
  hook: v.hook, saetze: ['Ich schaue mir die Aufnahme an.', 'Erst ist nichts zu sehen.', v.sieht, v.dann],
  monster: v.monster, ende: v.ende, frage: 'Was hättest du gemacht?', wahl: WAHL.flucht,
});
const KAMERA = [
  { titel: 'Klingelkamera', ort: 'haus', boese: 'frau', hook: 'Meine Klingel-Kamera hat um 3:12 Uhr jemanden gefilmt.',
    sieht: 'Eine Frau steht vor meiner Tür und schaut direkt in die Kamera.', dann: 'Sie klingelt nicht. Sie hat einen Schlüssel.',
    monster: 'Ich wohne hier.', ende: 'Im letzten Bild steht sie hinter der Kamera. Also in meinem Flur.' },
  { titel: 'Wohnzimmerkamera', ort: 'haus', boese: 'schatten', hook: 'Meine Wohnzimmer-Kamera zeigt mich schlafend. Ich bin nicht zu Hause.',
    sieht: 'Ich liege auf dem Sofa. Und jemand sitzt am Fußende.', dann: 'Er sitzt da seit Stunden. Er bewegt sich nicht.',
    monster: 'Ich warte auf dich.', ende: 'Das Video ist live. Die Person auf dem Sofa macht die Augen auf. Sie hat mein Gesicht.' },
  { titel: 'Dashcam', ort: 'wald', boese: 'schatten', hook: 'Meine Dashcam hat auf der Waldstraße etwas gefilmt. Ich fuhr allein.',
    sieht: 'Auf dem Rücksitz sitzt jemand.', dann: 'Ich bin die ganze Strecke allein gefahren. Ohne Pause.',
    monster: 'Fahr weiter.', ende: 'Ich schaue in den Rückspiegel. Die Dashcam hat nicht gelogen.' },
  { titel: 'Wildkamera', ort: 'wald', boese: 'hirsch', hook: 'Meine Wildkamera im Wald hat heute Nacht 300 Fotos gemacht.',
    sieht: 'Ein Hirsch steht auf zwei Beinen vor der Linse.', dann: 'Auf jedem Foto ist er näher an meinem Zelt.',
    monster: 'Ich sehe dich auch.', ende: 'Das letzte Foto ist von innen. Aus meinem Zelt. Und ich schlafe darauf.' },
  { titel: 'Foto um 3 Uhr', ort: 'haus', boese: 'gremlin', hook: 'Mein Handy hat um 3:12 Uhr ein Foto gemacht. Ich habe geschlafen.',
    sieht: 'Das Foto zeigt mich im Bett. Von oben.', dann: 'Über meinem Bett ist nur die Decke.',
    monster: 'Lächeln.', ende: 'Ich schaue nach oben. Der Blitz geht an.' },
];

// 4) Ein Anruf, der nicht sein kann
const anruf = (v) => ({
  titel: v.titel, ort: 'haus', boesewicht: v.boese, stimme: v.stimme || 'mann',
  hook: v.hook, saetze: ['Ich gehe ran.', 'Erst ist es still.', v.stimmeIst, v.sagt],
  monster: v.monster, ende: v.ende, frage: 'Wärst du rangegangen?', wahl: WAHL.ran,
});
const ANRUF = [
  { titel: 'Anruf von mir', boese: 'schatten', hook: 'Mein Handy klingelt. Der Anrufer bin ich selbst.', stimmeIst: 'Ich höre meine eigene Stimme.',
    sagt: 'Sie flüstert: Geh nicht in den Keller.', monster: 'Ich komme hoch.', ende: 'Auf der Kellertreppe höre ich Schritte. Sie kommen hoch. Und sie klingen wie meine.' },
  { titel: 'Mama ruft an', boese: 'frau', stimme: 'frau', hook: 'Meine Mama ruft an. Aber sie sitzt neben mir.', stimmeIst: 'Es ist wirklich ihre Stimme.',
    sagt: 'Sie flüstert: Wer ist bei dir? Ich bin noch auf der Arbeit.', monster: 'Leg auf, Schatz.', ende: 'Die Mama neben mir lächelt. Viel zu breit.' },
  { titel: 'Die 112 ruft zurück', boese: 'gremlin', hook: 'Mein Handy klingelt. Die 112 ruft zurück. Ich habe nicht angerufen.', stimmeIst: 'Eine Frau fragt, ob ich in Sicherheit bin.',
    sagt: 'Sie sagt: Sie haben eben geflüstert, dass jemand unter Ihrem Bett liegt.', monster: 'Psst.', ende: 'Ich schaue unters Bett. Da liegt mein Handy. Es wählt gerade.' },
  { titel: 'Er schläft neben mir', boese: 'schatten', hook: 'Mein Freund ruft an. Aber er schläft neben mir.', stimmeIst: 'Ich höre Regen im Hintergrund.',
    sagt: 'Er sagt: Mach bitte auf. Ich stehe seit einer Stunde vor der Tür.', monster: 'Bleib liegen.', ende: 'Ich drehe mich zu ihm um. Sein Kissen ist nass.' },
  { titel: 'Oma ruft an', boese: 'frau', stimme: 'frau', hook: 'Meine Oma ruft an. Sie ist seit drei Jahren tot.', stimmeIst: 'Sie klingt ganz ruhig.',
    sagt: 'Sie sagt: Schließ die Tür ab. Er ist schon im Haus.', monster: 'Danke.', ende: 'Ich schließe ab. Hinter mir sagt jemand: Danke.' },
];

// 5) Eine Regel auf einem Zettel - und ich breche sie nicht, trotzdem passiert es
const regel = (v) => ({
  titel: v.titel, ort: v.ort, boesewicht: v.boese, stimme: 'mann',
  hook: v.hook, saetze: ['Ich lache darüber.', 'Um drei Uhr nachts höre ich es.', v.reiz, 'Ich halte mich an die Regel.'],
  monster: v.monster, ende: v.ende, frage: 'Hättest du dich an die Regel gehalten?', wahl: ['Regel halten', 'Regel brechen'],
});
const REGEL = [
  { titel: 'Zimmerservice', ort: 'haus', boese: 'schatten', hook: 'Im Hotel hängt ein Zettel: Öffne nachts nicht die Tür.',
    reiz: 'Es klopft. Eine Stimme sagt: Zimmerservice.', monster: 'Heute komme ich rein.', ende: 'Am Morgen hängt ein neuer Zettel. Danke fürs Warten. Heute komme ich rein.' },
  { titel: 'Nicht zählen', ort: 'haus', boese: 'gremlin', hook: 'Im Ferienhaus hängt ein Zettel: Zähl nachts nicht die Türen.',
    reiz: 'Im Flur flüstert jemand Zahlen. Eins. Zwei. Drei.', monster: 'Vier.', ende: 'Am Morgen zähle ich doch. Das Haus hat eine Tür mehr als gestern.' },
  { titel: 'Nicht antworten', ort: 'wald', boese: 'hirsch', hook: 'Am Zeltplatz hängt ein Schild: Antworte nachts niemandem.',
    reiz: 'Draußen ruft meine Freundin meinen Namen.', monster: 'Komm raus.', ende: 'Sie liegt neben mir im Zelt. Und draußen ruft sie immer noch.' },
  { titel: 'Letzter Wagen', ort: 'zug', boese: 'schatten', hook: 'Im Nachtzug klebt ein Zettel: Setz dich nie in den letzten Wagen.',
    reiz: 'Der Zug hält. Alle Wagen vor mir werden abgekoppelt.', monster: 'Endstation.', ende: 'Jetzt bin ich im letzten Wagen. Und er fährt weiter. Ohne Lok.' },
];

const MUSTER = { allein: [allein, ALLEIN], fremd: [fremd, FREMD], kamera: [kamera, KAMERA], anruf: [anruf, ANRUF], regel: [regel, REGEL], ...MUSTER2 };

// Post gehört zur Geschichte, wenn sein Text mit einem ihrer beiden Hooks beginnt (Hook-A/B-Test)
export const passt = (p, s) => [s.hook, s.hook2].some((h) => h && String(p.text || '').includes(h.slice(0, 40)));

const gut = (s) => !pruefen(s).length && hookPunkte(s.hook) >= 4 && s.hook.length <= 70;

// Alle Geschichten, gemischt nach Muster (nie zweimal dasselbe Muster hintereinander). Mit Teil 2 für den Fall eines Hits.
export function alleSkripte() {
  const listen = Object.entries(MUSTER).map(([muster, [bau, varianten]]) => varianten.map((v) => { const s = bau(v); return { ...s, muster, herkunft: 'skriptbot', teil2: TEIL2[muster]?.(v), hook2: DU_HOOKS[s.titel] }; }));
  const aus = [];
  for (let i = 0; listen.some((l) => l[i]); i++) for (const l of listen) if (l[i]) aus.push(l[i]);
  return aus.filter(gut);
}

// Lernen: Ø Aufrufe je Muster aus unseren Instagram-/YouTube-Posts (daten.json "letzte"). Erkannt wird die Geschichte am Hook im Text.
export function musterWerte(letzte = [], alle = alleSkripte()) {
  const summe = {};
  for (const p of letzte) {
    if (!/desk\.rebel|giyuuu|english/i.test(p.konto || '') || !(p.aufrufe >= 0)) continue;
    const s = alle.find((x) => passt(p, x));
    if (s) (summe[s.muster] ||= []).push(p.aufrufe);
  }
  return Object.fromEntries(Object.entries(summe).map(([m, l]) => [m, { schnitt: l.reduce((a, b) => a + b, 0) / l.length, n: l.length }]));
}

// Nächste noch nicht gepostete Geschichte (bekannt = Slugs, die schon liefen). Mit Zahlen: das beste Muster zuerst,
// Muster mit weniger als 2 Posts gelten als "noch testen" (leicht über Schnitt), damit jedes eine Chance bekommt.
export function naechstesSkript(bekannt = [], letzte = []) {
  const weg = new Set(bekannt);
  const alle = alleSkripte(), frei = alle.filter((s) => !weg.has(slug(s.titel)));
  const werte = musterWerte(letzte, alle);
  const bekannteWerte = Object.values(werte).filter((w) => w.n >= 2);
  if (!bekannteWerte.length) return frei[0] || null;
  const mittel = bekannteWerte.reduce((a, w) => a + w.schnitt, 0) / bekannteWerte.length;
  const punkte = (m) => (werte[m]?.n >= 2 ? werte[m].schnitt : mittel * 1.1);
  return [...frei].sort((a, b) => punkte(b.muster) - punkte(a.muster))[0] || null;
}

// Hit erkannt? Dann Teil 2 dieser Geschichte (einmal). Hit = mind. doppelt so viele Aufrufe wie der Schnitt des Kontos und mind. 100.
export function teil2Kandidat(konto, bekannt = [], letzte = []) {
  const weg = new Set(bekannt), alle = alleSkripte();
  const eigene = letzte.filter((p) => String(p.konto || '').includes(konto) && p.aufrufe > 0);
  if (eigene.length < 3) return null;
  const schnitt = eigene.reduce((a, p) => a + p.aufrufe, 0) / eigene.length;
  for (const p of [...eigene].sort((a, b) => b.aufrufe - a.aufrufe)) {
    if (p.aufrufe < Math.max(100, 2 * schnitt)) break;
    const s = alle.find((x) => x.teil2 && passt(p, x));
    if (!s) continue;
    const t = { ...s, ...s.teil2, titel: `${s.titel} – Teil 2`, teil: 2, teil2: undefined, absender: undefined, nachricht: undefined, monster2: undefined };
    if (!weg.has(slug(t.titel)) && !pruefen(t).length) return t;
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const alle = alleSkripte();
  for (const s of alle) console.log(`${hookPunkte(s.hook)}/6  [${s.muster}] ${s.titel}: ${s.hook}`);
  console.log(`\n${alle.length} Geschichten bereit, ${alle.filter((s) => s.teil2).length} mit Teil 2`);
}
