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
assert.throws(()=>run(`GeneralizedTiles.compile(g,Object.fromEntries(regionBoundary(Array.from({length:33},(_,i)=>i+',0'),g).boundary.map(e=>[e.key,0])),palette,'#b99bdd','Limite')`),/32/);
run(`var single=GeneralizedTiles.compile(g,Object.fromEntries(regionBoundary(['0,0'],g).boundary.map(e=>[e.key,0])),palette,'#b99bdd','Singola');`);
assert.equal(run('single.item.internalColors.length'),0);
assert.equal(run('GeneralizedTiles.countSolutions(single.item.ids,g,single.item.borders,single.item.atoms)'),1);
for(const ids of [['0,0','1,0','0,1'],['0,0','1,0','2,0','0,1','0,2'],Array.from({length:32},(_,i)=>`${i},0`)]){
 run(`var outline=Object.fromEntries(regionBoundary(${JSON.stringify(ids)},g).boundary.map(e=>[e.key,0]));var shapePlan=GeneralizedTiles.compile(g,outline,palette,'#b99bdd','Forma');`);
 assert.equal(run('GeneralizedTiles.countSolutions(shapePlan.item.ids,g,outline,shapePlan.item.atoms)'),1,'concave and maximum-sized regions');
}
run(`var reservedBorder=Object.fromEntries(regionBoundary(['0,0'],g).boundary.map(e=>[e.key,plan.item.internalColors[0]]));var foreign=GeneralizedTiles.compile(g,reservedBorder,plan.palette,'#b99bdd','Bordo riservato');foreign.item.id='g-2';`);
assert.throws(()=>run('GeneralizedTiles.validateProject({palette:foreign.palette,generalizedTiles:[plan.item,foreign.item]})'),/riservato/);
console.log('PASS generalized: 5 geometries, independent uniqueness, ordering, exclusive shades, validation, legacy defaults, malformed/open/wildcard boundaries and limits.');
