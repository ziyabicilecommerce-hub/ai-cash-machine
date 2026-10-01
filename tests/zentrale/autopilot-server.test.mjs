import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../zentrale/js/tresor.js';
import { kanalAus, bestellungenAus, produkteAus, naechsteSeite } from '../../automations/lib/zentraleShopify.mjs';

const { ZTresor } = globalThis;
const SKRIPT = fileURLToPath(new URL('../../automations/zentrale-autopilot.mjs', import.meta.url));

const order = (id, tag, kunde, items, extra = {}) => ({
  id, created_at: `2026-09-${String(tag).padStart(2, '0')}T10:00:00+02:00`, customer: kunde ? { id: kunde, email: 'geheim@example.com' } : null,
  line_items: items.map(([pid, q, p, rabatt = 0]) => ({ product_id: pid, quantity: q, price: String(p), title: 'Produkt ' + pid, discount_allocations: rabatt ? [{ amount: String(rabatt) }] : [] })),
  ...extra,
});

test('kanalAus erkennt UTM, Referrer und direkt', () => {
  assert.equal(kanalAus({ landing_site: '/products/x?utm_source=TikTok&utm_medium=paid' }), 'tiktok');
  assert.equal(kanalAus({ referring_site: 'https://l.instagram.com/' }), 'instagram');
  assert.equal(kanalAus({ landing_site: '/?utm_source=partnerblog' }), 'partnerblog');
  assert.equal(kanalAus({}), 'direkt');
  assert.equal(kanalAus({ referring_site: 'https://irgendwo.de' }), 'sonstige');
});

test('bestellungenAus: ohne E-Mails, Rabatte abgezogen, Stornos raus', () => {
  const b = bestellungenAus([
    order(1, 1, 77, [[10, 2, 20, 4]]),
    order(2, 2, null, [[11, 1, 5]]),
    order(3, 3, 77, [[10, 1, 20]], { cancelled_at: '2026-09-03' }),
  ]);
  assert.equal(b.length, 2);
  assert.equal(b[0].kunde, 'K-77');
  assert.equal(b[0].artikel[0].preis, 18);
  assert.equal(b[1].kunde, 'Gast-2');
  assert.ok(!JSON.stringify(b).includes('geheim@'));
});

test('produkteAus ergänzt gelöschte Produkte und nimmt Einkaufspreise', () => {
  const b = bestellungenAus([order(1, 1, 1, [[10, 1, 20], [99, 1, 7]])]);
  const p = produkteAus([{ id: 10, title: 'A', product_type: 'X', variants: [{ price: '20.00', inventory_item_id: 500 }] }], { 500: '6.50' }, b);
  assert.equal(p.length, 2);
  assert.equal(p[0].kosten, 6.5);
  assert.equal(p[1].kategorie, 'Gelöscht');
  assert.ok(!('name' in b[0].artikel[0]));
});

test('naechsteSeite liest den Shopify-Link-Header', () => {
  assert.equal(naechsteSeite('<https://s.myshopify.com/admin/api/2024-10/orders.json?limit=250&page_info=abc123>; rel="next"'), 'abc123');
  assert.equal(naechsteSeite('<https://x/orders.json?page_info=zz>; rel="previous"'), null);
});

test('Tresor: Rundreise klappt, falsches Passwort scheitert', async () => {
  const p = await ZTresor.verschluesseln({ a: [1, 2, 3], t: 'ä€' }, 'richtig-langes-pw');
  assert.ok(!JSON.stringify(p).includes('ä€'));
  assert.deepEqual(JSON.parse(JSON.stringify(await ZTresor.entschluesseln(p, 'richtig-langes-pw'))), { a: [1, 2, 3], t: 'ä€' });
  await assert.rejects(() => ZTresor.entschluesseln(p, 'falsch-falsch'), /Falsches Passwort/);
});

test('Ganzer Lauf gegen einen nachgebauten Shop: verschlüsselt, paginiert, Telegram', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zentrale-'));
  const ausgabe = join(dir, 'live.enc.json'), log = join(dir, 'telegram.txt');
  const orders = Array.from({ length: 60 }, (_, i) => order(1000 + i, 1 + (i % 28), 1 + (i % 15), [[10, 1, 30], ...(i % 3 ? [] : [[11, 1, 12]])], { landing_site: i % 2 ? '/?utm_source=tiktok' : '/' }));
  writeFileSync(join(dir, 'mock.mjs'), `
    const orders = ${JSON.stringify(orders)};
    globalThis.fetch = async (url, opt = {}) => {
      const u = String(url);
      const antwort = (body, link) => ({ ok: true, status: 200, json: async () => body, headers: { get: (h) => (h === 'link' ? link || null : null) } });
      if (u.includes('api.telegram.org')) { (await import('node:fs')).writeFileSync(${JSON.stringify(log)}, JSON.parse(opt.body).text); return antwort({ ok: true }); }
      if (u.includes('/orders.json') && u.includes('page_info=seite2')) return antwort({ orders: orders.slice(30) });
      if (u.includes('/orders.json')) return antwort({ orders: orders.slice(0, 30) }, '<https://t.myshopify.com/admin/api/2024-10/orders.json?limit=250&page_info=seite2>; rel="next"');
      if (u.includes('/products.json')) return antwort({ products: [{ id: 10, title: 'LED', variants: [{ price: '30.00', inventory_item_id: 5 }] }, { id: 11, title: 'Kabel', variants: [{ price: '12.00', inventory_item_id: 6 }] }] });
      if (u.includes('/inventory_items.json')) return antwort({ inventory_items: [{ id: 5, cost: '9.00' }, { id: 6, cost: '2.00' }] });
      return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
    };`);
  const env = { ...process.env, SHOP: 'testshop', SHOPIFY_TOKEN: 'x', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', ZENTRALE_SCHLUESSEL: 'mein-geheimes-pw', ZENTRALE_AUSGABE: ausgabe, GITHUB_REPOSITORY: 'max/shop' };
  const out = execFileSync(process.execPath, ['--import', join(dir, 'mock.mjs'), SKRIPT], { env, encoding: 'utf8' });
  assert.match(out, /Telegram gesendet/);
  assert.match(out, /Verschlüsselte Live-Daten geschrieben/);
  assert.ok(!/€|\d+ Bestellungen/.test(out), 'Log darf keine Geschäftszahlen enthalten (öffentliches Repo)');
  const roh = readFileSync(ausgabe, 'utf8');
  assert.ok(!roh.includes('LED') && !roh.includes('K-1'), 'Datei muss verschlüsselt sein');
  const d = await ZTresor.entschluesseln(JSON.parse(roh), 'mein-geheimes-pw');
  assert.equal(d.bestellungen.length, 60, 'beide Seiten geholt');
  assert.equal(d.produkte.find((p) => p.id === 'p10').kosten, 9);
  const bericht = readFileSync(log, 'utf8');
  assert.match(bericht, /ZENTRALE · Tagesbericht/);
  assert.match(bericht, /max\.github\.io\/shop\/zentrale\//);
});

test('Ohne Shop-Secrets beendet sich der Lauf ruhig und schreibt nichts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zentrale-'));
  const ausgabe = join(dir, 'live.enc.json');
  const env = { ...process.env, SHOP: '', SHOPIFY_TOKEN: '', ZENTRALE_AUSGABE: ausgabe };
  const out = execFileSync(process.execPath, [SKRIPT], { env, encoding: 'utf8' });
  assert.match(out, /Shop nicht verbunden/);
  assert.ok(!existsSync(ausgabe));
});
