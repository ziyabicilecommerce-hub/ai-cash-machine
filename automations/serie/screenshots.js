// Serie (#119): Bildschirmfotos der Dashboards im Handy-Format für die Folge.
//   node automations/serie/screenshots.js out/serie-folge.json out/serie
// Schreibt <ordner>/seite-<n>.png je Szene mit "seite" (Dateien direkt vom Repo, kein Server nötig).
const { readFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [folgeDatei, ordner] = process.argv.slice(2);
const folge = JSON.parse(readFileSync(folgeDatei, 'utf8'));
const repo = path.resolve(__dirname, '..', '..');
mkdirSync(ordner, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  for (const [i, s] of folge.szenen.entries()) {
    if (!s.seite) continue;
    try {
      await page.goto('file://' + path.join(repo, s.seite, 'index.html'), { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(ordner, `seite-${i}.png`) });
      console.log('📸', s.seite);
    } catch (e) { console.log('⚠️', s.seite, e.message.slice(0, 100)); }
  }
  await browser.close();
})();
