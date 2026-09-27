import {creativeFor,generationPrompt} from './creative-data.mjs';
import {connections,chooseConnection,generate,classifyError} from './video-engine.mjs';
import {stitchScenes} from './stitch-video.mjs';
const $=id=>document.getElementById(id),brands={deskrebel:'DeskRebel',purivelle:'Purivelle'};
let inventory={},catalog=[],brand='deskrebel',product,creative,busy=false,controller=null,modelFamily='Alle',shown=18,resultBlobUrl=null;
let history=[],drafts={};
try{history=JSON.parse(localStorage.getItem('one-studio-history-v1')||'[]');if(!Array.isArray(history))history=[];}catch{}
try{drafts=JSON.parse(localStorage.getItem('one-studio-drafts-v1')||'{}');if(!drafts||Array.isArray(drafts)||typeof drafts!=='object')drafts={};}catch{}
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function feedback(text,error=false){$('feedback').textContent=text;$('feedback').classList.toggle('error',error);}
function safeUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'?u.href:null;}catch{return null;}}
function saveDraft(){if(!product)return;drafts[product.id]={caption:$('caption').value,prompt:$('prompt').value,look:$('look').value};try{localStorage.setItem('one-studio-drafts-v1',JSON.stringify(drafts));}catch{feedback('Deine Bearbeitung bleibt für diese Sitzung erhalten; Browserspeicher ist nicht verfügbar.');}}
function clearResult(){if(resultBlobUrl){URL.revokeObjectURL(resultBlobUrl);resultBlobUrl=null;}$('resultVideo').pause();$('resultVideo').removeAttribute('src');$('resultVideo').load();$('resultVideo').hidden=true;$('referenceImage').hidden=false;$('referenceOverlay').hidden=false;$('resultActions').hidden=true;$('sceneResults').replaceChildren();$('resultState').textContent='Produktreferenz · noch kein Video';}
function selectProduct(id){
 if(busy)return;saveDraft();product=inventory[brand]?.find(p=>String(p.id)===String(id));if(!product)return;
 creative=creativeFor(product,brands[brand]);$('productSelect').value=product.id;
 $('productHeadline').textContent=creative.headline;$('productDescription').textContent=creative.description;$('copyBadge').textContent=creative.authored?'KI · VORAB ERSTELLT':'PRODUKTDATEN';
 const draft=drafts[product.id];$('look').value=draft?.look||'product';$('caption').value=draft?.caption??creative.caption+'\n'+product.url;$('prompt').value=draft?.prompt??generationPrompt(product,creative,$('look').value);
 $('referenceImage').src=product.image;$('referenceImage').alt=product.title;$('previewName').textContent=product.name||product.title;$('previewBrand').textContent=brands[brand].toUpperCase();
 clearResult();document.querySelectorAll('.product-tile').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===String(product.id))));feedback('');$('jobPanel').hidden=true;
}
function setBrand(id){
 if(busy||!inventory[id])return;saveDraft();brand=id;document.querySelectorAll('[data-brand]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.brand===id)));
 $('productSelect').replaceChildren();$('productStrip').replaceChildren();
 for(const p of inventory[id]){
  $('productSelect').append(new Option(p.title,p.id));const b=node('button',undefined,'product-tile');b.type='button';b.dataset.id=String(p.id);b.setAttribute('aria-label',p.title);b.setAttribute('aria-pressed','false');const img=node('img');img.src=p.image;img.alt='';img.loading='lazy';b.append(img);b.addEventListener('click',()=>selectProduct(p.id));$('productStrip').append(b);
 }
 selectProduct(inventory[id][0].id);$('productSelect').disabled=false;$('generate').disabled=false;
}
function updateOptions(){
 const seconds=Number($('duration').value),needed=seconds===12?4:seconds;
 for(const option of $('connection').options){const c=connections.find(c=>c.id===option.value);option.disabled=!!c&&c.maxDuration<needed;}
 const selected=connections.find(c=>c.id===$('connection').value);if(selected&&selected.maxDuration<needed)$('connection').value='auto';
 $('durationNote').textContent=seconds===12?'12 Sekunden = drei KI-Szenen. Jede Szene benötigt eigenes GPU-Kontingent.':'Eine KI-Szene. Die tatsächliche Ausgabe kann geringfügig von der gewünschten Länge abweichen.';
 $('resultLength').textContent=seconds+' SEK.';
 const c=connections.find(c=>c.id===$('connection').value);$('modelHint').textContent=c?c.name+' · Direktanbindung im Testbetrieb. Öffentliche GPU-Warteschlange; Verfügbarkeit nicht garantiert.':'Automatisch prüft die erreichbaren Verbindungen vor dem Start. Nach einem angenommenen Auftrag erfolgt kein automatischer Neustart bei einem anderen Dienst.';
}
function lock(value){busy=value;$('generate').disabled=value;for(const e of document.querySelectorAll('[data-brand],.product-tile,#productSelect,#look,#duration,#connection,#caption,#prompt,.select-model'))e.disabled=value;updateOptions();}
function sceneLink(url,label){const a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function addHistory(entry){history.unshift(entry);history=history.slice(0,50);try{localStorage.setItem('one-studio-history-v1',JSON.stringify(history));}catch{feedback('Video fertig. Der Verlauf konnte nicht dauerhaft gespeichert werden.');}renderHistory();}
function renderHistory(){
 $('historyList').replaceChildren();if(!history.length){$('historyList').append(node('p','Noch kein fertiges Video. Erfolgreiche Generierungen erscheinen hier.','empty-state'));return;}
 for(const h of history){const card=node('article',undefined,'history-item'),info=node('div');info.append(node('strong',h.product||'Produktvideo'),node('small',[h.brand,h.model,new Date(h.createdAt).toLocaleString('de-DE')].filter(Boolean).join(' · ')));card.append(info);
  const links=node('div');for(const [i,raw]of (Array.isArray(h.scenes)?h.scenes:[]).entries()){const url=safeUrl(raw);if(url)links.append(sceneLink(url,'Szene '+(i+1)+' ↗ '));}card.append(links);$('historyList').append(card);}
}
async function run(){
 if(busy||!product)return;saveDraft();clearResult();feedback('');controller=new AbortController();lock(true);$('jobPanel').hidden=false;$('cancel').hidden=false;$('jobTitle').textContent='Verbindung wird geprüft';
 const started=Date.now(),timer=setInterval(()=>{const s=Math.floor((Date.now()-started)/1000);$('elapsed').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');},1000);$('elapsed').textContent='0:00';
 const duration=Number($('duration').value),count=duration===12?3:1,sceneDuration=count===3?4:duration,scenes=[];
 const status=text=>{$('jobStatus').textContent=text;};
 try{
  const c=await chooseConnection($('connection').value,controller.signal,status,sceneDuration);
  for(let i=0;i<count;i++){
   controller.signal.throwIfAborted();$('jobTitle').textContent=count===1?'Dein Video wird erstellt':'Szene '+(i+1)+' von '+count;
   const variation=count===3?[' Begin with a clear establishing view of the product.',' Focus on a close-up of one real product detail.',' Finish with a calm hero view of the same product.'][i]:'';
   const result=await generate(c,{image:product.image,prompt:$('prompt').value+variation,duration:sceneDuration},{signal:controller.signal,onStatus:status});
   scenes.push(result.url);$('sceneResults').append(sceneLink(result.url,'Szene '+(i+1)+' herunterladen ↗'));
  }
  let resultUrl=scenes[0],extension='mp4';
  if(count===3){$('jobTitle').textContent='Szenen werden verbunden';const stitched=await stitchScenes(scenes,{signal:controller.signal,onStatus:status});resultBlobUrl=URL.createObjectURL(stitched.blob);resultUrl=resultBlobUrl;extension=stitched.extension;}
  $('resultVideo').src=resultUrl;$('resultVideo').hidden=false;$('referenceImage').hidden=true;$('referenceOverlay').hidden=true;$('resultActions').hidden=false;
  $('downloadVideo').href=resultUrl;$('downloadVideo').download=brand+'-'+product.name+'-'+duration+'s.'+extension;
  if(!resultBlobUrl){$('downloadVideo').target='_blank';$('downloadVideo').rel='noopener noreferrer';}else{$('downloadVideo').removeAttribute('target');}
  $('downloadHint').textContent=count===3?'Der gemeinsame Clip enthält die drei generierten Szenen ohne Ton. Jetzt herunterladen; diese Exportdatei bleibt nur für die aktuelle Sitzung verfügbar.':'Der Anbieterlink kann ablaufen. Im geöffneten Video gegebenenfalls „Video speichern“ wählen.';
  $('resultState').textContent='Fertiges KI-Video · '+c.name;$('jobTitle').textContent='Video fertig';status('Das Ergebnis ist bereit. Prüfe die Produktdetails vor dem Veröffentlichen.');
  addHistory({product:product.title,brand:brands[brand],model:c.name,createdAt:new Date().toISOString(),scenes});
 }catch(error){
  const e=classifyError(error);feedback(e.text,true);$('jobTitle').textContent=e.kind==='cancel'?'Verbindung beendet':'Generierung nicht abgeschlossen';status(scenes.length?scenes.length+' Einzelszene(n) wurden erstellt und bleiben unten abrufbar.':'Kein fertiges Video zurückgegeben.');$('resultState').textContent='Kein fertiges Video';
  if(scenes.length)addHistory({product:product.title,brand:brands[brand],model:'Einzelszenen · Gesamtvideo nicht abgeschlossen',createdAt:new Date().toISOString(),scenes});
 }finally{clearInterval(timer);$('cancel').hidden=true;lock(false);controller=null;}
}
const taskNames={'text-to-video':'Text → Video','image-to-video':'Bild → Video','video-to-video':'Video → Video'};
function renderCatalog(){
 const q=$('modelSearch').value.trim().toLowerCase(),filter=$('modelFilter').value;
 const filtered=catalog.filter(m=>(modelFamily==='Alle'||m.family===modelFamily)&&(!q||[m.id,m.family,m.publisher].join(' ').toLowerCase().includes(q))&&(filter==='all'||(filter==='connected')===(m.connection==='public-api')));
 $('catalogCount').textContent=filtered.length+' Modelle gefunden · '+Math.min(shown,filtered.length)+' angezeigt';$('modelGrid').replaceChildren();
 for(const m of filtered.slice(0,shown)){
  const card=node('article',undefined,'model-card'),top=node('div',undefined,'model-card-top');top.append(node('span',m.family.slice(0,1),'family-icon'),node('span',m.connection==='public-api'?'DIREKTANBINDUNG · TEST':'KATALOG · NICHT VERBUNDEN','model-status'+(m.connection==='public-api'?' connected':'')));
  const tags=node('div',undefined,'model-tags');tags.append(node('span',taskNames[m.task]||m.task),node('span','Lizenz: '+m.license));
  const actions=node('div',undefined,'model-actions'),a=node('a','Modellquelle ↗');a.href=m.source;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);
  const c=connections.find(c=>c.model===m.id);if(c){const b=node('button','Im Studio wählen ↗','select-model');b.type='button';b.disabled=busy;b.onclick=()=>{if(busy)return;const needed=Number($('duration').value)===12?4:Number($('duration').value);if(c.maxDuration<needed)$('duration').value='4';$('connection').value=c.id;updateOptions();document.getElementById('studio').scrollIntoView({behavior:'smooth'});};actions.append(b);}
  card.append(top,node('h3',m.name),node('p',m.publisher,'model-publisher'),tags,actions);$('modelGrid').append(card);
 }
 if(!filtered.length)$('modelGrid').append(node('p','Keine passenden Modelle. Ändere Suche oder Filter.','empty-state'));$('moreModels').hidden=shown>=filtered.length;
}
async function copyCaption(){try{await navigator.clipboard.writeText($('caption').value);feedback('Beitragstext kopiert.');}catch{$('caption').focus();$('caption').select();feedback('Bitte den markierten Beitragstext kopieren.');}}
function exportTexts(){const all=Object.entries(inventory).flatMap(([b,ps])=>ps.map(p=>({brand:brands[b],product:p.title,url:p.url,...creativeFor(p,brands[b])})));const blob=new Blob([JSON.stringify(all,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='produkttexte-deskrebel-purivelle.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function loadJSON(path){const r=await fetch(path);if(!r.ok)throw new Error(path+' konnte nicht geladen werden.');return r.json();}
async function init(){
 for(const c of connections)$('connection').append(new Option(c.name,c.id));
 document.querySelectorAll('[data-brand]').forEach(b=>b.onclick=()=>setBrand(b.dataset.brand));$('productSelect').onchange=()=>selectProduct($('productSelect').value);
 $('look').onchange=()=>{if(!product)return;$('prompt').value=generationPrompt(product,creative,$('look').value);saveDraft();};$('caption').oninput=saveDraft;$('prompt').oninput=saveDraft;
 $('duration').onchange=updateOptions;$('connection').onchange=updateOptions;$('generate').onclick=run;$('cancel').onclick=()=>controller?.abort();$('copyCaption').onclick=copyCaption;$('exportTexts').onclick=exportTexts;
 $('modelSearch').oninput=()=>{shown=18;renderCatalog();};$('modelFilter').onchange=()=>{shown=18;renderCatalog();};$('moreModels').onclick=()=>{shown+=18;renderCatalog();};
 renderHistory();updateOptions();
 const results=await Promise.allSettled([loadJSON('products-deskrebel.json'),loadJSON('products.json'),loadJSON('model-catalog.json')]);
 for(const [i,b]of ['deskrebel','purivelle'].entries()){const r=results[i];if(r.status==='fulfilled'&&Array.isArray(r.value)&&r.value.length&&r.value.every(p=>p.id&&p.title&&safeUrl(p.image)&&safeUrl(p.url)))inventory[b]=r.value;else document.querySelector('[data-brand="'+b+'"]').disabled=true;}
 if(inventory.deskrebel||inventory.purivelle)setBrand(inventory.deskrebel?'deskrebel':'purivelle');else feedback('Die Produktdaten konnten nicht geladen werden. Bitte die Seite erneut öffnen.',true);
 const r=results[2];if(r.status==='fulfilled'&&Array.isArray(r.value.models)){
  catalog=r.value.models;$('catalogTotal').textContent=catalog.length+' MODELLE & VARIANTEN';
  for(const family of ['Alle',...new Set(catalog.map(m=>m.family))]){const b=node('button',family);b.type='button';b.setAttribute('aria-pressed',String(family==='Alle'));b.onclick=()=>{modelFamily=family;shown=18;for(const x of $('familyTabs').children)x.setAttribute('aria-pressed',String(x===b));renderCatalog();};$('familyTabs').append(b);}renderCatalog();
 }else{$('catalogCount').textContent='Modellkatalog konnte nicht geladen werden.';$('moreModels').hidden=true;}
}
init().catch(e=>feedback(e.message,true));
