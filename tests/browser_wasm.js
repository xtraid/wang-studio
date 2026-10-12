window.addEventListener('load',async()=>{
 const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message);};
 let solver;
 try{
  // Let the existing full UI flow finish before testing independent sessions.
  while(!document.querySelector('#browser-test-result'))await new Promise(r=>setTimeout(r,50));
  const {Solver,capabilities}=await import('./vendor/foundry/client.mjs');
  const caps=await capabilities();
  assert(caps.runtime==='wasm'&&caps.engine.source.sha256&&caps.engine.api_version===1&&caps.engine.wasm_abi_version===3&&caps.max_tiles===null,'versioned Wasm package');
  assert(caps.engine.version==='0.3.0'&&!caps.engine.source.dirty,'published clean release, not a local dev build');
  assert(caps.max_used_colors===65536&&caps.max_cells===65536,'expanded solver capabilities');
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
  // Exercise real editor controls, JSON download/upload handlers and the Worker.
  for (const geometry of ['square','tri-up','tri-side','hex-flat','hex-point']) {
   for (const n of [23,32,33,64,65]) {
    state={geometry,palette:Array.from({length:16},(_,i)=>'#'+(i*0x101010).toString(16).padStart(6,'0')),sets:{},boards:{}};
    ensure();state.sets[family()]=[];board().placed={};board().borders={};rebuild();
    const sides=count(), expected=Array.from({length:n},(_,t)=>Array.from({length:sides},(_,d)=>Math.floor(t/16**d)%16));
    for (const tile of expected) {draft=[...tile];$('#addTile').click();}
    assert(tiles().length===n&&$('#tiles').children.length===n,geometry+' create '+n);
    $('#tiles').lastElementChild.ondblclick();
    ink=(draft[0]+1)%16;$('#editor polygon[data-edge="0"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    assert(draft[0]===(expected[n-1][0]+1)%16,'edit high tile');
    ink=expected[n-1][0];$('#editor polygon[data-edge="0"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    $('#deleteTile').click();$('#addTile').click();
    assert(JSON.stringify(tiles())===JSON.stringify(expected),'edit preserves complete tileset');
    const cell=cellAt(sides===3?'0,0,0':'0,0');
    board().borders=Object.fromEntries(cell.edges.map((k,d)=>[k,expected[n-1][d]]));
    let saved;const originalDownload=download;
    try {download=blob=>{saved=blob;};$('#save').click();}finally{download=originalDownload;}
    const json=await saved.text();assert(JSON.parse(json).sets[family()].length===n,'export all tiles');
    state.sets[family()]=[];
    await $('#file').onchange({target:{files:[new File([json],'large.json',{type:'application/json'})],value:'large.json'}});
    assert(JSON.stringify(tiles())===JSON.stringify(expected),'import/reload all tiles');
    for(const engine of ['reference','optimized']) {
     $('#solverEngine').value=engine;$('#solverEngine').onchange();board().placed={};
     pendingEnumerationMode='step';await startRegionSolve({c:cellAt(cell.id)});
     assert(enumerationSession.status==='paused',geometry+' '+n+' '+engine+' SAT');
     assert(JSON.stringify(board().placed[cell.id])===JSON.stringify(expected[n-1]),'render high-ID witness');
     assert(enumerationSession.engine.wasm_abi_version===3,'actual new engine in UI session');
     draw();assert(exportCanvas().width>0,'solution canvas export');
     await resumeEnumeration('count');assert(enumerationSession.exact&&enumerationSession.count==='1','unique exact SAT');
     board().placed={};board().borders[cell.edges[sides-1]]=15;
     pendingEnumerationMode='count';await startRegionSolve({c:cellAt(cell.id)});
     assert(enumerationSession.exact&&enumerationSession.count==='0',geometry+' '+n+' '+engine+' UNSAT');
     board().borders[cell.edges[sides-1]]=expected[n-1][sides-1];
    }
   }
  }
  checks.push('UI create/edit/export/import/solve/render 23/32/33/64/65 tiles, five geometries, both engines, SAT/UNSAT, ABI 3');
  // A catalog of single-cell generalized pieces needs no private glue colors.
  // Its compiled active set exceeds 32 without exceeding the color budget.
  for(const geometry of ['square','tri-up','tri-side','hex-flat','hex-point']) {
   state={geometry,palette:Array(16).fill('#ffffff'),sets:{},boards:{},generalizedTiles:[],tilesetMode:'generalized'};ensure();
   const sides=count(),cell=cellAt(sides===3?'0,0,0':'0,0');
   for(let t=0;t<65;t++) {
    const borders=Object.fromEntries(cell.edges.map((k,d)=>[k,Math.floor(t/16**d)%16]));
    const {item}=GeneralizedTiles.compile(geometry,borders,state.palette,'#b99bdd','Piece '+t);
    item.id='g-'+t;state.generalizedTiles.push(item);
   }
   state=validate(JSON.parse(JSON.stringify({version:1,...state})));ensure();rebuild();renderUI();
   assert(solverTiles().length===65,'65 compiled generalized atoms survive reload');
   board().borders={...state.generalizedTiles[64].borders};board().placed={};
   pendingEnumerationMode='count';await startRegionSolve({c:cell});
   assert(enumerationSession.exact&&enumerationSession.count==='1','generalized 65 SAT '+geometry);
  }
  checks.push('65 generalized atoms in all geometries, serialization and actual Wasm solve');
  for(const geometry of ['square','tri-up','tri-side','hex-flat','hex-point']) {
   state={geometry,palette:Array(257).fill('#ffffff'),sets:{},boards:{}};ensure();
   const sides=count(),seed=cellAt(sides===3?'0,0,0':'0,0');
   const other=cellAt([...cellNeighbors(seed,geometry).values()][0]);
   state.sets[family()]=Array.from({length:257},(_,t)=>Array(sides).fill(t));
   const region=regionBoundary([seed.id,other.id],geometry);
   board().borders=Object.fromEntries(region.boundary.map(e=>[e.key,256]));
   const json=JSON.stringify({version:1,...state});
   await $('#file').onchange({target:{files:[new File([json],'wide-colors.json',{type:'application/json'})],value:'wide-colors.json'}});
   assert(state.palette.length===257&&tiles().length===257,'wide palette and tiles survive import');
   let limited=false;try{closedRegion(seed,{max_cells:1});}catch(e){limited=e.message.includes('1 celle');}
   assert(limited,'region adapter follows engine cell budget');
   limited=false;try{closedRegion(seed,{max_used_colors:16});}catch(e){limited=e.message.includes('16 colori');}
   assert(limited,'region adapter follows engine color budget');
   for(const engine of ['reference','optimized']) {
    $('#solverEngine').value=engine;board().placed={};
    pendingEnumerationMode='count';await startRegionSolve({c:seed});
    assert(enumerationSession.exact&&enumerationSession.count==='1','wide-color UI SAT '+geometry+' '+engine);
    assert(Object.values(board().placed).every(t=>t.every(c=>c===256)),'color 256 renders unchanged');
    board().placed={};const edge=region.boundary[0].key;board().borders[edge]=0;
    await startRegionSolve({c:seed});
    assert(enumerationSession.exact&&enumerationSession.count==='0','wide-color UI UNSAT '+geometry+' '+engine);
    board().borders[edge]=256;
   }
  }
  checks.push('257 tiles/colors, JSON import, both engines, adjacent SAT/UNSAT, five geometries, capability budgets');
  let idle=await solver.start({...data,idle_timeout_seconds:0.05});
  await wait(idle.id);await new Promise(r=>setTimeout(r,100));
  assert(solver.get(idle.id).status==='expired'&&!solver.get(idle.id).exact,'explicit idle expiry');
  idle=await solver.start({...data,timeout_seconds:0});await wait(idle.id);
  assert(solver.get(idle.id).status==='paused','disabled active deadline');solver.cancel(idle.id);
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
