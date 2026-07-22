# Cybrix Shopify Shop — Komplette Build-Dokumentation

> Damit der Shop jederzeit 1:1 wieder aufgebaut werden kann. Enthält Produkte, Preise,
> Theme-Code, Collections, Prozess und die entscheidenden Stolperfallen.

---

## 1. Store & IDs

| Was | Wert |
|---|---|
| Store | **Cybrix** — `techhub-store-3811.myshopify.com` |
| Währung | EUR |
| Online-Store Publication | `gid://shopify/Publication/337963745663` |
| Lieferant / Import | **EBoxMan** (Dropshipping, „Add to store") |
| Support-E-Mail (überall einheitlich) | `cybrix@gmail.com` |
| Inhaber / Impressum | Ziya Bicil, 65719 Hofheim am Taunus, Deutschland |
| Rabattcode | `CYBRIX10` = 10 % (Newsletter-Willkommen) |

### Themes
Es gibt mehrere fast gleichnamige „✅ FINAL – HIER VEROEFFENTLICHEN"-Kopien.
- **Live/MAIN:** `gid://shopify/OnlineStoreTheme/196482892159` („Kopie von Kopie von Kopie von ✅ FINAL")
- **Entwurf mit abgesicherter Version:** `gid://shopify/OnlineStoreTheme/196478009727` („Kopie von Kopie von ✅ FINAL")
- Der Produkt-Seiten-Aufbau steckt in `sections/product-page.liquid`, die Varianten-Logik in
  `sections/cx-variant-logic.liquid`, der Warenkorb in `sections/cart-page.liquid`.
- `templates/product.json` bindet die Sections in dieser Reihenfolge ein:
  `product_page`, `related`, `cx_variants` (= cx-variant-logic), `apps`.

---

## 2. Die 15 Produkte (Titel · Option · Varianten · Retail-Preise in €)

Alle Produkte: **Inventar nicht verfolgt** (`inventoryItem: { tracked: false }`), Vendor **Cybrix**.
Preise stammen aus den archivierten Vorlage-Produkten (Handles `15709…`).

| Produkt (DE-Titel) | Option | Varianten & Preise |
|---|---|---|
| **USB-C Dual-Port SSD Stick – kompatibel mit iPhone, Android & PC** | color × capacity (10) | Silber/Gelb × {128GB 335,46 · 256GB 465,04 · 512GB 872,82 · 1T 1601,46 · **2T 2700,00**} |
| **Mechanische Gaming Tastatur 87 Tasten Hot-Swap** | color (8) | Color 1 = **134,73** · Color 2–8 = je **123,95** |
| **Tarantula F108 Pro Mechanische Tastatur – Bluetooth Tri-Mode** | color (9) | Milk Brown 439,10 · Red 439,10 · Black 426,22 · Glacier Blue 426,22 · Dust Gray 426,22 · Dark Night 322,49 · Dawn Side Carved Gray 348,42 · Fog Blue 322,49 · F108 Glacier Blue 348,42 |
| **TX35 Business Tastatur – Mechanisches Gefühl mit RGB** | color (8) | Tx35 White 20,07 · Tx35 Black Rainbow 20,07 · Tx30 White 23,28 · Tx30 Black Rainbow 23,28 · Tx30 Black Character Luminous 26,17 · G103 Black Characters 26,17 · G103 Pink 28,74 · G103 Pink And Mouse 41,55 |
| **PC Lüfter 12V Leise – RGB Desktop Gehäuselüfter** | color (4) | Black Without Lights 13,59 · Colored Lights Black 13,75 · Lightless White 13,04 · Colored Lights White 14,37 |
| **Roboterarm Display-Ständer – Verstellbar für Phone, Headset & Gadgets** | Style (4) | PM100 115,28 · PM50 101,07 · PM100S 89,35 · PM50S 58,27 |
| **Hamster Maus Kabellos – Kompakt & Leise Bluetooth** | color (3) | Yellow/Pink/Gray Mute = je 86,77 |
| **Gaming Maus USB RGB – E-Sports Atemleuchten-Effekt** | color (2) | X1 Black Bare Metal 5,94 · X1 Black Box Package 6,56 |
| **Controller Schutzhülle Full Coverage – Transparent & Grip** | model (2) | Switch2pro Transparent 18,28 · Switch2pro Transparent Black 18,28 |
| **RGB Neon Netzkabel 8-Pin auf 24-Pin – Grafikkarte Motherboard** | color (2) | Black 182,61 · White 182,61 |
| **E-Ink Lesegerät 7 Zoll – Augenschonender Smart Reader** | Format (1) | 7 Zoll = 1719,47 |
| **Faltbare Silikon Tastatur 2.4G – Kabellos & Wasserdicht** | 1 Variante | 79,98 |
| **USB 2.0 Externes Diskettenlaufwerk 1.44 MB – Plug & Play** | 1 Variante | 99,43 |
| **Vertikale Maus mit Display & Wireless Charging – Bluetooth** | 1 Variante | 142,46 |
| **Laptop Ständer Aluminium – Höhenverstellbar & Faltbar** | 1 Variante | 77,71 |

**Varianten setzen** via `productSet(synchronous: true)` mit `productOptions` + `variants`
(jede Variante `inventoryItem: { tracked: false }`). Titel/Beschreibung/SEO/Vendor/Tags im selben Call.

---

## 3. Collections (Smart Collections, regelbasiert)

| Collection | Handle | Regel |
|---|---|---|
| Startseite (Bestseller) | `frontpage` | **manuell** — Produkte per `collectionAddProducts` hinzufügen |
| Gaming Tastaturen | `gaming-tastaturen` | TITLE enthält „Tastatur" OR „Keyboard" |
| Mäuse & Peripherie | `mause-peripherie` | TITLE enthält „Maus" OR „Mouse" |
| Setup Zubehör | `setup-zubehor` | TITLE enthält Laptop/Monitor/Controller/Anti-Spy/SSD/Netzkabel/Neon/Gehäuse/„PC Lüfter"/Ständer/Lesegerät |
| Tastaturen | `tastaturen` | TAG = „Tastatur" |
| Mäuse | `mause` | TAG = „Maus" |
| Gaming | `gaming` | TAG = „Gaming" |
| PC-Komponenten & Modding | `pc-komponenten-modding` | TAG = „PC-Komponenten" OR „PC-Modding" |
| Speicher & USB | `speicher-usb` | TAG = „Speicher" |

→ Produkte landen automatisch in den Kategorien, wenn Titel/Tags passen. Nur `frontpage` ist manuell.

Menü (Header) ist **fest codiert** in `sections/header.liquid` und verlinkt auf diese Handles.
Alle drei `698426…`-Collections + `frontpage` + die neuen Produkte müssen im Online-Store-Kanal
**veröffentlicht** sein (`publishablePublish`), sonst „Seite nicht gefunden".

---

## 4. Theme-Fix A — `sections/cx-variant-logic.liquid` (Varianten-Preis-Umschaltung)

Sorgt dafür, dass beim Klick auf einen Varianten-Button Preis/Bild/Verfügbarkeit sofort
umspringen und die richtige Variante in den Warenkorb geht. Löst nicht existierende
Kombinationen automatisch auf eine echte Variante auf. **`v.featured_image` MUSS abgesichert
sein** (siehe Stolperfalle #1).

```liquid
{%- comment -%} Varianten-Buttons funktionsfaehig: Preis, Bild, Verfuegbarkeit + richtige Variante in Warenkorb {%- endcomment -%}
<style>
.cx-opt-btn.cx-opt-unavail{opacity:.32;text-decoration:line-through;border-color:rgba(255,255,255,.1)!important;color:rgba(255,255,255,.4)!important;background:transparent!important;}
.cx-opt-btn.cx-opt-unavail.cx-opt-active{opacity:.6;}
</style>
<script>
(function(){
  var CXV=[
  {%- for v in product.variants -%}
    {%- if v.compare_at_price > v.price -%}{%- assign vpct = v.compare_at_price | minus: v.price | times: 100 | divided_by: v.compare_at_price -%}{%- assign vhc = 'true' -%}{%- else -%}{%- assign vpct = 0 -%}{%- assign vhc = 'false' -%}{%- endif -%}
    {id:{{ v.id }},o:{{ v.options | json }},price:{{ v.price | money | json }},cmp:{{ v.compare_at_price | money | json }},hasCmp:{{ vhc }},pct:{{ vpct }},av:{{ v.available }},qty:{{ v.inventory_quantity | default: 0 }},sku:{{ v.sku | json }},img:{%- if v.featured_image -%}{{ v.featured_image | image_url: width: 800 | json }}{%- else -%}null{%- endif -%}}{%- unless forloop.last -%},{%- endunless -%}
  {%- endfor -%}
  ];
  if(!CXV.length)return;
  function groups(){return Array.prototype.slice.call(document.querySelectorAll('.cx-prod-option'));}
  function btnVal(b){return (b.getAttribute('data-value')||b.textContent||'').trim();}
  function curSel(){return groups().map(function(g){var a=g.querySelector('.cx-opt-btn.cx-opt-active')||g.querySelector('.cx-opt-btn');return a?btnVal(a):null;});}
  function findExact(s){return CXV.find(function(v){return v.o.length===s.length && v.o.every(function(val,i){return val===s[i];});});}
  function setActive(gi,val){var g=groups()[gi];if(!g)return;g.querySelectorAll('.cx-opt-btn').forEach(function(b){if(btnVal(b)===val)b.classList.add('cx-opt-active');else b.classList.remove('cx-opt-active');});}
  function mark(s){groups().forEach(function(g,gi){g.querySelectorAll('.cx-opt-btn').forEach(function(b){var bv=btnVal(b);var ok=CXV.some(function(v){if(!v.av)return false;return v.o.every(function(val,i){return i===gi?(val===bv):(val===s[i]);});});b.classList.toggle('cx-opt-unavail',!ok);});});}
  function render(v){
    var idEl=document.querySelector('.cx-prod-info input[name="id"]');if(idEl)idEl.value=v.id;
    var pEl=document.querySelector('.cx-prod-price');if(pEl)pEl.textContent=v.price;
    var cEl=document.querySelector('.cx-prod-compare');if(cEl){if(v.hasCmp){cEl.style.display='';cEl.textContent=v.cmp;}else{cEl.style.display='none';}}
    var sEl=document.querySelector('.cx-prod-save');if(sEl){if(v.hasCmp){sEl.style.display='';sEl.textContent='-'+v.pct+'% sparen';}else{sEl.style.display='none';}}
    var atc=document.querySelector('.cx-atc-btn');if(atc)atc.disabled=!v.av;
    var img=document.getElementById('cx-main-img');if(img&&v.img)img.src=v.img;
    var uEl=document.querySelector('.cx-prod-urgency span:last-child');
    if(uEl)uEl.textContent=(v.av&&v.qty>0&&v.qty<=20)?('Nur noch '+v.qty+' Stueck verfuegbar'):(v.av?'Auf Lager – sofort versandbereit':'Derzeit nicht verfuegbar');
  }
  function resolve(changedGi){
    var s=curSel();if(s.indexOf(null)!==-1)return;
    var v=findExact(s);
    if(!v){var cand=null;if(changedGi!=null){var wanted=s[changedGi];var list=CXV.filter(function(x){return x.o[changedGi]===wanted;});list.sort(function(a,b){return (b.av?1:0)-(a.av?1:0);});cand=list[0];}if(!cand){cand=CXV.filter(function(x){return x.av;})[0]||CXV[0];}v=cand;v.o.forEach(function(val,gi){setActive(gi,val);});s=v.o.slice();}
    render(v);mark(s);
  }
  document.addEventListener('click',function(e){var b=e.target.closest('.cx-opt-btn');if(!b)return;var gi=groups().indexOf(b.closest('.cx-prod-option'));setTimeout(function(){resolve(gi);},0);});
  function init(){var g=groups();var first=CXV.filter(function(x){return x.av;})[0]||CXV[0];if(first){first.o.forEach(function(val,gi){if(g[gi]&&!g[gi].querySelector('.cx-opt-btn.cx-opt-active'))setActive(gi,val);});}resolve(null);}
  if(document.readyState!=='loading')init();else document.addEventListener('DOMContentLoaded',init);
})();
</script>
{% raw %}{% schema %}{% endraw %}
{"name":"Variant Logic","settings":[],"presets":[{"name":"Variant Logic"}]}
{% raw %}{% endschema %}{% endraw %}
```

Erwartete Markup-Struktur in `product-page.liquid` (Option-Buttons):
```liquid
<div class="cx-prod-option">
  <label class="cx-opt-label">{{ option.name }}</label>
  <div class="cx-opt-values">
    {%- for value in option.values -%}
      <button type="button" class="cx-opt-btn" onclick="this.parentNode.querySelectorAll('.cx-opt-btn').forEach(b=>b.classList.remove('cx-opt-active'));this.classList.add('cx-opt-active')">{{ value }}</button>
    {%- endfor -%}
  </div>
</div>
```
Preis-Element: `.cx-prod-price` · verstecktes Feld: `.cx-prod-info input[name="id"]`

---

## 5. Theme-Fix B — `sections/cart-page.liquid` (Mengen-Auswähler)

Problem war: die Klassen `.cx-qty-wrap/.cx-qty-btn/.cx-qty-input` waren **nicht gestylt**
→ hässlicher weißer Standard-Input. Fix = folgendes CSS im `<style>` ergänzen + Auto-Update-Script:

```css
.cx-qty-wrap{display:inline-flex;align-items:center;}
.cx-qty-btn{width:38px;height:38px;border:1px solid rgba(0,212,255,.25);background:rgba(0,212,255,.06);color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}
.cx-qty-btn:first-child{border-radius:8px 0 0 8px;}
.cx-qty-btn:last-child{border-radius:0 8px 8px 0;}
.cx-qty-btn:hover{background:rgba(0,212,255,.15);border-color:var(--primary);}
.cx-qty-input{width:54px;height:38px;border:1px solid rgba(0,212,255,.25);border-left:none;border-right:none;background:rgba(3,7,18,.6);color:#fff;text-align:center;font-size:15px;font-weight:600;border-radius:0;-moz-appearance:textfield;appearance:textfield;}
.cx-qty-input:focus{outline:none;border-color:var(--primary);}
.cx-qty-input::-webkit-outer-spin-button,.cx-qty-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
```
```html
<script>
(function(){var items=document.querySelector('.cx-cart-items');var form=items?items.closest('form'):null;if(!form)return;var t;
function submitSoon(){clearTimeout(t);t=setTimeout(function(){var g=document.querySelector('.cx-cart-grid');if(g)g.classList.add('cx-cart-updating');form.submit();},700);}
form.addEventListener('click',function(e){if(e.target.closest('.cx-qty-btn'))submitSoon();});
form.addEventListener('input',function(e){var el=e.target;if(el&&el.classList&&el.classList.contains('cx-qty-input'))submitSoon();});})();
</script>
```

---

## 6. Build-Prozess (Reihenfolge)

1. **Produkte importieren** aus EBoxMan („Add to store") → sie kommen mit rohen EN-Titeln, $-Preisen, ohne Bilder.
2. Pro Produkt **`productSet(synchronous:true)`**: DE-Titel, `descriptionHtml`, `seo`, `vendor:"Cybrix"`, `tags`, `productType`, `productOptions`, `variants` (Retail-€-Preise, `inventoryItem:{tracked:false}`). Keyboard auf **8** Varianten trimmen, USB auf **10**.
3. **Handles** auf saubere deutsche Slugs setzen (`productUpdate handle`, `redirectNewHandle:true`).
4. **Bilder** hinzufügen: `productCreateMedia` mit den Bild-URLs der archivierten Vorlage (CDN-URLs bleiben gültig).
5. **Jeder Variante das Bild zuweisen**: `productVariantsBulkUpdate(variants:[{id, mediaId}])` — WICHTIG (siehe #1).
6. **Veröffentlichen**: `publishablePublish` auf `gid://shopify/Publication/337963745663` (Produkte + die Collections).
7. Neue Produkte in `frontpage` (manuell) aufnehmen: `collectionAddProducts`.
8. Duplikate/alte Produkte **archivieren** (`productUpdate status:ARCHIVED`) oder **löschen** (`productDelete`).

---

## 7. STOLPERFALLEN (die uns Zeit gekostet haben)

1. **`image_url` auf Variante ohne Bild schießt das Varianten-Script ab.**
   Symptom: Button wird markiert, aber Preis bleibt stehen. Zwei Lösungen (beide anwenden):
   - Im Liquid `{%- if v.featured_image -%}…{%- else -%}null{%- endif -%}` absichern (siehe #4).
   - **Jeder Variante ein Bild zuweisen** (`productVariantsBulkUpdate` mit `mediaId`). Das hat den Fix LIVE gebracht, **ohne** neu zu veröffentlichen.
2. **Schreiben aufs Live-Theme ist per API blockiert**, ebenso Theme-Veröffentlichen. → Fix in ein Entwurfs-Theme schreiben, Merchant klickt „Veröffentlichen". Oder das Problem daten-seitig lösen (wie #1).
3. **Sparse Varianten-Matrix** (nicht jede Farbe hat jede Kapazität): Das Script löst unmögliche Kombis automatisch auf eine echte Variante auf und streicht sie durch.
4. **Smart Collections zählen auch archivierte Produkte** in `productsCount`, zeigen im Store aber nur aktive.
5. **`frontpage` ist manuell** — nach dem Löschen alter Produkte werden die neuen NICHT automatisch aufgenommen → Startseite leer, bis `collectionAddProducts`.
6. **Menü-404**: Kategorien im hardcoded Header brauchen veröffentlichte Collections.
7. **E-Mail-Konsistenz**: überall `cybrix@gmail.com` (Impressum, AGB, Datenschutz, Widerruf, Kontakt, Footer).
8. **Optionsnamen** waren englisch (`color`→„COLOR"). Für DE-Shop besser `Farbe`, `Kapazität`, `Modell`, `Ausführung`, `Format`. (Offen / optional.)

---

## 8. Offene / optionale Punkte

- Options-Labels auf Deutsch (Farbe/Kapazität/…) — noch englisch.
- „Color 1–8" sind generische Namen (Lieferant liefert keine echten Farbnamen).
- Entwurfs-Theme `196478009727` mit der **abgesicherten** Varianten-Version könnte veröffentlicht werden.
- Storefront-Passwort entfernen für echten Go-Live.

_Stand: Juni 2026 · erstellt während des gemeinsamen Aufbaus._
