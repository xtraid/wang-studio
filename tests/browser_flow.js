/* Real editor/solver integration. Loaded after the app by a browser harness. */
window.addEventListener('load',async()=>{
 const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message);};
 const setup=(size=2,pinned=false)=>{
  const all=Array.from({length:16},(_,n)=>Array.from({length:4},(_,d)=>(n>>d)&1));
  state={geometry:'square',palette:['#ffffff','#222222'],sets:{square:all},boards:{square:{placed:{},borders:{}}}};
  if(pinned)state.boards.square.placed['0,0']=[0,0,0,0];
  selected=0;ink=0;ensure();history=[];future=[];zoom=1;pan={x:0,y:0};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const c=cellAt(`${x},${y}`);if(y===0)board().borders[c.edges[0]]=0;if(x===size-1)board().borders[c.edges[1]]=0;if(y===size-1)board().borders[c.edges[2]]=0;if(x===0)board().borders[c.edges[3]]=0;}
  rebuild();renderUI();draw();pendingEnumerationMode='step';return{c:cellAt('0,0'),edge:0};
 };
 try{
  const caps=await solverRequest('/api/capabilities');assert(caps.solver==='optimized'&&caps.enumeration,'enumeration capability');
  let h=setup();$('#solveRegion').click();assert(mode==='solve','first button');await startRegionSolve(h);
  assert(enumerationSession.status==='paused'&&enumerationSession.count==='1','first pauses at solution 1');
  assert(Object.keys(board().placed).length===4&&history.length===1,'first fills with one undo');const first=JSON.stringify(board().placed),job=enumerationSession.id;
  await resumeEnumeration('next');assert(enumerationSession.count==='2'&&enumerationSession.id===job,'next resumes same search');assert(JSON.stringify(board().placed)!==first,'next differs');const second=JSON.stringify(board().placed);
  await chooseEnumeration('count');assert(enumerationSession.count==='16'&&enumerationSession.exact,'exactly 16 tilings');assert(JSON.stringify(board().placed)===second,'count preserves displayed solution');checks.push('first / next / exact 16');
  await chooseEnumeration('step');assert(enumerationSession.count==='1'&&JSON.stringify(board().placed)===first,'First reuses ORIGINAL constraints');await cancelSolve();assert(enumerationSession.count==='1'&&!enumerationSession.exact,'Stop keeps lower bound');checks.push('original constraints / Stop');
  h=setup(2,true);pendingEnumerationMode='count';await startRegionSolve(h);assert(enumerationSession.exact&&enumerationSession.count==='4','fixed original tile yields 4');undo();assert(Object.keys(board().placed).length===1,'undo preserves original pin');checks.push('fixed tiles / undo');
  h=setup();board().placed['0,0']=[1,1,1,1];pendingEnumerationMode='count';await startRegionSolve(h);assert(enumerationSession.exact&&enumerationSession.count==='0','UNSAT exact 0');checks.push('UNSAT');
  h=setup();state.sets.square.push([0,0,0,0]);pendingEnumerationMode='count';await startRegionSolve(h);assert(enumerationSession.count==='16','duplicate tile not overcounted');checks.push('duplicates');
  h=setup();delete board().borders[cellAt('0,0').edges[0]];await startRegionSolve(h);assert($('#status').textContent.includes('aperto'),'open contour rejected');checks.push('open contour');
  h=setup();let pending=startRegionSolve(h);board().placed['50,50']=[0,0,0,0];await pending;assert($('#status').textContent.includes('cambiata'),'stale result discarded');assert(Object.keys(board().placed).length===1,'stale results did not fill');checks.push('stale-result guard');
  h=setup(4);pendingEnumerationMode='count';pending=startRegionSolve(h);
  for(let i=0;i<40&&(!enumerationSession||enumerationSession.count==='0');i++)await new Promise(resolve=>setTimeout(resolve,50));
  await cancelSolve();await pending;assert(!enumerationSession.exact&&enumerationSession.status==='cancelled','count Stop');checks.push('count interruption');
  h=setup(1);state.sets.square=[[0,0,0,0]];await startRegionSolve(h);assert(enumerationSession.count==='1','unique first');await resumeEnumeration('next');assert(enumerationSession.exact&&enumerationSession.count==='1','unique solution exhausted');checks.push('unique solution');
  const png=exportCanvas('all');assert(png.getContext('2d').getImageData(0,0,1,1).data[3]===0,'transparent PNG');checks.push('PNG');
  const result=document.createElement('pre');result.id='browser-test-result';result.textContent='PASS editor enumeration: '+checks.join(', ');document.body.append(result);
 }catch(error){try{await cancelSolve();}catch{}const result=document.createElement('pre');result.id='browser-test-result';result.textContent='FAIL '+error.stack;document.body.append(result);}
});
