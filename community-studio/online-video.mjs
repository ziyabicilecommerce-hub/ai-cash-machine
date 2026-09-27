const el=id=>document.getElementById(id);
let products=[],loadId=0;
async function loadProducts(){
 const token=++loadId,desk=el('brand').value==='deskrebel';
 el('onlineProduct').disabled=true;el('onlineCopy').disabled=true;el('onlinePrompt').value='';
 try{
 const response=await fetch(desk?'products-deskrebel.json':'products.json');
 if(!response.ok)throw new Error();
 const data=await response.json();if(token!==loadId)return;products=data;
 el('onlineProduct').replaceChildren(...products.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.title;return o;}));
 el('onlineProduct').disabled=false;el('onlineCopy').disabled=false;el('onlineStatus').textContent='';makePrompt();
 }catch{if(token===loadId){el('onlineProduct').replaceChildren(new Option('Produktdaten nicht verfügbar',''));el('onlineStatus').textContent='Produktdaten konnten nicht geladen werden. Du kannst eine eigene Beschreibung eingeben.';el('onlineCopy').disabled=false;}}
}
function makePrompt(){
 const p=products.find(p=>String(p.id)===el('onlineProduct').value);if(!p)return;
 const brand=el('brand').value==='deskrebel'?'DeskRebel':'Purivelle';
 el('onlinePrompt').value='Vertical 9:16 realistic lifestyle product video for '+brand+'. Product: '+p.title+'. A fictional adult creator demonstrates one simple everyday use naturally. Warm daylight, handheld smartphone camera, believable movement, close-up on the product, clean cinematic finish. Preserve the exact product appearance when a reference image is supplied. No invented features, testimonials, medical claims, logos or on-screen text. Use the selected free model duration.';
}
el('onlineProduct').addEventListener('change',makePrompt);
el('brand').addEventListener('change',loadProducts);
el('onlineCopy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(el('onlinePrompt').value);el('onlineStatus').textContent='Beschreibung kopiert. Im Generator einfügen und dort starten.';}
 catch{el('onlinePrompt').focus();el('onlinePrompt').select();el('onlineStatus').textContent='Beschreibung markiert. Bitte mit Kopieren übernehmen.';}
});
el('onlineWan').addEventListener('click',()=>{
 el('onlineEmbed').hidden=false;
 if(!el('onlineFrame').getAttribute('src'))el('onlineFrame').src='https://wan2.video/generator.html?embed=1&lang=en&model=wan-2-2-fast';
 el('onlineEmbed').scrollIntoView({behavior:'smooth',block:'start'});
});
el('onlineClose').addEventListener('click',()=>{el('onlineEmbed').hidden=true;el('onlineWan').focus();});
loadProducts();
