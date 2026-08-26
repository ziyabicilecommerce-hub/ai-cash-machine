// Preis-Spion - beobachtet Konkurrenz-Preise täglich und meldet Änderungen/Sales
// Original: n8n Workflow "14_Preis_Spion" · Zeitplan: täglich 06:00
import { config } from './lib/config.mjs';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '14-preis-spion';

async function ladeSeite(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    },
  });
  return res.text();
}

async function main() {
  const urls = (config.KONKURRENT_URLS || '').split(',').map((u) => u.trim()).filter((u) => u.startsWith('http'));
  const state = loadState(STATE_KEY);
  state.preise = state.preise || {};

  const zeilen = [];
  let alarm = false;

  for (const url of urls) {
    const html = await ladeSeite(url);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 12000);

    const prompt = `Hier der Textinhalt einer Produktseite eines Konkurrenten (${url}):${NL}${NL}${text}${NL}${NL}Extrahiere: Produktname und aktueller Verkaufspreis (der Preis, den ein Kunde JETZT zahlen würde - bei Streichpreisen der reduzierte). Falls ein Rabatt/Sale erkennbar ist, nenne ihn.${NL}Antworte NUR mit validem JSON, ohne Markdown: {"produkt": "...", "preis": "29.99", "waehrung": "EUR", "sale": "ja|nein", "sale_info": "..."}${NL}Wenn kein Preis erkennbar ist: {"produkt": "unbekannt", "preis": "", "waehrung": "", "sale": "nein", "sale_info": ""}`;

    const antwort = await askKI(prompt, { maxTokens: 500 });
    const d = parseJsonFromText(antwort, { produkt: 'unbekannt', preis: '', sale: 'nein', sale_info: '' });

    const alt = state.preise[url];
    const neu = d.preis;
    let zeile = `- ${d.produkt}${NL}  ${neu ? `${neu} ${d.waehrung || ''}` : 'Preis nicht lesbar'}`;

    if (alt && neu && alt !== neu) {
      const pfeil = parseFloat(neu) < parseFloat(alt) ? 'GESENKT' : 'ERHÖHT';
      zeile += `${NL}  ${pfeil}: vorher ${alt} -> jetzt ${neu}`;
      alarm = true;
    }
    if (d.sale === 'ja') {
      zeile += `${NL}  SALE: ${d.sale_info || 'aktiv'}`;
      alarm = true;
    }
    zeile += `${NL}  ${url}`;
    zeilen.push(zeile);
    if (neu) state.preise[url] = neu;
  }

  saveState(STATE_KEY, state);

  const kopf = `${alarm ? 'PREIS-SPION: BEWEGUNG BEI DER KONKURRENZ!' : 'PREIS-SPION: Alles ruhig.'}${NL}${config.SHOP_NAME}${NL}--------------------${NL}${NL}`;
  await notifyTelegram(kopf + zeilen.join(`${NL}${NL}`));

  console.log(`[14-preis-spion] ${urls.length} URL(s) geprüft, Alarm: ${alarm}`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[14-preis-spion] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[14-preis-spion] Fehler:', err);
  process.exit(1);
});
