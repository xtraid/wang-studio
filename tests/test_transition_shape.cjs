const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const box={console};vm.createContext(box);
for(const f of ['geometry.js','transition.js','transition-objectives.js','transition-shape.js','logical-transition.js','transition-search.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',f),'utf8'),box);
const api=vm.runInContext('({shape:TransitionShape,search:TransitionSearch,boundary:BoundaryTransition,regionBoundary,objectives:TransitionObjectives})',box),S=api.shape;
const C=['0,0','1,0','2,0','0,1','0,2','0,3','1,3','2,3'];
const strip=Array.from({length:8},(_,i)=>`${i},0`),rectangle=Array.from({length:8},(_,i)=>`${i%2},${Math.floor(i/2)}`);
const shifted=ids=>ids.map(id=>{const [x,y,...h]=id.split(',').map(Number);return [x+10000,y-20000,...h].join(',');});
function source(ids,g='square'){
 const r=api.regionBoundary(ids,g),b=Object.fromEntries(r.boundary.map(e=>[e.key,null]));return api.boundary.source(g,b,['#ffffff']);
}
function error(ids,band=10,target=ids,g='square',tg=g,options={precision:.003,maxBoxes:16384}){return S.measure(S.reference(ids,g,band),S.region(target,tg),options);}
for(const g of ['square','tri-up','tri-side','hex-flat','hex-point']){
 const ids=g.startsWith('tri')?['0,0,0','0,0,1']:['0,0','1,0'];
 assert.equal(error(ids,10,ids,g).upper,0);assert.equal(error(ids,0,shifted(ids),g).upper,0);
 const normalized=S.region(ids,g),m=api.objectives.metrics(api.regionBoundary(ids,g));assert.ok(Math.abs(normalized.area-m.area)<1e-14);
 let area=0;for(const p of normalized.polygons)for(let i=0;i<p.length;i++)area+=(p[i][0]*p[(i+1)%p.length][1]-p[i][1]*p[(i+1)%p.length][0])/2;
 assert.ok(Math.abs(area-m.area)<1e-14,'actual normalized polygon area');
}
assert.ok(error(C,10,strip).lower>0);assert.ok(error(C,10,rectangle).lower>0);
const approximate=['0,0','1,0','0,1','0,2','0,3','1,3','2,3','3,3'];
assert.equal(api.regionBoundary(approximate,'square').n,api.regionBoundary(strip,'square').n);assert.equal(api.regionBoundary(approximate,'square').a,api.regionBoundary(strip,'square').a,'same area and B/I');
assert.ok(error(C,10,approximate).upper<error(C,10,strip).lower,'approximate C is better than strip');
const sharp=error(C,0,rectangle),soft=error(C,10,rectangle),wide=error(C,40,rectangle);
assert.ok(wide.upper<soft.lower);assert.ok(soft.upper<sharp.lower);
// Analytic symmetric difference for a centered 2x4 vs 8x1 rectangle: 12/8.
const analytic=error(rectangle,0,strip,'square','square',{precision:.003,maxBoxes:65536});assert.ok(analytic.lower<=1.5&&analytic.upper>=1.5);assert.ok(analytic.upper-analytic.lower<.04);
assert.ok(analytic.value>1,'errors above 100% are valid');
const coarse=error(C,10,strip,'square','square',{precision:.001,maxBoxes:128}),fine=error(C,10,strip);
assert.ok(fine.upper-fine.lower<coarse.upper-coarse.lower);assert.ok(fine.lower>=coarse.lower-1e-8&&fine.upper<=coarse.upper+1e-8);
assert.equal(S.decision(fine,0),'fail');assert.equal(S.decision(fine,10000),'pass');assert.equal(S.decision(fine,100*fine.value),'inconclusive');
const ref=S.reference(C,'square',10);assert.ok(S.phi(ref,[100,100])===0);assert.ok(S.phi(ref,ref.polygons[0].reduce((a,p)=>a.map((v,j)=>v+p[j]/4),[0,0]))>.5);
for(const g of ['tri-up','tri-side','hex-flat','hex-point'])assert.ok(error(C,10,g.startsWith('tri')?['0,0,0','0,0,1']:['0,0','1,0'],'square',g).lower>0);
const src=source(C),target=api.regionBoundary(strip,'square'),mapping=api.boundary.correspondence(target,src.interfaces);
const settings={maxAreaPercent:0,maxRatioPercent:100,shapePreference:true,shapeConstraint:true,shapeBandPercent:10,maxShapePercent:10000};
const proof=api.boundary.certificate(strip,'square',src,settings,{...mapping,shapeError:{value:0,lower:0,upper:0}});
assert.ok(proof.shapeError.lower>0,'independent verifier ignores injected objective');
assert.throws(()=>api.boundary.certificate(strip,'square',src,{...settings,maxShapePercent:0},mapping),/forma/);
const threshold=Math.round(proof.shapeError.value*10000)/100;
assert.throws(()=>api.boundary.certificate(strip,'square',src,{...settings,maxShapePercent:threshold},mapping),/inconcludente/);
const identity=api.boundary.certificate(C,'square',src,{...settings,maxShapePercent:0},api.boundary.correspondence(src.region,src.interfaces));assert.equal(identity.shapeError.upper,0);
assert.equal(S.settings({}).shapePreference,false);assert.equal(S.settings({}).shapeConstraint,false);assert.throws(()=>S.settings({shapeBandPercent:-1}));assert.throws(()=>S.settings({shapePreference:'true'}));
// Independent strict constraint still applies without the Pareto preference.
assert.throws(()=>api.boundary.certificate(strip,'square',src,{...settings,shapePreference:false,maxShapePercent:0},mapping),/forma/);
const off=api.search.create(source(['0,0','1,0']),'hex-flat',{maxAreaPercent:50,maxRatioPercent:100}),explicit=api.search.create(source(['0,0','1,0']),'hex-flat',{maxAreaPercent:50,maxRatioPercent:100,shapePreference:false,shapeConstraint:false});off.step(3000);explicit.step(3000);assert.equal(JSON.stringify(off.state),JSON.stringify(explicit.state));
const guided=api.search.create(source(['0,0','1,0']),'hex-flat',{maxAreaPercent:50,maxRatioPercent:100,shapePreference:true});guided.step(1200);
assert.ok(guided.state.frontier.every(p=>p.shapeError&&p.region.boundary.length>=6));
const pairs=new Map();for(const p of guided.state.frontier){const k=`${p.metrics.n}:${p.metrics.I}`;pairs.set(k,(pairs.get(k)||0)+1);}assert.ok([...pairs.values()].some(n=>n>1),'distinct geometric representatives survive objective-pair dedup');assert.ok([...pairs.values()].every(n=>n<=8));

const metric=source(['0,0','1,0']).metrics;
const candidate=(lower,upper)=>({metrics:metric,shapeError:{lower,upper}});
assert.equal(api.objectives.dominatesCandidate(metric,candidate(.1,.2),candidate(.3,.4),true),true);
assert.equal(api.objectives.dominatesCandidate(metric,candidate(.1,.3),candidate(.2,.4),true),false,'overlapping uncertainty cannot establish dominance');
assert.equal(api.objectives.dominatesCandidate(metric,candidate(.1,.2),candidate(.3,.4),false),false,'disabled preference ignores shape');

const constrained=api.search.create(source(['0,0','1,0']),'hex-flat',{maxAreaPercent:50,maxRatioPercent:100,shapePreference:false,shapeConstraint:true,shapeBandPercent:10,maxShapePercent:0});constrained.step(1200);
assert.equal(constrained.state.frontier.length,0);assert.ok(constrained.state.rejectedShape>0);assert.notEqual(constrained.state.status,'unrealizable');
const coloredRegion=api.regionBoundary(['0,0','1,0'],'square');
const coloredSource=api.boundary.source('square',Object.fromEntries(coloredRegion.boundary.map((e,i)=>[e.key,i<2?0:null])),['#ffffff']);
const coloredMap=api.boundary.correspondence(coloredRegion,coloredSource.interfaces);
assert.equal(api.boundary.certificate(coloredRegion.ids,'square',coloredSource,{...settings,maxShapePercent:0},coloredMap).shapeError.upper,0);
const changedColors={...coloredMap,borders:{...coloredMap.borders,[coloredRegion.boundary[0].key]:null}};
assert.throws(()=>api.boundary.certificate(coloredRegion.ids,'square',coloredSource,settings,changedColors),/colore/);
assert.throws(()=>S.settings(false));assert.throws(()=>S.settings([]));

console.log('PASS: continuous geometry, centroids, all lattice normalizations, C/strip/rectangle, smoothing, zero band, numerical bounds, >100%, independent hard certification, inconclusive thresholds, Pareto witnesses and disabled compatibility.');
