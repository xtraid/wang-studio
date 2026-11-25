/* The catalog owns generated atoms; ordinary state.sets stay independent. */
const validateWithoutGeneralized=validate;
validate=function(data){
 const next=validateWithoutGeneralized(data);
 return{...next,...GeneralizedTiles.validateProject(data)};
};
const renderWithoutGeneralized=renderUI;
renderUI=function(){renderWithoutGeneralized();renderGeneralized();};
function setTilesetMode(value){
 if(value===(state.tilesetMode??'atomic'))return;
 snapshot();state.tilesetMode=value;
 if(activeSolve)cancelSolve();
 if(mode==='place')setMode('select');
 renderUI();draw();
 message(value==='generalized'?'Tileset generalizzato: il solver usa soltanto le atomiche delle generalizzate abilitate per questa geometria.':'Tileset atomico: il solver usa soltanto le tessere ordinarie.');
}
function createGeneralized(){
 try{
  if(activeSolve)throw Error('Interrompi la ricerca prima di creare una generalizzata.');
  const borders=Object.fromEntries([...regionSelection.borders].filter(k=>Object.hasOwn(board().borders,k)).map(k=>[k,board().borders[k]]));
  if(!Object.keys(borders).length)throw Error('Seleziona il bordo completo della regione con Seleziona regione.');
  const items=state.generalizedTiles||[],name=$('#generalizedName').value.trim()||`Generalizzata ${items.length+1}`;
  const plan=GeneralizedTiles.compile(state.geometry,borders,state.palette,$('#generalizedColor').value,name);
  let n=1;while(items.some(t=>t.id===`g-${n}`))n++;plan.item.id=`g-${n}`;
  const next={...state,palette:plan.palette,generalizedTiles:[...items,plan.item],tilesetMode:'generalized'};
  GeneralizedTiles.validateProject(next);
  commitProject(next);
  message(`${name}: creata e verificata, esattamente una tassellazione con le proprie ${plan.item.atoms.length} atomiche. La griglia è rimasta invariata.`);
  return true;
 }catch(error){message('Generalizzata non creata: '+projectError(error));return false;}
}
function generalizedPreview(item){
 const polys=item.ids.map(id=>cellAt(id,item.geometry).p);
 let x=Infinity,y=Infinity,x1=-Infinity,y1=-Infinity;
 for(const poly of polys)for(const [px,py]of poly){x=Math.min(x,px);y=Math.min(y,py);x1=Math.max(x1,px);y1=Math.max(y1,py);}
 const w=x1-x,h=y1-y;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox',`${x-.12} ${y-.12} ${w+.24} ${h+.24}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`Anteprima di ${item.name}`);
 svg.innerHTML=polys.map((poly,i)=>{
  const center=cellAt(item.ids[i],item.geometry).center;
  return poly.map((p,s)=>`<polygon points="${[center,p,poly[(s+1)%poly.length]].map(v=>v.join(',')).join(' ')}" fill="${state.palette[item.atoms[i][s]]}" stroke="#172019" stroke-width=".02"/>`).join('');
 }).join('');return svg;
}
function renderGeneralized(){
 const generalized=state.tilesetMode==='generalized';
 $$('[data-mode="place"]').forEach(b=>b.disabled=generalized);
 if(generalized&&mode==='place')setMode('select');
 $('#atomicTilesPanel').hidden=generalized;$('#generalizedTilesPanel').hidden=!generalized;
 $('#atomicTab').setAttribute('aria-pressed',!generalized);$('#generalizedTab').setAttribute('aria-pressed',generalized);
 $('#solverTilesetLabel').textContent=generalized?'Generalizzato · sole atomiche generate':'Atomico · sole tessere ordinarie';
 const list=$('#generalizedList');list.replaceChildren();
 const items=state.generalizedTiles||[];
 for(const item of items){
  const card=document.createElement('article');card.className='generalized-card';
  const title=document.createElement('h3');title.textContent=item.name;card.append(title,generalizedPreview(item));
  const label=document.createElement('label');label.className='check-row';
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=item.enabled;
  enabled.onchange=()=>{snapshot();item.enabled=enabled.checked;if(activeSolve)cancelSolve();renderUI();draw();};
  label.append(enabled,document.createTextNode('Abilitata · '+item.geometry));card.append(label);
  const info=document.createElement('p');info.className='hint';info.textContent=`${item.atoms.length} atomiche · ${item.internalColors.length} colori interni · unica con le proprie atomiche${item.geometry!==state.geometry?' · altra geometria':''}`;card.append(info);
  const details=document.createElement('details'),summary=document.createElement('summary'),atoms=document.createElement('div');
  summary.textContent='Atomiche associate (sola lettura)';atoms.className='generalized-atoms';
  item.atoms.forEach((t,i)=>{
   const row=document.createElement('div');row.textContent=`${i+1}. `;row.title=`Cella ${item.ids[i]}`;
   t.forEach(c=>{const swatch=document.createElement('span');swatch.style.background=state.palette[c];swatch.textContent=String(c+1);swatch.title=`Colore ${c+1} · ${state.palette[c]}`;row.append(swatch);});atoms.append(row);
  });details.append(summary,atoms);card.append(details);
  const remove=document.createElement('button');remove.className='subtle';remove.textContent='Elimina generalizzata';
  remove.onclick=()=>{snapshot();state.generalizedTiles=state.generalizedTiles.filter(t=>t.id!==item.id);if(activeSolve)cancelSolve();renderUI();draw();message('Generalizzata e atomiche associate rimosse dal catalogo. Palette e griglia conservate; puoi annullare.');};card.append(remove);list.append(card);
 }
 const active=GeneralizedTiles.active(state,state.geometry),used=new Set(active.flat());
 $('#generalizedSummary').textContent=`${items.length} generalizzate salvate · ${active.length} tipi atomici attivi · ${used.size} colori usati (più eventuali vincoli della regione).`;
}
$('#atomicTab').onclick=()=>setTilesetMode('atomic');
$('#generalizedTab').onclick=()=>setTilesetMode('generalized');
$('#createGeneralized').onclick=createGeneralized;
renderGeneralized();
