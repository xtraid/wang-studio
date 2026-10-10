const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sandbox={console};vm.createContext(sandbox);const run=s=>vm.runInContext(s,sandbox),json=s=>JSON.parse(run(`JSON.stringify(${s})`));
for(const file of ['geometry.js','transition.js','transition-objectives.js','logical-transition.js','transition-search.js'])run(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'));
function source(ids,g){
 run(`var r=regionBoundary(${JSON.stringify(ids)},'${g}');r.colors=r.boundary.map((_,i)=>i%3);var model=LogicalTransition.atomicModel(r,'${g}');var src={geometry:'${g}',region:r,graph:model.graph,cellUnits:model.cellUnits,metrics:TransitionObjectives.metrics(r)};`);
}
for(const g of ['square','tri-up','tri-side','hex-flat','hex-point']){
 source(g.startsWith('tri')?['0,0,0']:['0,0'],g);
 assert.doesNotThrow(()=>run(`LogicalTransition.certificate(src.region.ids,'${g}',src.graph,src.cellUnits)`));
 assert.equal(run(`LogicalTransition.obstruction(src.graph,'${g}')`),null);
}
// An incompatibility certificate must never reject the source lattice itself.
for(const g of ['square','tri-up','tri-side','hex-flat','hex-point'])for(let n=3;n<=10;n++){
 const ids=g.startsWith('tri')?Array.from({length:n},(_,i)=>`${Math.floor(i/2)},0,${i%2}`):Array.from({length:n},(_,i)=>`${i%3},${Math.floor(i/3)}`);
 source(ids,g);assert.equal(run(`LogicalTransition.obstruction(src.graph,'${g}')`),null);
 assert.doesNotThrow(()=>run(`LogicalTransition.certificate(src.region.ids,'${g}',src.graph,src.cellUnits)`));
}
// Two adjacent squares -> two hexagons. Six exterior interfaces become ten
// atomic edges; logical contacts and all six interface identities remain.
source(['0,0','1,0'],'square');
run("var proof=LogicalTransition.certificate(['0,0','1,0'],'hex-flat',src.graph,{'0,0':0,'1,0':1});");
assert.equal(run('proof.region.boundary.length'),10);assert.equal(run('src.graph.boundary.length'),6);
assert.equal(new Set(Object.values(json('proof.edgeInterfaces'))).size,6);
assert.equal(run('proof.contacts.length'),1);
assert.equal(run('proof.metrics.internalFaces'),2);assert.equal(run('proof.metrics.externalFaces'),10);
const colors=json('src.graph.boundary.map(b=>b.color)'),mapping=json('proof.edgeInterfaces'),borders=json('proof.borders');
for(const[k,i]of Object.entries(mapping))assert.equal(borders[k],colors[i]);
// Same-color interfaces stay distinct. They are not run-length color encoding.
run("src.graph.boundary.forEach(b=>b.color=0);var equal=LogicalTransition.certificate(['0,0','1,0'],'hex-flat',src.graph,{'0,0':0,'1,0':1});");
assert.equal(new Set(Object.values(json('equal.edgeInterfaces'))).size,6);
// A target unit can consist of several atoms and retain its external ports.
source(['0,0'],'square');
run("var grouped=LogicalTransition.certificate(['0,0,0','0,0,1'],'tri-up',src.graph,{'0,0,0':0,'0,0,1':0});");
assert.equal(run('grouped.region.n'),2);assert.equal(run('grouped.metrics.internalFaces'),2);assert.equal(run('grouped.contacts.length'),0);
assert.throws(()=>run("LogicalTransition.certificate(['0,0,0'],'tri-up',src.graph,{'0,0,0':0})"),/interfacce/);
// Additional logical contact, missing unit, disconnected unit and wrong order.
source(['0,0','1,0','2,0'],'square');
assert.throws(()=>run("LogicalTransition.certificate(['0,0','1,0','0,1'],'hex-flat',src.graph,{'0,0':0,'1,0':1,'0,1':2})"));
assert.throws(()=>run("LogicalTransition.certificate(['0,0','1,0'],'square',src.graph,{'0,0':0,'1,0':1})"));
assert.throws(()=>run("LogicalTransition.certificate(['0,0','1,0','2,0'],'square',src.graph,{'0,0':0,'1,0':1,'2,0':0})"));
source(['0,0','1,0'],'square');
run('var inverted=JSON.parse(JSON.stringify(src.graph));inverted.units[0].ports.reverse();');
assert.throws(()=>run("LogicalTransition.certificate(['0,0','1,0'],'hex-flat',inverted,{'0,0':0,'1,0':1})"));
// Interior-face obstruction: a four-unit junction cannot survive on a
// three-valent hexagonal lattice without another contact or boundary interface.
source(['0,0','1,0','0,1','1,1'],'square');
assert.equal(run("LogicalTransition.obstruction(src.graph,'hex-flat').kind"),'interior-face-valence');
assert.equal(run("LogicalTransition.obstruction(src.graph,'tri-up')"),null);
assert.equal(run("TransitionSearch.create(src,'hex-flat').state.status"),'unrealizable');
assert.equal(run("TransitionSearch.create(src,'hex-flat').state.frontier.length"),0);
// Search uses proof filtering and keeps a Pareto front of observed candidates.
for(const [g,ids,target]of [['square',['0,0'],'tri-up'],['square',['0,0','1,0'],'hex-flat'],['hex-flat',['0,0'],'square'],['tri-up',['0,0,0'],'hex-flat']]){
 source(ids,g);run(`var search=TransitionSearch.create(src,'${target}',{maxAreaPercent:100});for(let i=0;i<100;i++)search.step(50);`);
 assert.ok(run('search.state.accepted>0'),`${g} -> ${target} finds a certified realization`);
 assert.ok(run('search.state.frontier.length>0'));
 assert.ok(['running','incomplete'].includes(run('search.state.status')),'Finite search is not reported as a global completion proof');
 run(`for(const c of search.state.frontier){LogicalTransition.certificate(c.region.ids,'${target}',src.graph,c.cellUnits);LogicalTransition.newTileset(c,'${target}',['#ffffff','#ffffff','#123456']);}`);
 assert.equal(run('search.state.frontier.some((a,i)=>search.state.frontier.some((b,j)=>i!==j&&TransitionObjectives.dominates(src.metrics,a.metrics,b.metrics)))'),false);
}
// A compact source with genuine internal cycles also has certified target
// partitions; the search is not restricted to one-cell or path examples.
source(Array.from({length:9},(_,i)=>`${i%3},${Math.floor(i/3)}`),'square');
run("var compactSearch=TransitionSearch.create(src,'tri-up');for(let i=0;i<150;i++)compactSearch.step(50);");
assert.ok(run('compactSearch.state.accepted>0'));
assert.ok(run('compactSearch.state.frontier.every(c=>new Set(Object.values(c.cellUnits)).size===9)'));
// The direct rhombus construction reaches the port-count lower bound instead
// of growing 9 squares into the old raster seed of 31 triangles (or larger).
assert.equal(run("TransitionObjectives.minimumCells(src.graph,3)"),18);
assert.equal(run('compactSearch.state.frontier[0].metrics.n'),18);
assert.ok(run('TransitionObjectives.comparison(src.metrics,compactSearch.state.frontier[0].metrics).relativeAreaError<.30'));
assert.equal(run('compactSearch.state.frontier.every((c,i,a)=>!i||TransitionObjectives.compareAreaError(src.metrics,a[i-1].metrics,c.metrics)<=0)'),true);
run("var strict=TransitionSearch.create(src,'tri-up',{maxAreaPercent:29});strict.step(1000);var allowed=TransitionSearch.create(src,'tri-up',{maxAreaPercent:30});allowed.step(1000);");
assert.equal(run('strict.state.frontier.length'),0,'No silent relaxation of an area bound');
assert.equal(run('strict.state.status'),'unrealizable','The port lower bound certifies infeasibility within 29%');
assert.equal(run('allowed.state.frontier[0].metrics.n'),18);
// Returning to the original lattice recovers the original unit embedding;
// successive rasterization is no longer necessary and does not inflate it.
run("var c=compactSearch.state.frontier[0];var backSource={geometry:'tri-up',region:c.region,graph:src.graph,cellUnits:c.cellUnits,metrics:c.metrics};var back=TransitionSearch.create(backSource,'square');back.step(100);");
assert.ok(run("back.state.frontier.some(c=>c.method==='original-lattice'&&c.metrics.n===9)"));
// Orientation changes and concave regions also use independently checked seeds.
for(const target of ['tri-up','tri-side']){
 source(['-2,4','-1,4','-2,5'],'square');
 run(`var seeded=TransitionSearch.create(src,'${target}');seeded.step(100);`);
 assert.equal(run('seeded.state.frontier[0].metrics.n'),6);
 assert.equal(run('seeded.state.frontier[0].method'),'square-rhombi');
}
// Saved logical partition survives another transition source extraction.
source(['0,0','1,0'],'square');
run("var certified=LogicalTransition.certificate(['0,0','1,0'],'hex-flat',src.graph,{'0,0':0,'1,0':1});var restored=LogicalTransition.source('hex-flat',certified.borders,['#ffffff','#ffffff','#123456'],{graph:src.graph,cellUnits:certified.cellUnits});");
assert.equal(run('restored.graph.units.length'),2);
assert.equal(run('restored.graph.boundary.length'),6);
run("var broken={...certified.borders};broken[Object.keys(broken)[0]]=99;");
assert.throws(()=>run("LogicalTransition.source('hex-flat',broken,['#ffffff','#ffffff','#123456'],{graph:src.graph,cellUnits:certified.cellUnits})"));

// Small sources, all directed geometry pairs, including triangle orientations.
for(const g of ['square','tri-up','hex-flat'])for(const target of ['square','tri-up','hex-flat']){
 source(g.startsWith('tri')?['0,0,0']:['0,0'],g);
 run(`var pair=TransitionSearch.create(src,'${target}',{maxAreaPercent:100});pair.step(5000);`);
 assert.ok(run('pair.state.frontier.length>0'),`${g} -> ${target} within 100%`);
 assert.ok(run('pair.state.frontier.every(c=>TransitionObjectives.withinAreaPercent(src.metrics,c.metrics,100))'));
 assert.equal(run('pair.state.frontier.some((a,i)=>pair.state.frontier.some((b,j)=>i!==j&&TransitionObjectives.dominates(src.metrics,a.metrics,b.metrics)))'),false);
}
// Integer area infeasibility is distinct from the interface-count bound.
source(['0,0,0'],'tri-up');run("var integerFailure=TransitionSearch.create(src,'hex-flat',{maxAreaPercent:30});");
assert.equal(run('integerFailure.state.proof.kind'),'area-cell-count');
assert.ok(run('integerFailure.state.proof.areaRange.min>integerFailure.state.proof.areaRange.max'));
// A saved one-unit realization can be larger than its original atomic seed.
// The latter is valid, but may no longer satisfy the current area tolerance.
source(['0,0'],'square');
run("var enlarged=LogicalTransition.certificate(['0,0','1,0','0,1','1,1'],'square',src.graph,{'0,0':0,'1,0':0,'0,1':0,'1,1':0});var largeSource={geometry:'square',region:enlarged.region,graph:src.graph,cellUnits:enlarged.cellUnits,metrics:enlarged.metrics};var diagnostics=TransitionSearch.create(largeSource,'square',{maxAreaPercent:30});diagnostics.step(300);");
assert.ok(run('diagnostics.state.rejectedArea>0'),'Certified original embedding excluded only for area');
assert.ok(run('diagnostics.state.frontier.every(c=>TransitionObjectives.withinAreaPercent(largeSource.metrics,c.metrics,30))'));

// Worker deadline keeps certified admissible results and reports incomplete,
// never mathematical impossibility. The synthetic clock avoids a slow timeout.
source(Array.from({length:9},(_,i)=>`${i%3},${Math.floor(i/3)}`),'square');
run("var posted=[],ticks=0;var performance={now:()=>++ticks*1000};var self={postMessage:data=>posted.push(data)};var importScripts=()=>{};var setTimeout=()=>{throw Error('Expired worker must not schedule another tick');};");
run(fs.readFileSync(path.join(__dirname,'../dist/transition-worker.js'),'utf8'));
run("self.onmessage({data:{source:src,target:'tri-up',maxAreaPercent:30,milliseconds:1}});");
assert.equal(run('posted[0].status'),'incomplete');
assert.match(run('posted[0].reason'),/Tempo/);
assert.equal(run('posted[0].proof'),null);
assert.ok(run('posted[0].frontier.length>0'));
assert.ok(run('posted[0].frontier.every(c=>TransitionObjectives.withinAreaPercent(src.metrics,c.metrics,30))'));
console.log('PASS: expanded distinct interfaces, grouped target units, global metrics, exact graph certificates, obstruction proofs, Pareto search, independent atomic tilesets and saved partitions.');
