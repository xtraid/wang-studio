importScripts(...['geometry.js','transition.js','transition-objectives.js','logical-transition.js','transition-search.js'].map(name=>name+'?v=logical-3'));
self.onmessage=({data})=>{
 try{
  const search=TransitionSearch.create(data.source,data.target,{maxAreaPercent:data.maxAreaPercent}),start=performance.now();let last=0;
  const publish=()=>self.postMessage({status:search.state.status,reason:search.state.reason,proof:search.state.proof,frontier:search.state.frontier,examined:search.state.examined,accepted:search.state.accepted,rejectedArea:search.state.rejectedArea,prunedArea:search.state.prunedArea,bounds:search.state.bounds,areaRange:search.state.areaRange,portMinimum:search.state.portMinimum,work:search.state.work,elapsed:performance.now()-start});
  const tick=()=>{
   const slice=performance.now();
   do{search.step(20);}while(search.state.status==='running'&&performance.now()-slice<40);
   if(search.state.status==='running'&&performance.now()-start>=data.milliseconds){search.state.status='incomplete';search.state.reason='Tempo di ricerca terminato; il fronte è relativo alle realizzazioni trovate.';}
   if(performance.now()-last>150||search.state.status!=='running'){publish();last=performance.now();}
   if(search.state.status==='running')setTimeout(tick,0);
  };tick();
 }catch(error){self.postMessage({status:'error',reason:error.message,frontier:[]});}
};
