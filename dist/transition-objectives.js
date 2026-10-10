/* Research on Tiling Complexity, section 1.2.4.
 * Areas use circumcircle circumference 1, independently of canvas scale.
 * Exact comparisons take place in Q(sqrt(3)); floats are display values only.
 */
const TransitionObjectives=(()=>{
 const integer=(n,name)=>{if(!Number.isSafeInteger(n)||n<0)throw Error(`${name} non valido.`);return n;};
 function areaForm(n,s){
  integer(n,'Numero di celle');
  if(![3,4,6].includes(s))throw Error('Geometria atomica non valida.');
  // Common positive denominator 16*pi^2.
  return s===4?[8n*BigInt(n),0n]:[0n,BigInt(s)*BigInt(n)];
 }
 function sign([a,b]){
  if(a===0n)return b<0n?-1:b>0n?1:0;
  if(b===0n)return a<0n?-1:1;
  if((a>0n)===(b>0n))return a>0n?1:-1;
  const squared=a*a-3n*b*b;
  return (squared>0n?1:squared<0n?-1:0)*(a>0n?1:-1);
 }
 const subtract=(a,b)=>[a[0]-b[0],a[1]-b[1]];
 function errorForm(source,target){
  const difference=subtract(areaForm(source.n,source.s),areaForm(target.n,target.s));
  return sign(difference)<0?difference.map(v=>-v):difference;
 }
 const display=form=>(Number(form[0])+Number(form[1])*Math.sqrt(3))/(16*Math.PI*Math.PI);
 function metrics(region){
  const n=integer(region.n,'Numero di celle'),a=integer(region.a,'Adiacenze interne');
  const s=region.s,m=integer(region.boundary.length,'Facce esterne');
  if(!n||!m||s*n!==2*a+m)throw Error('Metriche della regione non coerenti.');
  const area=display(areaForm(n,s));
  return{n,s,adjacencies:a,internalFaces:2*a,externalFaces:m,area,eta:2*a/m};
 }
 function compareAreaError(source,left,right){return sign(subtract(errorForm(source,left),errorForm(source,right)));}
 function compareEta(left,right){
  const d=BigInt(left.internalFaces)*BigInt(right.externalFaces)-BigInt(right.internalFaces)*BigInt(left.externalFaces);
  return d<0n?-1:d>0n?1:0;
 }
 function dominates(source,left,right){
  const area=compareAreaError(source,left,right),eta=compareEta(left,right);
  return area<=0&&eta>=0&&(area<0||eta>0);
 }
 function comparison(source,target){
  return{relativeAreaError:display(errorForm(source,target))/source.area,areaRatio:target.area/source.area,areaError:display(errorForm(source,target)),idealCells:source.area/display(areaForm(1,target.s)),eta:target.eta};
 }
 // The UI accepts percentages with at most two decimal places. Comparison
 // stays exact, including candidates precisely on the chosen bound.
 function toleranceUnits(percent){
  const hundredths=Math.round(percent*100);
  if(!Number.isFinite(percent)||percent<0||percent>10000||Math.abs(percent*100-hundredths)>1e-7)throw Error('Soglia d’area non valida (0–10000%, massimo due decimali).');
  return BigInt(hundredths);
 }
 function withinAreaPercent(source,target,percent){
  const hundredths=toleranceUnits(percent);
  const error=errorForm(source,target).map(v=>v*10000n),limit=areaForm(source.n,source.s).map(v=>v*hundredths);
  return sign(subtract(error,limit))<=0;
 }
 function cellRange(source,s,percent){
  const e=toleranceUnits(percent),ideal=source.area/display(areaForm(1,s));
  const below=(n,factor)=>sign(subtract(areaForm(n,s).map(v=>v*10000n),areaForm(source.n,source.s).map(v=>v*factor)))<0;
  const above=(n,factor)=>sign(subtract(areaForm(n,s).map(v=>v*10000n),areaForm(source.n,source.s).map(v=>v*factor)))>0;
  let min=Math.max(1,Math.ceil(ideal*(1-percent/100))),max=Math.max(0,Math.floor(ideal*(1+percent/100)));
  // Floating point estimates locate the endpoints; exact comparisons decide
  // inclusion, including irrational boundaries and equality at epsilon=0.
  while(below(min,10000n-e))min++;
  while(min>1&&!below(min-1,10000n-e))min--;
  while(above(max,10000n+e))max--;
  while(!above(max+1,10000n+e))max++;
  return{min,max};
 }
 function minimumCells(graph,s){
  if(![3,4,6].includes(s))throw Error('Geometria atomica non valida.');
  // A connected n-cell unit has at most (s-2)*n+2 exposed sides;
  // each distinct logical port needs at least one of them.
  return graph.units.reduce((n,u)=>n+Math.max(1,Math.ceil((u.ports.length-2)/(s-2))),0);
 }
 // Keep ties: distinct realizations can share the same objective pair.
 function frontier(source,candidates){return candidates.filter((candidate,i)=>!candidates.some((other,j)=>i!==j&&dominates(source,other.metrics,candidate.metrics)));}
 return{metrics,comparison,compareAreaError,compareEta,dominates,frontier,withinAreaPercent,minimumCells,cellRange};
})();
