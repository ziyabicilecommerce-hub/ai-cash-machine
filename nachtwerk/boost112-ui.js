import {PRESETS,makeShots,auditPrompt,exportProject} from './boost112.js';
const $=id=>document.getElementById(id);
const save=(name,content,type)=>{const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)};
let shots=[];
try{shots=JSON.parse(localStorage.getItem('nw112shots')||'[]');if(!Array.isArray(shots))shots=[]}catch{shots=[]}
const render=()=>{$('nw112Shots').textContent=shots.map(s=>`SHOT ${s.shot} · ${s.duration}s\n${s.prompt}`).join('\n\n')||'Noch keine Shots erstellt.';$('nw112Count').textContent=`${shots.length} Shots · ${shots.reduce((n,s)=>n+s.duration,0)} Sekunden geplant`;try{localStorage.setItem('nw112shots',JSON.stringify(shots))}catch{}};
const select=$('nw112Preset');PRESETS.forEach(([name],i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=name;select.append(o)});
$('nw112Apply').onclick=()=>{const [name,scene,camera,look]=PRESETS[Number(select.value)];$('nw112Idea').value=scene;const cinemaScene=$('nw102Scene');if(cinemaScene)cinemaScene.value=scene;const cameraEl=$('nw102Camera'),lookEl=$('nw102Look');if(cameraEl)cameraEl.value=camera;if(lookEl)lookEl.value=look;$('nw112Status').textContent=`${name}-Vorlage übernommen. Du kannst sie frei verändern.`};
$('nw112Build').onclick=()=>{const idea=$('nw112Idea').value.trim();if(!idea){$('nw112Status').textContent='Bitte zuerst eine Filmszene eingeben.';return}shots=makeShots(idea);render();$('nw112Status').textContent='Fünf Shots erstellt. Das sind Prompts, keine gerenderten Videos.'};
$('nw112Audit').onclick=()=>{const s=$('nw112Idea').value;const warnings=auditPrompt(s);$('nw112Status').textContent=warnings.length?'Verbesserungsvorschläge: '+warnings.join(' '):'Gute Ausgangsbeschreibung. Die tatsächliche Videoqualität hängt vom Modell ab.'};
$('nw112Json').onclick=()=>save('nachtwerk-storyboard.json',exportProject(shots),'application/json');
$('nw112Text').onclick=()=>save('nachtwerk-shotliste.txt',shots.map(s=>`SHOT ${s.shot} (${s.duration}s)\n${s.prompt}`).join('\n\n'),'text/plain');
$('nw112Copy').onclick=async()=>{try{await navigator.clipboard.writeText(shots.map(s=>s.prompt).join('\n\n'));$('nw112Status').textContent='Shot-Prompts kopiert.'}catch{$('nw112Status').textContent='Kopieren nicht verfügbar. Nutze den Text-Export.'}};
$('nw112Clear').onclick=()=>{shots=[];render();$('nw112Status').textContent='Shotliste geleert.'};
$('nw112File').onchange=()=>{const f=$('nw112File').files?.[0];if(!f)return;const video=$('nw112Video');if(video.dataset.url)URL.revokeObjectURL(video.dataset.url);const url=URL.createObjectURL(f);video.dataset.url=url;video.src=url;video.hidden=false;video.onloadedmetadata=()=>{$('nw112Media').textContent=`${f.name} · ${video.videoWidth} × ${video.videoHeight} · ${video.duration.toFixed(1)} Sekunden · ${(f.size/1048576).toFixed(1)} MB. Echtes Videofile erkannt; KI-Ursprung nicht verifiziert.`};video.onerror=()=>{$('nw112Media').textContent='Video konnte im Browser nicht dekodiert werden.'}};
render();
