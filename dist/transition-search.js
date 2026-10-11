/* Region generators propose unlabelled lattice sets. Only the independent
 * boundary/area/ratio verifier can admit a realization to the Pareto front. */
const TransitionSearch=(()=>{
 const compareText=(a,b)=>a<b?-1:a>b?1:0;
 function canonical(ids){
  let x=Infinity,y=Infinity;const coordinates=ids.map(id=>id.split(',').map(Number));
  for(const p of coordinates){x=Math.min(x,p[0]);y=Math.min(y,p[1]);}
  return coordinates.map(([i,j,h])=>h===undefined?`${i-x},${j-y}`:`${i-x},${j-y},${h}`).sort();
 }
 // Deterministic growth supplies useful large candidates before enumeration
 // reaches their size. Anisotropic variants explore different boundary ratios;
 // these scores are discovery heuristics, never acceptance criteria.
 function* growth(target,bounds,variant){
  const ids=[target.startsWith('tri')?'0,0,0':'0,0'],occupied=new Set(ids),fringe=new Map();
  const weights=[[1,1],[1,2],[2,1],[1,4],[4,1],[1,12],[12,1],[0,1],[1,0]];
  const[wx,wy]=weights[variant];
  const add=id=>{for(const neighbor of cellNeighbors(cellAt(id,target),target).values())if(!occupied.has(neighbor))fringe.set(neighbor,(fringe.get(neighbor)||0)+1);};
  add(ids[0]);
  for(let n=1;n<=Math.min(bounds.max,transitionLimit);n++){
   if(n>=bounds.min)yield{ids:canonical(ids),method:'deterministic-growth'};
   if(n===Math.min(bounds.max,transitionLimit))break;
   let best=null,score=Infinity;
   for(const[id,contacts]of fringe){
    yield null;
    const[x,y]=cellAt(id,target).center;
    const value=wx*x*x+wy*y*y-(variant<3?contacts*.1:0);
    if(value<score||(value===score&&(best===null||id<best))){best=id;score=value;}
   }
   if(best===null)return;
   fringe.delete(best);ids.push(best);occupied.add(best);add(best);
  }
 }
 // Fixed reference placement permits caching each candidate cell's field cost.
 // Final comparison independently translates the complete candidate's centroid.
 function* guided(target,bounds,reference,variant){
  const seed=target.startsWith('tri')?'0,0,0':'0,0',f=TransitionShape.scale(target);
  const anchor=reference.polygons[variant?reference.polygons.length-1:0].reduce((a,p)=>a.map((v,j)=>v+p[j]/reference.polygons[0].length),[0,0]);
  const offset=cellAt(seed,target).center.map((v,j)=>v*f-anchor[j]);
  const ids=[seed],occupied=new Set(ids),fringe=new Set(),cache=new Map();
  const add=id=>{for(const other of cellNeighbors(cellAt(id,target),target).values())if(!occupied.has(other))fringe.add(other);};add(seed);
  for(let n=1;n<=Math.min(bounds.max,transitionLimit);n++){
   if(n>=bounds.min)yield{ids:canonical(ids),method:'continuous-field-growth'};
   if(n===Math.min(bounds.max,transitionLimit))return;
   let best=null,score=Infinity;
   for(const id of fringe){
    yield null;
    if(!cache.has(id)){
     if(cache.size>=40000)return; // independent, bounded heuristic cache
     cache.set(id,TransitionShape.cellCost(reference,id,target,offset));
    }
    const value=cache.get(id);
    if(value<score||(value===score&&(best===null||id<best))){score=value;best=id;}
   }
   if(best===null)return;
   fringe.delete(best);occupied.add(best);ids.push(best);add(best);
  }
 }
 function* animals(target,bounds){
  let layer=target.startsWith('tri')?[['0,0,0'],['0,0,1']]:[['0,0']];
  for(let n=1;n<=Math.min(bounds.max,transitionLimit);n++){
   const next=new Map();let queuedCells=0;
   for(const ids of layer){
    if(n>=bounds.min)yield{ids,method:'enumeration'};
    if(n===Math.min(bounds.max,transitionLimit))continue;
    const occupied=new Set(ids),fringe=new Set();
    for(const id of ids){yield null;for(const other of cellNeighbors(cellAt(id,target),target).values())if(!occupied.has(other))fringe.add(other);}
    for(const id of fringe){
     yield null;const child=canonical([...ids,id]),signature=child.join(';');
     if(!next.has(signature)){
      if(queuedCells+child.length>200000)throw Error('Budget di memoria raggiunto (200000 celle nelle forme in attesa): ricerca incompleta.');
      next.set(signature,child);queuedCells+=child.length;
     }
     if(next.size>20000)throw Error('Budget di memoria raggiunto (20000 forme in attesa): ricerca incompleta.');
    }
   }
   layer=[...next.values()];
  }
 }
 function create(source,target,options={}){
  const settings={maxAreaPercent:options.maxAreaPercent??30,maxRatioPercent:options.maxRatioPercent??50,...TransitionShape.settings(options)};
  const shapeActive=!!(settings.shapePreference||settings.shapeConstraint),reference=shapeActive?TransitionShape.forSource(source,settings.shapeBandPercent):null;
  TransitionObjectives.withinAreaPercent(source.metrics,source.metrics,settings.maxAreaPercent);
  TransitionObjectives.withinRatioPercent(source.metrics,source.metrics,settings.maxRatioPercent);
  transitionGeometry(target);
  const sides=target.startsWith('tri')?3:target==='square'?4:6;
  const bounds=TransitionObjectives.cellRange(source.metrics,sides,settings.maxAreaPercent);
  const proof=bounds.min>bounds.max?{kind:'area-cell-count',areaRange:bounds,message:`Nessun numero intero positivo di celle rispetta la tolleranza ±${settings.maxAreaPercent}%.`}:null;
  const state={source,target,...settings,bounds,frontier:[],examined:0,accepted:0,rejectedBoundary:0,rejectedRatio:0,rejectedGeometry:0,rejectedArea:0,rejectedShape:0,inconclusiveShape:0,frontierTruncated:false,work:0,status:proof?'unrealizable':'running',reason:proof?.message||'',proof};
  if(proof)return{state,step:()=>state};
  if(bounds.min>transitionLimit){state.status='incomplete';state.reason=`L’intervallo richiede almeno ${bounds.min} celle, oltre il limite operativo di ${transitionLimit}. Nessuna impossibilità dimostrata.`;return{state,step:()=>state};}
  const iterators=[...(shapeActive?[guided(target,bounds,reference,0),guided(target,bounds,reference,1)]:[]),...Array.from({length:9},(_,i)=>growth(target,bounds,i)),animals(target,bounds)],done=iterators.map(()=>false);let turn=0;
  const seen=new Set();let rememberedCells=0;
  function accept(value){
   // All generators emit complete candidates only inside the exact area range.
   if(value.ids.length<bounds.min||value.ids.length>bounds.max)throw Error('Errore interno: candidato fuori dai limiti d’area.');
   const signature=canonical(value.ids).join(';');if(seen.has(signature))return;
   if(seen.size>=20000||rememberedCells+value.ids.length>200000){state.status='incomplete';state.reason='Budget di memoria dei candidati raggiunto: ricerca incompleta.';return;}
   seen.add(signature);rememberedCells+=value.ids.length;
   state.examined++;
   let region;try{region=regionBoundary(value.ids,target);}catch{state.rejectedGeometry++;return;}
   if(region.boundary.length<source.interfaces.length||(region.boundary.length>source.interfaces.length&&!source.interfaces.some(item=>item.color===null))){state.rejectedBoundary++;return;}
   const mapping=BoundaryTransition.correspondence(region,source.interfaces),metrics=TransitionObjectives.metrics(region);
   if(!TransitionObjectives.withinRatioPercent(source.metrics,metrics,settings.maxRatioPercent)){state.rejectedRatio++;return;}
   let candidate;
   try{candidate={...BoundaryTransition.certificate(value.ids,target,source,settings,mapping),method:value.method};}
   catch(error){if(error.code==='shape-rejected'){state.rejectedShape++;return;}if(error.code==='shape-inconclusive'){state.inconclusiveShape++;return;}throw error;}

   state.accepted++;
   const dominates=(a,b)=>TransitionObjectives.dominatesCandidate(source.metrics,a,b,settings.shapePreference);
   if(state.frontier.some(p=>dominates(p,candidate)))return;
   const tied=p=>TransitionObjectives.compareAreaError(source.metrics,p.metrics,candidate.metrics)===0&&TransitionObjectives.compareRatioDeviation(source.metrics,p.metrics,candidate.metrics)===0;
   if(!shapeActive&&state.frontier.some(tied))return;
   state.frontier=state.frontier.filter(p=>!dominates(candidate,p));state.frontier.push(candidate);
   state.frontier.sort((a,b)=>TransitionObjectives.compareAreaError(source.metrics,a.metrics,b.metrics)||TransitionObjectives.compareRatioDeviation(source.metrics,a.metrics,b.metrics)||(shapeActive?a.shapeError.value-b.shapeError.value:0)||compareText(a.region.ids.join(';'),b.region.ids.join(';')));
   // Retain geometric witnesses with identical area/rho, under explicit caps.
   if(shapeActive){
    const counts=new Map();let cells=0;
    state.frontier=state.frontier.filter(p=>{const key=`${p.metrics.n}:${p.metrics.I}`,n=counts.get(key)||0;counts.set(key,n+1);if(n>=8||cells+p.region.n>200000){state.frontierTruncated=true;return false;}cells+=p.region.n;return true;});
    if(state.frontier.length>256){state.frontier.length=256;state.frontierTruncated=true;}
   }
  }
  if(source.geometry.split('-')[0]===target.split('-')[0]&&source.region.n>=bounds.min&&source.region.n<=bounds.max)accept({ids:source.region.ids,method:'same-lattice'});
  function step(budget=50){
   if(state.status!=='running')return state;
   for(let k=0;k<budget&&state.status==='running';k++){
    if(done.every(Boolean)){state.status='incomplete';state.reason||=bounds.max>transitionLimit?'Limite operativo di celle raggiunto; ricerca incompleta.':'Campioni terminati; fronte globale e impossibilità non certificati.';break;}
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
