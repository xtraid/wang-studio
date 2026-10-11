window.addEventListener('load',async()=>{
 const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message);};
 let solver;
 try{
  // Let the existing full UI flow finish before testing independent sessions.
  while(!document.querySelector('#browser-test-result'))await new Promise(r=>setTimeout(r,50));
  const {Solver,capabilities}=await import('./vendor/foundry/client.mjs');
  const caps=await capabilities();
  assert(caps.runtime==='wasm'&&caps.engine.source.sha256&&caps.engine.api_version===1,'versioned Wasm package');
  checks.push('engine provenance');
  const provenance=solverProvenance();assert(provenance?.version===caps.engine.version,'project engine provenance');
  assert(validate({version:1,...clone(state),solverEngine:provenance}).solverEngine.version===caps.engine.version,'provenance survives project reload');
  $('#solverEngine').value='reference';$('#solverEngine').onchange();
  assert(!sessionIsCurrent(),'changing engine invalidates continuation');
  pendingEnumerationMode='step';await startRegionSolve({c:cellAt('0,0')});
  assert(enumerationSession.payload.solver==='reference'&&enumerationSession.status==='paused','UI selects C reference');
  await cancelSolve();$('#solverEngine').value='optimized';$('#solverEngine').onchange();
  checks.push('engine selection / project provenance');
  solver=new Solver();
  const data={geometry:'square',palette:['#ffffff','#000000'],tiles:[[0,0,0,0],[1,1,1,1]],cells:[{id:'0,0',required:[null,null,null,null]}],timeout_seconds:1};
  const wait=async id=>{
   for(let i=0;i<200;i++){const result=solver.get(id);if(result.status!=='running')return result;await new Promise(r=>setTimeout(r,10));}
   throw Error('Worker did not respond');
  };
  for(const engine of ['optimized','reference']){
   const {id}=await solver.start({...data,solver:engine});
   let result=await wait(id);assert(result.status==='paused'&&result.count==='1',engine+' first');
   await new Promise(r=>setTimeout(r,1100));assert(solver.get(id).status==='paused','idle pause does not consume search timeout');
   solver.resume(id,'next');result=await wait(id);assert(result.count==='2'&&result.status==='paused',engine+' next');
   solver.resume(id,'count');result=await wait(id);assert(result.exact&&result.count==='2'&&result.solver===engine,engine+' exhaustion');
  }
  checks.push('both C engines / pause / next / exact count');
  for(const geometry of ['tri-up','tri-side','hex-flat','hex-point'])for(const engine of ['optimized','reference']){
   state.geometry=geometry;ensure();board().placed={};board().borders={};
   const n=geometry.startsWith('tri')?3:6;
   state.sets[family()]=[Array(n).fill(0),Array(n).fill(1)];
   const seed=cellAt(n===3?'0,0,0':'0,0'),other=cellAt([...cellNeighbors(seed,geometry).values()][0]);
   const shared=seed.edges.find(k=>other.edges.includes(k));
   for(const c of [seed,other])for(const k of c.edges)if(k!==shared)board().borders[k]=null;
   $('#solverEngine').value=engine;rebuild();
   pendingEnumerationMode='step';await startRegionSolve({c:seed});
   assert(enumerationSession.status==='paused'&&enumerationSession.count==='1',geometry+' '+engine+' UI first');
   assert(Object.keys(board().placed).length===2,geometry+' applied both tiles');
   await resumeEnumeration('next');
   assert(enumerationSession.status==='paused'&&enumerationSession.count==='2',geometry+' UI next');
   await resumeEnumeration('count');
   assert(enumerationSession.exact&&enumerationSession.count==='2',geometry+' UI exact count');
   checkedAssignments(enumerationSession.payload,Object.fromEntries(Object.entries(board().placed).map(([id,t])=>[id,t[0]])));
   board().placed={};board().borders[seed.edges.find(k=>k!==shared)]=0;
   board().borders[other.edges.find(k=>k!==shared)]=1;
   pendingEnumerationMode='count';await startRegionSolve({c:seed});
   assert(enumerationSession.exact&&enumerationSession.count==='0',geometry+' conflicting boundary UNSAT');
  }
  checks.push('all triangle/hexagon variants in UI / both engines / first-next-count / incompatible boundaries');
  const huge={...data,tiles:Array.from({length:16},(_,n)=>Array.from({length:4},(_,d)=>(n>>d)&1)),
   cells:Array.from({length:16},(_,n)=>({id:`${n%4},${Math.floor(n/4)}`,required:[null,null,null,null]})),enumeration_mode:'count'};
  let {id}=await solver.start(huge),result=await wait(id);
  assert(result.status==='timeout'&&!result.exact&&BigInt(result.count)>0n,'progress must not reset deadline');
  checks.push('timeout retains lower bound');
  ({id}=await solver.start({...huge,timeout_seconds:30}));
  await new Promise(r=>setTimeout(r,100));result=solver.cancel(id);
  assert(result.status==='cancelled'&&!result.exact,'Stop terminates Worker');
  await new Promise(r=>setTimeout(r,100));assert(solver.get(id).status==='cancelled','late messages cannot replace Stop');
  checks.push('cancel and stale Worker messages');
  const starts=await Promise.allSettled([solver.start(data),solver.start(data)]);
  assert(starts.filter(s=>s.status==='fulfilled').length===1,'concurrent starts reserve a single slot');
  solver.close();checks.push('single live session');
  const output=document.createElement('pre');output.id='wasm-test-result';output.textContent='PASS Wasm: '+checks.join(', ');document.body.append(output);
 }catch(error){solver?.close();const output=document.createElement('pre');output.id='wasm-test-result';output.textContent='FAIL '+error.stack;document.body.append(output);}
});
