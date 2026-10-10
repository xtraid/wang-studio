const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sandbox={};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/transition-objectives.js'),'utf8'),sandbox);
const api=vm.runInContext('TransitionObjectives',sandbox);
const region=(n,s,a)=>api.metrics({n,s,a,boundary:Array(s*n-2*a)});
const triangle=region(1,3,0),square=region(1,4,0),hexagon=region(1,6,0);
for(const r of [triangle,square,hexagon]){
 const expected=r.s*Math.sin(2*Math.PI/r.s)/(8*Math.PI*Math.PI);
 assert.ok(Math.abs(r.area-expected)<1e-16);
 assert.equal(r.eta,0);
 assert.equal(r.internalFaces+r.externalFaces,r.s*r.n);
}
const twoTriangles=region(2,3,1);
assert.equal(api.compareAreaError(hexagon,twoTriangles,hexagon),0,'Two triangular cells equal one hexagonal cell in normalized area');
assert.equal(api.comparison(hexagon,twoTriangles).areaError,0);
assert.equal(api.comparison(hexagon,triangle).idealCells,2);
const source=region(4,4,4),strip=region(4,4,3),compact=region(4,4,4),larger=region(6,4,7);
assert.equal(api.dominates(source,compact,strip),true,'Same area, greater internal/external ratio dominates');
assert.equal(api.dominates(source,strip,compact),false);
assert.equal(api.dominates(source,compact,larger),false,'Area and contact-ratio tradeoff');
assert.equal(api.dominates(source,larger,compact),false);
const candidates=[{id:'strip',metrics:strip},{id:'compact',metrics:compact},{id:'tie',metrics:compact},{id:'larger',metrics:larger}];
assert.equal(JSON.stringify(api.frontier(source,candidates).map(c=>c.id)),JSON.stringify(['compact','tie','larger']));
assert.equal(api.dominates(source,compact,compact),false);
// Different geometries: compare exact irrational area errors, without epsilon.
for(let n=1;n<=100;n++){
 const a=region(n,3,n-1),b=region(n,4,n-1),c=region(n,6,n-1);
 for(const p of [a,b,c])for(const q of [a,b,c]){
  const left=api.comparison(source,p).areaError,right=api.comparison(source,q).areaError;
  assert.equal(api.compareAreaError(source,p,q),Math.sign(left-right));
 }
}
assert.throws(()=>region(0,4,0));assert.throws(()=>api.metrics({n:1,s:5,a:0,boundary:Array(5)}));
assert.throws(()=>api.metrics({n:1,s:4,a:1,boundary:Array(4)}));

assert.equal(api.withinAreaPercent(square,region(2,4,1),100),true);
assert.equal(api.withinAreaPercent(square,region(2,4,1),99.99),false);
assert.equal(api.withinAreaPercent(square,square,0),true);
assert.equal(api.withinAreaPercent(square,twoTriangles,29.91),true);
assert.equal(api.withinAreaPercent(square,twoTriangles,29.90),false);
assert.throws(()=>api.withinAreaPercent(square,square,-1));
assert.throws(()=>api.withinAreaPercent(square,square,NaN));
assert.throws(()=>api.withinAreaPercent(square,square,1.001));
assert.equal(api.comparison(square,region(2,4,1)).relativeAreaError,1);

// Integer bounds agree with exact admissibility in every geometry, including
// an empty interval, exact equality and irrational near-threshold cases.
for(const s of [3,4,6])for(let n=1;n<=12;n++)for(const t of [3,4,6])for(const epsilon of [0,1,29.90,29.91,30,100,150]){
 const from=region(n,s,n-1),bounds=api.cellRange(from,t,epsilon);
 for(let k=1;k<=bounds.max+2;k++)assert.equal(api.withinAreaPercent(from,region(k,t,k-1),epsilon),k>=bounds.min&&k<=bounds.max);
}
assert.equal(api.cellRange(triangle,6,0).max,0);
assert.equal(api.cellRange(hexagon,3,0).min,2);
assert.equal(api.cellRange(hexagon,3,0).max,2);
console.log('PASS: normalized areas, doubled internal faces, exact area/ratio comparisons, Pareto tradeoffs and objective ties.');
