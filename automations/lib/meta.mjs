import { config } from './config.mjs';

const API_VERSION = 'v21.0';

export async function getAdInsights({ level = 'ad', datePreset = 'yesterday', fields, limit = 100 } = {}) {
  const url = `https://graph.facebook.com/${API_VERSION}/act_${config.META_AD_ACCOUNT_ID}/insights?level=${level}&date_preset=${datePreset}&fields=${fields}&limit=${limit}&access_token=${config.META_ACCESS_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta Ads API Fehler ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data || [];
}

export async function getAdSets({ fields, effectiveStatus, limit = 200 } = {}) {
  let url = `https://graph.facebook.com/${API_VERSION}/act_${config.META_AD_ACCOUNT_ID}/adsets?fields=${fields}&limit=${limit}&access_token=${config.META_ACCESS_TOKEN}`;
  if (effectiveStatus) url += `&effective_status=${encodeURIComponent(JSON.stringify(effectiveStatus))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta Ads API Fehler ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data || [];
}

export function purchaseCount(ad) {
  const x = (ad.actions || []).find((v) =>
    ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'].includes(v.action_type)
  );
  return x ? parseFloat(x.value) : 0;
}

export function purchaseValue(ad) {
  const x = (ad.action_values || []).find((v) =>
    ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'].includes(v.action_type)
  );
  return x ? parseFloat(x.value) : 0;
}

export async function pauseAd(adId) {
  const url = `https://graph.facebook.com/${API_VERSION}/${adId}?status=PAUSED&access_token=${config.META_ACCESS_TOKEN}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Meta Ads Pause Fehler ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateAdSetBudget(adSetId, dailyBudgetCents) {
  const url = `https://graph.facebook.com/${API_VERSION}/${adSetId}?daily_budget=${Math.round(dailyBudgetCents)}&access_token=${config.META_ACCESS_TOKEN}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Meta Ads Budget-Update Fehler ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function sendCustomAudienceUsers(audienceId, schema, data) {
  const url = `https://graph.facebook.com/${API_VERSION}/${audienceId}/users?access_token=${config.META_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { schema, data } }),
  });
  if (!res.ok) throw new Error(`Meta Custom-Audience Fehler ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function duplicateAd(adId) {
  const url = `https://graph.facebook.com/${API_VERSION}/${adId}/copies?access_token=${config.META_ACCESS_TOKEN}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Meta Ads Duplizieren Fehler ${res.status}: ${await res.text()}`);
  return res.json();
}
