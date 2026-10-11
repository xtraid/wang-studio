const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const colors=['#c4d69a','#e5a17e','#87b7b0','#d9c584','#ffffff'];
let state={geometry:'square',palette:colors,sets:{},boards:{}},selected=0,ink=0,borderWildcard=false,draft=[],mode='place',zoom=1,pan={x:0,y:0},hover=null,history=[],future=[],space=false,drag=null,lastAction='',raf=0;
const canvas=$('#board'),ctx=canvas.getContext('2d'); let width=800,height=600,cells=[],edgeMap=new Map();
const count=()=>state.geometry==='square'?4:state.geometry.startsWith('hex')?6:3;
const family=()=>state.geometry.split('-')[0];
const tiles=()=>state.sets[family()]; const board=()=>state.boards[state.geometry];
const clone=o=>JSON.parse(JSON.stringify(o));
function ensure(){resetSelection();if(mode==='paste')mode='select';ink=Math.min(ink,state.palette.length-1);hover=null;if(!state.sets[family()])state.sets[family()]=Array.from({length:8},(_,i)=>Array.from({length:count()},(_,e)=>(i+e*(i%3+1)+Math.floor(i/4))%state.palette.length));if(!state.boards[state.geometry])state.boards[state.geometry]={placed:{},borders:{}};selected=Math.min(selected,tiles().length-1);draft=[...tiles()[Math.max(0,selected)]||Array(count()).fill(0)];}
function message(s){$('#status').textContent=s;}
function snapshot(){history.push(clone(state));if(history.length>80)history.shift();future=[];}
function undo(redo=false){const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(clone(state));state=from.pop();ensure();rebuild();renderUI();draw();}
let gridView='';
function viewKey(){return[state.geometry,width,height,zoom,pan.x,pan.y].join(':');}
function rebuild(){
 cells=[];edgeMap=new Map();const seen=new Set();
 const add=id=>{if(seen.has(id))return;seen.add(id);const c=cellAt(id);cells.push(c);c.edges.forEach((k,i)=>{if(!edgeMap.has(k))edgeMap.set(k,[]);edgeMap.get(k).push({c,i});});};
 const corners=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>lattice([(x-width/2-pan.x)/scale(),(y-height/2-pan.y)/scale()]));
 const minI=Math.floor(Math.min(...corners.map(p=>p[0])))-2,maxI=Math.ceil(Math.max(...corners.map(p=>p[0])))+2;
 const minJ=Math.floor(Math.min(...corners.map(p=>p[1])))-2,maxJ=Math.ceil(Math.max(...corners.map(p=>p[1])))+2;
 for(let j=minJ;j<=maxJ;j++)for(let i=minI;i<=maxI;i++){if(family()==='tri'){add(`${i},${j},0`);add(`${i},${j},1`);}else add(`${i},${j}`);}
 for(const id of Object.keys(board().placed))add(id);
 gridView=viewKey();
}
function refreshGrid(){if(gridView!==viewKey())rebuild();}
const scale=()=>58*zoom;
const screen=p=>[width/2+pan.x+p[0]*scale(),height/2+pan.y+p[1]*scale()];
function path(p,target=ctx){target.beginPath();p.forEach((v,i)=>i?target.lineTo(...v):target.moveTo(...v));target.closePath();}
function paint(c,edges,alpha=1,target=ctx,project=screen,palette=state.palette){const p=c.p.map(project),center=project(c.center);target.globalAlpha=alpha;path(p,target);target.fillStyle=palette[edges[0]];target.fill();for(let i=0;i<p.length;i++){path([center,p[i],p[(i+1)%p.length]],target);target.fillStyle=palette[edges[i]];target.fill();}path(p,target);target.strokeStyle='#111b1699';target.lineWidth=1.5;target.stroke();target.globalAlpha=1;}

function paintBorders(target=ctx,project=screen,borders=board().borders,palette=state.palette){for(const [k,color]of Object.entries(borders)){const [a,b]=borderPoints(k);target.beginPath();target.moveTo(...project(a));target.lineTo(...project(b));target.strokeStyle='#101a15';target.lineWidth=9;target.lineCap='round';target.stroke();target.strokeStyle=color===null?'#ffffff':palette[color];target.lineWidth=5;if(color===null)target.setLineDash([7,5]);target.stroke();if(color===null)target.setLineDash([]);}}
function conflicts(c,edges){return c.edges.some((k,i)=>{const border=board().borders[k];if(border!==undefined&&border!==null&&border!==edges[i])return true;return edgeMap.get(k).some(({c:other,i:side})=>other.id!==c.id&&board().placed[other.id]&&board().placed[other.id][side]!==edges[i]);});}
function draw(){refreshGrid();ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#111b16';ctx.fillRect(0,0,width,height);for(const c of cells){const center=screen(c.center),margin=scale()*1.5;if(center[0]<-margin||center[1]<-margin||center[0]>width+margin||center[1]>height+margin)continue;path(c.p.map(screen));ctx.strokeStyle='#2c3b2e';ctx.lineWidth=.8;ctx.stroke();const t=board().placed[c.id];if(t)paint(c,t);}
if(hover&&mode==='place'&&tiles()[selected]){const t=tiles()[selected];paint(hover.c,t,.45);if(conflicts(hover.c,t)){path(hover.c.p.map(screen));ctx.strokeStyle='#ff877f';ctx.lineWidth=2;ctx.stroke();}}
paintBorders();

if(hover&&mode==='border'){const c=hover.c,i=hover.edge;ctx.beginPath();ctx.moveTo(...screen(c.p[i]));ctx.lineTo(...screen(c.p[(i+1)%c.p.length]));ctx.strokeStyle=borderWildcard?'#ffffff':state.palette[ink];ctx.lineWidth=6;ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);}
drawSelection();
$('#placedCount').textContent=Object.keys(board().placed).length;$('#zoomValue').textContent=Math.round(zoom*100)+'%';$('#undo').disabled=!history.length;$('#redo').disabled=!future.length;if(typeof solveButtons==='function')solveButtons();}

function distance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function hit(e){refreshGrid();const r=canvas.getBoundingClientRect(),p=[(e.clientX-r.left-width/2-pan.x)/scale(),(e.clientY-r.top-height/2-pan.y)/scale()];const c=cells.find(c=>inside(p,c.p));if(!c)return null;let edge=0,d=Infinity;c.p.forEach((a,i)=>{const v=distance(p,a,c.p[(i+1)%c.p.length]);if(v<d){d=v;edge=i;}});return{c,edge,d};}
function act(h){if(!h)return false;const {c,edge}=h,b=board(),k=c.edges[edge];if(mode==='place'){if(!tiles()[selected]){message('Crea prima una tessera.');return false;}const t=tiles()[selected];if($('#strict').checked&&conflicts(c,t)){message('Questi lati non corrispondono. Scegli un’altra tessera o modifica i colori.');return false;}b.placed[c.id]=[...t];message('Tessera posata. Continua a comporre.');}else if(mode==='border'){const color=borderWildcard?null:ink;if(b.borders[k]===color)delete b.borders[k];else{if(color!==null&&$('#strict').checked&&edgeMap.get(k).some(({c,i})=>b.placed[c.id]&&b.placed[c.id][i]!==ink)){message('Il bordo non corrisponde alla tessera: cambia colore o disattiva Regola Wang.');return false;}b.borders[k]=color;}message('Traccia i lati per chiudere la tua regione. Riclicca un bordo per rimuoverlo.');}else{if(h.d<.15&&b.borders[k]!==undefined)delete b.borders[k];else delete b.placed[c.id];message('Elemento rimosso.');}draw();return true;}
function svgTile(t,editor=false){const p=polygon(state.geometry,110,82,65),c=[110,82];return t.map((v,i)=>`<polygon data-edge="${i}" points="${[c,p[i],p[(i+1)%p.length]].map(x=>x.join(',')).join(' ')}" fill="${state.palette[v]}" stroke="#172019" stroke-width="${editor?1.5:2}"/>`).join('');}
function renderDraft(){$('#editor').innerHTML=svgTile(draft,true);$('#editor').querySelectorAll('polygon').forEach(el=>el.onclick=()=>{draft[+el.dataset.edge]=ink;renderDraft();});}
function renderUI(){if(typeof syncTransitionSettings==='function')syncTransitionSettings();borderControls();$('#geometry').value=state.geometry;$('#colorCount').textContent=state.palette.length+' COLORI';$('#edgeCount').textContent=count()+' LATI';$('#tileCount').textContent=tiles().length.toString().padStart(2,'0');$('#palette').innerHTML='';state.palette.forEach((color,i)=>{const b=document.createElement('button');b.className='swatch'+(i===ink?' selected':'');b.style.background=color;b.title=`Colore ${i+1} · ${color}`;b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',i===ink);b.onclick=()=>{ink=i;borderWildcard=false;renderUI();draw();};$('#palette').append(b);});renderDraft();$('#tiles').innerHTML='';tiles().forEach((t,i)=>{const b=document.createElement('button');b.className='tile'+(i===selected?' selected':'');b.title=`Tessera ${i+1}`;b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',i===selected);b.draggable=true;b.innerHTML=`<svg viewBox="25 0 170 165">${svgTile(t)}</svg><small>${String(i+1).padStart(2,'0')}</small>`;b.onclick=()=>{selected=i;setMode('place');renderUI();draw();};b.ondblclick=()=>{draft=[...t];renderDraft();message('Tessera copiata nell’editor. Modificala e aggiungila al tileset.');};b.ondragstart=e=>{selected=i;setMode('place');e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='copy';};$('#tiles').append(b);});$('#deleteTile').disabled=selected<0;}
function borderControls(){const active=mode==='border'&&borderWildcard;$('#wildcardBorder').classList.toggle('active',active);$('#wildcardBorder').setAttribute('aria-pressed',active);}
function setMode(m){mode=m;borderControls();hover=null;$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));message(m==='select'?'Trascina un rettangolo per selezionare tessere e bordi.':m==='paste'?'Clicca per incollare la copia. Esc annulla.':m==='border'?(borderWildcard?'Bordo jolly: clicca i lati per chiudere la regione, con qualsiasi colore.':'Scegli un colore oppure Bordo jolly, poi clicca i lati.'):m==='erase'?'Clicca una tessera o un bordo per cancellarlo.':'Clicca la griglia o trascina una tessera dal tileset.');draw();}
$$('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('#wildcardBorder').onclick=()=>{borderWildcard=!borderWildcard;setMode('border');};
$('#geometry').onchange=e=>{snapshot();state.geometry=e.target.value;selected=0;pan={x:0,y:0};hover=null;ensure();rebuild();renderUI();draw();message('Geometria cambiata. Ogni griglia conserva la propria composizione.');};
$('#addColor').onclick=()=>{borderWildcard=false;const c=$('#newColor').value;if(state.palette.includes(c)){ink=state.palette.indexOf(c);}else{snapshot();state.palette.push(c);ink=state.palette.length-1;}renderUI();};
$('#addTile').onclick=()=>{snapshot();tiles().push([...draft]);selected=tiles().length-1;renderUI();draw();message('Nuova tessera aggiunta. È pronta per essere posata.');};
$('#deleteTile').onclick=()=>{if(selected<0)return;snapshot();tiles().splice(selected,1);selected=Math.min(selected,tiles().length-1);renderUI();draw();};
$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);
$('#zoomIn').onclick=()=>{zoom=Math.min(2.5,zoom+.15);draw();};$('#zoomOut').onclick=()=>{zoom=Math.max(.35,zoom-.15);draw();};
canvas.onpointerdown=e=>{
 if(e.button!==0&&e.button!==1)return;canvas.focus();canvas.setPointerCapture(e.pointerId);
 drag={x:e.clientX,y:e.clientY,pan:e.button===1||space,saved:false};lastAction='';
 if(drag.pan)return;
 if(mode==='solve'){drag=null;startRegionSolve(hit(e));return;}
 if(mode==='paste'){pasteRegion(hit(e));drag=null;return;}
 if(mode==='select'){drag.start=worldPoint(e);resetSelection();selectionBox=[drag.start,drag.start];draw();return;}
 stroke(e);
};
function stroke(e){const h=hit(e);if(!h)return;const id=mode==='border'?h.c.edges[h.edge]:mode==='erase'?h.c.id+':'+h.edge:h.c.id;if(id===lastAction)return;lastAction=id;if(!drag.saved){snapshot();drag.saved=true;}act(h);}
canvas.onpointermove=e=>{hover=hit(e);if(drag){if(drag.pan){pan.x+=e.clientX-drag.x;pan.y+=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;hover=null;}else if(drag.start){const end=worldPoint(e);selectRegion(drag.start,end);selectionBox=[drag.start,end];}else stroke(e);}cancelAnimationFrame(raf);raf=requestAnimationFrame(draw);};
canvas.onpointerup=e=>{
 if(drag?.start){const start=drag.start,end=worldPoint(e);selectRegion(start,end);
  if(Math.hypot(start[0]-end[0],start[1]-end[1])*scale()<5){const h=hit(e);if(h){if(h.d<.15&&board().borders[h.c.edges[h.edge]]!==undefined)regionSelection.borders.add(h.c.edges[h.edge]);else if(board().placed[h.c.id])regionSelection.tiles.add(h.c.id);}}
  message(`${regionSelection.tiles.size} tessere e ${regionSelection.borders.size} bordi selezionati.`);
 }
 drag=null;lastAction='';selectionBox=null;draw();
};
canvas.onpointercancel=()=>{drag=null;lastAction='';selectionBox=null;draw();};canvas.onpointerleave=()=>{hover=null;draw();};
canvas.ondragover=e=>{e.preventDefault();hover=hit(e);draw();};canvas.ondrop=e=>{e.preventDefault();const n=Number(e.dataTransfer.getData('text/plain'));if(!Number.isInteger(n)||!tiles()[n])return;selected=n;snapshot();setMode('place');act(hit(e));hover=null;renderUI();draw();};
function handleWheel(e){
 e.preventDefault();
 const unit=e.deltaMode===1?16:e.deltaMode===2?(e.shiftKey&&!e.ctrlKey?width:height):1;
 if(e.ctrlKey){const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left-width/2,y=e.clientY-rect.top-height/2,old=zoom;zoom=Math.max(.35,Math.min(2.5,zoom*Math.exp(-e.deltaY*unit*.001)));pan={x:x-(x-pan.x)*zoom/old,y:y-(y-pan.y)*zoom/old};}
 else if(e.shiftKey)pan.x-=(e.deltaX||e.deltaY)*unit;
 else pan.y-=(e.deltaY||e.deltaX)*unit;
 hover=null;draw();
}
canvas.addEventListener('wheel',handleWheel,{passive:false});
$('#clear').onclick=()=>{snapshot();state.boards[state.geometry]={placed:{},borders:{}};resetSelection();setMode('place');message('Clean all: tessere e bordi della griglia rimossi. Ctrl+Z per annullare.');};
$('#copyRegion').onclick=copyRegion;$('#pasteRegion').onclick=startPaste;$('#deleteRegion').onclick=deleteRegion;
function clean(v){document.body.classList.toggle('clean',v);resize();}$('#clean').onclick=()=>clean(true);$('#exitClean').onclick=()=>clean(false);
window.addEventListener('keydown',e=>{
 if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
 const key=e.key.toLowerCase(),command=e.ctrlKey||e.metaKey;
 if(e.code==='Space'){space=true;e.preventDefault();}
 if(e.key==='Escape'){resetSelection();setMode('select');clean(false);}
 if(command){if(key==='z'){e.preventDefault();undo(e.shiftKey);}else if(key==='c'){e.preventDefault();copyRegion();}else if(key==='v'){e.preventDefault();startPaste();}else if(key==='a'){e.preventDefault();regionSelection={tiles:new Set(Object.keys(board().placed)),borders:new Set(Object.keys(board().borders))};setMode('select');}}
 else{if(key==='p')setMode('place');if(key==='b')setMode('border');if(key==='e')setMode('erase');if(key==='s')setMode('select');if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteRegion();}}
});window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;drag=null;});
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#save').onclick=()=>download(new Blob([JSON.stringify({version:1,...state,solverEngine:typeof solverProvenance==='function'?solverProvenance():null},null,2)],{type:'application/json'}),'wang-studio.json');$('#load').onclick=()=>$('#file').click();
function validate(data){const types=['square','hex-flat','hex-point','tri-up','tri-side'];if(!data||data.version!==1||!types.includes(data.geometry)||!Array.isArray(data.palette)||!data.palette.length||data.palette.length>128||!data.palette.every(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))||!data.sets||!data.boards)throw Error('Formato progetto non valido.');const valid=t=>Array.isArray(t)&&t.every(n=>Number.isInteger(n)&&n>=0&&n<data.palette.length);for(const [k,ts]of Object.entries(data.sets)){const n={square:4,hex:6,tri:3}[k];if(!n||!Array.isArray(ts)||ts.length>10000||!ts.every(t=>valid(t)&&t.length===n))throw Error('Tileset non valido.');}for(const[k,b]of Object.entries(data.boards)){if(!types.includes(k)||!b||!b.placed||!b.borders)throw Error('Griglia non valida.');const n=k==='square'?4:k.startsWith('hex')?6:3;for(const[id,t]of Object.entries(b.placed)){if(!/^-?\d+,-?\d+(,[01])?$/.test(id)||!valid(t)||t.length!==n)throw Error('Tessera non valida.');}for(const [id,v]of Object.entries(b.borders)){if(!/^-?\d+,-?\d+\|-?\d+,-?\d+$/.test(id)||(v!==null&&!valid([v])))throw Error('Bordo non valido.');}}return{...(Object.hasOwn(data,'transitionSettings')?{transitionSettings:TransitionShape.settings(data.transitionSettings)}:{}),geometry:data.geometry,palette:data.palette,sets:data.sets,boards:data.boards,solverEngine:data.solverEngine??null};}
$('#file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>5e6)throw Error('Il file è troppo grande.');const next=validate(JSON.parse(await f.text()));snapshot();state=next;clipboard=null;ink=0;selected=0;hover=null;ensure();rebuild();renderUI();draw();message('Progetto aperto.');}catch(err){message('Impossibile aprire: '+err.message);}e.target.value='';};
function exportCanvas(mode='frame'){
 const output=document.createElement('canvas');const placed=Object.entries(board().placed).map(([id,t])=>({c:cellAt(id),t}));let project=screen,ratio=devicePixelRatio,w=width,h=height;
 if(mode==='all'){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  const include=p=>{x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);};
  placed.forEach(({c})=>c.p.forEach(include));Object.keys(board().borders).forEach(k=>borderPoints(k).forEach(include));
  if(!Number.isFinite(x0))throw Error('La composizione è vuota. Posa una tessera o disegna un bordo.');
  const unit=58,padding=12;w=Math.ceil((x1-x0)*unit+padding*2);h=Math.ceil((y1-y0)*unit+padding*2);
  project=([x,y])=>[(x-x0)*unit+padding,(y-y0)*unit+padding];ratio=2;
 }
 const pixelsW=Math.ceil(w*ratio),pixelsH=Math.ceil(h*ratio);
 if(pixelsW>16384||pixelsH>16384||pixelsW*pixelsH>40000000)throw Error('La composizione è troppo grande per un singolo PNG. Usa PNG frame e riduci lo zoom.');
 output.width=pixelsW;output.height=pixelsH;const target=output.getContext('2d');if(!target)throw Error('Impossibile creare il PNG.');target.setTransform(ratio,0,0,ratio,0,0);
 for(const {c,t}of placed)paint(c,t,1,target,project);paintBorders(target,project);return output;
}
function exportPNG(mode){try{exportCanvas(mode).toBlob(b=>{if(b){download(b,mode==='all'?'wang-regione.png':'wang-frame.png');message(mode==='all'?'Intera composizione esportata su sfondo trasparente.':'Frame esportato con posizione e zoom attuali, su sfondo trasparente.');}else message('Esportazione PNG non riuscita. Riprova.');},'image/png');}catch(err){message(err.message);}}
$('#exportAll').onclick=()=>exportPNG('all');
$('#export').onclick=()=>exportPNG('frame');
function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;canvas.width=Math.round(width*devicePixelRatio);canvas.height=Math.round(height*devicePixelRatio);draw();}
let regionSelection={tiles:new Set(),borders:new Set()},selectionBox=null,clipboard=null;
function resetSelection(){regionSelection={tiles:new Set(),borders:new Set()};selectionBox=null;}
function worldPoint(e){const r=canvas.getBoundingClientRect();return[(e.clientX-r.left-width/2-pan.x)/scale(),(e.clientY-r.top-height/2-pan.y)/scale()];}
function selectRegion(a,b){
 const x0=Math.min(a[0],b[0]),x1=Math.max(a[0],b[0]),y0=Math.min(a[1],b[1]),y1=Math.max(a[1],b[1]);
 const contains=([x,y])=>x>=x0&&x<=x1&&y>=y0&&y<=y1;
 resetSelection();
 for(const id of Object.keys(board().placed))if(contains(cellAt(id).center))regionSelection.tiles.add(id);
 for(const k of Object.keys(board().borders)){const [p,q]=borderPoints(k);if(contains([(p[0]+q[0])/2,(p[1]+q[1])/2]))regionSelection.borders.add(k);}
 message(`${regionSelection.tiles.size} tessere e ${regionSelection.borders.size} bordi selezionati.`);
}
function borderOwner(k){
 const known=edgeMap.get(k)?.[0];if(known)return{id:known.c.id,edge:known.i};
 const [a,b]=borderPoints(k),[u,v]=lattice([(a[0]+b[0])/2,(a[1]+b[1])/2]);
 for(let j=Math.floor(v)-2;j<=Math.ceil(v)+2;j++)for(let i=Math.floor(u)-2;i<=Math.ceil(u)+2;i++)for(let half=0;half<(family()==='tri'?2:1);half++){
  const c=cellAt(family()==='tri'?`${i},${j},${half}`:`${i},${j}`),edge=c.edges.indexOf(k);if(edge!==-1)return{id:c.id,edge};
 }
 return null;
}
function copyRegion(){
 const copiedTiles=[...regionSelection.tiles].filter(id=>board().placed[id]).map(id=>({id,t:[...board().placed[id]]}));
 const copiedBorders=[...regionSelection.borders].filter(k=>board().borders[k]!==undefined).map(k=>({...borderOwner(k),color:board().borders[k]})).filter(b=>b.id);
 if(!copiedTiles.length&&!copiedBorders.length){message('Seleziona prima una regione da copiare.');return false;}
 const ids=[...copiedTiles,...copiedBorders].map(v=>v.id.split(',').map(Number));
 clipboard={geometry:state.geometry,palette:[...state.palette],tiles:copiedTiles,borders:copiedBorders,anchor:[Math.min(...ids.map(p=>p[0])),Math.min(...ids.map(p=>p[1]))]};
 draw();message('Regione copiata. Premi Incolla, poi clicca la destinazione.');return true;
}
function startPaste(){if(!clipboard){message('Copia prima una selezione.');return;}if(clipboard.geometry!==state.geometry){message('Per incollare, scegli la stessa geometria della regione copiata.');return;}setMode('paste');}
function pastePlan(h){
 if(!h||!clipboard||clipboard.geometry!==state.geometry)return null;
 const [i,j]=h.c.id.split(',').map(Number),di=i-clipboard.anchor[0],dj=j-clipboard.anchor[1],palette=[...state.palette];
 const shift=id=>{const p=id.split(',').map(Number);p[0]+=di;p[1]+=dj;return p.join(',');};
 const color=n=>{if(n===null)return null;const value=clipboard.palette[n];let index=palette.indexOf(value);if(index<0){index=palette.length;palette.push(value);}return index;};
 const placed={},borders={};
 for(const tile of clipboard.tiles)placed[shift(tile.id)]=tile.t.map(color);
 for(const b of clipboard.borders)borders[cellAt(shift(b.id)).edges[b.edge]]=color(b.color);
 const touched=new Set(Object.keys(borders));Object.keys(placed).forEach(id=>cellAt(id).edges.forEach(k=>touched.add(k)));
 const claims=new Map();let invalid=palette.length>128;
 const claim=(k,v)=>{if(v===null||!touched.has(k))return;if(claims.has(k)&&claims.get(k)!==v)invalid=true;claims.set(k,v);};
 if($('#strict').checked){for(const [id,t]of Object.entries({...board().placed,...placed}))cellAt(id).edges.forEach((k,e)=>claim(k,t[e]));for(const[k,v]of Object.entries({...board().borders,...borders}))claim(k,v);}
 return{placed,borders,palette,invalid};
}
function pasteRegion(h){
 const plan=pastePlan(h);if(!plan)return false;
 if(plan.invalid){message('Incolla non riuscito: colori incompatibili o palette piena. Scegli un’altra posizione.');return false;}
 snapshot();state.palette=plan.palette;Object.assign(board().placed,plan.placed);Object.assign(board().borders,plan.borders);
 regionSelection={tiles:new Set(Object.keys(plan.placed)),borders:new Set(Object.keys(plan.borders))};selectionBox=null;
 rebuild();renderUI();setMode('select');message('Regione incollata. Puoi annullare con Ctrl+Z.');return true;
}
function deleteRegion(){
 if(!regionSelection.tiles.size&&!regionSelection.borders.size){message('Seleziona prima gli elementi da eliminare.');return;}
 snapshot();regionSelection.tiles.forEach(id=>delete board().placed[id]);regionSelection.borders.forEach(k=>delete board().borders[k]);resetSelection();draw();message('Selezione eliminata. Puoi annullare con Ctrl+Z.');
}
function drawSelection(){
 ctx.save();ctx.strokeStyle='#e4f6b9';ctx.lineWidth=2;ctx.setLineDash([5,4]);
 for(const id of regionSelection.tiles){if(!board().placed[id])continue;path(cellAt(id).p.map(screen));ctx.fillStyle='#e4f6b922';ctx.fill();ctx.stroke();}
 for(const k of regionSelection.borders){if(board().borders[k]===undefined)continue;const[a,b]=borderPoints(k);ctx.beginPath();ctx.moveTo(...screen(a));ctx.lineTo(...screen(b));ctx.stroke();}
 if(selectionBox){const[a,b]=selectionBox.map(screen);ctx.fillStyle='#c8dc9c20';ctx.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);ctx.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);}
 ctx.restore();
 if(mode==='paste'&&hover){const plan=pastePlan(hover);if(plan){for(const[id,t]of Object.entries(plan.placed)){const c=cellAt(id);paint(c,t,.55,ctx,screen,plan.palette);path(c.p.map(screen));ctx.strokeStyle=plan.invalid?'#ff877f':'#e4f6b9';ctx.lineWidth=2;ctx.stroke();}ctx.save();ctx.globalAlpha=.65;paintBorders(ctx,screen,plan.borders,plan.palette);ctx.restore();}}
 const hasSelection=regionSelection.tiles.size+regionSelection.borders.size>0;
 $('#copyRegion').disabled=!hasSelection;$('#deleteRegion').disabled=!hasSelection;$('#pasteRegion').disabled=!clipboard||clipboard.geometry!==state.geometry;
}

ensure();rebuild();renderUI();new ResizeObserver(resize).observe($('#stage'));resize();
if(document.modelContext?.registerTool){const lifecycle=new AbortController();const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};register({name:'read_wang_composition',description:'Legge geometria, palette, tileset e composizione correnti.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>clone({geometry:state.geometry,palette:state.palette,tiles:tiles(),board:board()})});register({name:'place_wang_tile',description:'Posa una tessera del tileset in una cella esistente, rispettando le regole attive.',inputSchema:{type:'object',properties:{cell:{type:'string'},tile:{type:'integer',minimum:0}},required:['cell','tile'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{const c=cells.find(c=>c.id===input.cell);if(!c||!Number.isInteger(input.tile)||!tiles()[input.tile])throw Error('Cella o tessera non valida');if($('#strict').checked&&conflicts(c,tiles()[input.tile]))throw Error('Colori incompatibili');snapshot();board().placed[c.id]=[...tiles()[input.tile]];draw();return{placed:c.id};}});window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
