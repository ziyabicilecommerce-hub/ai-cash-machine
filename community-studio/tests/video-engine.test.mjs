import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {connections,requestData,parseEvents,outputVideo,classifyError,generate,chooseConnection} from '../video-engine.mjs';
import {creativeFor} from '../creative-data.mjs';
const input={image:'https://cdn.shopify.com/product.png',prompt:'A realistic product demonstration.',duration:4};
test('100 unique sourced releases and authored copy for all 20 products',async()=>{
 const data=JSON.parse(await readFile(new URL('../model-catalog.json',import.meta.url)));
 assert.equal(data.models.length,100);assert.equal(new Set(data.models.map(m=>m.id)).size,100);
 for(const m of data.models)assert.equal(m.source,'https://huggingface.co/'+m.id);
 for(const path of ['products.json','products-deskrebel.json']){const products=JSON.parse(await readFile(new URL('../'+path,import.meta.url)));assert.equal(products.length,10);for(const p of products)assert.equal(creativeFor(p,'brand').authored,true);}
 assert.equal(data.models.filter(m=>m.connection==='public-api').length,4);
});
test('request duration and image bounds reject unsupported or unsafe input',()=>{
 for(const c of connections){assert.equal(requestData(c,input).length,c.params.length);assert.throws(()=>requestData(c,{...input,duration:12}));assert.throws(()=>requestData(c,{...input,image:'javascript:alert(1)'}));}
});
test('SSE parsing retains incomplete events across chunks and supports CRLF',()=>{
 const first=parseEvents('event: heartbeat\r\ndata: null\r\n\r\nevent: comp');assert.equal(first.events[0].event,'heartbeat');assert.equal(first.rest,'event: comp');
 const second=parseEvents(first.rest+'lete\ndata: [{"video":"ok"}]\n\n');assert.equal(second.events[0].event,'complete');assert.equal(second.rest,'');
});
test('video result rejects hostile origins and accepts nested Gradio file result',()=>{
 const c=connections[0];assert.throws(()=>outputVideo([{url:'https://evil.example/video.mp4'}],c));assert.throws(()=>outputVideo(['javascript:evil.mp4'],c));
 assert.equal(outputVideo([{video:{url:c.host+'/gradio_api/file=/tmp/test.mp4'}}],c),c.host+'/gradio_api/file=/tmp/test.mp4');
});
test('completed provider stream returns video; provider error never becomes success',async()=>{
 const original=globalThis.fetch,c=connections[0];let calls=0;
 try{globalThis.fetch=async()=>{calls++;return calls%2===1?Response.json({event_id:'abcdefgh12345678'}):new Response('event: heartbeat\ndata: null\n\nevent: complete\ndata: '+JSON.stringify([{video:{url:c.host+'/gradio_api/file=/tmp/test.mp4'}}])+'\n\n');};
  assert.ok((await generate(c,input,{signal:new AbortController().signal})).url.endsWith('test.mp4'));
  globalThis.fetch=async()=>{calls++;return calls%2===1?Response.json({event_id:'abcdefgh12345678'}):new Response('event: error\ndata: null\n\n');};
  await assert.rejects(generate(c,input,{signal:new AbortController().signal}),/kein Video erstellt/);
 }finally{globalThis.fetch=original;}
});
test('quota failure stops auto routing, without trying other shared-pool models',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response('quota exceeded',{status:429});};await assert.rejects(chooseConnection('auto',new AbortController().signal),/429/);assert.equal(calls,1);assert.equal(classifyError(new Error('HTTP 429')).kind,'quota');}finally{globalThis.fetch=original;}
});
test('changed provider schema is rejected before generation',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json({named_endpoints:{'/generate_video':{parameters:[{parameter_name:'unexpected'}]}}});};await assert.rejects(chooseConnection('ltx23',new AbortController().signal),/keine passende/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
