/* Tiling Foundry package connector. Browser Worker by default; optional local API. */
let activeSolve=null,enumerationSession=null,pendingEnumerationMode='step';
let browserSolverPromise=null;
function solverProvenance(){
 const session=enumerationSession;
 if(!session?.engine)return state.solverEngine||null;
 const engine=session.engine;
 return{package:engine.name,version:engine.version,api_version:engine.api_version,
  solver:session.payload.solver||'optimized',source:engine.source,build:engine.build};
}
function solverStamp(){return JSON.stringify({geometry:state.geometry,palette:state.palette,tiles:tiles(),board:board(),solver:$('#solverEngine').value||'optimized'});}
function closedRegion(seed){
 if(state.geometry!=='square')throw Error('Il collegamento optimized supporta per ora solo la griglia quadrata.');
 if(!seed)throw Error('Clicca una cella interna alla regione chiusa.');
 if(!tiles().length||tiles().length>32)throw Error('Optimized richiede da 1 a 32 tessere nel tileset.');
 const keys=Object.keys(board().borders);if(!keys.length)throw Error('Disegna prima un contorno chiuso con lo strumento Bordi.');
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const k of keys)for(const [x,y]of borderPoints(k)){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 const queue=[seed.id],seen=new Set(queue),offsets=[[0,-1],[1,0],[0,1],[-1,0]];
 for(let head=0;head<queue.length;head++){
  const id=queue[head],[x,y]=id.split(',').map(Number);
  if(x<minX||y<minY||x>=maxX||y>=maxY)throw Error('Il contorno è aperto, oppure hai cliccato all’esterno. Chiudi tutti i lati della regione.');
  if(queue.length>4096)throw Error('Regione aperta o troppo grande: il primo collegamento supporta fino a 4096 celle.');
  const c=cellAt(id);
  c.edges.forEach((k,d)=>{if(board().borders[k]!==undefined)return;const[dx,dy]=offsets[d],next=`${x+dx},${y+dy}`;if(!seen.has(next)){seen.add(next);queue.push(next);}});
 }
 const cells=queue.map(id=>{const c=cellAt(id),[x,y]=id.split(',').map(Number);
  const required=c.edges.map((k,d)=>{
   const border=board().borders[k],[dx,dy]=offsets[d],next=`${x+dx},${y+dy}`;
   const outside=!seen.has(next)?board().placed[next]:null;
   if(outside&&border!==undefined&&border!==null&&outside[(d+2)%4]!==border)throw Error('Una tessera esterna non corrisponde al colore del contorno.');
   return border??(outside?outside[(d+2)%4]:null);
  });
  return{id,required,fixed:board().placed[id]?[...board().placed[id]]:null};
 });
 return{geometry:'square',palette:[...state.palette],tiles:clone(tiles()),cells,timeout_seconds:30,solver:$('#solverEngine').value||'optimized'};
}
function sessionIsCurrent(){return !!enumerationSession&&enumerationSession.expectedStamp===solverStamp();}
function solveButtons(){
 const current=sessionIsCurrent(),paused=current&&enumerationSession.status==='paused';
 $('#solveRegion').disabled=!!activeSolve;
 $('#nextSolution').disabled=!!activeSolve||!paused;
 $('#countSolutions').disabled=!!activeSolve;
 $('#stopSolve').disabled=!activeSolve&&!(enumerationSession&&enumerationSession.status==='paused');
 const text=enumerationSession?(current?`${enumerationSession.exact?'Esattamente':'Almeno'} ${enumerationSession.count} soluzioni`:'Istanza modificata · avvia una nuova ricerca'):'Soluzioni: —';
 if($('#solutionCount').textContent!==text)$('#solutionCount').textContent=text;
}
async function solverRequest(url,options){
 if(new URLSearchParams(globalThis.location?.search||'').get('solver')!=='native'){
  browserSolverPromise??=import('./vendor/foundry/client.mjs').then(module=>{
   const solver=new module.Solver();
   window.addEventListener('pagehide',()=>solver.close(),{once:true});
   return{solver,capabilities:module.capabilities};
  }).catch(()=>{browserSolverPromise=null;throw Error('Il pacchetto del solver non è disponibile. Ricarica la pagina o reinstalla il pacchetto Foundry.');});
  const {solver,capabilities}=await browserSolverPromise;
  const method=options?.method||'GET';
  const body=options?.body?JSON.parse(options.body):{};
  if(url==='/api/capabilities'&&method==='GET')return capabilities();
  if(url==='/api/enumerate'&&method==='POST')return solver.start(body);
  const match=/^\/api\/jobs\/([^/]+)(\/resume)?$/.exec(url);
  if(match){
   if(match[2]&&method==='POST')return solver.resume(match[1],body.action);
   if(!match[2]&&method==='DELETE')return solver.cancel(match[1]);
   if(!match[2]&&method==='GET')return solver.get(match[1]);
  }
  throw Error('Operazione del solver non supportata.');
 }
 if(options?.body&&JSON.parse(options.body).solver==='reference')throw Error('Il confronto con il server locale supporta solo il motore optimized. Usa la modalità browser per reference.');
 const response=await fetch(url,options);const content=response.headers.get('content-type')||'';
 if(!content.includes('application/json'))throw Error('Il solver locale non è disponibile: avvia Wang Studio con python server.py.');
 const data=await response.json();if(!response.ok)throw Error(data.message||'Errore del servizio optimized.');return data;
}
function updateEnumeration(session,result){
 session.status=result.status;session.count=result.count??session.count;session.exact=result.exact===true;
 if(result.engine)session.engine=result.engine;
 solveButtons();
}
function checkedAssignments(payload,assignments){
 if(!assignments||Object.keys(assignments).length!==payload.cells.length)throw Error('Risposta del solver non valida.');
 const byId=new Map(payload.cells.map(c=>[c.id,c]));
 for(const c of payload.cells){const id=assignments[c.id],tile=payload.tiles[id];if(!Number.isInteger(id)||!tile||c.required.some((v,d)=>v!==null&&tile[d]!==v)||c.fixed&&c.fixed.some((v,d)=>v!==tile[d]))throw Error('La soluzione non rispetta i vincoli originali della regione.');const[x,y]=c.id.split(',').map(Number);[[0,-1],[1,0],[0,1],[-1,0]].forEach(([dx,dy],d)=>{const n=`${x+dx},${y+dy}`;if(byId.has(n)&&tile[d]!==payload.tiles[assignments[n]]?.[(d+2)%4])throw Error('La soluzione contiene lati incompatibili.');});}
 return assignments;
}
function applyEnumerationSolution(session,result){
 const assignments=checkedAssignments(session.payload,result.assignments);
 const changed=session.payload.cells.some(c=>JSON.stringify(board().placed[c.id])!==JSON.stringify(session.payload.tiles[assignments[c.id]]));
 if(changed){snapshot();for(const c of session.payload.cells)board().placed[c.id]=[...session.payload.tiles[assignments[c.id]]];resetSelection();rebuild();}
 session.displayed=true;session.expectedStamp=solverStamp();draw();
}
async function cancelSolve(){
 const run=activeSolve,session=run?.session||enumerationSession;
 if(!session)return;if(run)run.cancelled=true;
 message('Interruzione della ricerca…');
 if(session.id)try{const result=await solverRequest('/api/jobs/'+session.id,{method:'DELETE'});updateEnumeration(session,result);message(`Ricerca interrotta. ${session.exact?'Esattamente':'Almeno'} ${session.count} soluzioni trovate.`);}catch(error){message(error.message);}
}
async function observeEnumeration(run,action){
 const session=run.session;
 try{
  if(action){await solverRequest('/api/jobs/'+session.id+'/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});}
  else{
   const job=await solverRequest('/api/enumerate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...session.payload,enumeration_mode:run.mode})});session.id=job.id;
  }
  if(run.cancelled){const result=await solverRequest('/api/jobs/'+session.id,{method:'DELETE'});updateEnumeration(session,result);message(`Ricerca interrotta. Almeno ${session.count} soluzioni trovate.`);return;}
  while(true){
   const result=await solverRequest('/api/jobs/'+session.id);
   if(run.cancelled)return;
   if(session.expectedStamp!==solverStamp()){
    const final=await solverRequest('/api/jobs/'+session.id,{method:'DELETE'});updateEnumeration(session,final);
    message('La composizione è cambiata. Ricerca interrotta; nessuna soluzione applicata.');return;
   }
   updateEnumeration(session,result);
   if(result.status==='running'){message(`Conteggio: almeno ${session.count} soluzioni. Stop conserva questo limite inferiore.`);await new Promise(resolve=>setTimeout(resolve,200));continue;}
   if(result.status==='paused'){
    applyEnumerationSolution(session,result);message(`Soluzione ${session.count} · solver C. Successiva prosegue dal trail; Conta esplora tutte le soluzioni.`);return;
   }
   if(result.status==='complete'){
    if(result.count==='0')message('UNSAT: esattamente 0 soluzioni per questi vincoli.');
    else{if(!session.displayed&&result.assignments)applyEnumerationSolution(session,result);message(`Ricerca completata: esattamente ${session.count} soluzioni distinte. Tessere identiche contate una sola volta.`);}
    return;
   }
   if(['timeout','cancelled','expired'].includes(result.status)){message(`${result.status==='timeout'?'Tempo limite raggiunto':result.status==='expired'?'Sessione scaduta':'Ricerca interrotta'}: almeno ${session.count} soluzioni. Il totale non è noto.`);return;}
   throw Error(result.message||'Errore del solver optimized.');
  }
 }catch(error){
  if(session.id)try{const result=await solverRequest('/api/jobs/'+session.id,{method:'DELETE'});updateEnumeration(session,result);}catch{}
  session.status='error';session.exact=false;
  message(error.message==='Failed to fetch'?'Servizio optimized non raggiungibile. Avvia python server.py.':error.message);
 }finally{if(activeSolve===run){activeSolve=null;solveButtons();}}
}
async function startEnumeration(payload,mode='step'){
 if(activeSolve)return;
 const previous=enumerationSession;
 const session={id:null,payload:clone(payload),expectedStamp:solverStamp(),count:'0',exact:false,status:'running',displayed:false};
 const run={session,mode,cancelled:false};activeSolve=run;solveButtons();
 try{if(previous?.id&&previous.status==='paused')await solverRequest('/api/jobs/'+previous.id,{method:'DELETE'});}
 catch(error){activeSolve=null;message(error.message);solveButtons();return;}
 enumerationSession=session;solveButtons();message('Avvio del solver C sui vincoli originali…');
 return observeEnumeration(run,null);
}
async function startRegionSolve(h){
 if(activeSolve){message('È già in corso una ricerca. Premi Stop.');return;}
 try{
  const reuse=sessionIsCurrent()&&enumerationSession.payload.cells.some(c=>c.id===h?.c.id);
  const payload=reuse?enumerationSession.payload:closedRegion(h?.c);
  return await startEnumeration(payload,pendingEnumerationMode);
 }catch(error){message(error.message);}
}
function chooseEnumeration(mode){
 if(state.geometry!=='square'){message('Optimized supporta per ora i quadrati; esagoni e triangoli sono ancora da realizzare.');return;}
 pendingEnumerationMode=mode;
 if(sessionIsCurrent()){
  if(mode==='count'&&enumerationSession.status==='paused')return resumeEnumeration('count');
  return startEnumeration(enumerationSession.payload,mode);
 }
 setMode('solve');message(`Clicca dentro un contorno chiuso per ${mode==='count'?'contare le soluzioni':'trovare la prima soluzione'}. Le tessere già posate saranno fissate.`);
}
async function resumeEnumeration(action){
 if(activeSolve)return;
 if(!sessionIsCurrent()||enumerationSession.status!=='paused'){message('La regione è cambiata o la sessione è terminata. Avvia Prima.');return;}
 const run={session:enumerationSession,mode:action==='count'?'count':'step',cancelled:false};
 enumerationSession.status='running';activeSolve=run;solveButtons();return observeEnumeration(run,action);
}
$('#solveRegion').onclick=()=>chooseEnumeration('step');
$('#nextSolution').onclick=()=>resumeEnumeration('next');
$('#countSolutions').onclick=()=>chooseEnumeration('count');
$('#stopSolve').onclick=cancelSolve;
$('#solverEngine').onchange=()=>{solveButtons();draw();};
solveButtons();
