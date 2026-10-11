/* Reproduce both finite-work searches in Wang Studio and export its own preview. */
(async()=>{
 const result={images:[],transition:{work:6000,runs:[],environment:navigator.userAgent}};
 // The page normally loads search only in its Worker. Load the SAME module for
 // reproducible work-unit runs; certificates, preview and Apply are the real UI.
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='transition-search.js?v=continuous-1';s.onload=resolve;s.onerror=reject;document.head.append(s);});
 const ids=Array.from({length:5},(_,i)=>`${i},0`).concat(['0,1','0,2','0,3'],Array.from({length:5},(_,i)=>`${i},4`));
 const settings={maxAreaPercent:30,maxRatioPercent:50,shapeBandPercent:10,maxShapePercent:30,shapeConstraint:false};
 function setup(){
  state={geometry:'square',palette:['#dce5df'],sets:{square:[[0,0,0,0]]},boards:{square:{placed:{},borders:{}}}};
  selected=0;ensure();history=[];future=[];
  const r=regionBoundary(ids,'square');board().borders=Object.fromEntries(r.boundary.map(e=>[e.key,null]));rebuild();renderUI();
  return BoundaryTransition.source('square',board().borders,state.palette);
 }
 async function capture(name,source,candidate,shapePreference,stats){
  transitionRun={source,target:'hex-flat',...settings,...stats,shapePreference:true,stamp:transitionStamp(),frontier:[candidate],status:'incomplete'};
  renderTransition();
  // Export the actual continuous preview, at print resolution. Enabling its
  // overlay here does not modify which search generated the selected candidate.
  const svg=$('#transitionPreview').cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','1200');svg.setAttribute('height','900');
  const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
  const out=document.createElement('canvas');out.width=1200;out.height=900;const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,900);ctx.drawImage(img,0,0);URL.revokeObjectURL(url);
  const sourceProject={version:1,...clone(state)};
  transitionRun.shapePreference=shapePreference;
  if(!applyGeometryTransition())throw Error('Independent Apply check failed: '+$('#status').textContent);
  const project={version:1,...clone(state)};validate(project);
  result.images.push({name,png:out.toDataURL('image/png').split(',')[1],project,sourceProject,method:candidate.method,metrics:candidate.metrics,comparison:TransitionObjectives.comparison(source.metrics,candidate.metrics),shapeError:candidate.shapeError});
 }
 for(const shapePreference of [false,true]){
  const source=setup(),search=TransitionSearch.create(source,'hex-flat',{...settings,shapePreference});search.step(6000);
  const s=search.state;
  const front=s.frontier.map(c=>({...c,shapeError:TransitionShape.measure(TransitionShape.forSource(source,10),TransitionShape.region(c.region.ids,'hex-flat'),{precision:.005,maxBoxes:32768})}));
  const summary={shapePreference,examined:s.examined,accepted:s.accepted,retained:front.length,work:s.work};result.transition.runs.push(summary);
  const best=list=>list.reduce((a,b)=>a.shapeError.value<b.shapeError.value?a:b);
  const chosen=shapePreference?[['campo-c-guidata',best(front.filter(c=>c.region.n===10))],['campo-c-forma',best(front)]]:[['campo-c-non-guidata',front[0]]];
  for(const [name,candidate]of chosen){const restoredSource=setup();await capture(name,restoredSource,candidate,shapePreference,summary);}
 }
 return result;
})()
