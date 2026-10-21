import {GPU_MODES,recommendation,makeSpaceLink} from './hardware14.js';
const el=id=>document.getElementById(id);
const mode=el('nw14Mode'), info=el('nw14Info'), space=el('nw14Space'), status=el('nw14Status');
for(const [key,value] of Object.entries(GPU_MODES)){
 const option=document.createElement('option');option.value=key;option.textContent=value.name;mode.append(option);
}
function update(){info.textContent=recommendation(mode.value);el('nw14Quota').textContent=mode.value==='max'?'XLarge benötigt doppelt so viel ZeroGPU-Kontingent wie Large.':'Die kostenlose GPU-Zeit ist täglich begrenzt; Verfügbarkeit nicht garantiert.';}
mode.addEventListener('change',update);update();
el('nw14Open').addEventListener('click',()=>{
 try {const url=makeSpaceLink(space.value.trim());window.open(url,'_blank','noopener,noreferrer');status.textContent='Space geöffnet. Prüfe dort, ob der Betreiber den gewählten GPU-Modus unterstützt.';}
 catch(err){status.textContent=err.message;}
});
el('nw14Apply').addEventListener('click',()=>{
 try {makeSpaceLink(space.value.trim());const target=el('nw13Space');if(!target)throw Error('NACHTWERK 13-Modul fehlt');target.value=space.value.trim();target.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='Space-ID in Multi-Modell-Lab übernommen. Verbinde die API dort und prüfe die Renderparameter. GPU-Größe kann nicht clientseitig erzwungen werden.';}
 catch(err){status.textContent=err.message;}
});
el('nw14Local').addEventListener('click',()=>{
 const settings=el('settingsView');if(settings){settings.hidden=false;settings.scrollIntoView({behavior:'smooth'});}status.textContent='Für lokale Videogenerierung ComfyUI-Workflow und eigenes GPU-Setup in den Einstellungen verbinden.';
});
