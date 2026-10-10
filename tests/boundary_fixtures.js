/* Previous strip/chain constructions, retained only as geometry fixtures. */
function constructTransitionRegion(m,g){
 transitionGeometry(g);if(!Number.isSafeInteger(m)||m<3||m>transitionLimit)throw Error('Perimetro fuori dai limiti supportati.');
 let ids=[];
 if(g.startsWith('tri')){for(let k=0;k<m-2;k++)ids.push(`${Math.floor(k/2)},0,${k%2}`);}
 else if(g==='square'){
  if(m<4||m%2)throw Error('I quadrati richiedono un perimetro pari almeno 4.');
  for(let i=0;i<(m-2)/2;i++)ids.push(`${i},0`);
 }else{
  if(m<6||m%2||m===8)throw Error('Gli esagoni supportano 6, 10 e tutti i perimetri pari da 12.');
  if(m%4===2){for(let i=0;i<(m-2)/4;i++)ids.push(`${i},0`);}
  else{ids=['0,0','1,0','0,1'];for(let i=1;i<=(m-12)/4;i++)ids.push(`${-i},0`);}
 }
 const result=regionBoundary(ids,g);if(result.boundary.length!==m)throw Error('La costruzione non conserva il perimetro.');return result;
}
