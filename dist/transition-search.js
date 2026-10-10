/* Region generators propose unlabelled lattice sets. Only the independent
 * boundary/area/ratio verifier can admit a realization to the Pareto front. */
const TransitionSearch=(()=>{
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
  const settings={maxAreaPercent:options.maxAreaPercent??30,maxRatioPercent:options.maxRatioPercent??50};
  TransitionObjectives.withinAreaPercent(source.metrics,source.metrics,settings.maxAreaPercent);
  TransitionObjectives.withinRatioPercent(source.metrics,source.metrics,settings.maxRatioPercent);
  transitionGeometry(target);
  const sides=target.startsWith('tri')?3:target==='square'?4:6;
  const bounds=TransitionObjectives.cellRange(source.metrics,sides,settings.maxAreaPercent);
  const proof=bounds.min>bounds.max?{kind:'area-cell-count',areaRange:bounds,message:`Nessun numero intero positivo di celle rispetta la tolleranza ±${settings.maxAreaPercent}%.`}:null;
  const state={source,target,...settings,bounds,frontier:[],examined:0,accepted:0,rejectedBoundary:0,rejectedRatio:0,rejectedGeometry:0,rejectedArea:0,work:0,status:proof?'unrealizable':'running',reason:proof?.message||'',proof};
  if(proof)return{state,step:()=>state};
  if(bounds.min>transitionLimit){state.status='incomplete';state.reason=`L’intervallo richiede almeno ${bounds.min} celle, oltre il limite operativo di ${transitionLimit}. Nessuna impossibilità dimostrata.`;return{state,step:()=>state};}
  const iterators=[...Array.from({length:9},(_,i)=>growth(target,bounds,i)),animals(target,bounds)],done=iterators.map(()=>false);let turn=0;
  const seen=new Set();let rememberedCells=0;
  function accept(value){
   // All generators emit complete candidates only inside the exact area range.
   if(value.ids.length<bounds.min||value.ids.length>bounds.max)throw Error('Errore interno: candidato fuori dai limiti d’area.');
   const signature=canonical(value.ids).join(';');if(seen.has(signature))return;
   if(seen.size>=20000||rememberedCells+value.ids.length>200000){state.status='incomplete';state.reason='Budget di memoria dei candidati raggiunto: ricerca incompleta.';return;}
   seen.add(signature);rememberedCells+=value.ids.length;
   state.examined++;
   let region;try{region=regionBoundary(value.ids,target);}catch{state.rejectedGeometry++;return;}
   if(region.boundary.length<source.interfaces.length){state.rejectedBoundary++;return;}
   const mapping=BoundaryTransition.correspondence(region,source.interfaces),metrics=TransitionObjectives.metrics(region);
   if(!TransitionObjectives.withinRatioPercent(source.metrics,metrics,settings.maxRatioPercent)){state.rejectedRatio++;return;}
   const candidate={...BoundaryTransition.certificate(value.ids,target,source,settings,mapping),method:value.method};
   state.accepted++;
   if(state.frontier.some(p=>TransitionObjectives.dominates(source.metrics,p.metrics,candidate.metrics)))return;
   if(state.frontier.some(p=>TransitionObjectives.compareAreaError(source.metrics,p.metrics,candidate.metrics)===0&&TransitionObjectives.compareRatioDeviation(source.metrics,p.metrics,candidate.metrics)===0))return;
   state.frontier=state.frontier.filter(p=>!TransitionObjectives.dominates(source.metrics,candidate.metrics,p.metrics));state.frontier.push(candidate);
   state.frontier.sort((a,b)=>TransitionObjectives.compareAreaError(source.metrics,a.metrics,b.metrics)||TransitionObjectives.compareRatioDeviation(source.metrics,a.metrics,b.metrics));
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
