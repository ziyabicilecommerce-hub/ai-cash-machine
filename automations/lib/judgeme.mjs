import { config } from './config.mjs';

export async function getReviews({ perPage = 30, page = 1 } = {}) {
  if (!config.JUDGEME_API_TOKEN || !config.JUDGEME_SHOP_DOMAIN) {
    throw new Error('JUDGEME_API_TOKEN/JUDGEME_SHOP_DOMAIN-Secret ist nicht gesetzt - bitte in GitHub → Settings → Secrets and variables → Actions eintragen (siehe automations/README.md).');
  }
  const url = `https://judge.me/api/v1/reviews?api_token=${config.JUDGEME_API_TOKEN}&shop_domain=${config.JUDGEME_SHOP_DOMAIN}&per_page=${perPage}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Judge.me API Fehler ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.reviews || [];
}
