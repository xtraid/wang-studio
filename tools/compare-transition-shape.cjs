/* Reproducible finite-work experiment; timings are descriptive, not a benchmark. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
for(const file of ['geometry','transition','transition-objectives','transition-shape','logical-transition','transition-search'])vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../dist',file+'.js'),'utf8'));
const ids=Array.from({length:5},(_,i)=>`${i},0`).concat(['0,1','0,2','0,3'],Array.from({length:5},(_,i)=>`${i},4`));
const region=regionBoundary(ids,'square'),source=BoundaryTransition.source('square',Object.fromEntries(region.boundary.map(e=>[e.key,null])),['#ffffff']);
const options={maxAreaPercent:30,maxRatioPercent:50,shapeBandPercent:10,maxShapePercent:30,shapeConstraint:false},work=6000;
const reference=TransitionShape.forSource(source,10),runs=[];
for(const shapePreference of [false,true]){
 const search=TransitionSearch.create(source,'hex-flat',{...options,shapePreference}),start=performance.now();search.step(work);
 const elapsed=performance.now()-start,s=search.state;if(s.status==='running'){s.status='incomplete';s.reason='Finite work budget reached.';}
 const front=s.frontier.map(c=>{const shape=TransitionShape.measure(reference,TransitionShape.region(c.region.ids,'hex-flat'),{precision:.005,maxBoxes:32768});return{method:c.method,cells:c.region.n,ids:c.region.ids,B:c.metrics.B,I:c.metrics.I,...TransitionObjectives.comparison(source.metrics,c.metrics),shape};});
 runs.push({shapePreference,work:s.work,examined:s.examined,accepted:s.accepted,rejectedBoundary:s.rejectedBoundary,rejectedRatio:s.rejectedRatio,rejectedGeometry:s.rejectedGeometry,frontierTruncated:s.frontierTruncated,elapsedMilliseconds:Math.round(elapsed),status:s.status,front});
}
const report={source:{ids,geometry:'square',metrics:source.metrics},target:'hex-flat',options,work,runs};
if(process.argv.includes('--write')){
 const out=path.join(__dirname,'../docs');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'continuous-field-comparison.json'),JSON.stringify(report,null,2)+'\n');
 const best=(list)=>list.reduce((a,b)=>a.shape.value<b.shape.value?a:b);
 const panels=[['Source: 13 squares',null],['Unguided: 10 hexagons',runs[0].front[0]],['Guided: 10 hexagons',best(runs[1].front.filter(c=>c.cells===10))],['Guided: best shape',best(runs[1].front)]];
 const width=340,height=340,unit=170,drawPoly=(poly,fill,alpha)=>`<polygon points="${poly.map(([x,y])=>[170+x*unit,170+y*unit].join(',')).join(' ')}" fill="${fill}" fill-opacity="${alpha}" stroke="#354538" stroke-width=".6"/>`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="340" viewBox="0 0 1360 340"><rect width="1360" height="340" fill="#fff"/>${panels.map(([title,c],i)=>`<g transform="translate(${width*i},0)"><text x="16" y="25" font-family="sans-serif" font-size="16">${title}</text>${reference.polygons.map(p=>drawPoly(p,'#489fdf',.35)).join('')}${c?TransitionShape.region(c.ids,'hex-flat').polygons.map(p=>drawPoly(p,'#a9c783',.55)).join(''):''}<text x="16" y="320" font-family="sans-serif" font-size="13">${c?`E: ${(100*c.shape.value).toFixed(2)}% [${(100*c.shape.lower).toFixed(2)}, ${(100*c.shape.upper).toFixed(2)}]`:'Blue: source; green: target'}</text></g>`).join('')}</svg>`;
 fs.writeFileSync(path.join(out,'continuous-field-comparison.svg'),svg+'\n');
}
console.log(JSON.stringify(report,null,2));
