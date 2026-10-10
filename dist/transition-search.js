/* Candidate generation is separate from the invariant certificate.
 * Raster samples accelerate discovery; exhaustive finite lattice animals and
 * labelled partitions run alongside them. Neither generator may relax a port.
 */
const TransitionSearch=(()=>{
 const radii={square:Math.SQRT1_2,'tri-up':1/Math.sqrt(3),'tri-side':1/Math.sqrt(3),'hex-flat':1,'hex-point':1};
 function* raster(source,target){
  const sourceCells=new Set(source.region.ids);
  for(const factor of [1,1.25,.8,1.5,2,3,4,6,8,12])for(const phase of [[0,0],[.25,.25],[-.25,.25]]){
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
    if(ids.length>transitionLimit){tooLarge=true;break;}
   }
   if(ids.length&&!tooLarge)yield{ids,cellUnits,method:'geometric-sample'};
  }
 }
 function canonical(ids){
  let x=Infinity,y=Infinity;const coordinates=ids.map(id=>id.split(',').map(Number));
  for(const p of coordinates){x=Math.min(x,p[0]);y=Math.min(y,p[1]);}
  return coordinates.map(([i,j,h])=>h===undefined?`${i-x},${j-y}`:`${i-x},${j-y},${h}`).sort();
 }
 function* partitions(ids,target,graph){
  if(ids.length<graph.units.length)return;
  let region;try{region=regionBoundary(ids,target);}catch{return;}
  if(region.boundary.length<graph.boundary.length)return;
  const count=graph.units.length,labels=Array(ids.length).fill(-1),next=Array(ids.length).fill(0),uses=Array(count).fill(0);
  const index=new Map(ids.map((id,i)=>[id,i])),outside=new Set(region.boundary.map(e=>e.key));
  const neighbors=ids.map(id=>[...cellNeighbors(cellAt(id,target),target).values()].map(id=>index.get(id)).filter(i=>i!==undefined));
  const hasBoundary=ids.map(id=>cellAt(id,target).edges.some(k=>outside.has(k)));
  const contacts=graph.units.map(u=>new Set(u.ports.filter(p=>p.kind==='contact').map(p=>p.unit))),boundaryCounts=graph.units.map(u=>u.ports.filter(p=>p.kind==='boundary').length);
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
   labels[i]=u;uses[u]++;if(newUnit)used++;
   if(i===ids.length-1){
    if(used===count)yield{ids,cellUnits:Object.fromEntries(ids.map((id,k)=>[id,labels[k]])),method:'enumeration'};
    if(--uses[u]===0)used--;labels[i]=-1;
   }else{i++;next[i]=0;}
  }
 }
 function* animals(source,target){
  let layer=target.startsWith('tri')?[['0,0,0'],['0,0,1']]:[['0,0']];
  for(let n=1;n<=transitionLimit;n++){
   const next=new Map();
   for(const ids of layer){
    yield*partitions(ids,target,source.graph);
    const occupied=new Set(ids),fringe=new Set();
    for(const id of ids){yield null;for(const other of cellNeighbors(cellAt(id,target),target).values())if(!occupied.has(other))fringe.add(other);}
    for(const id of fringe){
     yield null;const child=canonical([...ids,id]),key=child.join(';');next.set(key,child);
     if(next.size>20000)throw Error('Budget di memoria della ricerca esaurito (20000 forme in attesa).');
    }
   }
   layer=[...next.values()];
  }
  throw Error('Limite operativo dell’editor raggiunto; spazio matematico non esaurito.');
 }
 function create(source,target){
  transitionGeometry(target);
  const impossible=LogicalTransition.obstruction(source.graph,target);
  const state={source,target,frontier:[],examined:0,accepted:0,work:0,status:impossible?'unrealizable':'running',reason:impossible?.message||'',proof:impossible};
  if(impossible)return{state,step:()=>state};
  const iterators=[raster(source,target),animals(source,target)],done=[false,false];let turn=0;
  const seen=new Set();
  function accept(value){
   state.examined++;
   let proof;try{proof=LogicalTransition.certificate(value.ids,target,source.graph,value.cellUnits);}catch{return;}
   const signature=JSON.stringify([value.ids,value.cellUnits]);if(seen.has(signature))return;seen.add(signature);state.accepted++;
   const candidate={...proof,method:value.method};
   if(state.frontier.some(p=>TransitionObjectives.dominates(source.metrics,p.metrics,candidate.metrics)))return;
   // One representative per equal objective pair; no scalar weighted score.
   if(state.frontier.some(p=>TransitionObjectives.compareAreaError(source.metrics,p.metrics,candidate.metrics)===0&&TransitionObjectives.compareEta(p.metrics,candidate.metrics)===0))return;
   state.frontier=state.frontier.filter(p=>!TransitionObjectives.dominates(source.metrics,candidate.metrics,p.metrics));state.frontier.push(candidate);
  }
  if(source.geometry===target)accept({ids:source.region.ids,cellUnits:source.cellUnits,method:'identity'});
  function step(budget=50){
   if(state.status!=='running')return state;
   for(let k=0;k<budget;k++){
    if(done.every(Boolean)){state.status='incomplete';state.reason||='Campioni terminati; ottimo globale non certificato.';break;}
    let index=turn++%2;if(done[index])index=1-index;
    try{const result=iterators[index].next();state.work++;if(result.done)done[index]=true;else if(result.value)accept(result.value);}
    catch(error){done[index]=true;state.reason=error.message;}
   }
   return state;
  }
  return{state,step};
 }
 return{create};
})();
