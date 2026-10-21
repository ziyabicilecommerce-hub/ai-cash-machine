import {timecode,shotPrompt,validateShotList,shotListSrt} from './shot-tools.js';
const $=id=>document.getElementById(id);
const key='nachtwerk-shot-planner-v1';
let shots=[];
try {const saved=JSON.parse(localStorage.getItem(key)||'[]');if(validateShotList(saved))shots=saved;}catch{}
function save(){try{localStorage.setItem(key,JSON.stringify(shots));}catch{}}
function refresh(){const target=$('shotList');target.replaceChildren();shots.forEach((s,i)=>{const li=document.createElement('li');const label=document.createElement('span');label.textContent=`${i+1}. ${s.duration}s · ${s.prompt}`;const del=document.createElement('button');del.type='button';del.textContent='Entfernen';del.addEventListener('click',()=>{shots.splice(i,1);save();refresh()});li.append(label,del);target.append(li)});$('shotCount').textContent=`${shots.length} Einstellungen · ${timecode(shots.reduce((sum,s)=>sum+s.duration,0))} bei 24 fps`;}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('addShot').addEventListener('click',()=>{try{const duration=Number($('shotDuration').value);const prompt=shotPrompt({subject:$('shotSubject').value,action:$('shotAction').value,camera:$('shotCamera').value,location:$('shotLocation').value,lighting:$('shotLight').value,duration});shots.push({prompt,duration});if(!validateShotList(shots))throw Error('Maximal 100 Einstellungen');save();refresh();$('shotStatus').textContent='Einstellung gespeichert – noch kein Video generiert.';}catch(e){$('shotStatus').textContent=e.message;}});
$('exportShotJson').addEventListener('click',()=>download('nachtwerk-shotliste.json',JSON.stringify({version:1,shots},null,2),'application/json'));
$('exportShotSrt').addEventListener('click',()=>{try{download('nachtwerk-shotliste.srt',shotListSrt(shots),'text/plain')}catch(e){$('shotStatus').textContent=e.message}});
$('copyShotPrompt').addEventListener('click',async()=>{try{if(!shots.length)throw Error('Erst eine Einstellung hinzufügen');await navigator.clipboard.writeText(shots.at(-1).prompt);$('shotStatus').textContent='Letzten Prompt kopiert.'}catch(e){$('shotStatus').textContent=e.message}});
$('importShotJson').addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>200000)throw Error('Datei zu groß');const parsed=JSON.parse(await file.text());if(!validateShotList(parsed.shots))throw Error('Ungültige Shotliste');shots=parsed.shots;save();refresh();$('shotStatus').textContent='Shotliste importiert.'}catch(err){$('shotStatus').textContent=err.message}finally{e.target.value=''}});
refresh();
