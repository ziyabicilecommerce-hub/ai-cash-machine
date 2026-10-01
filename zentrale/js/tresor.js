// Verschlüsselung für Live-Daten im öffentlichen Repo: PBKDF2 (SHA-256) + AES-GCM 256.
// Läuft gleich im Browser und in Node (globalThis.crypto.subtle).
(function (root) {
  const RUNDEN = 250000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function schluessel(passwort, salt) {
    const basis = await root.crypto.subtle.importKey('raw', enc.encode(passwort), 'PBKDF2', false, ['deriveKey']);
    return root.crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: RUNDEN, hash: 'SHA-256' }, basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function verschluesseln(objekt, passwort) {
    const salt = root.crypto.getRandomValues(new Uint8Array(16)), iv = root.crypto.getRandomValues(new Uint8Array(12));
    const k = await schluessel(passwort, salt);
    const daten = await root.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(objekt)));
    return { v: 1, salt: b64(salt), iv: b64(iv), daten: b64Gross(daten) };
  }

  // Große Puffer stückweise kodieren, sonst sprengt der Spread-Operator den Stack.
  function b64Gross(buf) {
    const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
    return btoa(s);
  }

  async function entschluesseln(paket, passwort) {
    if (!paket || paket.v !== 1) throw new Error('Unbekanntes Format');
    const k = await schluessel(passwort, unb64(paket.salt));
    try {
      const klar = await root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(paket.iv) }, k, unb64(paket.daten));
      return JSON.parse(dec.decode(klar));
    } catch (e) { throw new Error('Falsches Passwort'); }
  }

  root.ZTresor = { verschluesseln, entschluesseln, b64 };
})(typeof window !== 'undefined' ? window : globalThis);
