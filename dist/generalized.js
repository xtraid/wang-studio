/* Generalized tiles: immutable atomic encodings, no rotations or reflections. */
const GeneralizedTiles=(()=>{
 const unique=tiles=>[...new Map(tiles.map(t=>[JSON.stringify(t),t])).values()];
 const ordered=(ids,g)=>[...ids].sort((a,b)=>{
  const p=cellAt(a,g).center,q=cellAt(b,g).center;
  return Math.round(p[1]*1e5)-Math.round(q[1]*1e5)||Math.round(q[0]*1e5)-Math.round(p[0]*1e5)||a.localeCompare(b);
 });
 function shades(base,n,palette){
  if(!/^#[0-9a-f]{6}$/i.test(base))throw Error('Colore base non valido.');
  if(palette.length+n>65536)throw Error('Le sfumature superano il limite di 65536 colori del progetto.');
  const rgb=base.slice(1).match(/../g).map(x=>parseInt(x,16)),end=rgb.reduce((a,b)=>a+b,0)>382?0:255;
  const used=new Set(palette.map(c=>c.toLowerCase())),out=[];
  // Walk a continuous RGB shade ramp, skipping occupied display colors.
  for(let step=0;step<=65536&&out.length<n;step++){
   const c='#'+rgb.map(v=>Math.round(v+(end-v)*step/65536).toString(16).padStart(2,'0')).join('');
   if(!used.has(c)){used.add(c);out.push(c);}
  }
  if(out.length!==n)throw Error('Sfumature disponibili insufficienti: scegli un altro colore base.');
  return out;
 }
 function topology(ids,g){
  if(!Array.isArray(ids)||!ids.length)throw Error('Una generalizzata deve contenere almeno una cella.');
  const region=regionBoundary(ids,g,Infinity),claims=new Map();
  for(const id of ids)cellAt(id,g).edges.forEach((k,side)=>{
   if(!claims.has(k))claims.set(k,[]);claims.get(k).push({id,side});
  });
  return{region,claims};
 }
 // Independent finite-region enumeration: no prefilled cells and no expected
 // assignment used as a constraint. Stop at a second solution or a work bound.
 function countSolutions(ids,g,borders,atoms){
  const {claims}=topology(ids,g),ts=unique(atoms),assigned=new Map();
  const cells=ids.map(id=>({id,edges:cellAt(id,g).edges})),unassigned=new Set(cells);
  const sideIndex=Array.from({length:cells[0].edges.length},()=>new Map());
  for(const t of ts)t.forEach((color,side)=>{
   const index=sideIndex[side];if(!index.has(color))index.set(color,[]);index.get(color).push(t);
  });
  // Interior cells share the tileset; do not allocate a tileset-sized domain
  // for every cell. Indexed boundary/assigned-neighbor colors narrow candidates.
  let domains;
  function choices(cell){
   const required=[];let candidates=domains?domains.get(cell.id):ts;
   cell.edges.forEach((key,side)=>{
    if(Object.hasOwn(borders,key))required.push([side,borders[key]]);
    for(const owner of claims.get(key))if(assigned.has(owner.id))required.push([side,assigned.get(owner.id)[owner.side]]);
   });
   if(!domains)for(const [side,color]of required){const list=sideIndex[side].get(color)||[];if(list.length<candidates.length)candidates=list;}
   return required.length?candidates.filter(t=>required.every(([side,color])=>t[side]===color)):candidates;
  }
  domains=new Map(cells.map(cell=>[cell.id,choices(cell)]));
  // Root arc consistency is independent of the generated assignment. It avoids
  // exponential dead branches on long triangular/hexagonal encodings.
  const byId=new Map(cells.map(cell=>[cell.id,cell])),queue=[...cells],queued=new Set(cells);
  for(let head=0;head<queue.length;head++){
   const cell=queue[head];queued.delete(cell);let current=domains.get(cell.id);
   for(const key of cell.edges){
    const side=cell.edges.indexOf(key);
    for(const owner of claims.get(key))if(owner.id!==cell.id){
     const support=new Set(domains.get(owner.id).map(t=>t[owner.side]));
     const kept=current.filter(t=>support.has(t[side]));
     if(kept.length!==current.length)current=kept;
    }
   }
   if(!current.length)return 0;
   if(current!==domains.get(cell.id)){
    domains.set(cell.id,current);
    for(const key of cell.edges)for(const owner of claims.get(key))if(owner.id!==cell.id){
     const neighbor=byId.get(owner.id);if(!queued.has(neighbor)){queue.push(neighbor);queued.add(neighbor);}
    }
   }
  }
  let count=0,work=0;const stack=[];
  for(;;){
   if(++work>100000)throw Error('Verifica di unicità inconcludente: limite di lavoro raggiunto.');
   if(assigned.size===ids.length){if(++count===2)return count;}
   else{
    let best,options;
    for(const cell of unassigned){
     const candidates=choices(cell);
     if(!options||candidates.length<options.length){best=cell;options=candidates;if(options.length<=1)break;}
    }
    if(options.length)stack.push({cell:best,options,next:0});
   }
   // Explicit DFS frames preserve backtracking without a JS call-stack limit.
   let advanced=false;
   while(stack.length){
    const frame=stack[stack.length-1];assigned.delete(frame.cell.id);unassigned.add(frame.cell);
    if(frame.next<frame.options.length){assigned.set(frame.cell.id,frame.options[frame.next++]);unassigned.delete(frame.cell);advanced=true;break;}
    stack.pop();
   }
   if(!advanced)return count;
  }
 }
 function compile(g,borders,palette,baseColor,name){
  const region=readTransitionRegion(g,borders,palette,Infinity);
  if(region.colors.includes(null))throw Error('Una generalizzata richiede un bordo senza jolly.');
  const ids=ordered(region.ids,g),{claims}=topology(ids,g),internal=[...claims].filter(([,v])=>v.length===2);
  const extra=shades(baseColor,internal.length,palette),nextPalette=[...palette,...extra];
  const internalColors=extra.map((_,i)=>palette.length+i),edgeColors=new Map(internal.map(([k],i)=>[k,internalColors[i]]));
  const atoms=ids.map(id=>cellAt(id,g).edges.map(k=>Object.hasOwn(borders,k)?borders[k]:edgeColors.get(k)));
  const item={name,geometry:g,enabled:true,baseColor,ids,borders:{...borders},atoms,internalColors};
  verify(item,nextPalette);
  return{item,palette:nextPalette};
 }
 function verify(item,palette){
  if(!item||typeof item.name!=='string'||!item.name.trim()||item.name.length>80||typeof item.enabled!=='boolean'||typeof item.baseColor!=='string'||!/^#[0-9a-f]{6}$/i.test(item.baseColor))throw Error('Generalizzata non valida.');
  const {region,claims}=topology(item.ids,item.geometry),valid=n=>Number.isInteger(n)&&n>=0&&n<palette.length;
  if(!item.borders||Object.keys(item.borders).length!==region.boundary.length||region.boundary.some(e=>!Object.hasOwn(item.borders,e.key)||!valid(item.borders[e.key])))throw Error('Bordo della generalizzata non valido o con jolly.');
  if(!Array.isArray(item.atoms)||item.atoms.length!==item.ids.length||item.atoms.some(t=>!Array.isArray(t)||t.length!==region.s||!t.every(valid)))throw Error('Atomiche della generalizzata non valide.');
  if(!Array.isArray(item.internalColors)||!item.internalColors.every(valid)||new Set(item.internalColors).size!==region.a||item.internalColors.length!==region.a)throw Error('Colori interni non esclusivi.');
  const reserved=new Set(item.internalColors),used=new Set(),byId=new Map(item.ids.map((id,i)=>[id,item.atoms[i]]));
  if(Object.values(item.borders).some(c=>reserved.has(c)))throw Error('Un colore interno compare sul bordo esterno.');
  for(const [k,owners]of claims){
   const c=byId.get(owners[0].id)[owners[0].side];
   if(owners.length===1){if(c!==item.borders[k])throw Error('Colore del bordo alterato.');}
   else{
    if(!reserved.has(c)||used.has(c)||c!==byId.get(owners[1].id)[owners[1].side])throw Error('Adiacenza interna non esclusiva o incompatibile.');
    used.add(c);
   }
  }
  if(countSolutions(item.ids,item.geometry,item.borders,item.atoms)!==1)throw Error('La generalizzata non ha esattamente una tassellazione.');
  return item;
 }
 function validateProject(data){
  const mode=data.tilesetMode??'atomic',items=data.generalizedTiles??[];
  if(!['atomic','generalized'].includes(mode)||!Array.isArray(items)||items.length>100)throw Error('Catalogo generalizzato non valido (massimo 100 elementi).');
  const ids=new Set(),privateColors=new Set();
  for(const item of items){
   if(typeof item.id!=='string'||!/^g-[0-9]+$/.test(item.id)||ids.has(item.id))throw Error('Identità della generalizzata non valida.');
   ids.add(item.id);verify(item,data.palette);
   for(const c of item.internalColors){if(privateColors.has(c))throw Error('Colore interno condiviso fra generalizzate.');privateColors.add(c);}
  }
  if(items.some(t=>Object.values(t.borders).some(c=>privateColors.has(c))))throw Error('Il bordo usa un colore riservato all’interno di una generalizzata.');
  return{tilesetMode:mode,generalizedTiles:items};
 }
 function active(data,g){return unique((data.generalizedTiles||[]).filter(t=>t.enabled&&t.geometry===g).flatMap(t=>t.atoms));}
 const guarded=fn=>(...args)=>{
  try{return fn(...args);}catch(error){
   if(error instanceof RangeError)throw Error('Risorse di memoria insufficienti per la generalizzata.',{cause:error});
   throw error;
  }
 };
 return{compile:guarded(compile),verify:guarded(verify),validateProject:guarded(validateProject),active:guarded(active),countSolutions:guarded(countSolutions),ordered};
})();
