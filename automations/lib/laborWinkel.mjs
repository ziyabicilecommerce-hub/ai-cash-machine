// Liefert der Video-Fabrik die Erzählweise mit dem im Werbe-Labor getesteten Hook (höchstens 14 Tage alt).
import { readFileSync, existsSync } from 'node:fs';
import '../../zentrale/js/labor.js';

export function laborWinkel(p, { pfad = 'automations/state/werbe-labor.json', jetzt = Date.now() } = {}) {
  let stand;
  try { stand = existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')) : null; } catch { stand = null; }
  const e = stand && stand.produkte && stand.produkte[`${p.shopUrl || ''}/products/${p.handle || p.id}`];
  if (!e || !(jetzt - Date.parse(e.erstellt) < 14 * 864e5)) return '';
  return globalThis.ZLabor.fabrikWinkel(e);
}
