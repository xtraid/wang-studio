// Ordinary transitions preserve external interfaces only (historical filename).
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sandbox={console};vm.createContext(sandbox);const run=s=>vm.runInContext(s,sandbox),json=s=>JSON.parse(run(`JSON.stringify(${s})`));
for(const file of ['geometry.js','transition.js','transition-objectives.js','transition-shape.js','logical-transition.js','transition-search.js'])run(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'));
function source(ids,g){
 run(`var r=regionBoundary(${JSON.stringify(ids)},'${g}');var borders=Object.fromEntries(r.boundary.map((e,i)=>[e.key,[0,0,null,2,1,2,0][i%7]]));var src=BoundaryTransition.source('${g}',borders,['#ffffff','#222222','#123456']);`);
}
function search(target,area=50,ratio=100,steps=15000){run(`var search=TransitionSearch.create(src,'${target}',{maxAreaPercent:${area},maxRatioPercent:${ratio}});search.step(${steps});`);}
function certifyFront(target){
 run(`for(const c of search.state.frontier){BoundaryTransition.certificate(c.region.ids,'${target}',src,search.state,c);BoundaryTransition.newTileset(c,'${target}',['#ffffff','#222222','#123456']);}`);
 assert.equal(run('search.state.frontier.some((a,i)=>search.state.frontier.some((b,j)=>i!==j&&TransitionObjectives.dominates(src.metrics,a.metrics,b.metrics)))'),false);
 assert.equal(run('search.state.frontier.every((c,i,a)=>!i||TransitionObjectives.compareAreaError(src.metrics,a[i-1].metrics,c.metrics)<=0)'),true);
 assert.equal(run('search.state.frontier.every(c=>c.region.n>=search.state.bounds.min&&c.region.n<=search.state.bounds.max)'),true);
}
for(const ids of [['0,0'],['0,0','1,0','2,0'],Array.from({length:8},(_,i)=>`${i},0`),['0,0','1,0','0,1','1,1'],Array.from({length:16},(_,i)=>`${i%4},${Math.floor(i/4)}`)]){
 source(ids,'square');search('hex-flat',50,50);
 assert.ok(run('search.state.frontier.length>0'),`${ids.length} square cells -> hexagons has a witness`);
 assert.notEqual(run('search.state.status'),'unrealizable');certifyFront('hex-flat');
 if(ids.length===16)assert.ok(run('search.state.frontier.some(c=>c.region.n!==src.region.n)'),'destination cell count changes');
}
// All families and orientations, with a known strip witness under broad bounds.
// Triangle -> hex requires 100% area tolerance; hex -> triangles requires
// 100% to provide six distinct exterior interfaces (at least four atoms).
for(const g of ['square','tri-up','tri-side','hex-flat','hex-point'])for(const target of ['square','tri-up','tri-side','hex-flat','hex-point']){
 source(g.startsWith('tri')?['0,0,0']:['0,0'],g);search(target,100,100);
 assert.ok(run('search.state.frontier.length>0'),`${g} -> ${target}`);certifyFront(target);
}
// Exact mapping: duplicate colors remain distinct, jolly remains null, and
// repetition through transitions never creates extra logical interfaces.
source(['0,0','1,0'],'square');search('hex-flat',50,100);
run("var c=search.state.frontier[0];var saved={interfaces:src.interfaces,edgeInterfaces:c.edgeInterfaces};var restored=BoundaryTransition.source('hex-flat',c.borders,['#ffffff','#222222','#123456'],JSON.parse(JSON.stringify(saved)));");
assert.deepEqual(json('restored.interfaces'),json('src.interfaces'));
assert.equal(new Set(Object.values(json('c.edgeInterfaces'))).size,6);
assert.equal(run('Object.values(c.borders).includes(null)'),true);
run("var next=TransitionSearch.create(restored,'tri-up',{maxAreaPercent:100,maxRatioPercent:100});next.step(10000);var d=next.state.frontier[0];BoundaryTransition.certificate(d.region.ids,'tri-up',restored,next.state,d);");
assert.equal(new Set(Object.values(json('d.edgeInterfaces'))).size,6);
// The verifier checks the supplied map independently: reversal, split, missing
// interface, extra key and recoloring all fail, even with identical RGB values.
run('var reversed=JSON.parse(JSON.stringify(c));for(const k in reversed.edgeInterfaces)reversed.edgeInterfaces[k]=5-reversed.edgeInterfaces[k];');
assert.throws(()=>run("BoundaryTransition.certificate(c.region.ids,'hex-flat',src,search.state,reversed)"));
run('var broken=JSON.parse(JSON.stringify(c));delete broken.edgeInterfaces[Object.keys(broken.edgeInterfaces)[0]];');
assert.throws(()=>run("BoundaryTransition.certificate(c.region.ids,'hex-flat',src,search.state,broken)"));
run('var broken=JSON.parse(JSON.stringify(c));broken.borders[Object.keys(broken.borders)[0]]=99;');
assert.throws(()=>run("BoundaryTransition.certificate(c.region.ids,'hex-flat',src,search.state,broken)"));
run('var broken=JSON.parse(JSON.stringify(c));broken.edgeInterfaces.extra=0;');
assert.throws(()=>run("BoundaryTransition.certificate(c.region.ids,'hex-flat',src,search.state,broken)"));
run('var broken=JSON.parse(JSON.stringify(c));var keys=c.region.boundary.map(e=>e.key);broken.edgeInterfaces[keys[3]]=broken.edgeInterfaces[keys[0]];broken.borders[keys[3]]=broken.borders[keys[0]];');
assert.throws(()=>run("BoundaryTransition.certificate(c.region.ids,'hex-flat',src,search.state,broken)"));
// Identical colors cannot hide an interface reversal; actual cyclic rotations
// of the supplied map remain valid, including a run crossing the contour start.
run('var equalSource={...src,interfaces:src.interfaces.map(i=>({...i,color:0}))};var equalMap=BoundaryTransition.correspondence(src.region,equalSource.interfaces);var reversedMap=JSON.parse(JSON.stringify(equalMap));for(const k in reversedMap.edgeInterfaces)reversedMap.edgeInterfaces[k]=5-reversedMap.edgeInterfaces[k];');
assert.throws(()=>run("BoundaryTransition.certificate(src.region.ids,'square',equalSource,search.state,reversedMap)"),/Ordine/);
run("var rotatedMap={edgeInterfaces:{},borders:{}};var cycle=c.region.boundary;cycle.forEach((e,i)=>{var from=cycle[(i+1)%cycle.length].key;rotatedMap.edgeInterfaces[e.key]=c.edgeInterfaces[from];rotatedMap.borders[e.key]=c.borders[from];});BoundaryTransition.certificate(c.region.ids,'hex-flat',src,search.state,rotatedMap);");
// Old internal units may be deliberately nonsensical; only the boundary is read.
run("var migrated=BoundaryTransition.source('hex-flat',c.borders,['#ffffff','#222222','#123456'],null,{graph:{units:'ignored',boundary:src.interfaces},cellUnits:'ignored',edgeInterfaces:c.edgeInterfaces});");
assert.deepEqual(json('migrated.interfaces'),json('src.interfaces'));
assert.equal(run("Object.hasOwn(migrated,'graph')||Object.hasOwn(migrated,'cellUnits')"),false);
run('var recolored={...c.borders};recolored[Object.keys(recolored)[0]]=2;');
assert.throws(()=>run("BoundaryTransition.source('hex-flat',recolored,['#ffffff','#222222','#123456'],saved)"),/Ridefinisci/);
// 2x2 square -> four hexagons is certified despite changed internal contacts.
source(['0,0','1,0','0,1','1,1'],'square');
run("var hex=regionBoundary(['0,0','1,0','0,1','1,1'],'hex-flat');var mapping=BoundaryTransition.correspondence(hex,src.interfaces);var proof=BoundaryTransition.certificate(hex.ids,'hex-flat',src,{maxAreaPercent:50,maxRatioPercent:50},mapping);");
assert.notEqual(run('proof.metrics.I'),run('src.metrics.I'));
assert.throws(()=>run("BoundaryTransition.certificate(hex.ids,'hex-flat',src,{maxAreaPercent:29,maxRatioPercent:50},mapping)"),/area/);
// A strip has the same area as the compact source but violates a tight rho bound.
run("var strip=regionBoundary(['0,0','1,0','2,0','3,0'],'square');var stripMap=BoundaryTransition.correspondence(strip,src.interfaces);");
assert.throws(()=>run("BoundaryTransition.certificate(strip.ids,'square',src,{maxAreaPercent:0,maxRatioPercent:10},stripMap)"),/rapporto/);
search('square',0,10);assert.equal(run('search.state.frontier[0].metrics.I'),4);assert.ok(run('search.state.rejectedRatio>0'));
// Empty integer area range is a proof; inability to carry all boundary
// interfaces is currently just an incomplete search, never a false proof.
source(['0,0'],'square');search('hex-flat',0,100);assert.equal(run('search.state.proof.kind'),'area-cell-count');
search('tri-up',0,100);assert.equal(run('search.state.status'),'unrealizable');
source(['0,0'],'hex-flat');search('tri-up',0,100);assert.equal(run('search.state.frontier.length'),0);assert.equal(run('search.state.status'),'incomplete');assert.ok(run('search.state.rejectedBoundary>0'));
// Infinity convention: single square -> one hex preserves infinity exactly;
// single square -> two triangles is allowed only at tau=100%.
source(['0,0'],'square');search('hex-flat',50,0);assert.ok(run('search.state.frontier.length>0'));assert.equal(run('search.state.frontier[0].metrics.rho'),null);
search('tri-up',50,99.99);assert.equal(run('search.state.frontier.length'),0);assert.notEqual(run('search.state.status'),'unrealizable');
search('tri-up',50,100);assert.ok(run('search.state.frontier.length>0'));
// Invalid regions never pass: disconnected, duplicates, wrong atom IDs, holes.
for(const [ids,g]of [[['0,0','2,0'],'square'],[['0,0','0,0'],'square'],[['0,0,0'],'hex-flat'],[Array.from({length:9},(_,i)=>`${i%3},${Math.floor(i/3)}`).filter(id=>id!=='1,1'),'square']])assert.throws(()=>run(`regionBoundary(${JSON.stringify(ids)},'${g}')`));
// Screenshot regression: a 2x6 square region with a two-cell left tab.
// Exactly two adjacent green edges must survive a longer hexagonal perimeter.
run(`var tabIds=Array.from({length:12},(_,i)=>\`\${1+i%2},\${Math.floor(i/2)}\`).concat(['0,2','0,3']);
 var tab=regionBoundary(tabIds,'square');
 var tabBorders=Object.fromEntries(tab.boundary.map(e=>[e.key,null]));
 for(const id of ['0,2','0,3']){var edge=cellAt(id,'square').edges.find(k=>edgeOwners(k,'square').some(c=>c.id===\`-1,\${id.split(',')[1]}\`));tabBorders[edge]=1;}
 var src=BoundaryTransition.source('square',tabBorders,['#ffffff','#aabb88']);`);
assert.equal(run('Object.values(tabBorders).filter(c=>c===1).length'),2);
search('hex-flat',30,50);
assert.ok(run('search.state.frontier.length>0'));
assert.equal(run('search.state.frontier.every(c=>Object.values(c.borders).filter(v=>v===1).length===2)'),true);
run(`var c=search.state.frontier[0];var expanded={edgeInterfaces:{},borders:{}};
 c.region.boundary.forEach((e,i)=>{var item=src.interfaces[Math.floor(i*src.interfaces.length/c.region.boundary.length)];expanded.edgeInterfaces[e.key]=item.id;expanded.borders[e.key]=item.color;});`);
assert.ok(run('Object.values(expanded.borders).filter(v=>v===1).length>2'),'old proportional mapping duplicates green');
assert.throws(()=>run("BoundaryTransition.certificate(c.region.ids,'hex-flat',src,search.state,expanded)"),/duplicato/);
// Fully constrained boundaries cannot silently acquire colored sides.
run("var solid=BoundaryTransition.source('square',Object.fromEntries(regionBoundary(['0,0'],'square').boundary.map(e=>[e.key,0])),['#ffffff']);var noExpansion=TransitionSearch.create(solid,'hex-flat',{maxAreaPercent:50,maxRatioPercent:100});noExpansion.step(100);");
assert.equal(run('noExpansion.state.frontier.length'),0);
assert.ok(run('noExpansion.state.rejectedBoundary>0'));
assert.throws(()=>run("BoundaryTransition.correspondence(regionBoundary(['0,0'],'hex-flat'),solid.interfaces)"),/senza vincolo/);

// Optional expansion uses current atomic run lengths, including legacy runs.
run(`var sq=regionBoundary(['0,0'],'square'),hx=regionBoundary(['0,0'],'hex-flat');
 var opts={maxAreaPercent:10000,maxRatioPercent:100};
 var makeSource=colors=>BoundaryTransition.source('square',Object.fromEntries(sq.boundary.map((e,i)=>[e.key,colors[i]])),['#ffffff']);`);
for(const colors of [[0,0,0,0],[null,null,null,null],[0,0,null,0]])for(const enabled of [false,true]){
 run(`var unit=makeSource(${JSON.stringify(colors)}),options={...opts,allowWildcardExpansion:${enabled}};var trial=TransitionSearch.create(unit,'hex-flat',options);trial.step(100);`);
 run("BoundaryTransition.certificate(sq.ids,'square',unit,options,BoundaryTransition.correspondence(sq,unit,options));");
 const allowed=enabled&&colors.includes(null);
 assert.equal(run('trial.state.frontier.length>0'),allowed);
 if(allowed)run("var expandedMap=BoundaryTransition.correspondence(hx,unit,options);BoundaryTransition.certificate(hx.ids,'hex-flat',unit,options,expandedMap);");
 else assert.throws(()=>run('BoundaryTransition.correspondence(hx,unit,options)'));
}
run(`var unit=makeSource([0,0,null,0]),expandedMap=BoundaryTransition.correspondence(hx,unit);
 var expandedSource=BoundaryTransition.source('hex-flat',expandedMap.borders,['#ffffff'],{interfaces:unit.interfaces,edgeInterfaces:expandedMap.edgeInterfaces});`);
assert.equal(run('BoundaryTransition.sourceLengths(expandedSource)[2]'),3);
assert.equal(run('Object.values(expandedMap.borders).filter(c=>c===null).length'),3);
assert.throws(()=>run("BoundaryTransition.certificate(hx.ids,'hex-flat',unit,{...opts,allowWildcardExpansion:false},expandedMap)"),/lati esterni/);
// The old unit-only correspondence would contract the already expanded jolly.
run('var contracted=BoundaryTransition.correspondence(sq,unit.interfaces);');
for(const enabled of [false,true])assert.throws(()=>run(`BoundaryTransition.certificate(sq.ids,'square',expandedSource,{...opts,allowWildcardExpansion:${enabled}},contracted)`));
run(`var chained=TransitionSearch.create(expandedSource,'square',{...opts,allowWildcardExpansion:false});chained.step(500);
 for(const c of chained.state.frontier){BoundaryTransition.certificate(c.region.ids,'square',expandedSource,chained.state,c);}`);
assert.ok(run('chained.state.frontier.length>0'));
assert.ok(run('chained.state.frontier.every(c=>c.metrics.B===6&&Object.values(c.edgeInterfaces).filter(id=>id===2).length===3)'));
// A jolly run crossing index zero is contiguous on the cycle, in both modes.
run(`var wrap={edgeInterfaces:{},borders:{}};hx.boundary.forEach((e,i)=>{var k=hx.boundary[(i+3)%6].key;wrap.edgeInterfaces[e.key]=expandedMap.edgeInterfaces[k];wrap.borders[e.key]=expandedMap.borders[k];});`);
assert.equal(run('wrap.edgeInterfaces[hx.boundary[0].key]'),2);
assert.equal(run('wrap.edgeInterfaces[hx.boundary.at(-1).key]'),2);
for(const enabled of [false,true])run(`BoundaryTransition.certificate(hx.ids,'hex-flat',expandedSource,{...opts,allowWildcardExpansion:${enabled}},wrap)`);
// Inserting even an existing jolly between consecutive colored interfaces splits it.
run(`var split=JSON.parse(JSON.stringify(expandedMap));var k=hx.boundary[1].key;split.edgeInterfaces[k]=2;split.borders[k]=null;`);
assert.throws(()=>run("BoundaryTransition.certificate(hx.ids,'hex-flat',unit,opts,split)"),/Ordine/);
run('split.edgeInterfaces[hx.boundary[1].key]=99;');
assert.throws(()=>run("BoundaryTransition.certificate(hx.ids,'hex-flat',unit,opts,split)"),/Interfaccia/);
// Reallocation cannot shrink one jolly while expanding another, even at fixed B.
run(`var all=makeSource([null,null,null,null]),allMap=BoundaryTransition.correspondence(hx,all);
 var allExpanded=BoundaryTransition.source('hex-flat',allMap.borders,['#ffffff'],{interfaces:all.interfaces,edgeInterfaces:allMap.edgeInterfaces});
 var shifted={edgeInterfaces:{},borders:{}};[0,0,1,2,3,3].forEach((id,i)=>{shifted.edgeInterfaces[hx.boundary[i].key]=id;shifted.borders[hx.boundary[i].key]=null;});`);
for(const enabled of [false,true])assert.throws(()=>run(`BoundaryTransition.certificate(hx.ids,'hex-flat',allExpanded,{...opts,allowWildcardExpansion:${enabled}},shifted)`),/Estensione/);
// Legacy colored multi-edge runs are preserved at their actual length as well.
run(`var legacyColors=unit.interfaces.map(i=>({...i,color:0})),legacyBorders=Object.fromEntries(hx.boundary.map(e=>[e.key,0]));
 var oldSource=BoundaryTransition.source('hex-flat',legacyBorders,['#ffffff'],null,{graph:{boundary:legacyColors},edgeInterfaces:expandedMap.edgeInterfaces});
 var oldMap=BoundaryTransition.correspondence(hx,oldSource,{allowWildcardExpansion:false});
 BoundaryTransition.certificate(hx.ids,'hex-flat',oldSource,{...opts,allowWildcardExpansion:false},oldMap);`);
assert.equal(run('BoundaryTransition.sourceLengths(oldSource)[2]'),3);
assert.throws(()=>run('BoundaryTransition.sourceLengths({...expandedSource,edgeInterfaces:undefined})'),/mancante/);
assert.throws(()=>run("BoundaryTransition.settings({allowWildcardExpansion:'false'})"));

// Worker deadline preserves partial state without an impossibility claim.
source(Array.from({length:16},(_,i)=>`${i%4},${Math.floor(i/4)}`),'square');
run("var posted=[],ticks=0;var performance={now:()=>++ticks*1000};var self={postMessage:data=>posted.push(data)};var importScripts=()=>{};var setTimeout=()=>{throw Error('Expired worker must not schedule another tick');};");
run(fs.readFileSync(path.join(__dirname,'../dist/transition-worker.js'),'utf8'));
run("self.onmessage({data:{source:src,target:'hex-flat',maxAreaPercent:50,maxRatioPercent:50,milliseconds:1}});");
assert.equal(run('posted[0].status'),'incomplete');assert.match(run('posted[0].reason'),/Tempo/);assert.equal(run('posted[0].proof'),null);
console.log('PASS: boundary-only certificates, all geometries, small/2x2/4x4 sources, changed cell counts, exact area bounds, ratio tolerance, infinity, migration, cyclic interfaces, optional wildcard expansion, current run lengths, chained transitions, manual mapping rejection, independent tilesets and Worker timeout.');
