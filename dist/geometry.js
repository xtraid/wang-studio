/* Shared grid geometry: editor and transition Worker use identical polygons. */
function key(a,b){const p=a.map(v=>Math.round(v*1e5)).join(','),q=b.map(v=>Math.round(v*1e5)).join(',');return[p,q].sort().join('|');}
function polygon(kind,x,y,r){const n=kind==='square'?4:kind.startsWith('hex')?6:3;const start=kind==='square'?-Math.PI*3/4:kind==='hex-flat'?0:kind==='hex-point'?-Math.PI/2:kind==='tri-side'?0:-Math.PI/2;return Array.from({length:n},(_,i)=>[x+r*Math.cos(start+Math.PI*2*i/n),y+r*Math.sin(start+Math.PI*2*i/n)]);}
function cellAt(id,geometry=state.geometry){
 const [i,j,half=0]=id.split(',').map(Number);let p;
 if(geometry==='square')p=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]];
 else if(geometry.startsWith('hex')){const flat=geometry==='hex-flat';p=polygon(geometry,flat?1.5*i:Math.sqrt(3)*(i+j/2),flat?Math.sqrt(3)*(j+i/2):1.5*j,1);}
 else{const x=i+j/2,y=j*Math.sqrt(3)/2,A=[x,y],B=[x+1,y],C=[x+.5,y+Math.sqrt(3)/2],D=[x+1.5,y+Math.sqrt(3)/2];p=half?[D,C,B]:[A,B,C];if(geometry==='tri-side')p=p.map(([a,b])=>[-b,a]);}
 return{id,p,center:p.reduce((a,v)=>[a[0]+v[0]/p.length,a[1]+v[1]/p.length],[0,0]),edges:p.map((v,k)=>key(v,p[(k+1)%p.length]))};
}
function lattice([x,y],geometry=state.geometry){
 if(geometry==='square')return[x,y];
 if(geometry==='hex-flat')return[x/1.5,y/Math.sqrt(3)-x/3];
 if(geometry==='hex-point')return[x/Math.sqrt(3)-y/3,y/1.5];
 if(geometry==='tri-side')[x,y]=[y,-x];
 return[x-y/Math.sqrt(3),y*2/Math.sqrt(3)];
}
function borderPoints(k){return k.split('|').map(p=>p.split(',').map(v=>Number(v)/1e5));}
function inside(p,poly){let b=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],c=poly[j];if((a[1]>p[1])!==(c[1]>p[1])&&p[0]<(c[0]-a[0])*(p[1]-a[1])/(c[1]-a[1])+a[0])b=!b;}return b;}
function cellNeighbors(c,g){
 const[i,j]=c.id.split(',').map(Number),neighbors=new Map();
 for(let y=j-1;y<=j+1;y++)for(let x=i-1;x<=i+1;x++)for(let h=0;h<(g.startsWith('tri')?2:1);h++){
  const id=g.startsWith('tri')?`${x},${y},${h}`:`${x},${y}`;if(id===c.id)continue;
  const other=cellAt(id,g);for(const k of other.edges)if(c.edges.includes(k))neighbors.set(k,other.id);
 }
 if(neighbors.size!==c.edges.length)throw Error('Adiacenze geometriche non coerenti.');
 return neighbors;
}
