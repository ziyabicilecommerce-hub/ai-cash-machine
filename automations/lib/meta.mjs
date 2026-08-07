import { config } from './config.mjs';

const API_VERSION = 'v21.0';

// Ohne diese Prüfung führt ein fehlendes META_ACCESS_TOKEN/META_AD_ACCOUNT_ID
// zu einer verwirrenden Meta-Fehlermeldung wie "Object with ID 'act_' does
// not exist" (leere ID einfach in die URL eingesetzt) statt einem klaren
// Hinweis, welches Secret fehlt.
function pruefeMetaConfig({ brauchtAdAccount = false } = {}) {
  if (!config.META_ACCESS_TOKEN) {
    throw new Error('META_ACCESS_TOKEN-Secret ist nicht gesetzt - bitte in GitHub → Settings → Secrets and variables → Actions eintragen (siehe automations/README.md).');
  }
  if (brauchtAdAccount && !config.META_AD_ACCOUNT_ID) {
    throw new Error('META_AD_ACCOUNT_ID-Secret ist nicht gesetzt - bitte in GitHub → Settings → Secrets and variables → Actions eintragen (siehe automations/README.md).');
  }
}

export async function getAdInsights({ level = 'ad', datePreset = 'yesterday', fields, limit = 100 } = {}) {
  pruefeMetaConfig({ brauchtAdAccount: true });
  const url = `https://graph.facebook.com/${API_VERSION}/act_${config.META_AD_ACCOUNT_ID}/insights?level=${level}&date_preset=${datePreset}&fields=${fields}&limit=${limit}&access_token=${config.META_ACCESS_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta Ads API Fehler ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data || [];
}

export async function getAdSets({ fields, effectiveStatus, limit = 200 } = {}) {
  pruefeMetaConfig({ brauchtAdAccount: true });
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
  pruefeMetaConfig();
  const url = `https://graph.facebook.com/${API_VERSION}/${adId}?status=PAUSED&access_token=${config.META_ACCESS_TOKEN}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Meta Ads Pause Fehler ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateAdSetBudget(adSetId, dailyBudgetCents) {
  pruefeMetaConfig();
  const url = `https://graph.facebook.com/${API_VERSION}/${adSetId}?daily_budget=${Math.round(dailyBudgetCents)}&access_token=${config.META_ACCESS_TOKEN}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Meta Ads Budget-Update Fehler ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function sendCustomAudienceUsers(audienceId, schema, data) {
  pruefeMetaConfig();
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
  pruefeMetaConfig();
  const url = `https://graph.facebook.com/${API_VERSION}/${adId}/copies?access_token=${config.META_ACCESS_TOKEN}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Meta Ads Duplizieren Fehler ${res.status}: ${await res.text()}`);
  return res.json();
}
