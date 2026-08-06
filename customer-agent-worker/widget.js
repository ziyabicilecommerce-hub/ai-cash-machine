// Einbettbares Chat-Widget für die Shopify-Storefront.
// Einbindung (z.B. im Shopify-Theme vor </body>):
//   <script src="https://DEINE-WORKER-URL/widget.js" data-worker-url="https://DEINE-WORKER-URL"></script>
// (widget.js muss nicht zwingend vom Worker selbst ausgeliefert werden -
// jedes statische Hosting reicht, solange data-worker-url auf den Worker zeigt.)
(function () {
  const scriptTag = document.currentScript;
  const workerUrl = (scriptTag && scriptTag.getAttribute('data-worker-url')) || '';
  if (!workerUrl) {
    console.error('[cashmachine-chat] data-worker-url fehlt am <script>-Tag.');
    return;
  }

  const SESSION_KEY = 'cmx_chat_session_id';
  function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  const style = document.createElement('style');
  style.textContent = `
    #cmx-chat-bubble { position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px; border-radius: 50%;
      background: #1a1a2e; color: #fff; border: none; cursor: pointer; z-index: 999998; box-shadow: 0 4px 16px rgba(0,0,0,.25);
      font-size: 24px; display: flex; align-items: center; justify-content: center; }
    #cmx-chat-panel { position: fixed; bottom: 88px; right: 20px; width: 340px; max-width: calc(100vw - 40px); height: 460px;
      max-height: calc(100vh - 120px); background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.25);
      display: none; flex-direction: column; overflow: hidden; z-index: 999999; font-family: system-ui, sans-serif; }
    #cmx-chat-panel.open { display: flex; }
    #cmx-chat-header { background: #1a1a2e; color: #fff; padding: 12px 16px; font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
    #cmx-chat-close { background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; line-height: 1; }
    #cmx-chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .cmx-msg { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; }
    .cmx-msg.user { align-self: flex-end; background: #1a1a2e; color: #fff; }
    .cmx-msg.assistant { align-self: flex-start; background: #f0f0f3; color: #1a1a2e; }
    .cmx-msg.pending { opacity: .6; }
    #cmx-chat-form { display: flex; border-top: 1px solid #eee; padding: 8px; gap: 8px; }
    #cmx-chat-input { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; font-size: 13px; resize: none; font-family: inherit; }
    #cmx-chat-send { background: #1a1a2e; color: #fff; border: none; border-radius: 8px; padding: 0 14px; cursor: pointer; font-size: 13px; }
    #cmx-chat-send:disabled { opacity: .5; cursor: default; }
  `;
  document.head.appendChild(style);

  const bubble = document.createElement('button');
  bubble.id = 'cmx-chat-bubble';
  bubble.setAttribute('aria-label', 'Chat öffnen');
  bubble.textContent = '💬';
  document.body.appendChild(bubble);

  const panel = document.createElement('div');
  panel.id = 'cmx-chat-panel';
  panel.innerHTML = `
    <div id="cmx-chat-header"><span>Chat</span><button id="cmx-chat-close" aria-label="Chat schließen">✕</button></div>
    <div id="cmx-chat-messages"></div>
    <form id="cmx-chat-form">
      <textarea id="cmx-chat-input" rows="1" placeholder="Deine Frage..." maxlength="1500"></textarea>
      <button id="cmx-chat-send" type="submit">Senden</button>
    </form>
  `;
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#cmx-chat-messages');
  const formEl = panel.querySelector('#cmx-chat-form');
  const inputEl = panel.querySelector('#cmx-chat-input');
  const sendBtn = panel.querySelector('#cmx-chat-send');

  let verlauf = [];

  function addMessage(role, text, pending) {
    const div = document.createElement('div');
    div.className = `cmx-msg ${role}${pending ? ' pending' : ''}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  bubble.addEventListener('click', () => {
    panel.classList.add('open');
    if (!verlauf.length) {
      addMessage('assistant', 'Hi! Wie kann ich dir helfen?');
    }
    inputEl.focus();
  });
  panel.querySelector('#cmx-chat-close').addEventListener('click', () => panel.classList.remove('open'));

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendBtn.disabled = true;

    addMessage('user', text);
    verlauf.push({ role: 'user', content: text });
    const pendingEl = addMessage('assistant', 'Tippt...', true);

    try {
      const res = await fetch(`${workerUrl}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), messages: verlauf }),
      });
      const data = await res.json();
      const reply = data.reply || 'Entschuldige, da ist gerade etwas schiefgelaufen.';
      pendingEl.textContent = reply;
      pendingEl.classList.remove('pending');
      verlauf.push({ role: 'assistant', content: reply });
    } catch (err) {
      pendingEl.textContent = 'Verbindung fehlgeschlagen. Bitte versuch es später nochmal.';
      pendingEl.classList.remove('pending');
    } finally {
      sendBtn.disabled = false;
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });
})();
