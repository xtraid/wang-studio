/* Boundary-only model and independent verifier. No cell correspondence or
 * source internal adjacency graph is part of an ordinary transition. */
const BoundaryTransition=(()=>{
 function validateInterfaces(interfaces){
  if(!Array.isArray(interfaces)||!interfaces.length||interfaces.length>transitionLimit)throw Error('Interfacce esterne non valide.');
  const seen=new Set();
  for(const item of interfaces){
   if(!item||!Number.isSafeInteger(item.id)||item.id<0||seen.has(item.id)||(item.color!==null&&(!Number.isInteger(item.color)||item.color<0)))throw Error('Identità o colore di interfaccia non valido.');
   seen.add(item.id);
  }
 }
 // Validate a supplied correspondence, not the algorithm that constructed it.
 function verifyBoundary(region,interfaces,edgeInterfaces,borders,allowColoredExpansion=false){
  validateInterfaces(interfaces);
  if(!edgeInterfaces||!borders||Object.keys(edgeInterfaces).length!==region.boundary.length||Object.keys(borders).length!==region.boundary.length)throw Error('Copertura del bordo non valida.');
  const byId=new Map(interfaces.map(i=>[i.id,i])),word=[],colored=new Set();
  for(const e of region.boundary){
   const id=edgeInterfaces[e.key],item=byId.get(id);
   if(!item||!Object.hasOwn(edgeInterfaces,e.key)||!Object.hasOwn(borders,e.key)||borders[e.key]!==item.color)throw Error('Interfaccia o colore del bordo non conservato.');
   if(item.color!==null&&!allowColoredExpansion){
    if(colored.has(id))throw Error('Un lato colorato non può essere duplicato.');
    colored.add(id);
   }
   if(word.at(-1)!==id)word.push(id);
  }
  if(word.length>1&&word[0]===word.at(-1))word.pop();
  const start=word.indexOf(interfaces[0].id);
  if(start<0||word.length!==interfaces.length||interfaces.some((item,i)=>word[(start+i)%word.length]!==item.id))throw Error('Ordine ciclico, continuità o identità delle interfacce non conservati.');
 }
 function correspondence(region,interfaces){
  validateInterfaces(interfaces);
  if(region.boundary.length<interfaces.length)throw Error('Il bordo non contiene abbastanza lati per tutte le interfacce.');
  const edgeInterfaces={},borders={},extra=region.boundary.length-interfaces.length;
  const wildcards=interfaces.filter(item=>item.color===null).length;
  if(extra&&!wildcards)throw Error('Il bordo aggiuntivo richiede interfacce senza vincolo di colore.');
  let edge=0,wildcard=0;
  for(const item of interfaces){
   // Only unconstrained interfaces may absorb additional atomic sides.
   const length=1+(item.color===null?Math.floor(++wildcard*extra/wildcards)-Math.floor((wildcard-1)*extra/wildcards):0);
   for(let i=0;i<length;i++){const e=region.boundary[edge++];edgeInterfaces[e.key]=item.id;borders[e.key]=item.color;}
  }
  return{edgeInterfaces,borders};
 }
 function certificate(ids,g,source,options,mapping){
  const region=regionBoundary(ids,g),metrics=TransitionObjectives.metrics(region);
  verifyBoundary(region,source.interfaces,mapping?.edgeInterfaces,mapping?.borders);
  if(!TransitionObjectives.withinAreaPercent(source.metrics,metrics,options.maxAreaPercent))throw Error('La realizzazione supera la tolleranza d’area.');
  if(!TransitionObjectives.withinRatioPercent(source.metrics,metrics,options.maxRatioPercent))throw Error('La realizzazione supera la tolleranza del rapporto B/I.');
  let shapeError;
  if(options.shapePreference||options.shapeConstraint){
   const shape=TransitionShape.settings(options),reference=TransitionShape.forSource(source,shape.shapeBandPercent);
   shapeError=TransitionShape.measure(reference,TransitionShape.region(ids,g),shape.shapeConstraint?{precision:.002,maxBoxes:8192}:undefined);
   if(shape.shapeConstraint){
    const decision=TransitionShape.decision(shapeError,shape.maxShapePercent);
    if(decision!=='pass'){const error=Error(decision==='fail'?'La realizzazione supera la tolleranza di forma.':'Verifica di forma inconcludente: la soglia interseca l’incertezza numerica.');error.code=decision==='fail'?'shape-rejected':'shape-inconclusive';throw error;}
   }
  }
  return{region,metrics,...(shapeError?{shapeError}:{}),edgeInterfaces:{...mapping.edgeInterfaces},borders:{...mapping.borders}};
 }
 function source(g,borders,palette,saved,legacy){
  const region=readTransitionRegion(g,borders,palette);
  // Migration uses only the old exterior IDs and their realized edge mapping.
  // Units, contacts, sourceCell and cellUnits are deliberately ignored.
  const model=saved||(legacy?{interfaces:legacy.graph?.boundary?.map(({id,color})=>({id,color})),edgeInterfaces:legacy.edgeInterfaces}:null);
  const interfaces=model?model.interfaces:region.boundary.map((e,id)=>({id,color:borders[e.key]}));
  if(model){try{verifyBoundary(region,interfaces,model.edgeInterfaces,borders,true);}catch(error){throw Error(error.message+' Usa «Ridefinisci interfacce dal bordo» dopo aver modificato il contorno.');}}
  validateInterfaces(interfaces);
  if(interfaces.some(i=>i.color!==null&&i.color>=palette.length))throw Error('Colore di interfaccia non valido.');
  return{geometry:g,region,interfaces:interfaces.map(({id,color})=>({id,color})),metrics:TransitionObjectives.metrics(region)};
 }
 function newTileset(proof,g,palette){
  if(!palette.length)throw Error('Palette vuota.');
  const tiles=[],seen=new Set();
  for(const id of proof.region.ids){
   const tile=cellAt(id,g).edges.map(k=>proof.borders[k]??0),code=tile.join(',');
   if(tile.some(c=>!Number.isInteger(c)||c<0||c>=palette.length))throw Error('Colore di interfaccia non valido.');
   if(!seen.has(code)){seen.add(code);tiles.push(tile);}
  }
  return tiles;
 }
 return{source,correspondence,verifyBoundary,certificate,newTileset};
})();
