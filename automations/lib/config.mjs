// Zentrale Konfiguration - liest alle Werte aus Umgebungsvariablen (GitHub Secrets/Vars)
// statt aus dem n8n "Setup"-Node.
export const config = {
  SHOP: process.env.SHOP || '',
  SHOPIFY_TOKEN: process.env.SHOPIFY_TOKEN || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  // Tages-Obergrenze für Claude-Tokenverbrauch über alle Automationen hinweg
  // (Input+Output zusammen). '0' oder leer = kein Limit.
  CLAUDE_MAX_TOKENS_PRO_TAG: process.env.CLAUDE_MAX_TOKENS_PRO_TAG || '300000',
  SHOP_NAME: process.env.SHOP_NAME || 'Mein Shop',
  SHOP_URL: process.env.SHOP_URL || '',
  SHOP_NISCHE: process.env.SHOP_NISCHE || '',
  ABSENDER_EMAIL: process.env.ABSENDER_EMAIL || '',
  OWNER_EMAIL: process.env.OWNER_EMAIL || '',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  TEST_MODE: process.env.TEST_MODE || 'nein',

  // Meta Ads
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN || '',
  META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID || '',
  FB_PAGE_ID: process.env.FB_PAGE_ID || '',
  FB_PAGE_TOKEN: process.env.FB_PAGE_TOKEN || '',
  CUSTOM_AUDIENCE_ID: process.env.CUSTOM_AUDIENCE_ID || '',

  // WhatsApp Cloud API (Lead-Jäger)
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  WHATSAPP_TO_NUMBER: process.env.WHATSAPP_TO_NUMBER || '',

  // Trading-Bot (Binance Spot, kein Hebel/Margin - maximaler Verlust ist immer
  // das eingesetzte Kapital, nie mehr)
  BINANCE_API_KEY: process.env.BINANCE_API_KEY || '',
  BINANCE_API_SECRET: process.env.BINANCE_API_SECRET || '',
  TRADING_PAPER_MODE: process.env.TRADING_PAPER_MODE || 'ja',
  TRADING_SYMBOL: process.env.TRADING_SYMBOL || 'BTCUSDT',
  TRADING_KAPITAL_USDT: process.env.TRADING_KAPITAL_USDT || '100',
  TRADING_MAX_POSITION_PROZENT: process.env.TRADING_MAX_POSITION_PROZENT || '25',
  TRADING_MAX_TAGESVERLUST_PROZENT: process.env.TRADING_MAX_TAGESVERLUST_PROZENT || '5',
  TRADING_MAX_GESAMTVERLUST_PROZENT: process.env.TRADING_MAX_GESAMTVERLUST_PROZENT || '20',
  TRADING_STOP_LOSS_PROZENT: process.env.TRADING_STOP_LOSS_PROZENT || '3',
  TRADING_EMA_SCHNELL: process.env.TRADING_EMA_SCHNELL || '9',
  TRADING_EMA_LANGSAM: process.env.TRADING_EMA_LANGSAM || '21',

  // Pump-Scanner (reiner Alarm, kein Handel)
  PUMP_QUOTE_WAEHRUNG: process.env.PUMP_QUOTE_WAEHRUNG || 'USDT',
  PUMP_SCHWELLE_PROZENT: process.env.PUMP_SCHWELLE_PROZENT || '15',
  PUMP_MIN_VOLUMEN_USDT: process.env.PUMP_MIN_VOLUMEN_USDT || '1000000',
  PUMP_COOLDOWN_STUNDEN: process.env.PUMP_COOLDOWN_STUNDEN || '6',
  PUMP_MAX_PRO_LAUF: process.env.PUMP_MAX_PRO_LAUF || '10',

  // Google Maps via Composio (Lead-Jäger) - kein eigener Google-Cloud-Billing-Account nötig
  COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY || '',
  LEAD_SUCHBEGRIFFE: process.env.LEAD_SUCHBEGRIFFE || '',
  LEAD_MAX_PRO_LAUF: process.env.LEAD_MAX_PRO_LAUF || '15',

  // Product-Hunter (Produktrecherche, Claude-Einschätzung statt Live-Trenddaten)
  PRODUCT_HUNTER_NISCHEN: process.env.PRODUCT_HUNTER_NISCHEN || '',
  PRODUCT_HUNTER_ANZAHL_PRO_NISCHE: process.env.PRODUCT_HUNTER_ANZAHL_PRO_NISCHE || '3',

  // Creative Studio (Ad-Kreativ-Pakete: Hooks, Ad-Copy, Bild-Prompts, optional echte Bildgenerierung)
  CREATIVE_STUDIO_PRODUKTE: process.env.CREATIVE_STUDIO_PRODUKTE || '',
  CREATIVE_STUDIO_ANZAHL_PRODUKTE: process.env.CREATIVE_STUDIO_ANZAHL_PRODUKTE || '1',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // Store Builder & Optimizer (legt Produktseiten als Shopify-Entwurf an, prüft die Live-Storefront)
  STORE_BUILDER_PRODUKTE: process.env.STORE_BUILDER_PRODUKTE || '',
  STORE_BUILDER_ANZAHL_PRODUKTE: process.env.STORE_BUILDER_ANZAHL_PRODUKTE || '1',

  // Compliance Guard (nur Warnungen/Checklisten, keine Rechtsberatung)
  COMPLIANCE_GUARD_MAX_PRO_LAUF: process.env.COMPLIANCE_GUARD_MAX_PRO_LAUF || '20',

  // Fulfillment & Supplier Hub (nutzt nur die bestehende Shopify-Verbindung)
  FULFILLMENT_VERZUG_STUNDEN: process.env.FULFILLMENT_VERZUG_STUNDEN || '48',

  // CRM & Retention Engine (Kundenstamm-Segmentierung, personalisierte At-Risk-Angebote)
  CRM_AT_RISK_TAGE: process.env.CRM_AT_RISK_TAGE || '45',
  CRM_SMS_TOP_N: process.env.CRM_SMS_TOP_N || '3',
  CRM_MAX_PRO_LAUF: process.env.CRM_MAX_PRO_LAUF || '10',
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER || '',

  // Judge.me Bewertungen
  JUDGEME_API_TOKEN: process.env.JUDGEME_API_TOKEN || '',
  JUDGEME_SHOP_DOMAIN: process.env.JUDGEME_SHOP_DOMAIN || '',

  // Wetter
  LAT: process.env.LAT || '52.52',
  LON: process.env.LON || '13.40',

  // Geschäfts-Schwellwerte (haben pro Workflow sinnvolle Defaults, per Secret überschreibbar)
  VIP_UMSATZ_SCHWELLE: process.env.VIP_UMSATZ_SCHWELLE || '150',
  VIP_BESTELLUNGEN_SCHWELLE: process.env.VIP_BESTELLUNGEN_SCHWELLE || '3',
  VIP_RABATT_CODE: process.env.VIP_RABATT_CODE || 'VIP20',
  WINBACK_TAGE: process.env.WINBACK_TAGE || '60',
  WINBACK_RABATT_CODE: process.env.WINBACK_RABATT_CODE || 'COMEBACK15',
  WINBACK_RABATT_PROZENT: process.env.WINBACK_RABATT_PROZENT || '15',
  NACHBESTELL_TAGE: process.env.NACHBESTELL_TAGE || '30',
  NACHBESTELL_RABATT_CODE: process.env.NACHBESTELL_RABATT_CODE || 'WIEDER10',
  SCHLAEFER_RABATT_CODE: process.env.SCHLAEFER_RABATT_CODE || 'AUFWACH20',
  JUBILAEUM_RABATT_CODE: process.env.JUBILAEUM_RABATT_CODE || 'JUBILEUM15',
  NEWSLETTER_RABATT_CODE: process.env.NEWSLETTER_RABATT_CODE || 'WELCOME10',
  UPSELL_RABATT_CODE: process.env.UPSELL_RABATT_CODE || 'UPSELL10',
  RABATT_CODE: process.env.RABATT_CODE || 'SAVE10',
  RABATT_PROZENT: process.env.RABATT_PROZENT || '10',
  KAMPAGNEN_RABATT_CODE: process.env.KAMPAGNEN_RABATT_CODE || 'PROMO15',
  MIN_UMSATZ: process.env.MIN_UMSATZ || '50',
  MIN_BESTELLUNGEN: process.env.MIN_BESTELLUNGEN || '5',
  GROSS_SCHWELLE_WERT: process.env.GROSS_SCHWELLE_WERT || '300',
  GROSS_SCHWELLE_MENGE: process.env.GROSS_SCHWELLE_MENGE || '5',
  RETOURE_TAGE: process.env.RETOURE_TAGE || '30',
  KAUF_VOR_TAGEN: process.env.KAUF_VOR_TAGEN || '14',
  TAGE_NACH_BESTELLUNG: process.env.TAGE_NACH_BESTELLUNG || '3',
  FRAGE_TAGE: process.env.FRAGE_TAGE || '10',
  UGC_BELOHNUNG: process.env.UGC_BELOHNUNG || '10% Rabattcode',
  BEWERTUNG_LINK: process.env.BEWERTUNG_LINK || '',
  FEEDBACK_ANREIZ: process.env.FEEDBACK_ANREIZ || '10% auf die nächste Bestellung',
  MIN_SPEND_FUER_BEWERTUNG: process.env.MIN_SPEND_FUER_BEWERTUNG || '20',
  MAX_EMPFAENGER: process.env.MAX_EMPFAENGER || '50',
  MIN_TEXTLAENGE: process.env.MIN_TEXTLAENGE || '20',
  ANZAHL_ADS: process.env.ANZAHL_ADS || '5',
  ANZAHL_SKRIPTE: process.env.ANZAHL_SKRIPTE || '3',
  ZIELGRUPPE: process.env.ZIELGRUPPE || '',
  ANSPRACHE: process.env.ANSPRACHE || 'locker und persönlich',
  MARKETING_BUDGET_MONAT: process.env.MARKETING_BUDGET_MONAT || '500',
  MONATSZIEL_UMSATZ: process.env.MONATSZIEL_UMSATZ || '10000',
  WERBEKOSTEN_PRO_TAG: process.env.WERBEKOSTEN_PRO_TAG || '20',
  MIN_SPEND: process.env.MIN_SPEND || '10',
  MIN_SPEND_HEUTE: process.env.MIN_SPEND_HEUTE || '10',
  ROAS_ZIEL: process.env.ROAS_ZIEL || '3',
  KRITISCHER_ROAS: process.env.KRITISCHER_ROAS || '1',
  SKALIER_PROZENT: process.env.SKALIER_PROZENT || '20',
  MAX_TAGESBUDGET: process.env.MAX_TAGESBUDGET || '100',
  AUTO_SKALIEREN: process.env.AUTO_SKALIEREN || 'nein',
  AUTO_PAUSE: process.env.AUTO_PAUSE || 'nein',
  AUTO_STOP: process.env.AUTO_STOP || 'nein',
  AUTO_POST_FACEBOOK: process.env.AUTO_POST_FACEBOOK || 'nein',
  KONKURRENT_URLS: process.env.KONKURRENT_URLS || '',
  HEIMATMARKT: process.env.HEIMATMARKT || 'DE',
  LAND_CODE: process.env.LAND_CODE || 'DE',
  REGION: process.env.REGION || 'DACH',
  INSTAGRAM_HANDLE: process.env.INSTAGRAM_HANDLE || '',
  TIKTOK_HANDLE: process.env.TIKTOK_HANDLE || '',
  VORLAUF_TAGE: process.env.VORLAUF_TAGE || '7',
  VERSANDZEIT: process.env.VERSANDZEIT || '2-4 Werktage',
  REICHWEITE_TAGE_WARNUNG: process.env.REICHWEITE_TAGE_WARNUNG || '14',
  PRODUKTKOSTEN_PROZENT: process.env.PRODUKTKOSTEN_PROZENT || '40',

  // Profit & Tax Center (Finance-Cockpit-Erweiterung: Gebühren, Steuern, echter Nettogewinn)
  ZAHLUNGSGEBUEHR_PROZENT: process.env.ZAHLUNGSGEBUEHR_PROZENT || '2.5',
  ZAHLUNGSGEBUEHR_FIX_CENT: process.env.ZAHLUNGSGEBUEHR_FIX_CENT || '25',
  UMSATZSTEUER_PROZENT: process.env.UMSATZSTEUER_PROZENT || '19',

  // Pricing-Agent (echte Preisänderungen basierend auf Verkaufstempo) - wie
  // AUTO_SKALIEREN bei den Ads standardmäßig AUS, nur Empfehlung bis bewusst aktiviert.
  AUTO_PREISANPASSUNG: process.env.AUTO_PREISANPASSUNG || 'nein',
  PREIS_MAX_AENDERUNG_PROZENT: process.env.PREIS_MAX_AENDERUNG_PROZENT || '15',
  PREIS_MIN_MARGE_PROZENT: process.env.PREIS_MIN_MARGE_PROZENT || '20',
  PRICING_AGENT_MAX_PRO_LAUF: process.env.PRICING_AGENT_MAX_PRO_LAUF || '20',

  // Risk-Guard-Agent (Bestell-Risikoprüfung - taggt nur, storniert nie automatisch)
  RISK_GUARD_MIN_BESTELLWERT: process.env.RISK_GUARD_MIN_BESTELLWERT || '50',
  RISK_GUARD_MAX_PRO_LAUF: process.env.RISK_GUARD_MAX_PRO_LAUF || '20',

  // Reorder-Agent (automatische Nachbestell-Anfrage beim Lieferanten)
  AUTO_BESTELLUNG_SENDEN: process.env.AUTO_BESTELLUNG_SENDEN || 'nein',
  SUPPLIER_EMAIL: process.env.SUPPLIER_EMAIL || '',
  REORDER_PUFFER_TAGE: process.env.REORDER_PUFFER_TAGE || '30',
  REORDER_LIEFERZEIT_TAGE: process.env.REORDER_LIEFERZEIT_TAGE || '14',

  // Ads-Autopilot-Agent (führt Budget-Umschichtung zwischen Ad-Sets wirklich aus)
  AUTO_BUDGET_UMSCHICHTEN: process.env.AUTO_BUDGET_UMSCHICHTEN || 'nein',
  ADS_AUTOPILOT_MAX_SHIFT_PROZENT: process.env.ADS_AUTOPILOT_MAX_SHIFT_PROZENT || '15',
  ADS_AUTOPILOT_MIN_SPEND: process.env.ADS_AUTOPILOT_MIN_SPEND || '15',

  // Inventory-Guardian-Agent (stoppt Überverkauf bei Bestand 0) - Default AN,
  // da rein schützend/reversibel (im Gegensatz zu Preis-/Budget-Änderungen).
  AUTO_UEBERVERKAUF_STOPPEN: process.env.AUTO_UEBERVERKAUF_STOPPEN || 'ja',

  // Treue-Punkte-Engine (echte Shopify-Rabattcodes als Belohnung)
  LOYALTY_PUNKTE_PRO_EURO: process.env.LOYALTY_PUNKTE_PRO_EURO || '1',
  LOYALTY_SCHWELLE_PUNKTE: process.env.LOYALTY_SCHWELLE_PUNKTE || '100',
  LOYALTY_BELOHNUNG_PROZENT: process.env.LOYALTY_BELOHNUNG_PROZENT || '15',

  // Gift-Card-Kompensations-Agent (echte Gutscheine bei echten Service-Fehlern)
  AUTO_GUTSCHEIN_SENDEN: process.env.AUTO_GUTSCHEIN_SENDEN || 'nein',
  GIFTCARD_KOMPENSATION_WERT: process.env.GIFTCARD_KOMPENSATION_WERT || '10',
  GIFTCARD_VERZUG_STUNDEN: process.env.GIFTCARD_VERZUG_STUNDEN || '96',

  // DSGVO-Anfragen-Wächter
  DSGVO_FRIST_TAGE: process.env.DSGVO_FRIST_TAGE || '30',

  // Produkt-Launch-Hype-Agent
  LAUNCH_HYPE_MAX_EMPFAENGER: process.env.LAUNCH_HYPE_MAX_EMPFAENGER || '200',

  // Margen-Erosions-Wächter
  MARGE_WARNUNG_SCHWELLE_PROZENT: process.env.MARGE_WARNUNG_SCHWELLE_PROZENT || '10',

  // Broken-Link-Guardian
  BROKEN_LINK_MAX_PRODUKTE: process.env.BROKEN_LINK_MAX_PRODUKTE || '30',

  // Duplikat-Listing-Detektor
  DUPLIKAT_AEHNLICHKEIT_SCHWELLE: process.env.DUPLIKAT_AEHNLICHKEIT_SCHWELLE || '0.85',

  // Refund-Concierge-Agent (echte, kleine Erstattungen - Default AUS)
  AUTO_ERSTATTUNG_GENEHMIGEN: process.env.AUTO_ERSTATTUNG_GENEHMIGEN || 'nein',
  REFUND_MAX_BETRAG: process.env.REFUND_MAX_BETRAG || '30',

  // Übersetzungs-Entwurf-Agent
  TRANSLATION_ZIELSPRACHEN: process.env.TRANSLATION_ZIELSPRACHEN || '',
  TRANSLATION_MAX_PRODUKTE: process.env.TRANSLATION_MAX_PRODUKTE || '5',

  // Nie-Gekauft-Konverter
  NIEGEKAUFT_TAGE_ALS_ABONNENT: process.env.NIEGEKAUFT_TAGE_ALS_ABONNENT || '14',
  NIEGEKAUFT_RABATT_CODE: process.env.NIEGEKAUFT_RABATT_CODE || 'WILLKOMMEN15',
  NIEGEKAUFT_MAX_PRO_LAUF: process.env.NIEGEKAUFT_MAX_PRO_LAUF || '50',

  // Agentic-Checkout-Readiness-Agent (Katalog-Check für KI-Einkaufsagenten)
  AGENTIC_READINESS_MIN_BESCHREIBUNG_ZEICHEN: process.env.AGENTIC_READINESS_MIN_BESCHREIBUNG_ZEICHEN || '100',
  AGENTIC_READINESS_SCHWELLE: process.env.AGENTIC_READINESS_SCHWELLE || '70',
  AGENTIC_READINESS_MAX_PRODUKTE_IM_REPORT: process.env.AGENTIC_READINESS_MAX_PRODUKTE_IM_REPORT || '15',

  // PayPal-Beleg-Agent (Zahlungs-/Liefernachweise für PayPal-Kontoprüfungen)
  PAYPAL_BELEG_LOOKBACK_TAGE: process.env.PAYPAL_BELEG_LOOKBACK_TAGE || '14',
  PAYPAL_BELEG_MAX_PRO_LAUF: process.env.PAYPAL_BELEG_MAX_PRO_LAUF || '30',
};

export function isTestMode() {
  return config.TEST_MODE === 'ja';
}
