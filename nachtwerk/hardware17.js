export const HARDWARE = Object.freeze([
 {id:'zerogpu48',name:'ZeroGPU Large',memory:'48 GB VRAM',cost:'Gratis-Kontingent',kind:'cloud',note:'Geteilte RTX PRO 6000 Blackwell; GPU wird nur innerhalb eines kompatiblen Spaces zugeteilt.'},
 {id:'zerogpu96',name:'ZeroGPU XLarge',memory:'96 GB VRAM',cost:'2× Gratis-Kontingent',kind:'cloud',note:'Volle RTX PRO 6000 Blackwell nur wenn der Space xlarge anbietet; längere Wartezeit möglich.'},
 {id:'webgpu',name:'Browser WebGPU',memory:'Geräteabhängig',cost:'Keine Cloud-Kosten',kind:'local',note:'Lokale Browser-GPU, nicht automatisch für große Videomodelle geeignet.'},
 {id:'comfyui',name:'ComfyUI lokal',memory:'Geräteabhängig',cost:'Keine Cloud-Kosten',kind:'local',note:'Lokaler ComfyUI-Server und Modellgewichte müssen separat laufen.'}
]);
export function validateSpaceId(s){return /^[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*$/.test(String(s||''));}
export function spaceUrl(s){if(!validateSpaceId(s))throw Error('Ungültige Space-ID (owner/name)');return `https://huggingface.co/spaces/${s}`;}
export function chooseHardware(id){const h=HARDWARE.find(x=>x.id===id);if(!h)throw Error('Unbekanntes Profil');return h;}
