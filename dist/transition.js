/* Boundary-word transition. Uses the editor's actual polygons and edge keys. */
const transitionGeometries=['square','tri-up','tri-side','hex-flat','hex-point'];
const transitionLimit=20000;
const vertexNumbers=v=>v.split(',').map(Number);
const transitionVertex=p=>p.map(v=>Math.round(v*1e5)).join(',');
const vertexLess=(a,b)=>{const[x,y]=vertexNumbers(a),[u,v]=vertexNumbers(b);return x<u||(x===u&&y<v);};
function transitionGeometry(g){if(!transitionGeometries.includes(g))throw Error('Geometria non supportata.');}

// A lattice edge cannot cross another lattice edge except at a vertex. Degree
// two, one cycle and valid atomic edges therefore establish a simple contour.
function orderedContour(keys){
 if(keys.length<3||keys.length>transitionLimit)throw Error('Contorno vuoto o troppo grande (massimo 20000 segmenti).');
 const at=new Map();let start=null;
 for(const k of keys){
  const ends=k.split('|');
  if(ends.length!==2||ends[0]===ends[1])throw Error('Lato di bordo non valido.');
  for(const v of ends){
   if(!/^-?\d+,-?\d+$/.test(v)||vertexNumbers(v).some(n=>!Number.isSafeInteger(n)||Math.abs(n)>1e10))throw Error('Coordinate del bordo fuori dai limiti supportati.');
   if(start===null||vertexLess(v,start))start=v;
   if(!at.has(v))at.set(v,[]);at.get(v).push(k);
  }
 }
 if([...at.values()].some(es=>es.length!==2))throw Error('Il bordo deve essere semplice e chiuso: estremità aperte o vertici ramificati non supportati.');
 const walk=[];let v=start,previous=null;const visited=new Set();
 do{
  const k=at.get(v).find(k=>k!==previous);
  if(visited.has(k))throw Error('Bordo non semplice.');
  visited.add(k);const ends=k.split('|'),next=ends[0]===v?ends[1]:ends[0];
  walk.push({key:k,from:v,to:next});previous=k;v=next;
 }while(v!==start);
 if(walk.length!==keys.length)throw Error('Buchi o componenti disconnesse: è supportato un solo bordo semplice.');
 const [ox,oy]=vertexNumbers(start);let area=0;
 for(const e of walk){const[x,y]=vertexNumbers(e.from),[u,v]=vertexNumbers(e.to);area+=(x-ox)*(v-oy)-(u-ox)*(y-oy);}
 if(!area)throw Error('Il bordo non racchiude una regione.');
 // Canvas y points down: negative shoelace area is visually anticlockwise.
 return area<0?walk:walk.reverse().map(e=>({key:e.key,from:e.to,to:e.from}));
}
function nearbyCells(point,g){
 const[u,v]=lattice(point,g),result=[];
 for(let j=Math.floor(v)-2;j<=Math.ceil(v)+2;j++)for(let i=Math.floor(u)-2;i<=Math.ceil(u)+2;i++)
  for(let h=0;h<(g.startsWith('tri')?2:1);h++)result.push(cellAt(g.startsWith('tri')?`${i},${j},${h}`:`${i},${j}`,g));
 return result;
}
function edgeOwners(k,g){const[a,b]=borderPoints(k);return nearbyCells([(a[0]+b[0])/2,(a[1]+b[1])/2],g).filter(c=>c.edges.includes(k));}
function cellNeighbors(c,g){
 const[i,j]=c.id.split(',').map(Number),neighbors=new Map();
 for(let y=j-1;y<=j+1;y++)for(let x=i-1;x<=i+1;x++)for(let h=0;h<(g.startsWith('tri')?2:1);h++){
  const id=g.startsWith('tri')?`${x},${y},${h}`:`${x},${y}`;if(id===c.id)continue;
  const other=cellAt(id,g);for(const k of other.edges)if(c.edges.includes(k))neighbors.set(k,other.id);
 }
 if(neighbors.size!==c.edges.length)throw Error('Adiacenze geometriche non coerenti.');
 return neighbors;
}
function regionBoundary(ids,g){
 transitionGeometry(g);
 if(!ids.length||ids.length>transitionLimit||new Set(ids).size!==ids.length)throw Error('Regione vuota, duplicata o troppo grande.');
 const claims=new Map(),adj=new Map(ids.map(id=>[id,[]]));let a=0;
 for(const id of ids){
  const pattern=g.startsWith('tri')?/^-?\d+,-?\d+,[01]$/:/^-?\d+,-?\d+$/;
  if(!pattern.test(id)||id.split(',').some(v=>!Number.isSafeInteger(+v)||Math.abs(+v)>100000)||id!==id.split(',').map(Number).join(','))throw Error('Cella non valida per la geometria.');
  for(const k of cellAt(id,g).edges){
   if(!claims.has(k))claims.set(k,[id]);
   else{const owners=claims.get(k);if(owners.length!==1)throw Error('Sovrapposizione geometrica.');adj.get(id).push(owners[0]);adj.get(owners[0]).push(id);owners.push(id);a++;}
  }
 }
 const queue=[ids[0]],seen=new Set(queue);
 for(let h=0;h<queue.length;h++)for(const id of adj.get(queue[h]))if(!seen.has(id)){seen.add(id);queue.push(id);}
 if(seen.size!==ids.length)throw Error('Regione disconnessa non supportata.');
 const boundary=orderedContour([...claims].filter(([,owners])=>owners.length===1).map(([k])=>k));
 const s=cellAt(ids[0],g).p.length;
 if(boundary.length!==s*ids.length-2*a)throw Error('Identità del perimetro non rispettata.');
 return{ids,boundary,n:ids.length,a,s};
}
function readTransitionRegion(g,borders,palette){
 transitionGeometry(g);const keys=Object.keys(borders),boundary=orderedContour(keys);
 for(const k of keys){const color=borders[k];if(color!==null&&(!Number.isInteger(color)||color<0||color>=palette.length))throw Error('Colore di bordo non valido.');}
 // Validate the entire cycle as atomic sides before flood fill.
 let seed;
 for(const e of boundary){
  const owners=edgeOwners(e.key,g);if(owners.length!==2)throw Error('Il contorno contiene lati non atomici per questa geometria.');
  if(!seed){seed=owners.find(c=>{const i=c.edges.indexOf(e.key);return transitionVertex(c.p[i])===e.to;});}
 }
 if(!seed)throw Error('Impossibile individuare il lato interno del contorno.');
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const e of boundary){const[x,y]=vertexNumbers(e.from).map(n=>n/1e5);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 const queue=[seed.id],seen=new Set(queue),barriers=new Set(keys);
 for(let h=0;h<queue.length;h++){
  const c=cellAt(queue[h],g),[x,y]=c.center;
  if(x<x0||x>x1||y<y0||y>y1)throw Error('Contorno aperto o interno non valido.');
  if(queue.length>transitionLimit)throw Error('Regione troppo grande (massimo 20000 celle).');
  for(const[k,id]of cellNeighbors(c,g))if(!barriers.has(k)&&!seen.has(id)){seen.add(id);queue.push(id);}
 }
 const region=regionBoundary(queue,g);
 if(region.boundary.length!==keys.length||region.boundary.some(e=>!barriers.has(e.key)))throw Error('Il bordo non coincide con la regione: buchi o bordi interni non supportati.');
 return{...region,colors:region.boundary.map(e=>borders[e.key])};
}
function constructTransitionRegion(m,g){
 transitionGeometry(g);if(!Number.isSafeInteger(m)||m<3||m>transitionLimit)throw Error('Perimetro fuori dai limiti supportati.');
 let ids=[];
 if(g.startsWith('tri')){for(let k=0;k<m-2;k++)ids.push(`${Math.floor(k/2)},0,${k%2}`);}
 else if(g==='square'){
  if(m<4||m%2)throw Error('I quadrati richiedono un perimetro pari almeno 4.');
  for(let i=0;i<(m-2)/2;i++)ids.push(`${i},0`);
 }else{
  if(m<6||m%2||m===8)throw Error('Gli esagoni supportano 6, 10 e tutti i perimetri pari da 12.');
  if(m%4===2){for(let i=0;i<(m-2)/4;i++)ids.push(`${i},0`);}
  else{ids=['0,0','1,0','0,1'];for(let i=1;i<=(m-12)/4;i++)ids.push(`${-i},0`);}
 }
 const result=regionBoundary(ids,g);if(result.boundary.length!==m)throw Error('La costruzione non conserva il perimetro.');return result;
}
function planGeometryTransition(source,target){
 transitionGeometry(target);
 const existing=state.boards[target];
 if(target!==source&&existing&&(Object.keys(existing.placed).length||Object.keys(existing.borders).length))throw Error('La griglia di destinazione è occupata. Salvala e svuotala prima della transizione.');
 const original=readTransitionRegion(source,state.boards[source].borders,state.palette);
 const result=constructTransitionRegion(original.boundary.length,target),borders={};
 result.boundary.forEach((e,i)=>{borders[e.key]=original.colors[i];});
 const next=clone(state),f=target.split('-')[0];
 next.geometry=target;next.boards[source]={placed:{},borders:{}};next.boards[target]={placed:{},borders};
 if(!next.sets[f])next.sets[f]=[];
 next.solverEngine=null;
 return{next,original,result};
}
function transitionRegion(target){
 let plan;try{plan=planGeometryTransition(state.geometry,target);}catch(err){message('Transizione non applicata: '+err.message);return false;}
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const e of plan.result.boundary){const[x,y]=vertexNumbers(e.from).map(n=>n/1e5);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 snapshot();state=plan.next;selected=0;hover=null;mode='border';
 zoom=Math.max(.35,Math.min(1,(width-60)/(58*(x1-x0)),(height-60)/(58*(y1-y0))));
 pan={x:-(x0+x1)*scale()/2,y:-(y0+y1)*scale()/2};
 ensure();rebuild();renderUI();setMode('border');
 message(`Regione trasformata: ${plan.result.n} celle, ${plan.result.boundary.length} segmenti conservati. Tessere posate non trasferite; definisci il tileset separatamente. Ctrl+Z per annullare.`);
 return true;
}
$('#transitionRegion').onclick=()=>transitionRegion($('#transitionGeometry').value);
