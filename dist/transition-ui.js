let transitionRun=null;
function transitionStamp(){return JSON.stringify(state);}
function stopTransition(reason='Ricerca interrotta: il fronte contiene solo le realizzazioni trovate.'){
 const run=transitionRun;if(!run)return;
 run.worker?.terminate();clearTimeout(run.timer);run.worker=null;
 if(run.status==='running'){run.status='incomplete';run.reason=reason;}renderTransition();
}
function clearTransitionResults(){
 transitionRun=null;$('#transitionCandidate').innerHTML='';$('#transitionCandidate').disabled=true;$('#applyTransition').disabled=true;$('#transitionPreview').innerHTML='';$('#transitionMetrics').textContent='';
}
function beginGeometryTransition(){
 stopTransition();clearTransitionResults();let source,target,maxAreaPercent,maxRatioPercent;
 try{
  const limit=$('#transitionAreaLimit');
  if(!limit.checkValidity())throw Error('Soglia d’area non valida (0–10000%, massimo due decimali).');
  if(limit.value.trim()==='')throw Error('Specifica la tolleranza percentuale d’area.');
  maxAreaPercent=Number(limit.value);
  const ratioLimit=$('#transitionRatioLimit');
  if(!ratioLimit.checkValidity()||ratioLimit.value.trim()==='')throw Error('Specifica la tolleranza del rapporto (0–100%, massimo due decimali).');
  maxRatioPercent=Number(ratioLimit.value);
  target=$('#transitionGeometry').value;transitionGeometry(target);
  const existing=state.boards[target];
  if(target!==state.geometry&&existing&&(Object.keys(existing.placed).length||Object.keys(existing.borders).length))throw Error('La griglia di destinazione è occupata.');
  source=BoundaryTransition.source(state.geometry,board().borders,state.palette,board().boundaryModel,board().logical);
 }catch(error){message(error.message);$('#transitionStatus').textContent=error.message;return false;}
 const run={source,target,maxAreaPercent,maxRatioPercent,stamp:transitionStamp(),frontier:[],status:'running',reason:'',examined:0,accepted:0,elapsed:0};transitionRun=run;
 const seconds=Number($('#transitionSeconds').value)||3,milliseconds=Math.max(1000,Math.min(30000,seconds*1000));
 try{
  run.worker=new Worker(new URL('transition-worker.js?v=boundary-4',document.baseURI));
  run.worker.onmessage=({data})=>{
   if(transitionRun!==run||run.status!=='running')return;
   Object.assign(run,data);
   if(run.status!=='running'){run.worker.terminate();run.worker=null;clearTimeout(run.timer);}renderTransition();
  };
  run.worker.onerror=()=>{if(transitionRun===run){run.reason='Errore del Worker: nessuna modifica applicata.';run.status='error';stopTransition();}};
  run.timer=setTimeout(()=>{if(transitionRun===run)stopTransition('Tempo di ricerca terminato: il fronte contiene solo le realizzazioni trovate.');},milliseconds+2000);
  run.worker.postMessage({source,target,milliseconds,maxAreaPercent,maxRatioPercent});renderTransition();return true;
 }catch(error){run.status='error';run.reason=error.message;stopTransition();return false;}
}
function renderTransition(){
 const run=transitionRun;if(!run)return;
 const current=run.stamp===transitionStamp(),select=$('#transitionCandidate'),previous=Number(select.value)||0;
 select.innerHTML='';run.frontier.forEach((p,i)=>{const option=document.createElement('option'),m=TransitionObjectives.comparison(run.source.metrics,p.metrics);option.value=String(i);option.textContent=`${p.metrics.n} celle · δA ${(100*m.relativeAreaError).toFixed(2)}% · δρ ${(100*m.ratioDeviation).toFixed(2)}%`;select.append(option);});
 select.value=String(Math.min(run.status==='running'?0:previous,Math.max(0,run.frontier.length-1)));select.disabled=!run.frontier.length||run.status==='running';
 $('#stopTransition').disabled=run.status!=='running';$('#applyTransition').disabled=!current||!run.frontier.length||run.status==='running';
 const prefix=run.status==='running'?'Ricerca in corso.':run.reason;
 $('#transitionStatus').textContent=`${prefix} ${run.accepted||0} realizzazioni ammissibili; ${run.rejectedArea||0} certificate escluse per area; ${run.rejectedBoundary||0} escluse per capacità del bordo; ${run.rejectedRatio||0} escluse per rapporto; ${run.rejectedGeometry||0} geometrie non valide; ${run.frontier.length} coppie di obiettivi non dominate entro ±${run.maxAreaPercent}% d’area e ${run.maxRatioPercent}% di deviazione B/I fra quelle trovate.${run.bounds?(run.bounds.min>run.bounds.max?' Nessun numero di celle ammissibile.':` Numero di celle consentito: ${run.bounds.min}–${run.bounds.max} (condizione necessaria).`):''}${current?'':' Progetto modificato: avvia una nuova ricerca.'}`;
 previewTransition();
}
function previewTransition(){
 const run=transitionRun,p=run?.frontier[Number($('#transitionCandidate').value)||0],svg=$('#transitionPreview');svg.innerHTML='';
 if(!p){$('#transitionMetrics').textContent='';return;}
 const metrics=TransitionObjectives.comparison(run.source.metrics,p.metrics);
 $('#transitionMetrics').textContent=`Scostamento d’area ${(metrics.relativeAreaError*100).toFixed(2)}% (×${metrics.areaRatio.toFixed(3)}). Area normalizzata ${run.source.metrics.area.toPrecision(5)} → ${p.metrics.area.toPrecision(5)}; celle ideali ${metrics.idealCells.toPrecision(4)}. B ${p.metrics.B}, I ${p.metrics.I}; ρ ${run.source.metrics.rho===null?'∞':run.source.metrics.rho.toPrecision(4)} → ${p.metrics.rho===null?'∞':p.metrics.rho.toPrecision(4)}; deviazione ${(100*metrics.ratioDeviation).toFixed(2)}%. ${run.source.interfaces.length} interfacce esterne. Ottimo globale non certificato.`;
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 const polygons=p.region.ids.map(id=>({id,c:cellAt(id,run.target)}));
 for(const{c}of polygons)for(const[x,y]of c.p){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 const scale=Math.min(220/(x1-x0),160/(y1-y0)),project=([x,y])=>[120+(x-(x0+x1)/2)*scale,90+(y-(y0+y1)/2)*scale];
 svg.innerHTML=polygons.map(({id,c})=>`<polygon points="${c.p.map(v=>project(v).join(',')).join(' ')}" fill="#a9c783" stroke="#142018" stroke-width=".6"/>`).join('');
}
function applyGeometryTransition(){
 const run=transitionRun;
 try{
  if(!run||run.status==='running'||run.stamp!==transitionStamp())throw Error('Risultato non applicabile: attendi la ricerca o avviane una nuova dopo le modifiche.');
  const candidate=run.frontier[Number($('#transitionCandidate').value)||0];if(!candidate)throw Error('Nessuna realizzazione verificata selezionata.');
  // Recheck geometry and all interfaces on the main thread before committing.
  const proof=BoundaryTransition.certificate(candidate.region.ids,run.target,run.source,run,candidate);
  if(!TransitionObjectives.withinAreaPercent(run.source.metrics,proof.metrics,run.maxAreaPercent))throw Error('La realizzazione supera la soglia d’area richiesta.');
  const tileset=BoundaryTransition.newTileset(proof,run.target,state.palette),next=clone(state),source=state.geometry;
  next.geometry=run.target;next.boards[source]={placed:{},borders:{}};
  next.boards[run.target]={placed:{},borders:proof.borders,boundaryModel:{interfaces:clone(run.source.interfaces),edgeInterfaces:proof.edgeInterfaces,transition:{version:4,maxAreaPercent:run.maxAreaPercent,maxRatioPercent:run.maxRatioPercent,ratioDeviation:'symmetric-relative-infinity-extended',areaReference:'current-source-region',interfacePolicy:'positive-consecutive-expansion',normalization:'circumcircle-circumference-1',sourceGeometry:run.source.geometry,sourceMetrics:run.source.metrics,targetMetrics:proof.metrics,method:candidate.method,searchStatus:run.status,examined:run.examined,accepted:run.accepted,work:run.work,elapsedMilliseconds:run.elapsed,tilesetPolicy:'atomic-boundary-and-interior-color-0',globalOptimumCertified:false}}};
  next.sets[run.target.split('-')[0]]=tileset;next.solverEngine=null;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const e of proof.region.boundary){const[x,y]=vertexNumbers(e.from).map(n=>n/1e5);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  snapshot();state=next;selected=0;hover=null;zoom=Math.max(.35,Math.min(1,(width-60)/(58*(x1-x0)),(height-60)/(58*(y1-y0))));pan={x:-(x0+x1)*scale()/2,y:-(y0+y1)*scale()/2};
  ensure();rebuild();renderUI();setMode('border');renderTransition();message(`Realizzazione applicata: ${proof.region.n} celle, ${run.source.interfaces.length} interfacce esterne e un nuovo tileset atomico di ${tileset.length} tessere. Ctrl+Z per annullare.`);return true;
 }catch(error){message('Transizione non applicata: '+error.message);return false;}
}
$('#transitionRegion').onclick=beginGeometryTransition;
$('#stopTransition').onclick=()=>stopTransition();
$('#transitionCandidate').onchange=previewTransition;
$('#transitionGeometry').onchange=()=>{stopTransition();clearTransitionResults();$('#transitionStatus').textContent='Destinazione modificata: avvia una nuova ricerca.';};
$('#transitionRatioLimit').oninput=$('#transitionAreaLimit').oninput=()=>{stopTransition();clearTransitionResults();$('#transitionStatus').textContent='Soglia modificata: avvia una nuova ricerca.';};
$('#applyTransition').onclick=applyGeometryTransition;
$('#resetBoundaryInterfaces').onclick=()=>{stopTransition();if(board().boundaryModel||board().logical){snapshot();delete board().boundaryModel;delete board().logical;draw();}clearTransitionResults();message('Interfacce ridefinite: ogni lato del bordo attuale è una distinta interfaccia.');};
window.addEventListener('pagehide',()=>stopTransition(),{once:true});
