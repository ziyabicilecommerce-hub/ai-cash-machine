// Preis-Alarme: prüft bei JEDEM Cron-Lauf (nutzt den Preis, der ohnehin
// schon für die Handelsentscheidung geladen wird - kein zusätzlicher
// API-Call) ob eine konfigurierte Kursschwelle GERADE GEKREUZT wurde, und
// schickt dann eine WhatsApp/Telegram-Nachricht. Trigger nur bei einer
// echten Zustandsänderung (vorher auf der anderen Seite der Schwelle, jetzt
// drüber/drunter) statt bei jedem Lauf, in dem die Bedingung zufällig
// zutrifft - kein Spam, falls der Kurs länger um die Schwelle pendelt. Beim
// allerersten Check zu einem Alarm wird nur der Ausgangszustand gespeichert,
// nicht sofort "gekreuzt" gemeldet (sonst würde jeder neu hinzugefügte
// Alarm sofort feuern, nur weil er zufällig schon auf der Zielseite steht).
// Ändert NIE eine Order, reine Benachrichtigung.

import { notify } from './notify.mjs';

export async function pruefeUndSendePreisalarme(env, symbol, preisAktuell, alarmeFuerSymbol) {
  for (const alarm of alarmeFuerSymbol) {
    const zustandKey = `preisalarm:${symbol}:${alarm.richtung}:${alarm.preis}`;
    const aktuellerZustand = preisAktuell < alarm.preis ? 'unter' : 'ueber';
    let vorherigerZustand;
    try {
      vorherigerZustand = await env.TRADING_STATE.get(zustandKey);
    } catch (err) {
      console.error(`[trading-bot] Preis-Alarm ${symbol} KV-Lesefehler:`, err);
      continue;
    }

    if (vorherigerZustand !== null && vorherigerZustand !== aktuellerZustand && aktuellerZustand === alarm.richtung) {
      try {
        await notify(env, `🔔 Preis-Alarm ${symbol}: Kurs jetzt ${alarm.richtung === 'unter' ? 'UNTER' : 'ÜBER'} ${alarm.preis} (aktuell ${preisAktuell.toFixed(4)}).`);
      } catch (err) {
        console.error(`[trading-bot] Preis-Alarm ${symbol} Benachrichtigung fehlgeschlagen:`, err);
      }
    }

    if (vorherigerZustand !== aktuellerZustand) {
      await env.TRADING_STATE.put(zustandKey, aktuellerZustand);
    }
  }
}
