/* Candidate generation is separate from the invariant certificate.
 * Raster samples accelerate discovery; exhaustive finite lattice animals and
 * labelled partitions run alongside them. Neither generator may relax a port.
 */
const TransitionSearch=(()=>{
 const radii={square:Math.SQRT1_2,'tri-up':1/Math.sqrt(3),'tri-side':1/Math.sqrt(3),'hex-flat':1,'hex-point':1};
 // Provenance is only a source of candidates: every seed is independently
 // certified. In particular, returning to the initial lattice need not rasterize
 // an already enlarged realization again.
 function* seeds(source,target){
  const family=g=>g?.split('-')[0];
  if(family(source.geometry)===family(target))yield{ids:source.region.ids,cellUnits:source.cellUnits,method:'same-lattice'};
  const units=source.graph.units;
  if(units.every(u=>family(u.sourceGeometry)===family(target))){
   const ids=units.map(u=>u.sourceCell);
   yield{ids,cellUnits:Object.fromEntries(ids.map((id,u)=>[id,u])),method:'original-lattice'};
  }
  if(target.startsWith('tri')&&units.every(u=>u.sourceGeometry==='square')){
   const ids=[],cellUnits={};
   units.forEach((unit,u)=>{for(const h of [0,1]){const id=`${unit.sourceCell},${h}`;ids.push(id);cellUnits[id]=u;}});
   yield{ids,cellUnits,method:'square-rhombi'};
  }
 }
 // A local descent, not an optimality proof. Remove exposed atoms only when
 // area error strictly improves; the full certificate guards each removal.
 function* shrink(candidate,source,target,bounds){
  let current=candidate;
  while(current.region.n>bounds.min&&current.region.n>source.metrics.area/(current.metrics.area/current.metrics.n)){
   let improved=false;
   const exposed=new Set(current.region.boundary.map(e=>e.key));
   for(const id of current.region.ids.filter(id=>cellAt(id,target).edges.some(k=>exposed.has(k)))){
    yield null;
    const ids=current.region.ids.filter(other=>other!==id),cellUnits={...current.cellUnits};delete cellUnits[id];
    let next;try{next=LogicalTransition.certificate(ids,target,source.graph,cellUnits);}catch{continue;}
    if(TransitionObjectives.compareAreaError(source.metrics,next.metrics,current.metrics)>=0)continue;
    current=next;improved=true;yield{ids,cellUnits,method:'certified-area-descent'};break;
   }
   if(!improved)return;
  }
 }
 function* raster(source,target,bounds){
  const sourceCells=new Set(source.region.ids);
  const atom=cellAt(target.startsWith('tri')?'0,0,0':'0,0',target);
  const ideal=source.metrics.area/TransitionObjectives.metrics({n:1,s:atom.p.length,a:0,boundary:atom.edges}).area;
  const lo=Math.sqrt(bounds.min/ideal),hi=Math.sqrt(Math.min(bounds.max,transitionLimit)/ideal);
  const factors=[Math.max(lo,Math.min(hi,1)),lo,hi,...[.25,.5,.75].map(t=>lo+(hi-lo)*t)];
  for(const factor of new Set(factors))for(const phase of [[0,0],[.25,.25],[-.25,.25],[.5,0],[0,.5],[.5,.5]]){
   const ratio=radii[target]/radii[source.geometry]*factor;
   let i0=Infinity,j0=Infinity,i1=-Infinity,j1=-Infinity;
   for(const edge of source.region.boundary)for(const[x,y]of borderPoints(edge.key)){
    const[i,j]=lattice([x*ratio+phase[0],y*ratio+phase[1]],target);i0=Math.min(i0,i);j0=Math.min(j0,j);i1=Math.max(i1,i);j1=Math.max(j1,j);
   }
   const ids=[],cellUnits={};let tooLarge=false;
   for(let j=Math.floor(j0)-1;j<=Math.ceil(j1)+1&&!tooLarge;j++)for(let i=Math.floor(i0)-1;i<=Math.ceil(i1)+1&&!tooLarge;i++)for(let h=0;h<(target.startsWith('tri')?2:1);h++){
    yield null;
    const id=target.startsWith('tri')?`${i},${j},${h}`:`${i},${j}`,c=cellAt(id,target);
    const point=c.center.map((v,d)=>(v-phase[d])/ratio);
    const owner=nearbyCells(point,source.geometry).find(c=>sourceCells.has(c.id)&&inside(point,c.p));
    if(owner){ids.push(id);cellUnits[id]=source.cellUnits[owner.id];}
    if(ids.length>Math.min(bounds.max,transitionLimit)){tooLarge=true;break;}
   }
   if(tooLarge)yield ids.length>bounds.max?{prunedArea:true}:{resourceLimit:'Campione oltre il limite operativo dell’editor; spazio ammissibile non esaurito.'};
   if(ids.length&&!tooLarge)yield{ids,cellUnits,method:'geometric-sample'};
  }
 }
 function canonical(ids){
  let x=Infinity,y=Infinity;const coordinates=ids.map(id=>id.split(',').map(Number));
  for(const p of coordinates){x=Math.min(x,p[0]);y=Math.min(y,p[1]);}
  return coordinates.map(([i,j,h])=>h===undefined?`${i-x},${j-y}`:`${i-x},${j-y},${h}`).sort();
 }
 function* partitions(ids,target,graph,bounds){
  if(ids.length<bounds.min||ids.length>bounds.max)return;
  let region;try{region=regionBoundary(ids,target);}catch{return;}
  if(region.boundary.length<graph.boundary.length)return;
  const count=graph.units.length,labels=Array(ids.length).fill(-1),next=Array(ids.length).fill(0),uses=Array(count).fill(0);
  const index=new Map(ids.map((id,i)=>[id,i])),outside=new Set(region.boundary.map(e=>e.key));
  const neighbors=ids.map(id=>[...cellNeighbors(cellAt(id,target),target).values()].map(id=>index.get(id)).filter(i=>i!==undefined));
  const hasBoundary=ids.map(id=>cellAt(id,target).edges.some(k=>outside.has(k)));
  const contacts=graph.units.map(u=>new Set(u.ports.filter(p=>p.kind==='contact').map(p=>p.unit))),boundaryCounts=graph.units.map(u=>u.ports.filter(p=>p.kind==='boundary').length);
  const minimum=graph.units.map(u=>Math.max(1,Math.ceil((u.ports.length-2)/(region.s-2))));
  let i=0,used=0;
  while(i>=0){
   yield null;
   if(next[i]===count){next[i]=0;i--;if(i>=0){if(--uses[labels[i]]===0)used--;labels[i]=-1;}continue;}
   const u=next[i]++;
   if(hasBoundary[i]&&!boundaryCounts[u])continue;
   if(neighbors[i].some(j=>labels[j]>=0&&labels[j]!==u&&!contacts[u].has(labels[j])))continue;
   if(ids.length===count&&(uses[u]||neighbors[i].length!==contacts[u].size||cellAt(ids[i],target).p.length-neighbors[i].length<boundaryCounts[u]))continue;
   const newUnit=uses[u]===0;
   if(count-used-(newUnit?1:0)>ids.length-i-1)continue;
   const deficit=minimum.reduce((total,m,v)=>total+Math.max(0,m-uses[v]-(v===u?1:0)),0);
   if(deficit>ids.length-i-1)continue;
   labels[i]=u;uses[u]++;if(newUnit)used++;
   if(i===ids.length-1){
    if(used===count)yield{ids,cellUnits:Object.fromEntries(ids.map((id,k)=>[id,labels[k]])),method:'enumeration'};
    if(--uses[u]===0)used--;labels[i]=-1;
   }else{i++;next[i]=0;}
  }
 }
 function* animals(source,target,bounds){
  let layer=target.startsWith('tri')?[['0,0,0'],['0,0,1']]:[['0,0']];
  for(let n=1;n<=Math.min(bounds.max,transitionLimit);n++){
   const next=new Map();
   for(const ids of layer){
    yield*partitions(ids,target,source.graph,bounds);
    if(n===Math.min(bounds.max,transitionLimit))continue;
    const occupied=new Set(ids),fringe=new Set();
    for(const id of ids){yield null;for(const other of cellNeighbors(cellAt(id,target),target).values())if(!occupied.has(other))fringe.add(other);}
    for(const id of fringe){
     yield null;const child=canonical([...ids,id]),key=child.join(';');next.set(key,child);
     if(next.size>20000)throw Error('Budget di memoria della ricerca esaurito (20000 forme in attesa).');
    }
   }
   layer=[...next.values()];
  }
  if(bounds.max>transitionLimit)throw Error('Limite operativo dell’editor raggiunto; spazio matematico non esaurito.');
 }
 function create(source,target,options={}){
  const maxAreaPercent=options.maxAreaPercent??30;
  TransitionObjectives.withinAreaPercent(source.metrics,source.metrics,maxAreaPercent);
  transitionGeometry(target);
  const sides=target.startsWith('tri')?3:target==='square'?4:6;
  const areaRange=TransitionObjectives.cellRange(source.metrics,sides,maxAreaPercent),portMinimum=TransitionObjectives.minimumCells(source.graph,sides);
  const bounds={min:Math.max(areaRange.min,portMinimum),max:areaRange.max};
  const impossible=LogicalTransition.obstruction(source.graph,target)||(bounds.min>bounds.max?{kind:'area-cell-count',areaRange,portMinimum,message:areaRange.min>areaRange.max?`Nessun numero intero positivo di celle rispetta la tolleranza ±${maxAreaPercent}%.`:`La tolleranza permette al massimo ${bounds.max} celle; le interfacce logiche ne richiedono almeno ${portMinimum}. Non realizzabile entro questa tolleranza.`}:null);
  const state={source,target,frontier:[],examined:0,accepted:0,rejectedArea:0,prunedArea:0,bounds,areaRange,portMinimum,maxAreaPercent,work:0,status:impossible?'unrealizable':'running',reason:impossible?.message||'',proof:impossible};
  if(impossible)return{state,step:()=>state};
  if(bounds.min>transitionLimit){state.status='incomplete';state.reason=`Almeno ${bounds.min} celle richieste: limite operativo di ${transitionLimit} celle superato. Nessuna impossibilità matematica dimostrata.`;return{state,step:()=>state};}
  const iterators=[seeds(source,target),raster(source,target,bounds),animals(source,target,bounds)],done=[false,false,false];let turn=0,refinement=null,refinedError=null;
  const seen=new Set();
  function accept(value){
   if(value.resourceLimit){state.reason=value.resourceLimit;return;}
   if(value.prunedArea){state.prunedArea++;return;}
   state.examined++;
   if(value.ids.length<bounds.min||value.ids.length>bounds.max){
    // Direct embeddings are independently certifiable without a shape
    // search. Count a valid but inadmissible one separately from unverified
    // raster proposals pruned by cardinality; never expand it.
    if(['original-lattice','square-rhombi','same-lattice'].includes(value.method)&&value.ids.length<=transitionLimit){
     try{LogicalTransition.certificate(value.ids,target,source.graph,value.cellUnits);state.rejectedArea++;return;}catch{}
    }
    state.prunedArea++;return;
   }
   let proof;try{proof=LogicalTransition.certificate(value.ids,target,source.graph,value.cellUnits);}catch{return;}
   const signature=JSON.stringify([value.ids,value.cellUnits]);if(seen.has(signature))return;seen.add(signature);
   const candidate={...proof,method:value.method};
   if(value.method!=='certified-area-descent'&&(!refinedError||TransitionObjectives.compareAreaError(source.metrics,proof.metrics,refinedError)<0)){
    refinement=shrink(candidate,source,target,bounds);refinedError=proof.metrics;
   }
   if(!TransitionObjectives.withinAreaPercent(source.metrics,proof.metrics,maxAreaPercent)){state.rejectedArea++;return;}
   state.accepted++;
   if(state.frontier.some(p=>TransitionObjectives.dominates(source.metrics,p.metrics,candidate.metrics)))return;
   // One representative per equal objective pair; no scalar weighted score.
   if(state.frontier.some(p=>TransitionObjectives.compareAreaError(source.metrics,p.metrics,candidate.metrics)===0&&TransitionObjectives.compareEta(p.metrics,candidate.metrics)===0))return;
   state.frontier=state.frontier.filter(p=>!TransitionObjectives.dominates(source.metrics,candidate.metrics,p.metrics));state.frontier.push(candidate);
   state.frontier.sort((a,b)=>TransitionObjectives.compareAreaError(source.metrics,a.metrics,b.metrics)||-TransitionObjectives.compareEta(a.metrics,b.metrics));
  }
  if(source.geometry===target)accept({ids:source.region.ids,cellUnits:source.cellUnits,method:'identity'});
  function step(budget=50){
   if(state.status!=='running')return state;
   for(let k=0;k<budget;k++){
    if(refinement&&(done.every(Boolean)||turn++%2===0)){
     const result=refinement.next();state.work++;if(result.done)refinement=null;else if(result.value)accept(result.value);continue;
    }
    if(done.every(Boolean)){state.status='incomplete';state.reason||='Campioni terminati; ottimo globale non certificato.';break;}
    let index=turn++%iterators.length;while(done[index])index=(index+1)%iterators.length;
    try{const result=iterators[index].next();state.work++;if(result.done)done[index]=true;else if(result.value)accept(result.value);}
    catch(error){done[index]=true;state.reason=error.message;}
   }
   return state;
  }
  return{state,step};
 }
 return{create};
})();
