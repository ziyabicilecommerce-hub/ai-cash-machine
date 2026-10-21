export const FLAGSHIP = Object.freeze({
 id:'vera-rubin-nvl72', name:'NVIDIA DGX Vera Rubin NVL72',
 gpuCount:72, cpuCount:36, gpuMemoryTB:20.7,
 description:'72 Rubin GPUs, 36 Vera CPUs, 20,7 TB HBM4 GPU-Speicher; Rack-System für Rechenzentren.',
 source:'https://www.nvidia.com/en-gb/data-center/vera-rubin-nvl72/',
 access:'Nur mit rechtmäßig bereitgestelltem Rechenzentrum/Cluster und autorisiertem Endpoint. Nicht kostenlos verfügbar.'
});
export function validateEndpoint(raw){
 let u;try{u=new URL(raw);}catch{throw Error('Ungültige URL.');}
 if(u.protocol!=='https:' && !(u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname))) throw Error('Nur HTTPS oder lokales HTTP erlaubt.');
 if(u.username||u.password) throw Error('Keine Zugangsdaten in URLs eingeben.');
 if(!['http:','https:'].includes(u.protocol))throw Error('Ungültiges Protokoll.');
 return u.origin;
}
export function hardwareSummary(){return `${FLAGSHIP.name} · ${FLAGSHIP.gpuCount} GPUs · ${FLAGSHIP.cpuCount} CPUs · ${FLAGSHIP.gpuMemoryTB} TB GPU-Speicher`;}
