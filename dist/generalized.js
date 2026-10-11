/* Generalized tiles: immutable atomic encodings, no rotations or reflections. */
const GeneralizedTiles=(()=>{
 const unique=tiles=>[...new Map(tiles.map(t=>[JSON.stringify(t),t])).values()];
 const ordered=(ids,g)=>[...ids].sort((a,b)=>{
  const p=cellAt(a,g).center,q=cellAt(b,g).center;
  return Math.round(p[1]*1e5)-Math.round(q[1]*1e5)||Math.round(q[0]*1e5)-Math.round(p[0]*1e5)||a.localeCompare(b);
 });
 function shades(base,n,palette){
  if(!/^#[0-9a-f]{6}$/i.test(base))throw Error('Colore base non valido.');
  if(palette.length+n>128)throw Error('Le sfumature superano il limite di 128 colori del progetto.');
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
  if(!Array.isArray(ids)||!ids.length||ids.length>32)throw Error('Una generalizzata può contenere da 1 a 32 celle.');
  const region=regionBoundary(ids,g),claims=new Map();
  for(const id of ids)cellAt(id,g).edges.forEach((k,side)=>{
   if(!claims.has(k))claims.set(k,[]);claims.get(k).push({id,side});
  });
  return{region,claims};
 }
 // Independent finite-region enumeration: no prefilled cells and no expected
 // assignment used as a constraint. Stop at a second solution or a work bound.
 function countSolutions(ids,g,borders,atoms){
  const {claims}=topology(ids,g),ts=unique(atoms),assigned=new Map();
  const domains=new Map(ids.map(id=>[id,ts.filter(t=>cellAt(id,g).edges.every((k,s)=>!Object.hasOwn(borders,k)||borders[k]===t[s]))]));
  let count=0,work=0;
  function visit(){
   if(++work>100000)throw Error('Verifica di unicità inconcludente: limite di lavoro raggiunto.');
   if(assigned.size===ids.length){count++;return;}
   let best,choices;
   for(const id of ids){
    if(assigned.has(id))continue;
    const edges=cellAt(id,g).edges;
    const options=domains.get(id).filter(t=>edges.every((k,s)=>claims.get(k).every(o=>!assigned.has(o.id)||assigned.get(o.id)[o.side]===t[s])));
    if(!options.length)return;
    if(!choices||options.length<choices.length){best=id;choices=options;if(options.length===1)break;}
   }
   for(const t of choices){assigned.set(best,t);visit();assigned.delete(best);if(count>=2)return;}
  }
  visit();return count;
 }
 function compile(g,borders,palette,baseColor,name){
  const region=readTransitionRegion(g,borders,palette);
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
 return{compile,verify,validateProject,active,countSolutions,ordered};
})();
