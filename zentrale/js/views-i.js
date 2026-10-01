// Ansicht: 15 Kanäle - Live-Status des Direkt-Posters (video-feed/kanaele.json) und Schritt-fuer-Schritt-
// Anleitung zum kostenlosen Verbinden jeder Plattform ueber GitHub-Secrets. Kein Fremddienst, keine App.
(function (root) {
  const { ZUI } = root;
  const { h, kopieren } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  const REPO = 'ziyabicilecommerce-hub/ai-cash-machine';
  const SECRETS = `https://github.com/${REPO}/settings/secrets/actions`;
  const VARS = `https://github.com/${REPO}/settings/variables/actions`;
  let status = null, geladen = false;

  // s = Secret, v = Variable. Reihenfolge: von leicht nach schwer.
  const KANAELE = [
    { name: 'Telegram', zeit: '5 Min', link: 'https://t.me/BotFather', schritte: ['In Telegram @BotFather öffnen, /newbot senden, Namen wählen, Token kopieren.', 'Einen Kanal anlegen und den Bot als Administrator hinzufügen.'], werte: [['s', 'TELEGRAM_BOT_TOKEN', 'Token vom BotFather'], ['v', 'TELEGRAM_KANAL_ID', '@deinkanal'], ['s', 'TELEGRAM_CHAT_ID', 'deine Chat-ID für die Tagesberichte']] },
    { name: 'Bluesky', zeit: '3 Min', link: 'https://bsky.app/settings/app-passwords', schritte: ['Bluesky > Einstellungen > Datenschutz und Sicherheit > App-Passwörter > neues App-Passwort.'], werte: [['s', 'BLUESKY_HANDLE', 'name.bsky.social'], ['s', 'BLUESKY_APP_PASSWORD', 'das App-Passwort']] },
    { name: 'Discord', zeit: '2 Min', link: 'https://support.discord.com/hc/de/articles/228383668', schritte: ['Eigenen Server > Kanal-Einstellungen > Integrationen > Webhooks > Neuer Webhook > URL kopieren.'], werte: [['s', 'DISCORD_WEBHOOK_URL', 'die Webhook-URL']] },
    { name: 'Mastodon', zeit: '5 Min', link: 'https://mastodon.social/settings/applications', schritte: ['Einstellungen > Entwicklung > Neue Anwendung, Rechte write:media, write:statuses, read:statuses.', 'Zugangs-Token kopieren.'], werte: [['v', 'MASTODON_URL', 'https://mastodon.social'], ['s', 'MASTODON_TOKEN', 'Zugangs-Token']] },
    { name: 'X', zeit: '10 Min', link: 'https://developer.x.com/en/portal/dashboard', schritte: ['Kostenlosen Entwickler-Zugang (Free) anlegen, App erstellen.', 'User authentication: Read and Write. Dann Keys and tokens > Access Token and Secret erzeugen.'], werte: [['s', 'X_API_KEY', 'API Key'], ['s', 'X_API_SECRET', 'API Key Secret'], ['s', 'X_ACCESS_TOKEN', 'Access Token'], ['s', 'X_ACCESS_SECRET', 'Access Token Secret']] },
    { name: 'Tumblr', zeit: '10 Min', link: 'https://www.tumblr.com/oauth/apps', schritte: ['App registrieren (Callback z. B. die Zentrale-URL), Consumer Key und Secret kopieren.', 'Auf api.tumblr.com/console mit Key und Secret anmelden: dort stehen Token und Token-Secret.'], werte: [['s', 'TUMBLR_CONSUMER_KEY', ''], ['s', 'TUMBLR_CONSUMER_SECRET', ''], ['s', 'TUMBLR_TOKEN', ''], ['s', 'TUMBLR_TOKEN_SECRET', ''], ['v', 'TUMBLR_BLOG', 'deinblog.tumblr.com']] },
    { name: 'Reddit', zeit: '5 Min', link: 'https://www.reddit.com/prefs/apps', schritte: ['App erstellen > Typ "script" > Client-ID (unter dem Namen) und Secret kopieren.', 'Postet höchstens 1x pro Lauf (Spam-Schutz), standardmäßig ins eigene Profil.'], werte: [['s', 'REDDIT_CLIENT_ID', ''], ['s', 'REDDIT_CLIENT_SECRET', ''], ['s', 'REDDIT_USERNAME', ''], ['s', 'REDDIT_PASSWORD', ''], ['v', 'REDDIT_SUBREDDIT', 'optional']] },
    { name: 'YouTube', zeit: '20 Min', link: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', schritte: ['Google-Cloud-Projekt anlegen, "YouTube Data API v3" aktivieren, OAuth-Client (Desktop-App) erstellen.', 'Im OAuth Playground (eigene Client-ID eintragen) Scopes youtube.upload und youtube.force-ssl (für Kommentar-Antworten) freigeben und das Refresh-Token kopieren.', 'Hinweis: Ohne Google-Prüfung bleiben per API hochgeladene Videos privat - die Prüfung ist kostenlos, dauert aber.'], werte: [['s', 'YOUTUBE_CLIENT_ID', ''], ['s', 'YOUTUBE_CLIENT_SECRET', ''], ['s', 'YOUTUBE_REFRESH_TOKEN', ''], ['v', 'YOUTUBE_SICHTBARKEIT', 'public']] },
    { name: 'Dailymotion', zeit: '10 Min', link: 'https://www.dailymotion.com/partner/', schritte: ['Partner-Konto > Einstellungen > API-Schlüssel erstellen.'], werte: [['s', 'DAILYMOTION_API_KEY', ''], ['s', 'DAILYMOTION_API_SECRET', ''], ['s', 'DAILYMOTION_USERNAME', ''], ['s', 'DAILYMOTION_PASSWORD', '']] },
    { name: 'Pinterest', zeit: '15 Min', link: 'https://developers.pinterest.com/apps/', schritte: ['App anlegen, Zugriffstoken mit pins:write und boards:read erzeugen, Board-ID kopieren.', 'Mit Trial-Zugang sind Pins nur für dich sichtbar, öffentlich nach Standard-Zugang (kostenlos beantragen).'], werte: [['s', 'PINTEREST_ACCESS_TOKEN', ''], ['v', 'PINTEREST_BOARD_ID', '']] },
    { name: 'LinkedIn', zeit: '15 Min', link: 'https://www.linkedin.com/developers/apps', schritte: ['App anlegen, Produkt "Share on LinkedIn" hinzufügen, Token mit w_member_social erzeugen.'], werte: [['s', 'LINKEDIN_ACCESS_TOKEN', ''], ['v', 'LINKEDIN_PERSON_ID', 'deine Personen-ID']] },
    { name: 'Threads', zeit: '15 Min', link: 'https://developers.facebook.com/apps/', schritte: ['Meta-App mit Threads-API anlegen, dich als Tester eintragen, langlebiges Token erzeugen.'], werte: [['s', 'THREADS_ACCESS_TOKEN', ''], ['s', 'THREADS_USER_ID', '']] },
    { name: 'Facebook', zeit: '20 Min', link: 'https://developers.facebook.com/tools/explorer/', schritte: ['Im Graph API Explorer Seiten-Token mit pages_manage_posts und pages_manage_engagement (Kommentar-Antworten) erzeugen und in ein langlebiges Token tauschen.'], werte: [['s', 'FACEBOOK_PAGE_ID', ''], ['s', 'FACEBOOK_PAGE_TOKEN', '']] },
    { name: 'Instagram', zeit: '20 Min', link: 'https://developers.facebook.com/tools/explorer/', schritte: ['Instagram-Profil auf Business/Creator stellen und mit der Facebook-Seite verknüpfen.', 'Token mit instagram_content_publish und instagram_manage_comments (Kommentar-Antworten) erzeugen, Business-Account-ID kopieren.'], werte: [['s', 'META_ACCESS_TOKEN', ''], ['s', 'INSTAGRAM_BUSINESS_ACCOUNT_ID', '']] },
    { name: 'TikTok', zeit: '20 Min', link: '../tiktok-verbinden/', schritte: ['Auf developers.tiktok.com eine App mit "Content Posting API" anlegen.', 'Über die Seite "TikTok verbinden" anmelden und das Refresh-Token kopieren.', 'Ohne TikTok-Prüfung landen Videos als Entwurf in deinem TikTok-Postfach - ein Tipp zum Veröffentlichen.'], werte: [['s', 'TIKTOK_CLIENT_KEY', ''], ['s', 'TIKTOK_CLIENT_SECRET', ''], ['s', 'TIKTOK_REFRESH_TOKEN', '']] },
  ];

  // Kostenlose KI-Schluessel: ohne sie haengt alles an den gedrosselten Gratis-Diensten ohne Schluessel.
  const KI = [
    { name: 'Google Gemini', link: 'https://aistudio.google.com/apikey', wert: 'GEMINI_API_KEY', text: 'Mit Google-Konto anmelden > "API-Schlüssel erstellen". Gratis-Kontingent reicht für den Tagesbedarf.' },
    { name: 'Groq', link: 'https://console.groq.com/keys', wert: 'GROQ_API_KEY', text: 'Konto anlegen > API Keys > Create. Kostenlos, sehr schnell.' },
    { name: 'Pollinations', link: 'https://enter.pollinations.ai', wert: 'POLLINATIONS_TOKEN', text: 'Kostenlos registrieren und Token kopieren - ohne Token wird Pollinations gedrosselt.' },
  ];

  async function laden(app) {
    geladen = true;
    try { const r = await fetch('../video-feed/kanaele.json', { cache: 'no-store' }); status = r.ok ? await r.json() : null; } catch (e) { status = null; }
    if (app.aktiv === 'kanaele15') app.zeichnen();
  }

  function karte(k) {
    const s = status && status.kanaele && status.kanaele[k.name];
    const chip = !s ? '<span class="chip">unbekannt</span>' : s.letzterFehler ? '<span class="chip hoch">Fehler</span>' : s.verbunden ? '<span class="chip ok">verbunden</span>' : '<span class="chip mittel">nicht verbunden</span>';
    return `<details class="box"${s && s.letzterFehler ? ' open' : ''}><summary><strong>${h(k.name)}</strong> ${chip} <span class="klein-text">· ${h(k.zeit)} · kostenlos${s ? ` · heute ${s.heute}/${s.limit}` : ''}</span></summary>
      ${s && s.letzterFehler ? `<p class="minus">Letzter Fehler (${h(ZUI.datum(String(s.letzterFehler.zeit).slice(0, 10)))}): ${h(s.letzterFehler.text)}</p>` : ''}
      ${s && s.letzterErfolg ? `<p class="plus">Zuletzt gepostet: ${h(ZUI.datum(String(s.letzterErfolg).slice(0, 10)))}</p>` : ''}
      <ol>${k.schritte.map((x) => `<li>${h(x)}</li>`).join('')}<li>In GitHub eintragen (${k.werte.some((w) => w[0] === 's') ? `<a href="${SECRETS}" target="_blank" rel="noopener">Secrets</a>` : ''}${k.werte.some((w) => w[0] === 'v') ? ` / <a href="${VARS}" target="_blank" rel="noopener">Variables</a>` : ''}):</li></ol>
      <ul class="aufgaben">${k.werte.map(([art, name, tipp]) => `<li class="aufgabe" data-prio="info"><span class="t"><code>${h(name)}</code><span class="klein-text"> · ${art === 's' ? 'Secret' : 'Variable'}${tipp ? ` · ${h(tipp)}` : ''}</span></span><button class="knopf klein" data-kopie="${h(name)}">Name kopieren</button></li>`).join('')}</ul>
      <div class="reihe"><a class="knopf klein" href="${h(k.link)}" target="_blank" rel="noopener">${h(k.name)} öffnen</a></div></details>`;
  }

  V.kanaele15 = {
    titel: '15 Kanäle',
    unter: 'Der Direkt-Poster postet jede Stunde (8 bis 22 Uhr) direkt über die offiziellen, kostenlosen Schnittstellen - ohne Fremddienst. Jede Plattform verbindest du einmal selbst; danach läuft sie von allein, bis zu 5 Videos pro Tag und Kanal.',
    zeichnen(el, app) {
      if (!geladen) laden(app);
      const verbunden = status ? Object.values(status.kanaele || {}).filter((s) => s.verbunden).length : 0;
      el.innerHTML = `<div class="kpis" style="margin-bottom:14px"><div class="kpi"><div class="l">Verbunden</div><div class="w">${verbunden} / 15</div></div><div class="kpi"><div class="l">Posts heute</div><div class="w">${status ? Object.values(status.kanaele || {}).reduce((s, k) => s + (k.heute || 0), 0) : 0}</div></div><div class="kpi"><div class="l">Stand</div><div class="w" style="font-size:1rem">${status ? h(ZUI.datum(String(status.stand).slice(0, 10))) : '–'}</div></div></div>
        ${!status ? `<p class="klein-text">${geladen ? 'Der Status erscheint nach dem nächsten Poster-Lauf (stündlich).' : 'Lädt …'}</p>` : ''}
        <section class="box betont" style="margin-bottom:14px"><h2>Zuerst: KI-Schlüssel (kostenlos, 5 Minuten)</h2>
          <p class="klein-text">Labor, Video-Skripte, Text-Vorschläge und Kommentar-Antworten brauchen eine KI. Die Gratis-Dienste ohne Schlüssel sind oft gedrosselt - mit diesen kostenlosen Schlüsseln läuft es stabil. Einer reicht, alle drei sind am sichersten (fällt einer aus, springt der nächste ein).</p>
          <ul class="aufgaben">${KI.map((k) => `<li class="aufgabe" data-prio="info"><span class="t"><strong>${h(k.name)}</strong> · <code>${h(k.wert)}</code> (Secret)<span class="klein-text"> · ${h(k.text)}</span></span><a class="knopf klein" href="${h(k.link)}" target="_blank" rel="noopener">Öffnen</a><button class="knopf klein" data-kopie="${h(k.wert)}">Name kopieren</button></li>`).join('')}</ul>
          <p class="klein-text">Eintragen unter <a href="${SECRETS}" target="_blank" rel="noopener">GitHub > Secrets</a>.</p></section>
        <p class="klein-text">Tipp: Mit Telegram, Bluesky und Discord anfangen - zusammen 10 Minuten, dann laufen die ersten Posts sofort.</p>
        ${KANAELE.map(karte).join('')}`;
      el.querySelectorAll('[data-kopie]').forEach((b) => b.addEventListener('click', () => kopieren(b.dataset.kopie)));
    },
  };
  V.kanaele15.KANAELE = KANAELE;
  V.kanaele15.KI = KI;
})(window);
