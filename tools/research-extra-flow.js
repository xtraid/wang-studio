/* Figures rendered by Wang Studio; exact counts ignore displayed fixed tiles. */
(async()=>{
 const result={images:[],checks:[]};
 const palette=['#dce5df','#527a39','#3c6f92','#d4a14a'];
 function setup(ids,tiles=[[0,0,0,0]]){
  state={geometry:'square',palette:[...palette],sets:{square:tiles},boards:{square:{placed:{},borders:{}}}};
  selected=0;ensure();history=[];future=[];
  const r=regionBoundary(ids,'square');
  board().borders=Object.fromEntries(r.boundary.map(e=>[e.key,null]));
  rebuild();renderUI();return r;
 }
 function capture(name){
  const r=readTransitionRegion('square',board().borders,state.palette);
  const project={version:1,...clone(state)};
  if(name==='generalizzata-bordo'||name.startsWith('perimetro-'))project.boards.square.placed={};
  validate(project);
  result.images.push({name,png:exportCanvas('all').toDataURL('image/png').split(',')[1],project,metrics:TransitionObjectives.metrics(r)});
 }
 function verify(ids,tiles){
  const assigned={};let solutions=0;
  function walk(n){
   if(n===ids.length){solutions++;return;}
   const id=ids[n],c=cellAt(id);
   for(const t of tiles){
    if(c.edges.some((key,i)=>{
     const b=board().borders[key];if(b!==undefined&&b!==null&&b!==t[i])return true;
     return Object.entries(assigned).some(([other,u])=>{const j=cellAt(other).edges.indexOf(key);return j>=0&&u[j]!==t[i];});
    }))continue;
    assigned[id]=t;walk(n+1);delete assigned[id];
   }
  }
  walk(0);return solutions;
 }
 const ids=['0,0','1,0','0,1','1,1'];
 const tiles=[[1,2,3,1],[1,1,2,2],[3,1,1,1],[2,1,1,1]];
 let r=setup(ids,tiles);
 ids.forEach((id,i)=>board().placed[id]=tiles[i]);
 for(const e of r.boundary){const id=ids.find(id=>cellAt(id).edges.includes(e.key));board().borders[e.key]=board().placed[id][cellAt(id).edges.indexOf(e.key)];}
 if(ids.some(id=>conflicts(cellAt(id),board().placed[id])))throw Error('Invalid solution');
 result.checks.push({example:'soluzione-atomica',solutions:verify(ids,tiles)});capture('soluzione-atomica');
 const pair=['0,0','1,0'],tg=[[1,2,1,1],[1,1,1,2]];
 r=setup(pair,tg);for(const e of r.boundary)board().borders[e.key]=1;
 pair.forEach(id=>board().placed[id]=[0,0,0,0]);capture('generalizzata-bordo');
 pair.forEach((id,i)=>board().placed[id]=tg[i]);
 const exact=verify(pair,tg);if(exact!==1)throw Error('Generalized example is not unique');
 result.checks.push({example:'generalizzata-interno',solutions:exact,assignments:4});capture('generalizzata-interno');
 const examples=[{k:1,ids:['0,0'],add:'1,0'},{k:2,ids:['0,0','0,1','1,1'],add:'1,0'},{k:3,ids:['0,0','1,0','2,0','0,1','2,1'],add:'1,1'}];
 for(const ex of examples){
  setup(ex.ids);ex.ids.forEach(id=>board().placed[id]=[0,0,0,0]);capture(`perimetro-k${ex.k}-prima`);
  const before=result.images.at(-1).metrics;
  setup([...ex.ids,ex.add]);ex.ids.forEach(id=>board().placed[id]=[0,0,0,0]);board().placed[ex.add]=[3,3,3,3];capture(`perimetro-k${ex.k}-dopo`);
  const after=result.images.at(-1).metrics;
  if(after.B-before.B!==4-2*ex.k)throw Error('Incorrect boundary variation');
  result.checks.push({k:ex.k,before,after,expectedDelta:4-2*ex.k});
 }
 return result;
})()
