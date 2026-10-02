// Kleine Leiste "Zur Zentrale" fuer die Einzel-Apps - nur sichtbar, wenn die App NICHT schon in der Zentrale laeuft.
(function () {
  if (window.top !== window.self) return;
  const a = document.createElement('a');
  a.href = new URL('../zentrale/#werkzeuge', location.href).href;
  a.textContent = '← Zentrale';
  a.setAttribute('style', 'position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:8px 12px;border-radius:999px;background:#1f6f4a;color:#fff;font:600 14px/1 system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,.35)');
  const los = () => document.body && document.body.appendChild(a);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', los); else los();
})();
