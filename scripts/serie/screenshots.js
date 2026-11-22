const { chromium } = require('playwright');
const out = process.argv[2];
const root = '/home/user/ai-cash-machine/';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const pages = ['automations-dashboard', 'automations-dashboard/tiktok', 'automations-dashboard/reselling', 'mission-control', 'cockpit', 'uebersicht', 'zentrale', 'trading-dashboard'];
  let n = 0;
  for (const u of pages) {
    try {
      await p.goto('file://' + root + u + '/index.html', { waitUntil: 'load', timeout: 15000 });
      await p.waitForTimeout(1500);
      await p.screenshot({ path: `${out}/s${n++}.png` });
      console.log('ok', u);
    } catch (e) { console.log('fail', u, e.message.slice(0, 80)); }
  }
  await b.close();
})();
