export const MODELS=[
 {id:'wan22',name:'Wan 2.2',url:'https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B'},
 {id:'hunyuan15',name:'HunyuanVideo 1.5',url:'https://huggingface.co/tencent/HunyuanVideo-1.5'},
 {id:'cogvideox',name:'CogVideoX',url:'https://huggingface.co/THUDM/CogVideoX-5b'},
 {id:'mochi1',name:'Mochi 1',url:'https://huggingface.co/genmo/mochi-1-preview'},
 {id:'animatediff',name:'AnimateDiff',url:'https://huggingface.co/guoyww/animatediff-motion-adapter-v1-5-2'},
 {id:'ltx23',name:'LTX-2.3 Turbo',url:'https://huggingface.co/spaces/techfreakworm/LTX2.3-Studio'}
];
export const DEFAULT_SCENE='Photorealistic cinematic horror, adult woman in a black coat walks through thick moonlit fog toward an abandoned Victorian mansion, natural body motion, smooth tracking shot, dramatic lighting, 16:9.';
export function validateSpace(space){const s=String(space||'').trim();if(!/^[\w.-]+\/[\w.-]+$/.test(s))throw Error('Space-ID muss owner/name sein.');return s;}
export function parseArgs(raw){const v=JSON.parse(raw);if(!Array.isArray(v)&&(!v||typeof v!=='object'))throw Error('API-Argumente müssen ein JSON-Array oder Objekt sein.');return v;}
export function endpointsFromApi(api){return Object.entries(api?.named_endpoints||{}).filter(([key,value])=>key.startsWith('/')&&value&&typeof value==='object');}
export function findVideoOutput(value){const seen=new Set();function walk(v,depth=0){if(depth>12||v==null)return null;if(typeof v==='string')return /^https:\/\//i.test(v)&&(/\.(mp4|webm|mov)(\?|#|$)/i.test(v)||/\/gradio_api\/file=/i.test(v))?v:null;if(typeof v!=='object'||seen.has(v))return null;seen.add(v);if(typeof v.url==='string'){const x=walk(v.url,depth+1);if(x)return x;}for(const item of Object.values(v)){const x=walk(item,depth+1);if(x)return x;}return null;}return walk(value);}
