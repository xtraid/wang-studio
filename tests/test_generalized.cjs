const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sandbox={console};vm.createContext(sandbox);const run=s=>vm.runInContext(s,sandbox);
for(const file of ['geometry.js','transition.js','generalized.js'])run(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'));
run(`var palette=['#ffffff','#222222','#b99bdd'];`);
for(const g of ['square','hex-flat','hex-point','tri-up','tri-side']){
 run(`var g='${g}',seed=cellAt(g.startsWith('tri')?'0,0,0':'0,0',g),neighbor=[...cellNeighbors(seed,g).values()][0];
 var region=regionBoundary([seed.id,neighbor],g),borders=Object.fromEntries(region.boundary.map((e,i)=>[e.key,i%2]));
 var plan=GeneralizedTiles.compile(g,borders,palette,'#b99bdd','Test');plan.item.id='g-1';`);
 assert.equal(run('plan.item.atoms.length'),2);
 assert.equal(run('plan.item.internalColors.length'),1);
 assert.equal(run('GeneralizedTiles.countSolutions(plan.item.ids,g,borders,plan.item.atoms)'),1);
 assert.equal(run('JSON.stringify(borders)===JSON.stringify(plan.item.borders)'),true);
 assert.equal(run('plan.palette.length'),4);
 assert.equal(run('palette.includes(plan.palette.at(-1))'),false);
 assert.equal(run('JSON.stringify(GeneralizedTiles.compile(g,borders,palette,"#b99bdd","Test").item.atoms)===JSON.stringify(plan.item.atoms)'),true);
 assert.equal(run('GeneralizedTiles.active({generalizedTiles:[plan.item]},g).length'),run('new Set(plan.item.atoms.map(t=>JSON.stringify(t))).size'));
 assert.equal(run('GeneralizedTiles.active({generalizedTiles:[{...plan.item,enabled:false}]},g).length'),0);
 assert.doesNotThrow(()=>run('GeneralizedTiles.validateProject(JSON.parse(JSON.stringify({palette:plan.palette,generalizedTiles:[plan.item],tilesetMode:"generalized"})))'));
 assert.throws(()=>run('GeneralizedTiles.compile(g,{...borders,[Object.keys(borders)[0]]:null},palette,"#b99bdd","Test")'),/jolly/);
 assert.throws(()=>run('GeneralizedTiles.compile(g,Object.fromEntries(Object.entries(borders).slice(1)),palette,"#b99bdd","Test")'));
 assert.throws(()=>run('GeneralizedTiles.verify({...plan.item,atoms:plan.item.atoms.map(t=>t.map(()=>0))},plan.palette)'));
 assert.throws(()=>run('GeneralizedTiles.verify({...plan.item,internalColors:[]},plan.palette)'));
 assert.throws(()=>run('GeneralizedTiles.validateProject({palette:plan.palette,generalizedTiles:[plan.item,{...plan.item,id:"g-2"}]})'),/condiviso/);
}
assert.equal(run('GeneralizedTiles.validateProject({palette}).tilesetMode'),'atomic');
assert.equal(run('GeneralizedTiles.validateProject({palette}).generalizedTiles.length'),0);
assert.throws(()=>run('GeneralizedTiles.validateProject({palette,tilesetMode:"mixed"})'));
run(`g='square';var ids=['0,0','1,0','0,1','1,1'];region=regionBoundary(ids,g);borders=Object.fromEntries(region.boundary.map(e=>[e.key,0]));
plan=GeneralizedTiles.compile(g,borders,palette,'#b99bdd','Quadrato');plan.item.id='g-1';`);
assert.equal(run('JSON.stringify(plan.item.ids)'),JSON.stringify(['1,0','0,0','1,1','0,1']));
assert.equal(run('plan.item.internalColors.length'),4);
assert.equal(run('GeneralizedTiles.countSolutions(ids,g,borders,plan.item.atoms)'),1);
assert.equal(run('GeneralizedTiles.countSolutions(ids,g,borders,Array.from({length:16},(_,n)=>Array.from({length:4},(_,s)=>(n>>s)&1)))'),2,'independent verification stops after discovering ambiguity');
assert.equal(run('GeneralizedTiles.countSolutions(ids,g,borders,[[1,1,1,1]])'),0);
run(`var second=GeneralizedTiles.compile(g,borders,plan.palette,'#b99bdd','Seconda');second.item.id='g-2';`);
assert.equal(run('second.item.internalColors.some(c=>plan.item.internalColors.includes(c))'),false);
assert.doesNotThrow(()=>run('GeneralizedTiles.validateProject({palette:second.palette,generalizedTiles:[plan.item,second.item]})'));
assert.throws(()=>run(`GeneralizedTiles.compile(g,borders,Array(65536).fill('#ffffff'),'#b99bdd','Limite')`),/65536/);
run(`var single=GeneralizedTiles.compile(g,Object.fromEntries(regionBoundary(['0,0'],g).boundary.map(e=>[e.key,0])),palette,'#b99bdd','Singola');`);
assert.equal(run('single.item.internalColors.length'),0);
assert.equal(run('GeneralizedTiles.countSolutions(single.item.ids,g,single.item.borders,single.item.atoms)'),1);
for(const ids of [['0,0','1,0','0,1'],['0,0','1,0','2,0','0,1','0,2'],Array.from({length:32},(_,i)=>`${i},0`)]){
 run(`var outline=Object.fromEntries(regionBoundary(${JSON.stringify(ids)},g).boundary.map(e=>[e.key,0]));var shapePlan=GeneralizedTiles.compile(g,outline,palette,'#b99bdd','Forma');`);
 assert.equal(run('GeneralizedTiles.countSolutions(shapePlan.item.ids,g,outline,shapePlan.item.atoms)'),1,'concave regions');
}
run(`var reservedBorder=Object.fromEntries(regionBoundary(['0,0'],g).boundary.map(e=>[e.key,plan.item.internalColors[0]]));var foreign=GeneralizedTiles.compile(g,reservedBorder,plan.palette,'#b99bdd','Bordo riservato');foreign.item.id='g-2';`);
assert.throws(()=>run('GeneralizedTiles.validateProject({palette:foreign.palette,generalizedTiles:[plan.item,foreign.item]})'),/riservato/);
console.log('PASS generalized: 5 geometries, independent uniqueness, ordering, exclusive shades, validation, legacy defaults, malformed/open/wildcard boundaries and limits.');

// More than the former 32-cell cap, and more than the abandoned 256-cell cap.
for(const geometry of ['square','hex-flat','hex-point','tri-up','tri-side'])for(const n of [33,65,257]){
 const ids=geometry.startsWith('tri')?Array.from({length:n},(_,i)=>`${Math.floor(i/2)},0,${i%2}`):Array.from({length:n},(_,i)=>`${i},0`);
 run(`var largeIds=${JSON.stringify(ids)},largeGeometry=${JSON.stringify(geometry)};
 var largeBorders=Object.fromEntries(regionBoundary(largeIds,largeGeometry).boundary.map(e=>[e.key,0]));
 var largePlan=GeneralizedTiles.compile(largeGeometry,largeBorders,palette,'#b99bdd','Grande');largePlan.item.id='g-1';`);
 assert.equal(run('largePlan.item.atoms.length'),n);
 assert.equal(run('new Set(largePlan.item.internalColors).size'),n-1);
 assert.equal(run('GeneralizedTiles.countSolutions(largePlan.item.ids,largeGeometry,largeBorders,largePlan.item.atoms)'),1);
 assert.equal(run('JSON.stringify(largePlan.item.ids)'),run('JSON.stringify(GeneralizedTiles.ordered(largeIds,largeGeometry))'));
 assert.doesNotThrow(()=>run('GeneralizedTiles.validateProject(JSON.parse(JSON.stringify({palette:largePlan.palette,generalizedTiles:[largePlan.item],tilesetMode:"generalized"})))'));
 assert.equal(run('GeneralizedTiles.active({generalizedTiles:[largePlan.item]},largeGeometry).length'),n);
 const before=run('JSON.stringify([largeBorders,palette])');
 assert.throws(()=>run("GeneralizedTiles.compile(largeGeometry,largeBorders,Array(65536).fill('#ffffff'),'#b99bdd','Esaurimento')"),/65536/);
 assert.equal(run('JSON.stringify([largeBorders,palette])'),before);
}
// Preserve the finite shade-ramp resource and fail without changing inputs.
run(`var shadeBefore=JSON.stringify(palette),tooMany=Array.from({length:2000},(_,i)=>i+',0');
 var tooManyBorders=Object.fromEntries(regionBoundary(tooMany,'square').boundary.map(e=>[e.key,0]));`);
assert.throws(()=>run("GeneralizedTiles.compile('square',tooManyBorders,palette,'#b99bdd','Colori')"),/Sfumature disponibili insufficienti/);
assert.equal(run('JSON.stringify(palette)'),run('shadeBefore'));
// No inherited transition cap or recursive stack cap on generalized validation.
run(`var deep=Array.from({length:20001},(_,i)=>i+',0');`);
assert.throws(()=>run("regionBoundary(deep,'square')"),/troppo grande/,'transition budget remains unchanged');
assert.equal(run("GeneralizedTiles.countSolutions(deep,'square',{},[[0,0,0,0]])"),1);
assert.equal(run("readTransitionRegion('square',Object.fromEntries(regionBoundary(deep,'square',Infinity).boundary.map(e=>[e.key,0])),palette,Infinity).n"),20001);
// Allocation errors stay distinct from SAT/UNSAT and expose a resource message.
run('var RealMap=Map;Map=class {constructor(){throw new RangeError("allocation failed");}};');
assert.throws(()=>run("GeneralizedTiles.compile('square',borders,palette,'#b99bdd','Memoria')"),/memoria insufficienti/);
run('Map=RealMap;');
console.log('PASS generalized scaling: 33/65/257 cells in five geometries, deterministic order, JSON round trip, 20001-cell traversal, resource failures.');
// Independent exhaustive oracle checks the iterative search and root pruning.
let seed=8197;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for(const g of ['square','hex-flat','hex-point','tri-up','tri-side'])for(let trial=0;trial<40;trial++){
 const ids=g.startsWith('tri')?['0,0,0','0,0,1','1,0,0']:['0,0','1,0','2,0'];
 const cells=ids.map(id=>JSON.parse(run(`JSON.stringify(cellAt(${JSON.stringify(id)},${JSON.stringify(g)}))`)));
 const atoms=Array.from({length:1+random(5)},()=>Array.from({length:cells[0].edges.length},()=>random(2)));
 const borders={};for(const c of cells)for(const key of c.edges)if(random(5)===0)borders[key]=random(2);
 const ts=[...new Map(atoms.map(t=>[JSON.stringify(t),t])).values()];let expected=0;const assignment=[];
 function visit(i){if(i===cells.length){expected++;return;}for(const t of ts){
  if(cells[i].edges.some((key,side)=>Object.hasOwn(borders,key)&&borders[key]!==t[side]))continue;
  if(assignment.some((other,j)=>cells[j].edges.some((key,side)=>{const d=cells[i].edges.indexOf(key);return d>=0&&other[side]!==t[d];})))continue;
  assignment.push(t);visit(i+1);assignment.pop();
 }}visit(0);
 assert.equal(run(`GeneralizedTiles.countSolutions(${JSON.stringify(ids)},${JSON.stringify(g)},${JSON.stringify(borders)},${JSON.stringify(atoms)})`),Math.min(2,expected),g+' trial '+trial);
}
console.log('PASS: iterative uniqueness agrees with independent exhaustive enumeration on 200 cases.');
