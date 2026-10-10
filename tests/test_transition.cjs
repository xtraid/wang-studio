const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const els=new Map(),ctx=new Proxy({},{get:()=>()=>{}});
const el=s=>{if(!els.has(s))els.set(s,{value:'',checked:true,style:{},dataset:{},classList:{toggle(){}},getContext:()=>ctx,getBoundingClientRect:()=>({width:1000,height:650,left:0,top:0}),querySelectorAll:()=>[],append(){},setAttribute(){},addEventListener(){}});return els.get(s);};
const sandbox={console,document:{querySelector:el,querySelectorAll:()=>[],createElement:()=>el(Symbol()),body:el('body')},window:{addEventListener(){}},ResizeObserver:class{observe(){}},devicePixelRatio:1,requestAnimationFrame:()=>0,cancelAnimationFrame(){},setTimeout,AbortController,Blob,URL};
vm.createContext(sandbox);const run=s=>vm.runInContext(s,sandbox);const json=s=>JSON.parse(run(`JSON.stringify(${s})`));
for(const f of ['geometry.js','app.js','transition.js'])run(fs.readFileSync(path.join(__dirname,'../dist',f),'utf8'));
run(fs.readFileSync(path.join(__dirname,'boundary_fixtures.js'),'utf8'));
const geos=['square','tri-up','tri-side','hex-flat','hex-point'];
const sizes=[6,8,10,12,14,16,18,20,22,24];
const valid=(m,g)=>!g.startsWith('hex')||m!==8;
// Independent strict convex-polygon SAT: a shared edge/vertex is not overlap.
function overlaps(a,b){
 for(const p of [a,b])for(let i=0;i<p.length;i++){
  const q=p[(i+1)%p.length],axis=[-(q[1]-p[i][1]),q[0]-p[i][0]];
  const projection=poly=>poly.map(v=>v[0]*axis[0]+v[1]*axis[1]),u=projection(a),v=projection(b);
  if(Math.min(...u)>=Math.max(...v)-1e-8||Math.min(...v)>=Math.max(...u)-1e-8)return false;
 }return true;
}
function checkConstruction(m,g){
 run(`var built=constructTransitionRegion(${m},'${g}');`);
 const region=json('built');assert.equal(region.boundary.length,m);assert.equal(m,region.s*region.n-2*region.a);
 const polys=json(`built.ids.map(id=>cellAt(id,'${g}').p)`);
 for(let i=0;i<polys.length;i++)for(let j=0;j<i;j++)assert.equal(overlaps(polys[i],polys[j]),false,`${g} ${m}: cells overlap`);
 let area=0;for(const e of region.boundary){const a=e.from.split(',').map(Number),b=e.to.split(',').map(Number);area+=a[0]*b[1]-b[0]*a[1];}assert.ok(area<0,'Visual counterclockwise orientation');
 assert.equal(new Set(region.boundary.map(e=>e.from)).size,m,'Simple cycle');
 for(let i=0;i<m;i++)assert.equal(region.boundary[i].to,region.boundary[(i+1)%m].from);
 assert.deepEqual(json(`readTransitionRegion('${g}',Object.fromEntries(built.boundary.map((e,i)=>[e.key,i%5])),state.palette).ids.slice().sort()`),[...region.ids].sort());
}
for(const g of geos)for(const m of sizes){if(valid(m,g))checkConstruction(m,g);else assert.throws(()=>run(`constructTransitionRegion(${m},'${g}')`),/esagoni/);}
for(const m of [3,4,5,7,9,11])for(const g of geos){
 if(g.startsWith('tri')||g==='square'&&m%2===0)checkConstruction(m,g);
 else assert.throws(()=>run(`constructTransitionRegion(${m},'${g}')`));
}
// Offscreen source and coordinates independent of current viewport.
for(const g of geos){
 run(`var remote=constructTransitionRegion(16,'${g}').ids.map(id=>{const v=id.split(',').map(Number);v[0]-=5000;v[1]+=7000;return v.join(',');});var rb=regionBoundary(remote,'${g}');`);
 assert.equal(run(`readTransitionRegion('${g}',Object.fromEntries(rb.boundary.map(e=>[e.key,0])),state.palette).n`),run('remote.length'));
}
// General compact/concave source regions, beyond the target strip families.
for(const g of geos){
 run(`var shape=[];if('${g}'==='square'){for(let x=0;x<3;x++)for(let y=0;y<3;y++)if(x===0||y===2)shape.push(\`\${x},\${y}\`);}else if('${g}'.startsWith('tri')){for(let i=0;i<3;i++)for(let j=0;j<2;j++)for(let h=0;h<2;h++)shape.push(\`\${i},\${j},\${h}\`);}else{for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)if(Math.abs(i+j)<=1)shape.push(\`\${i},\${j}\`);}var general=regionBoundary(shape,'${g}');var colored=Object.fromEntries(general.boundary.map((e,i)=>[e.key,i%5]));`);
 assert.equal(run(`readTransitionRegion('${g}',colored,state.palette).n`),run('shape.length'));
 assert.deepEqual(json(`readTransitionRegion('${g}',Object.fromEntries(Object.entries(colored).reverse()),state.palette).colors`),json(`general.boundary.map((_,i)=>i%5)`),'Insertion order does not rotate/reverse the word');
}
// Extraction rejects invalid contours without mutating editor state.
function rejectAtomic(code){
 run(`state={geometry:'square',palette:['#000000'],sets:{square:[]},boards:{square:{placed:{},borders:{}}}};ensure();history=[];future=[];${code}`);
 const before=run('JSON.stringify({state,history,future,pan,zoom,selected,mode,selection:[...regionSelection.borders]})');
 assert.throws(()=>run('readTransitionRegion(state.geometry,board().borders,state.palette)'));
 assert.equal(run('JSON.stringify({state,history,future,pan,zoom,selected,mode,selection:[...regionSelection.borders]})'),before);
}
rejectAtomic('');
rejectAtomic("var b=constructTransitionRegion(12,'square');board().borders=Object.fromEntries(b.boundary.slice(1).map(e=>[e.key,0]));");
rejectAtomic("for(const id of ['0,0','3,0'])for(const k of cellAt(id).edges)board().borders[k]=0;");
rejectAtomic("for(const id of ['0,0','1,1'])for(const k of cellAt(id).edges)board().borders[k]=0;");
rejectAtomic("var counts=new Map();for(let x=0;x<3;x++)for(let y=0;y<3;y++){if(x===1&&y===1)continue;for(const k of cellAt(`${x},${y}`).edges)counts.set(k,(counts.get(k)||0)+1);}board().borders=Object.fromEntries([...counts].filter(([,n])=>n===1).map(([k])=>[k,0]));");
rejectAtomic("board().borders={'0,0|200000,0':0,'200000,0|0,200000':0,'0,0|0,200000':0};");
assert.throws(()=>run("regionBoundary(['0,0','0,0'],'square')"));
assert.throws(()=>run("regionBoundary(['0,0','2,2'],'square')"));
console.log('PASS: shared lattice geometry, perimeter identity, no overlap, offscreen and concave extraction; open, holed, disconnected and non-atomic contours rejected.');
