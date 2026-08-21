# Trading-Bot (Cloudflare Worker)

Krypto-Spot-Trading-Bot mit denselben Sicherheitsgrenzen wie
`automations/49-trading-bot.mjs`, aber als eigenständiger Cloudflare Worker
statt als GitHub-Actions-Automation — **und mit Unterstützung für mehrere
Kryptowährungen gleichzeitig.**

## Datei-Aufbau

`worker.js` ist der Orchestrator (Konfiguration einlesen, pro Symbol
handeln, HTTP-/Cron-Einstiegspunkte) und importiert aus `lib/`:

- **`strategie.mjs`** — reine Entscheidungslogik (Kauf/Verkauf-Signale),
  läuft identisch im Live-Worker UND im Backtest (`backtest.mjs`).
- **`exchanges.mjs`** — Binance-/Kraken-Adapter (Kerzen, Orders, Spread).
- **`marktdaten.mjs`** — externe Gratis-Datenquellen (CoinGecko,
  CoinPaprika, OKX, Gate.io, Bitstamp, Fear & Greed, BTC-Dominanz,
  Mehrfach-Zeitrahmen, News-Sentiment via CryptoPanic).
- **`notify.mjs`** — WhatsApp- und Telegram-Versand (beide unabhängig optional).
- **`state.mjs`** — KV-Persistenz pro Symbol (Kapital, Position, Trades).
- **`config.mjs`** — liest alle `TRADING_*`-Umgebungsvariablen ein.
- **`reports.mjs`** — Tages-/Wochen-/Monats-Rückblick + Kapital-Rebalancing.
- **`statistik.mjs`** — Trade-Kennzahlen + Echtgeld-Readiness-Ampel.
- **`status.mjs`** — baut die Antwort für `/status` und `/export`.
- **`learning.mjs`** — adaptives Lernen aus der eigenen Trade-Historie
  (kein KI-Modell, reine Statistik) — siehe unten.

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

**Welche Strategie passt besser?** Wurde live getestet: alle 8 Coins liefen
eine Zeit lang mit unterschiedlichen Strategien parallel (siehe Abschnitt
darunter). Backtest über 90 Tage auf allen 8 Coins zeigt ein klares Bild -
`bollinger-mean-reversion` schlägt `donchian-breakout`/`ema-crossover` auf
7 von 8 Coins deutlich (Win-Rate 66-85% statt 15-33%, meist positiver statt
negativer Return). Deshalb aktuell fahren **alle 8 Coins mit
bollinger-mean-reversion** (`TRADING_STRATEGIE_PRO_SYMBOL` ist leer,
`TRADING_BOLLINGER_STDDEV` auf `1.5` statt `2` gestellt - engeres Band,
löst öfter aus, per Backtest bei gleicher/besserer Win-Rate). Das ist kein
Naturgesetz - Marktphasen ändern sich, vor jeder erneuten Umstellung wieder
mit dem Backtest gegentesten (siehe unten), oder interaktiv mit echten
Charts im **CASHMACHINE STRATEGY LAB** (`strategy-lab/` im Hauptrepo, live
unter `https://ziyabicilecommerce-hub.github.io/ai-cash-machine/strategy-lab/`).

### Pro Symbol eine andere Strategie (optional)

Statt für alle Symbole zwangsläufig dieselbe Strategie zu nutzen, kann
`TRADING_STRATEGIE_PRO_SYMBOL` einzelnen Symbolen eine abweichende Strategie
zuweisen — z.B. um live zu beobachten, welche Strategie auf welchem Coin am
meisten Kapital gewinnt, statt das nur im Backtest zu simulieren. Format:

```
TRADING_STRATEGIE_PRO_SYMBOL = "XBTUSDT:bollinger-mean-reversion,ETHUSDT:donchian-breakout"
```

Symbole ohne Eintrag laufen mit dem globalen `TRADING_STRATEGIE`-Default
weiter. Leer (aktueller Stand) = alle Symbole nutzen den globalen Default.
Alle Risiko-Grenzen (Stop-Loss, Take-Profit, Kill-Switch, Filter) gelten
unabhängig von der gewählten Strategie identisch pro Symbol. Im
Trading-Dashboard zeigt jede Coin-Karte an, welche Strategie sie gerade
fährt.

## Backtesting — Strategie VOR echtem Geld gegen echte Kursdaten testen

`backtest.mjs` lädt echte historische 15-Minuten-Kerzen (per Default von
Binance, mit `TRADING_EXCHANGE=kraken` alternativ von Kraken - gleicher
Name/gleiches Verhalten wie beim Live-Worker) und simuliert damit die exakt
gleiche Strategie-Logik (`lib/strategie.mjs`), die auch der Live-Worker
verwendet — kein separates Nachbauen der Regeln, also kein Risiko, dass
Backtest und Live-Bot unterschiedliche Dinge tun.

```bash
node backtest.mjs BTCUSDT 90
# oder mit eigener Konfiguration, gleiche Variablennamen wie in wrangler.toml:
TRADING_RSI_UEBERKAUFT=70 TRADING_TRAILING_STOP_AB_PROZENT=2 node backtest.mjs BTCUSDT 180
# alle drei Strategien direkt gegeneinander vergleichen:
node backtest.mjs BTCUSDT 90 --vergleiche
# mit Kraken-Daten statt Binance (Kraken-Symbolname beachten, z.B. XBTUSDT statt BTCUSDT):
TRADING_EXCHANGE=kraken node backtest.mjs XBTUSDT 90 --vergleiche
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

## Automatischer wöchentlicher Backtest-Check (`lib/autobacktest.mjs`)

Läuft von selbst mit, ohne dass man `backtest.mjs` manuell anstoßen muss:
einmal pro Woche (montags, wie das adaptive Lernen) prüft der Worker jedes
Symbol gegen die letzten 14 Tage echter Kerzen mit der aktuell
konfigurierten Strategie und schreibt das Ergebnis (Return, Trades,
Win-Rate, Max-Drawdown, Buy&Hold-Vergleich) rein informativ nach KV —
verändert nie Kapital oder Position. `/status` liefert es pro Symbol als
`autoBacktest`-Feld, Trading Command zeigt es im Signale-Tab an.

Bewusst nur 14 Tage statt der vollen 90 wie bei `backtest.mjs` auf der
Kommandozeile — hält die Zahl der Binance/Kraken-Anfragen pro Lauf klein
genug für Cloudflare Workers' Subrequest-Limit (8 Symbole × mehrere
paginierte Anfragen). Für eine tiefere Analyse über längere Zeiträume
bleibt `backtest.mjs` (lokal, ohne dieses Limit) die richtige Wahl — dieser
Check ist ein laufendes "funktioniert die aktuell konfigurierte Strategie
noch?", kein Ersatz dafür. Default an (`TRADING_AUTO_BACKTEST`), da rein
informativ und ohne Risiko.

## Trade-Historie & Win-Rate im Dashboard

Jeder abgeschlossene Trade (Ausstieg) wird jetzt im State gespeichert
(die letzten 50 pro Symbol). Der `/status`-Endpoint liefert daraus pro Symbol
`tradeStats` (Win-Rate, Anzahl Trades, Ø Gewinn/Verlust) — das
`trading-dashboard/` zeigt das direkt in der Symbol-Karte an, sobald der
erste Trade abgeschlossen ist. Kein zusätzliches Setup nötig.

Zusätzlich liefert `/status` ein Portfolio-weites `portfolioKennzahlen`-
Objekt (`lib/statistik.mjs`, reine Statistik über die gesamte Trade-
Historie): Profit Factor, Expectancy pro Trade, Ø Gewinn/Verlust,
Recovery Factor sowie "Sharpe/Sortino pro Trade" — bewusst NICHT die
annualisierten Lehrbuch-Kennzahlen (dafür bräuchte es täglich getaktete
Renditen, Trades sind unregelmäßig getaktet), sondern Ø Rendite / Streuung
über alle abgeschlossenen Trades, klar so benannt. Trading Command zeigt
das im Übersicht-Tab.

## Tägliche WhatsApp-Zusammenfassung

Zusätzlich zu den Alarmen bei einzelnen Ereignissen (Einstieg, Ausstieg,
Kill-Switch, Fehler) verschickt der Worker jetzt **einmal pro Kalendertag**
automatisch eine Zusammenfassung über alle Symbole zusammen: Gesamtkapital,
Gesamt-P&L in %, wie viele Positionen gerade offen sind, und ob irgendwo der
Kill-Switch aktiv ist. Damit reicht diese eine WhatsApp-Nachricht am Tag, um
zu wissen ob alles normal läuft — das Dashboard muss man nur noch öffnen,
wenn man mehr Details sehen will. Braucht kein zusätzliches Setup, läuft im
selben 5-Minuten-Cron mit (verschickt aber wirklich nur einmal pro Tag).

## Wöchentlicher WhatsApp-Rückblick

Zusätzlich zum täglichen Update verschickt der Worker **einmal pro Woche
(montags)** einen ausführlicheren Rückblick: P&L nur der letzten 7 Tage,
bester/schlechtester Coin, Win-Rate-Trend über die Woche. Läuft mehr als
eine Strategie parallel (siehe `TRADING_STRATEGIE_PRO_SYMBOL` weiter unten),
zeigt der Rückblick zusätzlich pro Strategie-Gruppe, wie viel sie diese
Woche gewonnen/verloren hat — direkter Live-Vergleich, welche Strategie
gerade am besten abschneidet. Braucht kein zusätzliches Setup, läuft im
selben 5-Minuten-Cron mit.

## Zusätzliche Kauf-Filter (alle optional, alle ohne API-Key)

Mehrere unabhängige, kostenlose Datenquellen können zusätzlich zur
eigentlichen Strategie ein Kaufsignal verwerfen — jede für sich
standardmäßig konfigurierbar, fällt bei einem Ausfall der jeweiligen API
immer "offen" (blockiert den Bot nie dauerhaft, nur den einzelnen Filter
für diesen Lauf):

- **`TRADING_COINGECKO_FILTER`** (`ja`/`nein`): verwirft den Kauf, wenn der
  **Durchschnitt aus bis zu 5 unabhängigen Börsen/Quellen** (CoinGecko,
  CoinPaprika, OKX, Gate.io, Bitstamp) den Coin in den letzten 24h im Minus
  zeigt — bewusst gemittelt statt als 5 einzelne Hürden verdrahtet (würde
  Käufe sonst fast unmöglich machen). Fällt eine oder mehrere Quellen aus,
  wird mit den verbliebenen gemittelt; fallen ALLE aus, blockiert der
  Filter nicht. CoinCap wurde ebenfalls geprüft, war aus dieser Umgebung
  aber wiederholt nicht erreichbar (bekanntes Zuverlässigkeitsproblem);
  Bybit lieferte hier eine Geo-Sperre — beide deshalb nicht mit drin.
- **`TRADING_FNG_FILTER`** (`ja`/`nein`) + `TRADING_FNG_MAX_WERT` (Default
  `80`): verwirft den Kauf bei "Extreme Greed" im
  [Fear & Greed Index](https://alternative.me/crypto/fear-and-greed-index/) —
  Kontra-Signal gegen Euphorie-Käufe. Markweiter Wert (nicht pro Coin), nur
  einmal pro Lauf abgefragt. Blockiert bewusst NICHT bei Angst, weil das
  bei `bollinger-mean-reversion` genau die Marktlage ist, in der die
  Strategie kaufen soll.
- **`TRADING_MTF_FILTER`** (`ja`/`nein`) + `TRADING_MTF_INTERVAL_MINUTEN`
  (Default `240` = 4h): verwirft den Kauf, wenn der übergeordnete Trend
  (EMA9 vs. EMA21 auf dem längeren Zeitrahmen) abwärts zeigt — vermeidet
  Käufe gegen einen größeren Trend, nur weil das kurzfristige 15m-Signal
  gerade anspringt.
- **`TRADING_BTC_DOMINANZ_FILTER`** (`ja`/`nein`) +
  `TRADING_BTC_DOMINANZ_MAX_PROZENT` (Default `60`): verwirft Käufe für
  **Altcoins** (nicht für BTC selbst), wenn Bitcoins Anteil an der
  gesamten Krypto-Marktkapitalisierung über der Schwelle liegt — Kapital
  fließt dann laut Markt bevorzugt in Bitcoin statt Altcoins ("risk-off"
  für Alts). Markweiter Wert, nur einmal pro Lauf abgefragt (CoinPaprika
  `/global`).
- **`TRADING_FLASH_CRASH_FILTER`** (`ja`/`nein`) +
  `TRADING_FLASH_CRASH_FENSTER_KERZEN` (Default `4` = 1h bei 15m-Kerzen) +
  `TRADING_FLASH_CRASH_MAX_DROP_PROZENT` (Default `8`): pausiert Käufe für
  ein Symbol, wenn der Kurs innerhalb des Fensters bereits um mehr als die
  Schwelle gefallen ist — eher ein Flash-Crash/Börsenfehler als eine
  normale Kaufgelegenheit, besonders wichtig bei `bollinger-mean-reversion`
  (das "überverkauft" sonst genau in so einem Moment als Kaufsignal
  missverstehen könnte). Braucht KEINEN externen API-Call, nutzt dieselben
  Kerzen wie die Strategie selbst.
- **`TRADING_SPREAD_FILTER`** (`ja`/`nein`) + `TRADING_SPREAD_MAX_PROZENT`
  (Default `1`): verwirft einen Kauf, wenn der Bid/Ask-Spread an der Börse
  gerade ungewöhnlich breit ist — oft ein Begleitsymptom eines
  Flash-Crashs oder Börsenproblems (dünne/gestörte Liquidität). Fragt
  direkt die ohnehin verbundene Börse ab (Kraken oder Binance), kein
  zusätzlicher Key nötig.
- **`TRADING_MARKTWEITER_CRASH_FILTER`** (`ja`/`nein`, Default `ja`) +
  `TRADING_MARKTWEITER_CRASH_FENSTER_KERZEN` (Default `4`) +
  `TRADING_MARKTWEITER_CRASH_MAX_DROP_PROZENT` (Default `10`): marktweite
  Erweiterung des Flash-Crash-Filters — crasht **BTC selbst** innerhalb des
  Fensters um mehr als die Schwelle, werden Käufe für **alle** konfigurierten
  Coins in diesem Lauf pausiert, nicht nur für BTC. Altcoins fallen in einem
  BTC-getriebenen Panik-Moment erfahrungsgemäß mit, oft sogar stärker als
  BTC selbst. Braucht einen zusätzlichen Klines-Abruf pro Lauf (einmal, nicht
  pro Symbol), keinen externen API-Key. Nutzt dieselbe, bereits verifizierte
  Berechnung wie der Pro-Symbol-Filter, nur auf BTCs eigenen Kerzen. Löst
  EINE WhatsApp-Warnung pro Lauf aus (nicht pro Coin), und wird im Control
  Center als 🛑 Marktweiter Crash-Schutz angezeigt.

## Wirtschaftskalender-Filter (kein API-Key nötig)

- **`TRADING_NEWS_EVENT_FILTER`** (Default `ja`) +
  `TRADING_NEWS_EVENT_FENSTER_MINUTEN` (Default `30`): pausiert Käufe für
  **alle** Coins gemeinsam rund um marktbewegende US-Wirtschaftstermine
  ("High Impact" USD-Events wie FOMC-Zinsentscheide, CPI, NFP) - jeweils
  `TRADING_NEWS_EVENT_FENSTER_MINUTEN` davor UND danach. Datenquelle:
  [nfs.faireconomy.media](https://nfs.faireconomy.media/ff_calendar_thisweek.json),
  ein öffentlicher, kostenloser JSON-Export des ForexFactory-
  Wirtschaftskalenders ohne API-Key - weltweit von unzähligen Trading-Bots
  genutzt. Nur **einmal pro Cron-Lauf** abgerufen (nicht pro Symbol), weil
  die Quelle selbst ein Rate-Limit hat (max. 2 Abrufe/5 Minuten insgesamt
  für diese URL). Löst EINE WhatsApp/Telegram-Warnung pro Lauf aus (nicht
  pro Coin), im Control Center als ⏸️ "Wirtschaftskalender-Pause"
  angezeigt. Gleiches Modul (fast unverändert) auch im Aktien-Bot
  (`stocks-bot-worker`) - ein gemeinsames Makro-Risiko-Signal für beide.

## News-Sentiment-Filter (optional, braucht kostenlosen API-Key)

- **`TRADING_NEWS_SENTIMENT_FILTER`** (`ja`/`nein`, Default `nein`) +
  `TRADING_NEWS_SENTIMENT_MIN_PROZENT` (Default `35`): verwirft einen Kauf,
  wenn echte Nutzer auf [CryptoPanic](https://cryptopanic.com/) die
  aktuellen News zu diesem Coin überwiegend als "bearish" bewertet haben.
  Anders als alle Filter oben kommt das Signal nicht aus Kursdaten, sondern
  aus echtem Community-Sentiment (bullish/bearish-Votes zu jedem Artikel) —
  eine unabhängige zweite Dimension neben Kurs-Technik. Summiert die
  Positiv-/Negativ-Stimmen der letzten Artikel zu diesem Coin; liegt der
  Positiv-Anteil unter der Schwelle, wird der Kauf übersprungen. Ohne Votes
  zu diesem Coin (noch nichts bewertet) bleibt der Filter wirkungslos statt
  zu blockieren.
  Braucht einen **kostenlosen** `CRYPTOPANIC_API_KEY` als Secret (Free-Tier
  auf [cryptopanic.com/developers/api](https://cryptopanic.com/developers/api/),
  kein Zahlungsmittel nötig) — ohne Key bleibt der Filter automatisch aus,
  auch wenn `TRADING_NEWS_SENTIMENT_FILTER = "ja"` gesetzt ist.
  **Standardmäßig AUS**, weil er sich (wie unten erklärt) nicht per Backtest
  validieren lässt — wer ihn nutzt, sollte ihn erst eine Weile im
  Paper-Modus beobachten, bevor er sich fürs Echtgeld darauf verlässt.

**Performance-basierte Positionsgröße:** `TRADING_PERFORMANCE_SIZING`
(`ja`/`nein`) + `TRADING_PERFORMANCE_SIZING_MIN_FAKTOR` (Default `0.5`) +
`TRADING_PERFORMANCE_SIZING_MIN_TRADES` (Default `5`) — braucht KEINEN
externen API-Call, nutzt nur die eigene Trade-Historie des Symbols. Liegt
die Win-Rate der letzten (bis zu 20) Trades unter 50%, wird die
Positionsgröße für dieses Symbol proportional reduziert (bis zum
konfigurierten Minimum-Faktor) — kann die konfigurierte
`TRADING_MAX_POSITION_PROZENT` NIE überschreiten, nur innerhalb dieser
Grenze nach unten anpassen. Braucht mindestens `TRADING_PERFORMANCE_SIZING_MIN_TRADES`
abgeschlossene Trades, sonst bleibt der Faktor bei 1.0 (zu wenig Daten für
ein verlässliches Signal).

**Take-Profit:** `TRADING_TAKE_PROFIT_PROZENT` (Default `5`, `0` = aus)
verkauft sofort, sobald eine Position um diesen Wert im Plus ist, statt auf
das strategie-eigene Ausstiegssignal zu warten. Per Backtest geprüft: bei
`bollinger-mean-reversion` sind einzelne Trades meist kleiner als 5%
Gewinn — der Default-Wert greift bei dieser Strategie daher praktisch nie,
ist aber ein sicheres Sicherheitsnetz für größere Ausreißer. Deutlich
niedrigere Werte (getestet: 0.1%) zeigten in kurzen Backtests uneinheitliche
Wirkung (auf einem Coin leicht positiv, auf einem anderen neutral) — zu
wenig Daten für eine verlässliche pauschale Empfehlung, vor jeder Änderung
selbst mit `backtest.mjs` gegen mehrere Coins/Zeiträume gegentesten.

**Wichtig zum Backtesting dieser Filter:** `backtest.mjs` kann aktuell nur
Signale testen, die sich aus den historischen Kraken-Kursdaten selbst
ableiten lassen (Strategie, Stop-Loss, Take-Profit, Performance-Sizing,
Flash-Crash-Filter — die letzten beiden brauchen keine externe API und
laufen im Backtest identisch mit). Die 24h-Preisbestätigung, der Fear &
Greed-Filter, der BTC-Dominanz-Filter, der Spread-Filter, der
Wirtschaftskalender-Filter und der News-Sentiment-Filter lassen sich nicht
rückwirkend exakt nachstellen
(keine passenden historischen Daten im gleichen Format frei verfügbar) —
sie sind gegen echte Live-Daten geprüft (lösen korrekt aus, fallen bei
Ausfall sauber offen), aber NICHT historisch backgetestet. Das im Kopf
behalten, bevor man sich zu sehr auf sie verlässt.

## Bessere Ausstiegs-Logik & Risiko-Feintuning

Drei weitere optionale Regeln, alle per Backtest gegen echte Kraken-Daten
geprüft, bevor sie live gingen:

- **`TRADING_COOLDOWN_NACH_VERLUST_MINUTEN`** (Default `60`): pausiert
  Käufe für ein Symbol eine Weile nach einem Verlust-Trade -
  "Revenge Trading" vermeiden. Per Backtest bei der aktuellen hohen
  Win-Rate selten relevant (wenig aufeinanderfolgende Verluste), aber ohne
  gemessenen Nachteil - deshalb aktiviert.
- **`TRADING_PARTIAL_TAKE_PROFIT_PROZENT`** (Default `0` = aus) +
  `TRADING_PARTIAL_TAKE_PROFIT_ANTEIL` (Default `50`): verkauft schon bei
  einem niedrigeren Ziel einen Anteil der Position, statt auf das volle
  Ausstiegssignal zu warten - der Rest läuft mit unverändertem
  Einstiegspreis weiter (Stop-Loss/Trailing-Stop gelten normal weiter).
  **Echter Trade-off, kein reiner Vorteil:** per Backtest auf 3 von 4
  getesteten Coins etwas weniger Gesamt-Return (Trades enden öfter knapp
  am Ziel statt bei größeren Ausreißern) - dafür häufiger/früher
  realisierte Gewinne. Deshalb standardmäßig AUS, bewusst selbst
  einschalten, wer diesen Trade-off will.
- **`TRADING_DYNAMISCHER_STOP_LOSS`** (Default `nein`) +
  `TRADING_STOP_LOSS_ATR_MULTIPLIKATOR` (Default `2`): nutzt die
  Volatilität BEIM EINSTIEG (ATR) statt eines festen Prozentsatzes für den
  Stop-Loss-Abstand. Per Backtest uneinheitlich - auf BTC klar schlechter
  (mehr Fehlausstiege durch normales Rauschen), auf ETH klar besser. Kein
  Coin-übergreifend klarer Vorteil, deshalb standardmäßig AUS.

## Adaptives Lernen (optional, kein API-Call)

- **`TRADING_ADAPTIVES_LERNEN`** (Default `nein`) +
  `TRADING_ADAPTIVES_LERNEN_MIN_TRADES` (Default `10`): einmal pro Woche
  (montags, `lib/learning.mjs`) schaut sich der Bot pro Symbol die
  **eigenen abgeschlossenen Verlust-Trades** an und berechnet daraus einen
  neuen Stop-Loss-Prozentsatz — den Durchschnitt der tatsächlich erlittenen
  Verluste dieses Coins, statt für immer beim einen global konfigurierten
  `TRADING_STOP_LOSS_PROZENT` zu bleiben. **Kein KI-/LLM-Modell** — reine
  Statistik über die eigene Historie, aber ein echter Lernmechanismus: der
  Bot passt sein eigenes Risiko-Verhalten an das an, was bei diesem Coin
  bisher wirklich passiert ist.
  Sicherheits-Leitplanken: erst ab `TRADING_ADAPTIVES_LERNEN_MIN_TRADES`
  abgeschlossenen Verlust-Trades für dieses Symbol (sonst zu wenig Daten,
  bleibt der globale Wert aktiv); niemals unter 1% oder außerhalb des
  0,5×–2×-Bands um den konfigurierten Standard (verhindert Wegdriften durch
  einzelne Ausreißer); wirkt sich nur auf **neu eröffnete** Positionen aus
  (beim Einstieg eingefroren, wie `entryAtr` beim dynamischen Stop-Loss) —
  eine bereits offene Position wird nie nachträglich verändert; jede
  Anpassung wird per WhatsApp gemeldet und im Control Center als
  🧠 "Gelernter Stop-Loss" angezeigt.
  **Standardmäßig AUS**, weil `backtest.mjs` aktuell einen Lauf mit fixen
  Parametern simuliert und ein wöchentliches Nachjustieren mitten in der
  Simulation nicht abbildet — anders als die klassischen Filter oben also
  NICHT per Backtest validierbar. Wer es nutzt, sollte es erst eine Weile
  live im Paper-Modus beobachten (Meldungen kommen automatisch per
  WhatsApp), bevor er sich fürs Echtgeld darauf verlässt.

## Monats-Rückblick & CSV-Export

Zusätzlich zum täglichen und wöchentlichen Update verschickt der Worker
**einmal pro Monat (am 1.)** einen noch weiter herausgezoomten Rückblick:
Gesamt-P&L des Monats, bester/schlechtester Coin über den Monat.

`GET /export?key=<STATUS_READ_KEY>` liefert die komplette gespeicherte
Trade-Historie (bis zu den letzten 50 Trades pro Symbol, wie im
Dashboard) als CSV-Datei zum Download - für Excel/Google Sheets oder
eigene Auswertung außerhalb des Dashboards. Gleiches Secret wie
`/status`, rein lesend, kann nie einen Trade auslösen. Im Trading-
Dashboard ein Klick über den Button "⤓ CSV exportieren".

## Smart-Kapital-Rebalancing (optional, Default AUS)

Ohne Rebalancing startet jeder Coin mit gleich viel Kapital und wächst
danach nur über seine EIGENEN Trades weiter (Compounding) - ein Coin, der
konstant schlecht läuft, bekommt nie weniger Spielraum als einer, der
konstant gut läuft.

`TRADING_REBALANCING` (`ja`/`nein`) schiebt stattdessen einmal pro Woche
(montags, gleicher Zeitpunkt wie der Wochenrückblick)
`TRADING_REBALANCING_ANTEIL_PROZENT` (Default `10`) des aktuellen Kapitals
vom Coin mit der **schlechtesten** Performance zum Coin mit der **besten**
- "Kapital folgt dem, was gerade funktioniert". Sicherheits-Leitplanken:

- Nur Coins mit mindestens `TRADING_REBALANCING_MIN_TRADES` (Default `5`)
  abgeschlossenen Trades zählen mit — zu wenig Daten sonst zu verrauscht.
- Ein Coin mit gerade **offener Position** wird nie angefasst.
- Verschiebt nur einen PROZENTUALEN Anteil, kein Alles-oder-Nichts — wirkt
  sich erst über mehrere Wochen spürbar aus, kein abrupter Umschwung.
- Erhöht das Gesamtkapital NIE, verschiebt nur zwischen den Coins.
  Stop-Loss, Take-Profit und Kill-Switch bleiben pro Coin unverändert - nur
  wie viel Kapital für die NÄCHSTE Positionsgröße zur Verfügung steht,
  ändert sich.

Meldet jede Verschiebung per WhatsApp (Betrag, von welchem Coin zu
welchem, mit beider Performance in %).

## Echtgeld-Readiness-Ampel

`/status` liefert zusätzlich ein `readiness`-Objekt: eine grobe Ampel
(🔴 Rot / 🟡 Gelb / 🟢 Grün), ob der Bot nach seinen bisherigen
Paper-Trade-Zahlen "reif genug" für einen Echtgeld-Test WIRKT. **Keine
Finanzberatung, keine Erfolgsgarantie** — nur ein Hinweis, berechnet aus
Daten, die der Bot ohnehin schon hat (Anzahl abgeschlossener Trades,
Gesamt-Win-Rate, Gesamt-P&L, ob ein Kill-Switch aktiv ist), kein
zusätzlicher API-Call nötig:

- 🔴 **Rot**: ein Kill-Switch ist aktiv, ODER weniger als 10 abgeschlossene
  Trades, ODER insgesamt im Minus.
- 🟡 **Gelb**: mindestens 10 Trades, insgesamt im Plus, aber noch unter 30
  Trades oder unter 50% Win-Rate — positiv, aber noch zu früh für eine
  klare Aussage.
- 🟢 **Grün**: mindestens 30 Trades, mindestens 50% Win-Rate, insgesamt im
  Plus.

Wird oben im Trading-Dashboard als Banner angezeigt und steht zusätzlich
einmal pro Woche im WhatsApp-Rückblick. Die Schwellenwerte (10/30 Trades,
50% Win-Rate) sind bewusst konservativ gewählt, aber willkürlich — eine
"perfekte" Zahl gibt es nicht, das ist eine grobe Orientierung, keine
Garantie.

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

## Live-Setup-Checkliste (rein informativ, bewegt nie Geld)

Die App `trading-live-setup/` (im Hauptrepo, live unter
`https://ziyabicilecommerce-hub.github.io/ai-cash-machine/trading-live-setup/`,
verlinkt vom Trading-Dashboard) zeigt Schritt für Schritt, was für den
Umstieg von Paper- auf Live-Trading nötig ist: Kraken-Konto anlegen,
einzahlen, API-Key mit **nur Spot-Trading-Rechten** (nie Auszahlung)
erstellen, als Cloudflare-Secret setzen, `TRADING_PAPER_MODE` umstellen.
Zeigt oben den aktuellen Bot-Modus (liest denselben `/status`-Endpoint wie
das Dashboard). **Wichtig:** Ein-/Auszahlungen und die API-Key-Erstellung
laufen ausschließlich auf Krakens eigener Seite — diese App verarbeitet
selbst nirgends Geld oder Zahlungsdaten, sie verlinkt nur dorthin und
erklärt die Reihenfolge.

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
   # Optional, zweiter/alternativer Benachrichtigungskanal:
   # wrangler secret put TELEGRAM_BOT_TOKEN
   # wrangler secret put TELEGRAM_CHAT_ID
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

   **Telegram einrichten** (kostenlos, optional): mit
   [@BotFather](https://t.me/BotFather) in Telegram chatten, `/newbot`
   senden, den zurückgegebenen Token als `TELEGRAM_BOT_TOKEN` setzen. Die
   eigene Chat-ID über [@userinfobot](https://t.me/userinfobot) herausfinden
   (kurz anschreiben, gibt die eigene ID zurück) und als `TELEGRAM_CHAT_ID`
   setzen. Beide Kanäle laufen unabhängig — nur WhatsApp, nur Telegram, oder
   beide gleichzeitig sind möglich; fehlt ein Kanal komplett, wird nur
   geloggt statt gesendet, kein Fehler.
5. Deployen:
   ```bash
   wrangler deploy
   ```
   Der Cron-Trigger (alle 5 Minuten, siehe `wrangler.toml`) läuft danach
   automatisch — kein manueller Aufruf nötig. Zum Testen:
   ```
   https://cashmachine-trading-bot.<dein-account>.workers.dev/?key=<TRIGGER_SECRET>
   ```

## Kill-Switch zurücksetzen (ohne Trade-Historie zu verlieren)

`GET /reset-kill-switch?key=<TRIGGER_SECRET>&symbol=<SYMBOL>` setzt NUR
`killSwitchAktiv`/`killSwitchBenachrichtigt` zurück — Kapital, Trade-
Historie und alles vom adaptiven Lernen Gemerkte bleiben unangetastet. Der
Bot handelt das Symbol ab dem nächsten Cron-Lauf wieder. Gleiches
`TRIGGER_SECRET` wie der manuelle Test-Lauf, kein neues Secret nötig.
```
https://cashmachine-trading-bot.<dein-account>.workers.dev/reset-kill-switch?key=<TRIGGER_SECRET>&symbol=BTCUSDT
```
Bewusst **kein** automatischer Reset nach X Tagen und **kein** Knopf im
Dashboard (das bleibt strikt rein lesend) — der Gesamtverlust-Kill-Switch
ist die letzte Sicherheitslinie, ein Reset soll immer eine bewusste
menschliche Entscheidung sein, nachdem man sich die Ursache angeschaut hat.

## State komplett zurücksetzen (Holzhammer, löscht ALLES für das Symbol)

Der State liegt in Cloudflare KV (`TRADING_STATE`, Key `state:<SYMBOL>`).
Nur nötig, wenn wirklich bei null neu gestartet werden soll — löscht auch
Trade-Historie und Kapitalstand, nicht nur den Kill-Switch (dafür siehe
oben):
```bash
wrangler kv key delete --binding=TRADING_STATE "state:BTCUSDT"
```
