// Ersatz-Anschreiben, wenn die kostenlose KI überlastet ist: kein Lauf soll mit 0 Bewerbungen enden.
// Baut nur aus echten Fakten in BEWERBUNG_DATEN (Praktika, Kenntnisse) - nichts wird erfunden.
import { daten } from './bewerbung.mjs';

// Verlangt die Anzeige zwingend Ausbildung/Erfahrung/Abschluss, ist eine Vorlagen-Bewerbung verschenkt.
const HARTE_HUERDE = /(abgeschlossene|erfolgreich abgeschlossene)\s+([a-zä-]+\s+){0,2}(berufs)?ausbildung|abgeschlossenes\s+([a-zä-]+\s+)?studium|mehrjährige|mindestens\s+(\d|zwei|drei|vier|fünf)\s+jahre|(\d|zwei|drei|vier|fünf)\+?\s+jahre\s+(berufs)?erfahrung|realschulabschluss|mittlere reife|abitur|fachhochschulreife|führerschein (der )?klasse b (ist )?(zwingend|erforderlich|voraussetzung)/i;
const OFFEN_FUER_EINSTEIGER = /quereinst|ohne (berufs)?erfahrung|keine (berufs)?erfahrung (nötig|erforderlich|notwendig)|wir arbeiten (sie|dich) ein|berufseinsteiger|berufsanfänger/i;

// Berufe, die schon im Titel eine abgeschlossene Ausbildung/ein Studium bedeuten (als Ausbildungsplatz aber ok).
const NUR_MIT_QUALIFIKATION = /steuerfach|steuerberat|bilanzbuchhalt|hauptbuchhalt|finanzbuchhalter|lohnbuchhalter|accountant|controller|psycholog|therapeut|medizinische[rn]? fachangestellte|\bmfa\b|zahnmedizin|rechtsanwaltsfach|notarfach|rechtsanwalt|jurist|verwaltungsfachangestellte|sozialversicherungsfach|monteur|mechaniker|mechatroniker|elektriker|elektroniker|handwerker|installateur|immobilienverwalter|hausverwalter|gründer|franchise|geprüfte|sicherheitskraft|ingenieur|entwickler|developer|architekt|arzt|ärzt|pflegefach|erzieher|lehrer|consultant|berater|expert|projekt ?manag|project ?manag|account ?manag|§ ?34 ?a|sachkunde|bachelor|master|\bit\b|technische[rn]? |fahrer|spezialist/i;
const AUSBILDUNG = /ausbildung|auszubild|azubi|duales studium|trainee/i;
const FREMDSPRACHE = /spanisch|französisch|italienisch|niederländisch|polnisch|russisch|arabisch|chinesisch|japanisch|portugiesisch|tschechisch|rumänisch/i;

// Die BA hängt die Anzeige als JSON an ("quereinstiegGeeignet":false) - das darf nicht als "Quereinstieg" zählen.
export const nurAnzeige = (text = '') => text.replace(/\n?\{"[a-z][\s\S]*$/i, '');

export function vorlagePasst(text, titel = '') {
  text = nurAnzeige(text);
  if (!titel.trim()) return false;
  // "IT-Mitarbeiter / Quereinsteiger" ist ausdrücklich offen - nur sonst blockt der Titel.
  if (!AUSBILDUNG.test(titel) && !/quereinst|einsteiger|junior|1st[ -]level|service ?desk|it-support|it support/i.test(titel) && NUR_MIT_QUALIFIKATION.test(titel)) return false;
  const sprache = titel.match(FREMDSPRACHE)?.[0];
  if (sprache && !new RegExp(sprache, 'i').test(daten().roh)) return false;
  return OFFEN_FUER_EINSTEIGER.test(text) || !HARTE_HUERDE.test(text);
}

function aufhaenger(titel, firma, text) {
  const k = `${titel} ${text.slice(0, 1500)}`;
  if (AUSBILDUNG.test(titel)) {
    return `Ich möchte meinen Weg im Beruf mit einer richtig guten Ausbildung starten – und ${firma} ist genau der Ort, an dem ich das will. Deshalb bewerbe ich mich bei Ihnen auf „${titel}“.`;
  }
  if (/luftfracht|air ?cargo|airfreight|export|import|zoll/i.test(k)) {
    return `Internationale Sendungen, Zollpapiere und enge Zeitfenster, bei denen jeder Handgriff sitzen muss – genau dieses Tempo reizt mich an der Stelle als ${titel} bei ${firma}.`;
  }
  if (/leitstelle|leitstand|einsatzzentrale|notruf|disposition|disponent/i.test(k)) {
    return `Wo jede Minute zählt und schnell die richtige Entscheidung fallen muss, will ich arbeiten – deshalb hat mich Ihre Stelle als ${titel} bei ${firma} sofort angesprochen.`;
  }
  if (/buchhalt|finanz|rechnungswesen|kreditor|debitor/i.test(k)) {
    return `Zahlen, die am Ende auf den Cent genau stimmen müssen, und Abläufe, auf die sich andere verlassen – das reizt mich an der Stelle als ${titel} bei ${firma}.`;
  }
  return `Ein Büro, in dem viel passiert und kein Tag wie der andere ist – genau das reizt mich an der Stelle als ${titel} bei ${firma}.`;
}

const abschnitt = (name) => daten().abschnitte.find((a) => name.test(a.titel))?.zeilen || [];
// "Praktikum, Allianz Generalvertretung Cemal Kurt, Hattersheim (3 Wochen)" → "Allianz"
const firmaAusPraktikum = (t) => (t.split(',')[1] || '').replace(/\(.*\)/, '').split(' – ')[0]
  .replace(/\s+(Generalvertretung|GmbH|AG|KG|e\.\s?K\.).*$/i, '').trim();
const undListe = (teile) => (teile.length > 1 ? `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}` : teile[0] || '');

export function vorlageAnschreiben({ titel, firma, text = '' }) {
  const praktika = abschnitt(/prakti|erfahr/i);
  const namen = [...new Set(praktika.map(([, t = '']) => firmaAusPraktikum(t)).filter(Boolean))].slice(0, 4);
  const buero = praktika.find(([, t = '', d = '']) => /rechnung|telefon|kunde|versicherung|büro/i.test(`${t} ${d}`));
  const kenntnis = (n) => abschnitt(/kenntnis/i).find(([l = '']) => n.test(l))?.[1] || '';
  const edv = kenntnis(/edv|computer|it/i);
  const sprachen = kenntnis(/sprache/i);

  const liste = undListe(namen);
  const edvText = undListe(edv.replace(/\s*\([^)]*\)/g, '').split(/,\s*/).filter(Boolean));
  const sprachText = sprachen.replace(/\s*\([^)]*\)/g, '').split(/,\s*/).filter(Boolean).join(' sowie ');
  return [
    'Sehr geehrte Damen und Herren,',
    '',
    aufhaenger(titel, firma, text),
    '',
    'Berufserfahrung bringe ich noch nicht mit – dafür eine schnelle Auffassungsgabe, Zuverlässigkeit und große Lust, mich gründlich einarbeiten zu lassen und richtig anzupacken.'
      + (liste ? ` In meinen Praktika bei ${liste} habe ich gelernt, mich schnell in neue Abläufe einzufinden, sorgfältig mitzuarbeiten und auch unter Zeitdruck den Überblick zu behalten.` : '')
      + (buero?.[2] ? ` Bei ${firmaAusPraktikum(buero[1])} gehörten unter anderem dazu: ${buero[2].replace(/\.$/, '')}.` : ''),
    '',
    [edvText && `Mit ${edvText} arbeite ich sicher`, sprachText && `durch ${sprachText} kann ich auch bei internationalen Kontakten unterstützen`]
      .filter(Boolean).join(', und ').replace(/^./, (z) => z.toUpperCase()) + '.',
    '',
    AUSBILDUNG.test(titel)
      ? 'Ich bin bereit, mich voll reinzuhängen, im Betrieb wie in der Berufsschule, und möchte nach der Ausbildung gern bei Ihnen bleiben. Über die Einladung zu einem persönlichen Kennenlernen freue ich mich sehr – meinen Lebenslauf finden Sie im Anhang.'
      : 'Ich suche eine Vollzeitstelle, in der ich dauerhaft bleiben, Verantwortung übernehmen und jeden Tag dazulernen kann. Ich kann ab sofort bei Ihnen anfangen. Über die Einladung zu einem persönlichen Kennenlernen freue ich mich sehr – meinen Lebenslauf finden Sie im Anhang.',
  ].join('\n').replace(/\n\.\n/, '\n');
}

// Initiativbewerbung: die Firma sucht im Lieblingsbereich (oft mit Erfahrung) - Bewerbung um den Einstieg.
export function initiativAnschreiben({ bereich, firma }) {
  const praktika = abschnitt(/prakti|erfahr/i);
  const namen = undListe([...new Set(praktika.map(([, t = '']) => firmaAusPraktikum(t)).filter(Boolean))].slice(0, 4));
  const edv = undListe((abschnitt(/kenntnis/i).find(([l = '']) => /edv|computer|it/i.test(l))?.[1] || '').replace(/\s*\([^)]*\)/g, '').split(/,\s*/).filter(Boolean));
  return [
    'Sehr geehrte Damen und Herren,',
    '',
    `ich habe gesehen, dass ${firma} im Bereich ${bereich} gerade Verstärkung sucht – genau dort möchte ich beruflich hin. Für die ausgeschriebene Stelle fehlt mir vielleicht noch die Erfahrung, deshalb bewerbe ich mich initiativ für einen Einstieg: als Quereinsteiger mit Einarbeitung, in der Assistenz oder Sachbearbeitung, oder als Auszubildender.`,
    '',
    (bereich === 'IT-Sicherheit'
      ? 'Mich reizt an IT-Sicherheit, dass man jeden Tag gegen echte Angreifer arbeitet: Auffälligkeiten erkennen, schnell reagieren und Systeme sauber halten. Eine IT-Ausbildung bringe ich noch nicht mit, aber ich will genau dorthin und fange dafür gern ganz unten an – im IT-Support, als Trainee im Security-Team oder in einer Ausbildung zum Fachinformatiker.'
      : 'Mich reizt an diesem Bereich das Tempo: Abläufe, bei denen jeder Handgriff sitzen muss, Fristen, die eingehalten werden müssen, und kein Tag wie der andere.')
      + (namen ? ` In meinen Praktika bei ${namen} habe ich gelernt, mich schnell in neue Abläufe einzuarbeiten, sorgfältig zu arbeiten und auch unter Zeitdruck den Überblick zu behalten.` : '')
      + (edv ? ` Mit ${edv} arbeite ich sicher.` : ''),
    '',
    'Ich suche eine Vollzeitstelle, in der ich dauerhaft bleiben und jeden Tag dazulernen kann, und könnte ab sofort anfangen. Über die Gelegenheit zu einem persönlichen Kennenlernen freue ich mich sehr – meinen Lebenslauf finden Sie im Anhang.',
  ].join('\n');
}
