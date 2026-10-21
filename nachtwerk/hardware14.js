export const GPU_MODES = Object.freeze({
  free: {name:'ZeroGPU Large',vramGb:48,quotaMultiplier:1,description:'Geteilte NVIDIA RTX PRO 6000 Blackwell (48 GB), kostenloses Tageskontingent'},
  max: {name:'ZeroGPU XLarge',vramGb:96,quotaMultiplier:2,description:'Volle NVIDIA RTX PRO 6000 Blackwell (96 GB), wenn der Space xlarge anbietet'},
  local: {name:'Lokale GPU',vramGb:null,quotaMultiplier:0,description:'Eigene Hardware über lokalen ComfyUI-Workflow; GPU-Größe wird nicht vorgetäuscht'}
});
export function recommendation(mode){
 const m=GPU_MODES[mode]; if(!m) throw Error('Unbekannter Hardwaremodus');
 return `${m.name}: ${m.description}. Hardware wird vom Betreiber des Renderdienstes zugewiesen; NACHTWERK kann sie nicht erzwingen.`;
}
export function makeSpaceLink(space){
 if(!/^[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*$/.test(space)) throw Error('Space-ID muss owner/name sein');
 return `https://huggingface.co/spaces/${space}`;
}
