# Trading-Bot (Cloudflare Worker)

Krypto-Spot-Trading-Bot mit denselben Sicherheitsgrenzen wie
`automations/49-trading-bot.mjs`, aber als eigenständiger Cloudflare Worker
statt als GitHub-Actions-Automation — **und mit Unterstützung für mehrere
Kryptowährungen gleichzeitig.**

## Warum ein eigener Worker statt GitHub Actions?

Der GitHub-Actions-Bot (`automations/49-trading-bot.mjs`) lief technisch
korrekt, aber **jede Anfrage an Binance schlug mit `HTTP 451` fehl** —
Binance blockiert die IP-Bereiche der GitHub-Actions-Runner aus
regulatorischen Gründen. Cloudflare Workers laufen am globalen Edge-Netzwerk
und sind davon in aller Regel nicht betroffen. Der GitHub-Actions-Bot bleibt
im Repo (funktioniert als Vorlage/Referenz), aber für echten Betrieb bitte
diesen Worker nutzen.

## Was ist neu ggü. der GitHub-Actions-Version?

**Mehrere Symbole gleichzeitig** (`TRADING_SYMBOLS`, kommagetrennt, z.B.
`BTCUSDT,ETHUSDT,SOLUSDT`). Wichtig: **dein Gesamtrisiko bleibt exakt so
hoch wie konfiguriert** — `TRADING_KAPITAL_USDT` wird durch die Anzahl
Symbole geteilt, jedes Symbol bekommt sein eigenes, unabhängiges Kapital,
eigenen State und eigenen Kill-Switch. Bei 100 USDT Gesamtkapital und 2
Symbolen handelt jedes einzelne also mit 50 USDT — nicht mit 100 USDT pro
Coin. So verdoppelt/vervielfacht sich dein Risiko nicht heimlich, nur weil
mehr Coins beobachtet werden.

Alle bisherigen Sicherheitsmechanismen bleiben unverändert, pro Symbol:
- Paper-Modus per Default (`TRADING_PAPER_MODE=ja`), kein echtes Geld ohne
  bewusstes Umstellen.
- Spot-only, kein Hebel — maximaler Verlust ist immer nur das für dieses
  Symbol eingesetzte Kapital.
- Stop-Loss pro Trade, Tagesverlust-Handelssperre, dauerhafter
  Gesamtverlust-Kill-Switch, Mindest-Ordergröße-Check vor jedem Kauf.
- Bei einer fehlgeschlagenen Order (z.B. Börsen-Fehler) kommt sofort ein
  WhatsApp-Alarm, statt dass der Fehler unbemerkt bleibt.

## Bessere Strategie + mehr Risiko-Kontrollen (alle standardmäßig AUS)

Der reine EMA(9/21)-Crossover neigt in seitwärts laufenden Märkten zu vielen
kleinen Fehlsignalen ("Whipsaws"). Diese Filter sind optional zuschaltbar,
per Default deaktiviert (0 bzw. "nein"), damit ein bereits laufendes Setup
durch dieses Update nicht ungefragt anders handelt:

- **`TRADING_RSI_UEBERKAUFT`** (Default `0` = aus): Kauft nicht, wenn der
  RSI(`TRADING_RSI_PERIODE`, Default 14) beim Crossover über diesem Wert
  liegt — verhindert den Einstieg in einen bereits überhitzten Rally kurz vor
  einer Korrektur. Sinnvoller Wert z.B. `70`.
- **`TRADING_MIN_VOLATILITAET_PROZENT`** (Default `0` = aus): Kauft nicht,
  wenn die aktuelle Volatilität (ATR(14) als % vom Preis) unter diesem Wert
  liegt — verhindert Trades in toten, seitwärts laufenden Märkten, wo ein
  EMA-Crossover kaum Aussagekraft hat. Sinnvoller Wert z.B. `0.5`.
- **`TRADING_TRAILING_STOP_AB_PROZENT`** (Default `0` = aus): Sobald eine
  Position seit Einstieg um mindestens diesen Wert im Plus war, zieht der
  Stop-Loss mit dem höchsten seither gesehenen Preis mit statt starr am
  Einstiegspreis zu kleben — sichert einen Teil des Gewinns, statt ihn bei
  einer Umkehr komplett wieder herzugeben. Sinnvoller Wert z.B. `2`.
- **`TRADING_VOLA_SIZING`** (Default `nein`): Setzt bei hoher Volatilität
  automatisch WENIGER Kapital pro Trade ein als das konfigurierte Maximum
  (`TRADING_VOLA_SIZING_REFERENZ_PROZENT` = "normale" Volatilität,
  `TRADING_VOLA_SIZING_MIN_FAKTOR` = wie tief die Positionsgröße bei sehr
  hoher Volatilität maximal sinken darf, Default `0.25` = nie unter 25% der
  normalen Größe). Kann das Risiko nur SENKEN, niemals über
  `TRADING_MAX_POSITION_PROZENT` hinaus erhöhen.
- **`TRADING_MAX_GLEICHZEITIGE_POSITIONEN`** (Default = Anzahl Symbole, also
  keine zusätzliche Grenze): begrenzt, wie viele Symbole gleichzeitig eine
  offene Position haben dürfen — reduziert das Klumpenrisiko eines
  marktweiten Krypto-Crashs, bei dem sonst alle Coins gleichzeitig fallen.

## Zweite Börse: Kraken

Neben Binance (`TRADING_EXCHANGE = "binance"`, Default) unterstützt der
Worker jetzt auch **Kraken** (`TRADING_EXCHANGE = "kraken"`). Beide teilen
sich dieselbe Handelslogik/Risiko-Kontrollen — nur die Order-Ausführung
läuft über einen eigenen Adapter, da Kraken andere Symbol-Namen (z.B.
`XBTUSDT` statt `BTCUSDT`) und ein anderes Signatur-Verfahren
(HMAC-SHA512 statt HMAC-SHA256) nutzt.

**Wichtig:** Der Kraken-Adapter konnte in dieser Entwicklungsumgebung nicht
gegen ein echtes Kraken-Konto getestet werden (kein Zugang hier) — nur die
Signatur-/Parsing-Logik gegen Krakens öffentlich dokumentiertes API-Format.
Vor echtem Geldeinsatz zwingend zuerst mit `TRADING_PAPER_MODE = "ja"`
laufen lassen und die ersten paar WhatsApp-Meldungen genau prüfen. Bei
jeder Order verifiziert der Adapter den tatsächlichen Ausführungsstatus
über `QueryOrders`, statt eine Ausführung einfach anzunehmen — schlägt das
fehl, wird laut ein Fehler geworfen statt stillschweigend eine Position zu
buchen, die es gar nicht gibt.

## Drei Strategien zur Wahl

`TRADING_STRATEGIE` schaltet zwischen den drei klassischen Familien
systematischer Handelsstrategien um:

- **`ema-crossover`** (Default, unverändertes Verhalten) — **Trendfolge**:
  kauft bei Trendwechsel nach oben, verkauft bei Trendwechsel nach unten.
  Funktioniert am besten in klar trendenden Märkten.
- **`bollinger-mean-reversion`** — **Mean-Reversion**: kauft, wenn der Kurs
  unter das untere Bollinger-Band (`TRADING_BOLLINGER_PERIODE`, Default 20
  Kerzen; `TRADING_BOLLINGER_STDDEV`, Default 2 Standardabweichungen) fällt
  — Wette auf Rückkehr zum Mittelwert statt auf einen Trend. Verkauft,
  sobald der Kurs den Mittelwert wieder erreicht. Eher geeignet für
  seitwärts laufende, oszillierende Märkte, in denen EMA-Crossover viele
  Fehlsignale produziert.
- **`donchian-breakout`** — **Breakout** (klassischer "Turtle Trader"-
  Ansatz): kauft, wenn der Kurs über das höchste Hoch der letzten
  `TRADING_DONCHIAN_ENTRY_PERIODE`-Kerzen ausbricht (Default 20) — Wette auf
  einen NEUEN, gerade erst startenden Trend. Verkauft über einen kürzeren
  Ausstiegs-Kanal (`TRADING_DONCHIAN_EXIT_PERIODE`, Default 10 Kerzen),
  damit ein laufender Trend nicht beim ersten kleinen Rücksetzer verkauft
  wird, ein echter Trendbruch aber zügig erkannt wird.

Stop-Loss, Trailing-Stop, Tagesverlust-Sperre und Kill-Switch gelten bei
allen drei Strategien identisch — die Risiko-Grenzen sind strategieunabhängig.

**Welche Strategie passt besser?** Kommt auf das Symbol und die Marktphase
an — es gibt keine pauschal "beste" Strategie für immer, deshalb auch drei
statt einer. Vor jeder Umstellung alle drei mit dem Backtest direkt
vergleichen (siehe unten), oder interaktiv mit echten Charts im
**CASHMACHINE STRATEGY LAB** (`strategy-lab/` im Hauptrepo, live unter
`https://ziyabicilecommerce-hub.github.io/ai-cash-machine/strategy-lab/`).

## Backtesting — Strategie VOR echtem Geld gegen echte Kursdaten testen

`backtest.mjs` lädt echte historische 15-Minuten-Kerzen von Binance und
simuliert damit die exakt gleiche Strategie-Logik (`lib/strategie.mjs`), die
auch der Live-Worker verwendet — kein separates Nachbauen der Regeln, also
kein Risiko, dass Backtest und Live-Bot unterschiedliche Dinge tun.

```bash
node backtest.mjs BTCUSDT 90
# oder mit eigener Konfiguration, gleiche Variablennamen wie in wrangler.toml:
TRADING_RSI_UEBERKAUFT=70 TRADING_TRAILING_STOP_AB_PROZENT=2 node backtest.mjs BTCUSDT 180
# alle drei Strategien direkt gegeneinander vergleichen:
node backtest.mjs BTCUSDT 90 --vergleiche
```

Ausgabe: Gesamt-Return, Vergleich mit simplem Buy&Hold, maximaler Drawdown,
Anzahl Trades, Win-Rate, durchschnittlicher Gewinn/Verlust pro Trade.

**Wichtig, unmissverständlich:** Eine gute Backtest-Performance ist **keine
Garantie** für die Zukunft — Märkte verändern sich, vergangene Muster
wiederholen sich nicht zwangsläufig. Der Backtest ist ein Werkzeug, um eine
Konfiguration mit echten Daten zu prüfen, BEVOR man sie mit echtem Geld
laufen lässt — kein Versprechen auf Gewinn. Vor jedem Umstieg von
`TRADING_PAPER_MODE="ja"` auf `"nein"` zusätzlich mindestens ein paar Wochen
im Paper-Modus live beobachten.

## Trade-Historie & Win-Rate im Dashboard

Jeder abgeschlossene Trade (Ausstieg) wird jetzt im State gespeichert
(die letzten 50 pro Symbol). Der `/status`-Endpoint liefert daraus pro Symbol
`tradeStats` (Win-Rate, Anzahl Trades, Ø Gewinn/Verlust) — das
`trading-dashboard/` zeigt das direkt in der Symbol-Karte an, sobald der
erste Trade abgeschlossen ist. Kein zusätzliches Setup nötig.

## Tägliche WhatsApp-Zusammenfassung

Zusätzlich zu den Alarmen bei einzelnen Ereignissen (Einstieg, Ausstieg,
Kill-Switch, Fehler) verschickt der Worker jetzt **einmal pro Kalendertag**
automatisch eine Zusammenfassung über alle Symbole zusammen: Gesamtkapital,
Gesamt-P&L in %, wie viele Positionen gerade offen sind, und ob irgendwo der
Kill-Switch aktiv ist. Damit reicht diese eine WhatsApp-Nachricht am Tag, um
zu wissen ob alles normal läuft — das Dashboard muss man nur noch öffnen,
wenn man mehr Details sehen will. Braucht kein zusätzliches Setup, läuft im
selben 15-Minuten-Cron mit (verschickt aber wirklich nur einmal pro Tag).

## Live-Dashboard (rein lesend)

Der Worker hat jetzt einen `GET /status`-Endpoint (eigenes Secret
`STATUS_READ_KEY`, unabhängig von `TRIGGER_SECRET`), der pro Symbol
Position, Kapital, P&L und Kill-Switch-Status als JSON liefert — **kann
niemals einen Trade auslösen**, reine Leseoperation.

Die zugehörige App `trading-dashboard/` (im Hauptrepo, live unter
`https://ziyabicilecommerce-hub.github.io/ai-cash-machine/trading-dashboard/`)
zeigt diese Daten live an: Worker-URL + `STATUS_READ_KEY` einmal übers ⚙
Symbol eintragen (bleibt nur im eigenen Browser, localStorage), danach
Auto-Refresh alle 30 Sekunden.

## Einmaliges Setup

1. **Cloudflare-Account** (kostenlos) + [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/).
2. In diesem Ordner:
   ```bash
   wrangler kv namespace create TRADING_STATE
   ```
   Die zurückgegebene `id` in `wrangler.toml` bei `REPLACE_WITH_KV_NAMESPACE_ID`
   eintragen.
3. Konfiguration in `wrangler.toml` unter `[vars]` anpassen (Symbole,
   Kapital, Risikogrenzen) — das sind keine Geheimnisse, dürfen direkt in
   der Datei stehen.
4. Secrets setzen (nicht in `wrangler.toml` schreiben):
   ```bash
   wrangler secret put BINANCE_API_KEY
   wrangler secret put BINANCE_API_SECRET
   # Nur falls TRADING_EXCHANGE = "kraken":
   # wrangler secret put KRAKEN_API_KEY
   # wrangler secret put KRAKEN_API_SECRET
   wrangler secret put WHATSAPP_ACCESS_TOKEN
   wrangler secret put WHATSAPP_PHONE_NUMBER_ID
   wrangler secret put WHATSAPP_TO_NUMBER
   wrangler secret put TRIGGER_SECRET
   wrangler secret put STATUS_READ_KEY
   ```
   **Beim Binance-/Kraken-API-Key: nur Spot-Trading-Rechte aktivieren,
   NIEMALS Auszahlungsrechte.** `TRIGGER_SECRET` ist ein frei erfundener
   String, der den manuellen Test-Aufruf (`?key=...`) vor Fremdzugriff
   schützt. `STATUS_READ_KEY` ist ein ANDERER frei erfundener String für den
   rein lesenden `/status`-Endpoint (fürs Dashboard) — bewusst getrennt von
   `TRIGGER_SECRET`, damit dieser Key auch dann keinen Trade auslösen kann,
   wenn er versehentlich weitergegeben wird.
5. Deployen:
   ```bash
   wrangler deploy
   ```
   Der Cron-Trigger (alle 15 Minuten, siehe `wrangler.toml`) läuft danach
   automatisch — kein manueller Aufruf nötig. Zum Testen:
   ```
   https://cashmachine-trading-bot.<dein-account>.workers.dev/?key=<TRIGGER_SECRET>
   ```

## State zurücksetzen

Der State liegt in Cloudflare KV (`TRADING_STATE`, Key `state:<SYMBOL>`),
nicht mehr in einer Git-Datei. Zum manuellen Zurücksetzen (z.B. nach einem
ausgelösten Kill-Switch):
```bash
wrangler kv key delete --binding=TRADING_STATE "state:BTCUSDT"
```
