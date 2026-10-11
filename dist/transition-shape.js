/* Continuous, centroid-aligned geometry. No rounded canvas vertices enter the
 * integral. Adaptive boxes enclose the integrand using distance's Lipschitz bound. */
const TransitionShape=(()=>{
 function settings(o={}){
  if(!o||typeof o!=='object'||Array.isArray(o))throw Error('Impostazioni di forma non valide.');
  const result={shapePreference:o.shapePreference??false,shapeConstraint:o.shapeConstraint??false,shapeBandPercent:o.shapeBandPercent??10,maxShapePercent:o.maxShapePercent??30};
  for(const k of ['shapePreference','shapeConstraint'])if(typeof result[k]!=='boolean')throw Error('Attivazione forma non valida.');
  for(const k of ['shapeBandPercent','maxShapePercent'])if(!Number.isFinite(result[k])||result[k]<0||result[k]>10000||Math.abs(result[k]*100-Math.round(result[k]*100))>1e-7)throw Error('Percentuale di forma non valida (0–10000%, due decimali).');
  return result;
 }
 const enabled=o=>o.shapePreference||o.shapeConstraint;
 const scale=g=>1/(2*Math.PI*(g==='square'?Math.SQRT1_2:g.startsWith('tri')?1/Math.sqrt(3):1));
 function region(ids,g){
  const factor=scale(g),origin=cellAt(ids[0],g).center;
  // Subtract an anchor before summation to avoid cancellation far from canvas origin.
  const cells=ids.map(id=>cellAt(id,g)),mean=[0,0];
  for(const c of cells)for(let j=0;j<2;j++)mean[j]+=(c.center[j]-origin[j])/ids.length;
  const project=p=>p.map((v,j)=>(v-origin[j]-mean[j])*factor);
  const edges=new Map(),polygons=[];
  for(const c of cells){polygons.push(c.p.map(project));c.edges.forEach((k,i)=>{if(edges.has(k))edges.delete(k);else edges.set(k,[project(c.p[i]),project(c.p[(i+1)%c.p.length])]);});}
  const segments=[...edges.values()],box=[Infinity,Infinity,-Infinity,-Infinity];
  for(const segment of segments)for(const [x,y]of segment){box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],y);box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],y);}
  const s=cells[0].p.length,area=ids.length*s*Math.sin(2*Math.PI/s)/(8*Math.PI*Math.PI);
  return{polygons,segments,box,area,geometry:g,ids:[...ids],factor};
 }
 function distance(r,[x,y]){
  let squared=Infinity,inside=false;
  for(const [[a,b],[c,d]]of r.segments){
   const dx=c-a,dy=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy)));
   squared=Math.min(squared,(x-a-t*dx)**2+(y-b-t*dy)**2);
   if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
  }
  return (inside?-1:1)*Math.sqrt(squared);
 }
 function reference(ids,g,percent){const r=region(ids,g);return{...r,sigma:percent/100*Math.sqrt(r.area)};}
 const references=new WeakMap();
 function forSource(source,percent){
  const key=JSON.stringify([source.geometry,source.region.ids,percent]);
  let entry=references.get(source);
  if(!entry||entry.key!==key){entry={key,reference:reference(source.region.ids,source.geometry,percent)};references.set(source,entry);}
  return entry.reference;
 }
 function phi(r,p){const d=distance(r,p);return r.sigma?Math.max(0,Math.min(1,.5-d/(2*r.sigma))):d<=0?1:0;}
 // Exact translation identity in one lattice, without tolerance-based shape equality.
 function same(a,b){
  if(a.geometry!==b.geometry||a.ids.length!==b.ids.length)return false;
  const canonical=ids=>{const ps=ids.map(id=>id.split(',').map(Number));const x=Math.min(...ps.map(p=>p[0])),y=Math.min(...ps.map(p=>p[1]));return ps.map(([i,j,h])=>[i-x,j-y,...(h===undefined?[]:[h])].join(',')).sort().join(';');};
  return canonical(a.ids)===canonical(b.ids);
 }
 function measure(source,target,{precision=.01,maxBoxes=2048}={}){
  if(!Number.isFinite(precision)||precision<=0||!Number.isInteger(maxBoxes)||maxBoxes<1||maxBoxes>65536)throw Error('Budget integrale non valido.');
  if(same(source,target))return{value:0,lower:0,upper:0,uncertainty:0,boxes:0,converged:true};
  maxBoxes=Math.max(1,Math.min(maxBoxes,Math.floor(8000000/(source.segments.length+target.segments.length))));
  const box=[Math.min(source.box[0],target.box[0]),Math.min(source.box[1],target.box[1]),Math.max(source.box[2],target.box[2]),Math.max(source.box[3],target.box[3])];
  const extent=Math.max(1,...box.map(Math.abs)),guard=extent*1e-10;
  // A max heap refines the largest remaining integral uncertainty first.
  const heap=[];
  function push(v){let i=heap.length;heap.push(v);while(i){const p=(i-1)>>1;if(heap[p].gap>=v.gap)break;heap[i]=heap[p];i=p;}heap[i]=v;}
  function pop(){const first=heap[0],v=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let j=2*i+1;if(j+1<heap.length&&heap[j+1].gap>heap[j].gap)j++;if(heap[j].gap<=v.gap)break;heap[i]=heap[j];i=j;}heap[i]=v;}return first;}
  function evaluate(b){
   const [x0,y0,x1,y1]=b,p=[(x0+x1)/2,(y0+y1)/2],radius=Math.hypot(x1-x0,y1-y0)/2+guard;
   const ds=distance(source,p),dt=distance(target,p),area=(x1-x0)*(y1-y0)/source.area;
   const s=ds>radius?1:ds<-radius?-1:0,t=dt>radius?1:dt<-radius?-1:0;
   let lower=0,upper=0;
   if(!(s&&s===t)){
    upper=area*(source.sigma?Math.min(1,(Math.abs(ds)+radius)/source.sigma):1);
    if(s&&t&&s!==t)lower=area*(source.sigma?Math.min(1,Math.max(0,Math.abs(ds)-radius)/source.sigma):1);
   }
   return{b,lower,upper,gap:upper-lower};
  }
  const first=evaluate(box);push(first);let lower=first.lower,upper=first.upper,boxes=1;
  while(upper-lower>precision&&boxes+4<=maxBoxes&&heap.length){
   const v=pop(),[a,b,c,d]=v.b,x=(a+c)/2,y=(b+d)/2;lower-=v.lower;upper-=v.upper;
   for(const part of [[a,b,x,y],[x,b,c,y],[a,y,x,d],[x,y,c,d]]){const child=evaluate(part);lower+=child.lower;upper+=child.upper;if(child.gap)push(child);}boxes+=4;
  }
  // Roundoff allowance is additional to the spatial uncertainty. The spatial
  // enclosures are analytic; JS floating arithmetic is not an interval library.
  lower=Math.max(0,lower-1e-9);upper+=1e-9;
  return{value:(lower+upper)/2,lower,upper,uncertainty:(upper-lower)/2,boxes,converged:upper-lower<=precision};
 }
 function decision(error,percent){return error.upper<=percent/100?'pass':error.lower>percent/100?'fail':'inconclusive';}
 // Multi-point triangle quadrature is a DISCOVERY score only. The independent
 // verifier always recomputes a bounded integral on the full polygons.
 function cellCost(ref,id,g,offset=[0,0]){
  const c=cellAt(id,g),f=scale(g),pts=c.p.map(p=>p.map((v,j)=>v*f-offset[j])),center=c.center.map((v,j)=>v*f-offset[j]);let sum=0;
  for(let i=0;i<pts.length;i++)for(const weights of [[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]]){
   const p=[0,1].map(j=>weights[0]*center[j]+weights[1]*pts[i][j]+weights[2]*pts[(i+1)%pts.length][j]);
   sum+=1-2*phi(ref,p);
  }
  return sum/(pts.length*3);
 }
 return{settings,enabled,scale,region,reference,forSource,distance,phi,measure,decision,cellCost};
})();
