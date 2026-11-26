// Shop-Autopilot-Kit (26.11., Nutzer: "deine Bots als Produkt verkaufen - perfekt"): packt 10 erprobte Shopify-Bots
// mit allen Hilfsdateien, schlanken GitHub-Actions-Workflows und einer deutschen Anleitung zu einem ZIP, das auf
// Gumroad o. ä. verkauft werden kann. Keine Secrets, keine Kundendaten, kein State - nur Code + Anleitung.
//   node scripts/shop-kit-bauen.mjs [zielordner]
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const BOTS = [
  { datei: '15-warenkorb-sequenz', name: 'Warenkorb-Retter', was: 'Erinnert an abgebrochene Warenkörbe nach 1 h, 24 h und 72 h - freundlich, per E-Mail.', cron: '0 * * * *' },
  { datei: '04-bewertungs-magnet', name: 'Bewertungs-Magnet', was: 'Bittet Kunden einige Tage nach Erhalt um eine Bewertung.', cron: '0 9 * * *' },
  { datei: '05-winback-maschine', name: 'Winback-Maschine', was: 'Holt Kunden zurück, die lange nichts bestellt haben (optional mit Rabattcode).', cron: '0 10 * * *' },
  { datei: '13-willkommens-booster', name: 'Willkommens-Booster', was: 'Begrüßt Neukunden nach der ersten Bestellung persönlich.', cron: '30 8 * * *' },
  { datei: '39-nachbestell-erinnerung', name: 'Nachbestell-Erinnerung', was: 'Erinnert rechtzeitig, wenn Verbrauchsprodukte bald leer sind.', cron: '0 11 * * *' },
  { datei: '29-zahlungs-retter', name: 'Zahlungs-Retter', was: 'Freundliche Erinnerung bei offener Vorkasse/Überweisung - ohne Mahn-Ton.', cron: '0 13 * * *' },
  { datei: '20-lager-waechter', name: 'Lager-Wächter', was: 'Warnt dich, bevor Bestseller ausverkauft sind (nach Verkaufstempo).', cron: '0 6 * * *' },
  { datei: '14-preis-spion', name: 'Preis-Spion', was: 'Beobachtet Konkurrenz-Preise und meldet Änderungen und Sales.', cron: '0 5 * * *' },
  { datei: '28-seo-text-doktor', name: 'SEO-Text-Doktor', was: 'Findet zu dünne Produktbeschreibungen und schlägt bessere vor.', cron: '0 8 * * 2' },
  { datei: '27-wochen-sieger-report', name: 'Wochen-Report', was: 'Jeden Sonntag: bester Tag, beste Uhrzeit, bestes Produkt der Woche.', cron: '0 18 * * 0' },
];
// Einstellungen, die die Bots lesen (alles optional außer SHOP + SHOPIFY_TOKEN)
export const EINSTELLUNGEN = {
  Pflicht: { SHOP: 'Shop-Adresse, z. B. mein-shop.myshopify.com', SHOPIFY_TOKEN: 'Admin-API-Token aus Shopify (Einstellungen → Apps → App entwickeln)' },
  'E-Mail': { RESEND_API_KEY: 'Kostenloser Schlüssel von resend.com (3.000 Mails/Monat gratis)', ABSENDER_EMAIL: 'Absender, z. B. Mein Shop <hallo@mein-shop.de>', OWNER_EMAIL: 'Deine Adresse für Berichte' },
  Benachrichtigung: { TELEGRAM_BOT_TOKEN: 'Optional: Meldungen aufs Handy per Telegram', TELEGRAM_CHAT_ID: 'Optional: deine Telegram-Chat-ID' },
  Shop: { SHOP_NAME: 'Name deines Shops', SHOP_URL: 'Öffentliche Shop-Adresse', SHOP_NISCHE: 'Worum es im Shop geht (für passende Texte)', VERSANDZEIT: 'z. B. 2-4 Werktage' },
  Bots: { WINBACK_TAGE: 'Ab wie vielen Tagen ohne Bestellung (Standard 60)', WINBACK_RABATT_CODE: 'Optionaler Rabattcode', WINBACK_RABATT_PROZENT: 'Rabatt in % (nur Text)', NACHBESTELL_TAGE: 'Nach wie vielen Tagen erinnern', NACHBESTELL_RABATT_CODE: 'Optionaler Rabattcode', TAGE_NACH_BESTELLUNG: 'Bewertungs-Anfrage nach X Tagen', BEWERTUNG_LINK: 'Link zu deiner Bewertungsseite', RABATT_CODE: 'Allgemeiner Rabattcode', RABATT_PROZENT: 'Allgemeiner Rabatt in %', KONKURRENT_URLS: 'Preis-Spion: Produkt-Links der Konkurrenz, mit Komma getrennt', REICHWEITE_TAGE_WARNUNG: 'Lager-Wächter: warnen, wenn Bestand für weniger als X Tage reicht', MIN_TEXTLAENGE: 'SEO-Doktor: Mindestlänge einer Beschreibung' },
  Sicherheit: { TEST_MODE: '"ja" = nichts wird wirklich verschickt (zum Ausprobieren)' },
};
const ALLE_KEYS = () => Object.values(EINSTELLUNGEN).flatMap((g) => Object.keys(g));

// Alle Dateien, die die Bots brauchen (relative Importe rekursiv folgen)
export function abhaengigkeiten(start, wurzel = '.') {
  const gesehen = new Set();
  const offen = [...start];
  while (offen.length) {
    const f = offen.pop();
    if (gesehen.has(f)) continue;
    gesehen.add(f);
    const text = readFileSync(join(wurzel, f), 'utf8');
    for (const [, imp] of text.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) offen.push(relative(wurzel, resolve(wurzel, dirname(f), imp)));
    for (const [, imp] of text.matchAll(/import\(\s*'(\.{1,2}\/[^']+)'\s*\)/g)) offen.push(relative(wurzel, resolve(wurzel, dirname(f), imp)));
  }
  return [...gesehen].sort();
}

// Darf nichts Persönliches enthalten - Abbruch, falls doch
export const VERBOTEN = /deskrebel|purivelle|ziyabicil|gmail\.com|ghp_[A-Za-z0-9]{20,}|shpat_[A-Za-z0-9]{10,}|re_[A-Za-z0-9]{20,}/i;
export function pruefen(dateien, lesen = (f) => readFileSync(f, 'utf8')) {
  return dateien.filter((f) => VERBOTEN.test(lesen(f)));
}

export function runnerYml() {
  const env = ['GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}', ...ALLE_KEYS().map((k) => `${k}: \${{ secrets.${k} }}`)].map((z) => `          ${z}`).join('\n');
  return `name: Shop-Autopilot (gemeinsamer Lauf)

on:
  workflow_call:
    inputs:
      script:
        required: true
        type: string

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    concurrency:
      group: \${{ inputs.script }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Bot ausführen
        run: node \${{ inputs.script }}
        env:
${env}
      - name: Fortschritt speichern (wer schon angeschrieben wurde)
        if: always()
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add automations/state/ 2>/dev/null || true
          if ! git diff --cached --quiet; then
            git commit -m "Bot-Fortschritt [skip ci]"
            for v in 1 2 3; do git push && exit 0; git pull --rebase -X theirs origin "$GITHUB_REF_NAME" || true; sleep $((v * 3)); done
          fi
`;
}

export function botYml(b) {
  return `name: "${b.name}"

on:
  schedule:
    - cron: '${b.cron}'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  run:
    uses: ./.github/workflows/_runner.yml
    with:
      script: automations/${b.datei}.mjs
    secrets: inherit
`;
}

export function anleitung() {
  const bots = BOTS.map((b) => `| **${b.name}** | ${b.was} |`).join('\n');
  const einst = Object.entries(EINSTELLUNGEN).map(([g, o]) => `### ${g}\n\n| Name | Wofür |\n|---|---|\n${Object.entries(o).map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n')}`).join('\n\n');
  return `# Shop-Autopilot-Kit – 10 Bots für deinen Shopify-Shop

Zehn fertige Automationen, die rund um die Uhr für deinen Shop arbeiten – **kostenlos auf GitHub**, ohne Server,
ohne monatliche App-Gebühren. Texte schreibt eine kostenlose KI (Pollinations), E-Mails gehen über Resend (gratis bis 3.000/Monat).

## Was drin ist

| Bot | Was er macht |
|---|---|
${bots}

## Einrichten in 15 Minuten

1. **GitHub-Konto** anlegen (kostenlos) und ein neues, **privates** Repository erstellen.
2. Den Inhalt dieses ZIPs hochladen (Repository → „Add file" → „Upload files"), inklusive des Ordners \`.github\`.
3. In **Shopify**: Einstellungen → Apps und Vertriebskanäle → Apps entwickeln → App erstellen.
   Admin-API-Rechte: Bestellungen, Kunden, Produkte, Inventar (jeweils lesen; Produkte schreiben nur für den SEO-Doktor).
   Den Admin-API-Token kopieren.
4. In **GitHub**: Repository → Settings → Secrets and variables → Actions → „New repository secret".
   Mindestens \`SHOP\` und \`SHOPIFY_TOKEN\` anlegen, für E-Mails zusätzlich \`RESEND_API_KEY\` und \`ABSENDER_EMAIL\`.
5. **Erst testen:** Secret \`TEST_MODE\` = \`ja\`. Dann unter „Actions" einen Bot auswählen → „Run workflow".
   Im Protokoll siehst du, was er tun würde – verschickt wird im Testmodus nichts.
6. Passt alles: \`TEST_MODE\` löschen oder auf \`nein\` setzen. Ab jetzt laufen die Bots automatisch nach Zeitplan.

## Alle Einstellungen

${einst}

## Wichtig

- **Rechtliches:** Werbe-E-Mails nur an Kunden, die eingewilligt haben bzw. im Rahmen der Bestandskunden-Regel
  (§ 7 Abs. 3 UWG). Abmeldelink und Impressum gehören in jede Mail. Du bist für den Versand verantwortlich.
- **Zeitpläne** (cron, in UTC) kannst du in \`.github/workflows/*.yml\` ändern oder einzelne Bots dort löschen.
- **Fortschritt** (wer schon angeschrieben wurde) speichern die Bots in \`automations/state/\` – so bekommt niemand doppelt Post.
- Ohne Gewähr auf bestimmte Umsätze. Die Bots nehmen dir Routine ab – verkaufen muss dein Shop.
`;
}

export function bauen(ziel = 'dist/shop-autopilot-kit', wurzel = '.') {
  const ordner = resolve(wurzel, ziel);
  if (existsSync(ordner)) rmSync(ordner, { recursive: true, force: true });
  const dateien = abhaengigkeiten(BOTS.map((b) => `automations/${b.datei}.mjs`), wurzel);
  const schlecht = pruefen(dateien.map((f) => join(wurzel, f)));
  if (schlecht.length) throw new Error(`Persönliche Daten gefunden in: ${schlecht.join(', ')}`);
  for (const f of dateien) {
    mkdirSync(dirname(join(ordner, f)), { recursive: true });
    // Hinweise auf Dateien, die nur im Original-Repo existieren, zeigen im Kit auf die ANLEITUNG
    writeFileSync(join(ordner, f), readFileSync(join(wurzel, f), 'utf8').replaceAll('siehe setup/ App oder automations/README.md', 'siehe ANLEITUNG.md'));
  }
  mkdirSync(join(ordner, '.github/workflows'), { recursive: true });
  mkdirSync(join(ordner, 'automations/state'), { recursive: true });
  writeFileSync(join(ordner, 'automations/state/.gitkeep'), '');
  writeFileSync(join(ordner, '.github/workflows/_runner.yml'), runnerYml());
  for (const b of BOTS) writeFileSync(join(ordner, `.github/workflows/${b.datei}.yml`), botYml(b));
  writeFileSync(join(ordner, 'package.json'), JSON.stringify({ name: 'shop-autopilot-kit', version: '1.0.0', private: true, type: 'module', engines: { node: '>=20' } }, null, 2) + '\n');
  writeFileSync(join(ordner, 'ANLEITUNG.md'), anleitung());
  return { ordner, dateien };
}

if (process.argv[1]?.endsWith('shop-kit-bauen.mjs')) {
  const { ordner, dateien } = bauen(process.argv[2] || 'dist/shop-autopilot-kit');
  execFileSync('zip', ['-qr', `${ordner}.zip`, '.'], { cwd: ordner });
  console.log(`[shop-kit] ${dateien.length} Dateien + ${BOTS.length} Workflows -> ${ordner}.zip`);
}
