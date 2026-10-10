/* Logical interface certificates. No source tiles are converted. */
const LogicalTransition=(()=>{
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function claims(ids,g){
  const edges=new Map();for(const id of ids)for(const key of cellAt(id,g).edges){if(!edges.has(key))edges.set(key,[]);edges.get(key).push(id);}return edges;
 }
 function validateGraph(graph){
  if(!graph||!Array.isArray(graph.units)||!graph.units.length||!Array.isArray(graph.boundary)||!graph.boundary.length)throw Error('Grafo logico non valido.');
  const boundaries=new Map(),contacts=new Map();
  graph.boundary.forEach((b,i)=>{if(b.id!==i||!Number.isInteger(b.unit)||b.unit<0||b.unit>=graph.units.length)throw Error('Interfaccia esterna non valida.');boundaries.set(i,b);});
  const seen=new Set();
  graph.units.forEach((unit,u)=>{
   if(!Array.isArray(unit.ports)||unit.ports.length<1)throw Error('Unità logica non valida.');
   const neighbors=new Set();
   for(const p of unit.ports){
    if(p.kind==='boundary'){
     if(!boundaries.has(p.id)||boundaries.get(p.id).unit!==u||seen.has(p.id))throw Error('Incidenza del bordo non valida.');seen.add(p.id);
    }else if(p.kind==='contact'){
     if(!Number.isInteger(p.unit)||p.unit<0||p.unit>=graph.units.length||p.unit===u||neighbors.has(p.unit))throw Error('Contatto logico non valido.');
     neighbors.add(p.unit);contacts.set(`${u},${p.unit}`,true);
    }else throw Error('Tipo di interfaccia non valido.');
   }
  });
  if(seen.size!==graph.boundary.length)throw Error('Interfacce di bordo mancanti.');
  for(const k of contacts.keys()){const[u,v]=k.split(',');if(!contacts.has(`${v},${u}`))throw Error('Contatto non simmetrico.');}
 }
 function interiorFaces(graph){
  validateGraph(graph);const visited=new Set(),faces=[];
  graph.units.forEach((unit,u)=>unit.ports.forEach(p=>{
   if(p.kind!=='contact'||visited.has(`${u},${p.unit}`))return;
   let a=u,b=p.unit,external=false;const cycle=[];
   do{
    const dart=`${a},${b}`;if(visited.has(dart))throw Error('Ordine delle interfacce non coerente.');visited.add(dart);cycle.push(a);
    const ports=graph.units[b].ports;let i=ports.findIndex(q=>q.kind==='contact'&&q.unit===a);
    do{i=(i+1)%ports.length;if(ports[i].kind==='boundary')external=true;}while(ports[i].kind!=='contact');
    a=b;b=ports[i].unit;
   }while(a!==u||b!==p.unit);
   if(!external)faces.push(cycle);
  }));return faces;
 }
 function atomicModel(region,g){
  const owners=claims(region.ids,g),unitsByCell=Object.fromEntries(region.ids.map((id,i)=>[id,i]));
  const boundary=region.boundary.map((e,id)=>({id,unit:unitsByCell[owners.get(e.key)[0]],color:region.colors[id]}));
  const outside=new Map(region.boundary.map((e,i)=>[e.key,i]));
  const units=region.ids.map(id=>({sourceCell:id,sourceGeometry:g,ports:regionBoundary([id],g).boundary.map(e=>{
   const other=owners.get(e.key).find(c=>c!==id);
   return other===undefined?{kind:'boundary',id:outside.get(e.key)}:{kind:'contact',unit:unitsByCell[other]};
  })}));
  const graph={units,boundary};validateGraph(graph);return{graph,cellUnits:unitsByCell};
 }
 function distribute(edges,interfaces,assignment){
  if(edges.length<interfaces.length||(!interfaces.length&&edges.length))return false;
  edges.forEach((e,i)=>{assignment[e]=interfaces[Math.floor(i*interfaces.length/edges.length)].id;});return true;
 }
 function matchPorts(ports,edges,assignment){
  const first=ports.findIndex(p=>p.kind==='contact');
  if(first<0)return edges.every(e=>e.kind==='boundary')&&distribute(edges.map(e=>e.key),ports,assignment);
  const wanted=ports[first].unit;
  const starts=edges.map((e,i)=>i).filter(i=>edges[i].kind==='contact'&&edges[i].unit===wanted&&!(edges[(i+edges.length-1)%edges.length].kind==='contact'&&edges[(i+edges.length-1)%edges.length].unit===wanted));
  if(starts.length!==1)return false;
  const source=ports.slice(first).concat(ports.slice(0,first)),target=edges.slice(starts[0]).concat(edges.slice(0,starts[0]));
  let si=0,ti=0;
  while(si<source.length){
   const p=source[si++];if(p.kind!=='contact'||target[ti]?.kind!=='contact'||target[ti].unit!==p.unit)return false;
   do{ti++;}while(ti<target.length&&target[ti].kind==='contact'&&target[ti].unit===p.unit);
   const bs=[],bt=[];while(si<source.length&&source[si].kind==='boundary')bs.push(source[si++]);
   while(ti<target.length&&target[ti].kind==='boundary')bt.push(target[ti++].key);
   if(!distribute(bt,bs,assignment))return false;
  }
  return ti===target.length;
 }
 function certificate(ids,g,graph,cellUnits){
  validateGraph(graph);const region=regionBoundary(ids,g),owners=claims(ids,g),groups=graph.units.map(()=>[]);
  if(Object.keys(cellUnits).length!==ids.length)throw Error('La partizione non copre esattamente la regione.');
  for(const id of ids){const u=cellUnits[id];if(!Number.isInteger(u)||!groups[u])throw Error('Partizione logica non valida.');groups[u].push(id);}
  const edgeInterfaces={};
  for(let u=0;u<groups.length;u++){
   if(!groups[u].length)throw Error('Unità logica mancante.');
   const unit=regionBoundary(groups[u],g);
   const edges=unit.boundary.map(e=>{
    const other=owners.get(e.key).find(id=>cellUnits[id]!==u);
    return other===undefined?{key:e.key,kind:'boundary'}:{key:e.key,kind:'contact',unit:cellUnits[other]};
   });
   if(!matchPorts(graph.units[u].ports,edges,edgeInterfaces))throw Error('Incidenze o ordine delle interfacce logiche non conservati.');
  }
  const word=[];for(const e of region.boundary){const id=edgeInterfaces[e.key];if(id===undefined)throw Error('Interfaccia esterna mancante.');if(word.at(-1)!==id)word.push(id);}
  if(word.length>1&&word[0]===word.at(-1))word.pop();
  const start=word.indexOf(0),ordered=word.slice(start).concat(word.slice(0,start));
  if(start<0||!same(ordered,graph.boundary.map(b=>b.id)))throw Error('Sequenza ciclica delle interfacce non conservata.');
  const borders=Object.fromEntries(region.boundary.map(e=>[e.key,graph.boundary[edgeInterfaces[e.key]].color]));
  const contacts=[...owners].filter(([,ids])=>ids.length===2&&cellUnits[ids[0]]!==cellUnits[ids[1]]).map(([key])=>key);
  return{region,metrics:TransitionObjectives.metrics(region),cellUnits:{...cellUnits},edgeInterfaces,contacts,borders};
 }
 function source(g,borders,palette,logical){
  const region=readTransitionRegion(g,borders,palette),model=logical||atomicModel(region,g);
  const proof=certificate(region.ids,g,model.graph,model.cellUnits);
  if(Object.entries(proof.borders).some(([k,v])=>borders[k]!==v))throw Error('Colori modificati rispetto alla partizione logica. Usa «Ogni cella come unità» per ridefinirla.');
  return{geometry:g,region,graph:model.graph,cellUnits:model.cellUnits,metrics:proof.metrics};
 }
 function obstruction(graph,g){
  const maxValence=g.startsWith('hex')?3:g==='square'?4:6;
  const face=interiorFaces(graph).find(f=>f.length>maxValence);
  if(!face)return null;
  return{kind:'interior-face-valence',units:face,targetValence:maxValence,message:`Non realizzabile: una faccia interna del grafo logico coinvolge ${face.length} unità; nella geometria scelta possono incontrarsi al massimo ${maxValence} unità senza introdurre altri contatti o interfacce.`};
 }
 function newTileset(proof,g,palette){
  // An independent atomic witness tileset. Interior sides use palette color 0.
  // Wildcards impose no color, so this witness also chooses 0 there.
  if(!palette.length)throw Error('Palette vuota.');
  const tiles=[],seen=new Set();
  for(const id of proof.region.ids){
   const tile=cellAt(id,g).edges.map(k=>proof.borders[k]??0),code=tile.join(',');
   if(tile.some(c=>!Number.isInteger(c)||c<0||c>=palette.length))throw Error('Colore di interfaccia non valido.');
   if(!seen.has(code)){seen.add(code);tiles.push(tile);}
  }
  return tiles;
 }
 return{atomicModel,certificate,source,obstruction,newTileset,interiorFaces};
})();
