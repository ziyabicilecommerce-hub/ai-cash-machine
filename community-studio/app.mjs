import {buildPlan,datePlus,planCSV,autolistCSV} from './plan.mjs';
const $=id=>document.getElementById(id), canvas=$('canvas'),ctx=canvas.getContext('2d');
const STORAGE='purivelle-studio-v1';
let products=[],plan=[],selected=0,day=0,loadedImage=null,loadId=0,recording=false,recorder=null,frame=0,downloadURL=null;
let saved={};try{saved=JSON.parse(localStorage.getItem(STORAGE)||'{}');}catch{}
const THEMES={sage:['#e1e8d8','#19362d','#f7f7ef'],night:['#142a25','#e1edb4','#233c31'],clay:['#eeddd0','#4b332c','#faf2e9']};
const CHAPTERS=[['Ankommen.','Lege dein Handy beiseite. Dieser Moment gehört dir.'],['Leiser werden.','Es muss gerade nichts Neues passieren.'],['Ein Blick nach draußen.','Nimm einen kleinen Teil deiner Umgebung bewusst wahr.'],['Ein guter Moment.','Was hat dir heute gefallen?'],['Weniger Tabs.','Welche offene Sache kann bis morgen warten?'],['Dein eigenes Tempo.','Du musst in dieser Pause nichts schaffen.'],['Eine kleine Idee.','Was möchtest du morgen anders machen?'],['Etwas festhalten.','Notiere einen Gedanken, wenn du möchtest.'],['Zurück zu dir.','Wie soll dein Abend weitergehen?'],['Bis zur nächsten Pause.','Was ist dein persönliches Feierabendritual?']];
function feedback(s,error=false){$('feedback').textContent=s;$('feedback').classList.toggle('error',error);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({plan,start:$('startDate').value,mode:$('format').value,notes:$('notes').value}));}catch{feedback('Der Browser konnte die Änderungen nicht speichern. Bitte als Datei sichern.',true);}}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
function textLines(text,x,y,width,size,lineHeight,max=4,font='Arial'){ctx.font=`${size}px ${font}`;let lines=[],line='';for(const word of String(text).split(/\s+/)){const test=line?line+' '+word:word;if(ctx.measureText(test).width>width&&line){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);lines.slice(0,max).forEach((s,i)=>ctx.fillText(i===max-1&&lines.length>max?s+'…':s,x,y+i*lineHeight));}
function render(t=0,duration=0){
 const [bg,fg,paper]=THEMES[$('theme').value]||THEMES.sage;ctx.fillStyle=bg;ctx.fillRect(0,0,720,1280);ctx.fillStyle=fg;ctx.font='24px Arial';ctx.fillText('PURIVELLE',48,65);ctx.font='14px Arial';ctx.fillText('DER KLEINE FEIERABEND',48,100);
 const long=duration===600;const chapter=CHAPTERS[Math.min(9,Math.floor(t/60))];
 const title=long?chapter[0]:t>duration*.7&&duration?'Dein Moment. Dein Ritual.':$('headline').value;
 textLines(title,48,195,624,55,65,3,'Georgia');
 ctx.fillStyle=paper;ctx.fillRect(35,395,650,585);
 if(loadedImage){const zoom=1+Math.sin(t*.18)*.012;const scale=Math.min(620/loadedImage.naturalWidth,545/loadedImage.naturalHeight)*zoom;const w=loadedImage.naturalWidth*scale,h=loadedImage.naturalHeight*scale;ctx.drawImage(loadedImage,(720-w)/2,415+(545-h)/2,w,h);}else{ctx.fillStyle=fg;ctx.font='20px Arial';ctx.fillText('Produktbild wird geladen …',80,690);}
 ctx.fillStyle=fg;ctx.font='19px Arial';const p=products.find(x=>x.id===$('product').value);ctx.fillText((p?.name||'').slice(0,45),48,1024);
 textLines(long?chapter[1]:$('subline').value,48,1080,620,28,39,3);
 ctx.font='17px Arial';ctx.fillText('purivelle.store',48,1225);
 if(duration){const remain=Math.max(0,Math.ceil(duration-t));ctx.textAlign='right';ctx.fillText(`${String(Math.floor(remain/60)).padStart(2,'0')}:${String(remain%60).padStart(2,'0')}`,670,1225);ctx.textAlign='left';ctx.fillRect(0,1272,720*Math.min(1,t/duration),8);}
}
async function loadProduct(){const token=++loadId;loadedImage=null;render();const p=products.find(x=>x.id===$('product').value);if(!p)return;try{const img=new Image();img.crossOrigin='anonymous';img.src=p.image;await img.decode();if(token!==loadId)return;loadedImage=img;render();}catch{if(token===loadId)feedback('Produktbild konnte nicht geladen werden. Internetverbindung prüfen oder ein anderes Produkt wählen.',true);}}
function applySelected(){const p=plan[selected];if(!p)return;$('product').value=p.productId;$('headline').value=p.headline;$('subline').value=p.subline;$('caption').value=p.caption;loadProduct();}
function saveEdit(){const p=plan[selected];if(!p)return;Object.assign(p,{productId:$('product').value,headline:$('headline').value,subline:$('subline').value,caption:$('caption').value});persist();showCards();}
function showCards(){const host=$('cards');host.replaceChildren();plan.forEach((p,index)=>{if(p.day!==day)return;const product=products.find(x=>x.id===p.productId);const button=document.createElement('button');button.className='card';button.type='button';const img=document.createElement('img');img.src=product.image;img.alt=product.title;img.loading='lazy';const body=document.createElement('div');body.className='card-body';const time=document.createElement('time');time.textContent=p.time+' · '+p.series;const h=document.createElement('h3');h.textContent=p.headline;const tag=document.createElement('span');tag.className='tag';tag.textContent=(p.type==='video'?'VIDEOIDEE':'BILDBEITRAG')+' / ENTWURF';body.append(time,h,tag);button.append(img,body);button.onclick=()=>{if(recording)return;saveEdit();selected=index;applySelected();$('editor').scrollIntoView({behavior:'smooth'});};host.append(button);});}
function showDays(){const host=$('days');host.replaceChildren();for(let i=0;i<7;i++){const b=document.createElement('button');b.type='button';b.textContent=new Date(datePlus($('startDate').value,i)+'T12:00:00Z').toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'numeric',timeZone:'Europe/Berlin'});b.className=i===day?'selected':'';b.setAttribute('aria-pressed',i===day?'true':'false');b.onclick=()=>{day=i;showDays();showCards();};host.append(b);}showCards();}
function setBusy(b){recording=b;document.querySelectorAll('#editorForm input,#editorForm select,#editorForm textarea,#editorForm button,#newPlan,#format,#startDate,#cards button').forEach(el=>el.disabled=b);$('cancel').disabled=false;$('cancel').hidden=!b;$('progress').hidden=!b;}
async function exportVideo(){
 if(!loadedImage)return feedback('Das Produktbild muss zuerst vollständig geladen sein.',true);
 if(!window.MediaRecorder||!canvas.captureStream)return feedback('Dieser Browser unterstützt den Video-Export nicht. Bitte einen aktuellen Chrome- oder Edge-Browser verwenden.',true);
 saveEdit();const duration=Number($('duration').value);const mime=['video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime)return feedback('Kein unterstütztes Videoformat im Browser gefunden.',true);
 let stream,aborted=false,wake=null,chunks=[];setBusy(true);$('videoResult').replaceChildren();$('progress').value=0;
 try{if(navigator.wakeLock)try{wake=await navigator.wakeLock.request('screen');}catch{}
 render(0,duration);stream=canvas.captureStream(24);recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2000000});
 const done=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Exportfehler'));});
 const cancel=()=>{aborted=true;if(recorder?.state==='recording')recorder.stop();};$('cancel').onclick=cancel;
 const visibility=()=>{if(document.hidden)cancel();};document.addEventListener('visibilitychange',visibility);
 const start=performance.now();recorder.start(1000);feedback(`Export läuft (${duration===600?'10 Minuten':duration+' Sekunden'}). Bitte diesen Tab sichtbar lassen.`);
 const tick=()=>{if(recorder.state!=='recording')return;const t=(performance.now()-start)/1000;render(Math.min(t,duration),duration);$('progress').value=Math.min(100,t/duration*100);if(t>=duration)recorder.stop();else frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
 try{await done;}finally{document.removeEventListener('visibilitychange',visibility);}
 if(aborted){feedback('Export abgebrochen. Bei einem Tabwechsel wird gestoppt, damit kein unvollständiges Video als fertig erscheint.');return;}
 if(downloadURL)URL.revokeObjectURL(downloadURL);const blob=new Blob(chunks,{type:mime});downloadURL=URL.createObjectURL(blob);const video=document.createElement('video');video.src=downloadURL;video.controls=true;const a=document.createElement('a');a.href=downloadURL;a.download=`purivelle-${duration}s.${mime.includes('mp4')?'mp4':'webm'}`;a.className='button primary';a.textContent='Fertiges Video herunterladen ↓';$('videoResult').append(video,a);feedback('Video fertig. '+(mime.includes('mp4')?'MP4-Export bereit.':'WebM-Export bereit; vor einem Metricool-Upload gegebenenfalls in MP4 umwandeln.'));
 }catch(e){feedback('Video konnte nicht exportiert werden: '+e.message,true);}finally{cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());if(wake)await wake.release().catch(()=>{});recorder=null;setBusy(false);render();}
}
async function init(){
 const r=await fetch('products.json');if(!r.ok)throw new Error('Produktdatei nicht erreichbar.');products=await r.json();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 $('startDate').value=saved.start||datePlus(today,1);$('format').value=['mix','bild','video'].includes(saved.mode)?saved.mode:'mix';
 plan=Array.isArray(saved.plan)&&saved.plan.length===35&&saved.plan.every(x=>products.some(p=>p.id===x.productId))?saved.plan:buildPlan(products,$('startDate').value,$('format').value);
 for(const p of products){const o=document.createElement('option');o.value=p.id;o.textContent=p.title;$('product').append(o);}
 $('heroImage').src=products.find(p=>p.name==='FingerFlow')?.image||products[0].image;$('notes').value=saved.notes||'';$('notes').addEventListener('input',persist);
 $('newPlan').onclick=()=>{try{const next=buildPlan(products,$('startDate').value,$('format').value);plan=next;selected=0;day=0;persist();showDays();applySelected();feedback('Neuer Wochenplan erstellt. Vorherige Änderungen werden durch diesen Plan ersetzt.');}catch(e){feedback(e.message,true);}};
 $('editorForm').onsubmit=e=>e.preventDefault();$('product').onchange=loadProduct;['headline','subline','theme'].forEach(id=>$(id).addEventListener('input',()=>render()));
 $('save').onclick=()=>{saveEdit();feedback('Entwurf in diesem Browser gespeichert.');};$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('caption').value);feedback('Beitragstext kopiert.');}catch{feedback('Kopieren nicht verfügbar. Text im Feld markieren und kopieren.',true);}};
 $('png').onclick=()=>{if(!loadedImage)return feedback('Bitte warten, bis das Produktbild geladen ist.',true);render();try{canvas.toBlob(b=>{if(b){download(b,'purivelle-beitrag.png');feedback('Bild-Download gestartet.');}else feedback('Bild konnte nicht exportiert werden.',true);},'image/png');}catch{feedback('Bildexport vom Browser blockiert.',true);}};
 $('video').onclick=exportVideo;$('downloadPlan').onclick=()=>{saveEdit();download(new Blob([planCSV(plan,products)],{type:'text/csv;charset=utf-8'}),'purivelle-wochenplan.csv');};
 const auto=document.createElement('button');auto.className='text-button';auto.textContent='Bilder für Metricool-Autoliste ↓';auto.onclick=()=>{saveEdit();const images=plan.filter(x=>x.type==='bild');if(!images.length)return feedback('Der Plan enthält nur Videoideen. Wähle zuerst Bilder oder einen Mix.',true);download(new Blob([autolistCSV(plan,products)],{type:'text/csv;charset=utf-8'}),'purivelle-metricool-autoliste.csv');feedback(`${images.length} Bildbeiträge exportiert. In Metricool unter Autolisten importieren; Kanal und Zeitplan dort festlegen. Der Import veröffentlicht noch nichts aus dieser App.`);};document.querySelector('.toolbar').append(auto);
 $('backup').onclick=()=>{saveEdit();download(new Blob([JSON.stringify({plan,notes:$('notes').value},null,2)],{type:'application/json'}),'purivelle-studio-backup.json');};
 showDays();applySelected();
 try{const res=await fetch('publishing-status.json',{cache:'no-store'});if(!res.ok)throw new Error();const status=await res.json();$('scheduledCount').textContent=String(status.scheduled||0);$('scheduleStatus').textContent=status.message;}catch{$('scheduleStatus').textContent='Veröffentlichungsstatus nicht abrufbar. Die 35 Beiträge sind lokale Entwürfe; automatisches Posting ist nicht aktiv.';}
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
init().catch(e=>{feedback(e.message,true);$('scheduleStatus').textContent='Studio konnte nicht vollständig geladen werden. Bitte Seite neu laden.';});
