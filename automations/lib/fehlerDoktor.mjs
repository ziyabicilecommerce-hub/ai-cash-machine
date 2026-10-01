// Fehler-Doktor: liest das Log eines abgestuerzten Laufs und sagt in klarem Deutsch, WAS los ist und WER es
// loest - das System selbst (Neustart, eigene KI) oder du (Schluessel erneuern). Kein Raten, nur feste Regeln.

// Reihenfolge = Prioritaet. selbst: true -> das System heilt es automatisch (Neustart lohnt sich).
export const REGELN = [
  { art: 'ki-limit', test: /quota|insufficient_quota|Pollinations-Fehler 402|enough credits|KI-Dienste nicht verfügbar|rate limit|Tages-Sicherheitslimit|Zu wenige Szenen|Skript zu kurz|KI lieferte kein JSON/i, selbst: true,
    text: 'Gratis-KI am Limit', loesung: 'Die eigene KI auf GitHub übernimmt automatisch. Schneller und besser: kostenlosen GEMINI_API_KEY eintragen.' },
  { art: 'zugang', test: /\b(401|403)\b.*(token|auth|credential|unauthori|forbidden)|invalid[_ ](token|grant|client)|token (expired|abgelaufen)|Bad credentials|OAuthException|Session has expired/i, selbst: false,
    text: 'Zugang abgelaufen oder ungültig', loesung: 'Den genannten Schlüssel neu erstellen und unter GitHub > Secrets ersetzen.' },
  { art: 'speicher', test: /No space left on device|ENOSPC/i, selbst: true, text: 'Festplatte des GitHub-Servers voll', loesung: 'Neustart auf frischem Server - meist erledigt.' },
  { art: 'konflikt', test: /non-fast-forward|failed to push|rejected.*fetch first|CONFLICT \(content\)|cannot lock ref/i, selbst: true,
    text: 'Speicher-Konflikt (zwei Agenten gleichzeitig)', loesung: 'Automatischer Neustart - danach passt es wieder.' },
  { art: 'netz', test: /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|\b50[234]\b|Service Unavailable|Bad Gateway|network error|TLS/i, selbst: true,
    text: 'Netz-Wackler bei einem Dienst', loesung: 'Automatischer Neustart - meist kurz danach wieder ok.' },
  { art: 'zeit', test: /exceeded the maximum execution time|has timed out|was canceled|The operation was canceled/i, selbst: false,
    text: 'Lauf zu langsam (Zeitlimit)', loesung: 'Weniger auf einmal: der Engpass-Chef senkt die Menge, oder Zeitlimit im Workflow erhöhen.' },
  { art: 'code', test: /SyntaxError|TypeError|ReferenceError|RangeError|Cannot find module|ERR_MODULE_NOT_FOUND|is not a function|is not defined|Unexpected token|ENOENT/i, selbst: false,
    text: 'Programmfehler', loesung: 'Muss im Code behoben werden - in Claude Code mit „Fehler-Doktor: <Workflow> reparieren“ beauftragen.' },
];

const SECRET = /\b([A-Z][A-Z0-9_]*_(?:TOKEN|KEY|SECRET|PASSWORD|PASSWORT|ID|URL|HANDLE))\b/;
// GitHub-Logzeilen: "2026-10-01T20:06:46.69Z text" -> nur der Text, ohne Steuerzeichen.
const zeilen = (log) => String(log || '').split('\n').map((z) => z.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, '').replace(/\u001b\[[\d;]*m/g, '').trim()).filter(Boolean);

export function diagnose(log) {
  const z = zeilen(log).filter((x) => !/^(##\[(group|endgroup)\]|shell:|env:|\s*[A-Z_]+:\s*$)/.test(x));
  const fehlerZeilen = z.filter((x) => /error|fehler|✗|failed|exception|##\[error\]|cannot|denied|refused|quota|limit|abgelaufen/i.test(x));
  const suche = (fehlerZeilen.length ? fehlerZeilen : z).slice(-40).join('\n');
  const regel = REGELN.find((r) => r.test.test(suche)) || REGELN.find((r) => r.test.test(z.slice(-200).join('\n')));
  const beleg = (fehlerZeilen.filter((x) => !/^##\[error\]Process completed with exit code/.test(x)).at(-1) || z.at(-1) || '').slice(0, 220);
  const secret = regel?.art === 'zugang' ? (suche.match(SECRET)?.[1] || '') : '';
  if (!regel) return { art: 'unbekannt', selbst: false, text: 'Unbekannter Fehler', loesung: 'Log ansehen - die letzte Fehlerzeile steht hier.', beleg };
  return { art: regel.art, selbst: regel.selbst, text: regel.text, loesung: secret ? `${regel.loesung} (Schlüssel: ${secret})` : regel.loesung, beleg, ...(secret ? { secret } : {}) };
}
