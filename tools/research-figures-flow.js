(async()=>{
 const result={images:[],transition:null};
 const palette=['#dce5df','#527a39','#3c6f92'];
 function setup(ids){
  state={geometry:'square',palette:[...palette],sets:{square:[[0,0,0,0]]},boards:{square:{placed:{},borders:{}}}};
  selected=0;ensure();history=[];future=[];
  const r=regionBoundary(ids,'square');board().borders=Object.fromEntries(r.boundary.map(e=>[e.key,null]));
  rebuild();renderUI();return r;
 }
 function capture(name){
  const project={version:1,...clone(state)},r=readTransitionRegion(state.geometry,board().borders,state.palette),placed=board().placed;
  board().placed=Object.fromEntries(r.ids.map(id=>[id,Array(count()).fill(0)]));
  const canvas=exportCanvas('all');board().placed=placed;
  result.images.push({name,png:canvas.toDataURL('image/png').split(',')[1],project,metrics:TransitionObjectives.metrics(r)});
 }
 let r=setup(['0,0','1,0','0,1','1,1']);
 board().borders[r.boundary[0].key]=1;board().borders[r.boundary[1].key]=2;
 capture('bordo-parziale');
 setup(['0,0','1,0','0,1','1,1']);capture('regione-convessa');
 setup(['0,0','0,1','1,1']);capture('regione-concava');
 const ids=Array.from({length:12},(_,i)=>`${1+i%2},${Math.floor(i/2)}`).concat(['0,2','0,3']);
 setup(ids);
 for(const id of ['0,2','0,3']){const edge=cellAt(id,'square').edges.find(k=>edgeOwners(k,'square').some(c=>c.id===`-1,${id.split(',')[1]}`));board().borders[edge]=1;}
 capture('transizione-quadrati');
 $('#transitionGeometry').value='hex-flat';$('#transitionAreaLimit').value='30';$('#transitionRatioLimit').value='50';$('#transitionSeconds').value='2';
 if(!beginGeometryTransition())throw Error('Transition did not start');
 while(transitionRun.status==='running')await new Promise(r=>setTimeout(r,50));
 if(!transitionRun.frontier.length)throw Error('No candidate');
 $('#transitionCandidate').value='0';
 const candidate=transitionRun.frontier[0];
 result.transition={source:transitionRun.source.metrics,target:candidate.metrics,...TransitionObjectives.comparison(transitionRun.source.metrics,candidate.metrics),status:transitionRun.status};
 if(!applyGeometryTransition())throw Error('Apply failed');
 if(Object.values(board().borders).filter(c=>c===1).length!==2)throw Error('Colored count changed');
 capture('transizione-esagoni');
 return result;
})()
