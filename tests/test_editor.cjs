const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');const els=new Map(),context2d=new Proxy({},{get:(_,p)=>()=>{}});const el=s=>{if(!els.has(s))els.set(s,{textContent:'',value:'',checked:true,style:{},dataset:{},classList:{toggle(){}},getContext:()=>context2d,getBoundingClientRect:()=>({width:1000,height:650,left:0,top:0}),querySelectorAll:()=>[],append(){},setAttribute(){},addEventListener(){},click(){},focus(){}});return els.get(s)};const registered={};const sandbox={console,document:{querySelector:el,querySelectorAll:()=>[],createElement:()=>el(Math.random()),body:el('body'),activeElement:{tagName:'BODY'},modelContext:{registerTool:t=>registered[t.name]=t}},window:{addEventListener(){}},ResizeObserver:class{observe(){}},devicePixelRatio:1,requestAnimationFrame:()=>0,cancelAnimationFrame(){},setTimeout,AbortController,Blob,URL};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8'),sandbox);const run=s=>vm.runInContext(s,sandbox);
for(const geo of ['square','hex-flat','hex-point','tri-up','tri-side']){run(`state.geometry='${geo}';ensure();rebuild();`);assert.equal(run('cells.find(c=>c.id==="0,0"||c.id==="0,0,0").edges.filter(k=>edgeMap.get(k).length===2).length'),geo==='square'?4:geo.startsWith('hex')?6:3,geo+' adjacent edges');run('board().placed={};board().borders={};mode="place";selected=0;');assert.equal(run('act({c:cells.find(c=>c.id==="0,0"||c.id==="0,0,0"),edge:0})'),true);assert.equal(run('Object.keys(board().placed).length'),1);assert.equal(run('(()=>{const c=cells.find(c=>c.id==="0,0"||c.id==="0,0,0");const k=c.edges[0];board().borders[k]=(board().placed[c.id][0]+1)%state.palette.length;return conflicts(c,board().placed[c.id]);})()'),true);run('board().borders={}');assert.doesNotThrow(()=>run('validate({version:1,...clone(state)})'));}
run('state.geometry="square";ensure();rebuild();board().placed={};board().borders={};');registered.place_wang_tile.execute({cell:'0,0',tile:0});assert.equal(Object.keys(registered.read_wang_composition.execute().board.placed).length,1);assert.throws(()=>registered.place_wang_tile.execute({cell:'invalid',tile:0}));assert.throws(()=>run('validate({version:1})'));run('snapshot();board().placed={};undo();');assert.equal(run('Object.keys(board().placed).length'),1);console.log('PASS: 5 geometries, shared edges, Wang constraints, placement, serialization, undo, WebMCP valid/invalid actions (mock context).');
const fills=[],strokes=[],rects=[];const exportCtx={setTransform(){},beginPath(){},lineTo(){},moveTo(){},closePath(){},fill(){fills.push({color:this.fillStyle,alpha:this.globalAlpha});},stroke(){strokes.push(this.strokeStyle);},fillRect(){rects.push(1);}};sandbox.document.createElement=tag=>tag==='canvas'?{getContext:()=>exportCtx}:el(Math.random());
for(const geo of ['square','hex-flat','hex-point','tri-up','tri-side']){run(`state.geometry='${geo}';ensure();rebuild();board().placed={};board().borders={};`);fills.length=strokes.length=rects.length=0;run('exportCanvas()');assert.equal(fills.length+strokes.length+rects.length,0,'Empty export must be transparent');run('(()=>{const c=cells.find(c=>c.id==="0,0"||c.id==="0,0,0");board().placed[c.id]=Array(count()).fill(state.palette.indexOf("#ffffff"));board().borders[c.edges[0]]=state.palette.indexOf("#ffffff");hover={c,edge:0};})();exportCanvas();');assert.equal(fills.length,geo==='square'?5:geo.startsWith('hex')?7:4,'Only placed tile exported; no hover');assert.ok(fills.every(f=>f.color==='#ffffff'&&f.alpha===1),'White stays opaque');assert.equal(strokes.length,3,'Only tile outline and two region border strokes');assert.equal(strokes.at(-1),'#ffffff','White border preserved');assert.equal(rects.length,0,'No background rectangle');}
console.log('PASS: transparent empty exports, opaque white tiles/borders, no grid or hover in all 5 geometries.');
const points=[];exportCtx.moveTo=(x,y)=>points.push([x,y]);exportCtx.lineTo=(x,y)=>points.push([x,y]);
for(const geo of ['square','hex-flat','hex-point','tri-up','tri-side']){
 run(`state.geometry='${geo}';ensure();board().placed={};board().borders={};zoom=.35;pan={x:17000,y:-13000};draw();`);
 for(const [x,y]of [[1,1],[999,1],[1,649],[999,649],[500,325]])assert.ok(run(`hit({clientX:${x},clientY:${y}})`),geo+' grid covers viewport far from origin');
 assert.ok(run('cells.some(c=>Math.abs(Number(c.id.split(",")[0]))>13)'),geo+' expands beyond former boundary');
 run('(()=>{const h=hit({clientX:500,clientY:325});board().placed[h.c.id]=Array(count()).fill(4);board().borders[h.c.edges[0]]=4;})();pan={x:0,y:0};zoom=1;draw();');
 assert.equal(run('Object.keys(board().placed).length'),1,'Pan preserves placement');
 points.length=0;const all=run('exportCanvas("all")');assert.ok(all.width>24&&all.width<500&&all.height>24&&all.height<500,geo+' export crops offscreen tile');assert.ok(points.every(([x,y])=>x>=6&&y>=6&&x<=all.width/2-6&&y<=all.height/2-6),geo+' all exported paths inside crop');
 run('pan={x:-20000,y:12000};zoom=2;draw();');const again=run('exportCanvas("all")');assert.equal(again.width,all.width,'Full export independent of zoom and pan');assert.equal(again.height,all.height);
 const frame=run('exportCanvas("frame")');assert.equal(frame.width,1000);assert.equal(frame.height,650);
 run('board().placed={}');assert.ok(run('exportCanvas("all").width>0'),'Border-only composition exports');run('board().borders={}');assert.throws(()=>run('exportCanvas("all")'),/vuota/);
}
console.log('PASS: continuous grid at distant pan/minimum zoom, all five geometries; cropped full export includes offscreen content and isolated borders; full export stable across camera changes; frame dimensions preserved.');
run('pan={x:0,y:0};zoom=1;handleWheel({ctrlKey:false,shiftKey:false,deltaX:0,deltaY:100,deltaMode:0,preventDefault(){}})');assert.equal(run('pan.y'),-100);assert.equal(run('pan.x'),0);assert.equal(run('zoom'),1);
run('handleWheel({ctrlKey:false,shiftKey:true,deltaX:0,deltaY:80,deltaMode:0,preventDefault(){}})');assert.equal(run('pan.x'),-80);assert.equal(run('pan.y'),-100);assert.equal(run('zoom'),1);
run('handleWheel({ctrlKey:false,shiftKey:true,deltaX:2,deltaY:0,deltaMode:1,preventDefault(){}})');assert.equal(run('pan.x'),-112);
run('handleWheel({ctrlKey:true,shiftKey:false,deltaX:0,deltaY:-100,deltaMode:0,clientX:500,clientY:325,preventDefault(){}})');assert.ok(run('zoom>1'));
console.log('PASS: normal wheel pans Y; Shift wheel pans X with both native axes; line deltas normalized; Ctrl wheel zooms.');
for(const geo of ['square','hex-flat','hex-point','tri-up','tri-side']){
 run(`state.geometry='${geo}';ensure();board().placed={};board().borders={};pan={x:0,y:0};zoom=1;rebuild();`);
 run('(()=>{const c=cellAt(family()==="tri"?"0,0,0":"0,0");board().placed[c.id]=Array(count()).fill(4);c.edges.forEach(k=>board().borders[k]=4);})();selectRegion([-3,-3],[3,3]);');
 assert.equal(run('regionSelection.tiles.size'),1);assert.equal(run('regionSelection.borders.size'),geo==='square'?4:geo.startsWith('hex')?6:3);
 assert.ok(run('copyRegion()'));run('startPaste()');assert.equal(run('mode'),'paste');
 assert.ok(run('pasteRegion({c:cellAt(family()==="tri"?"30,30,1":"30,30")})'),geo+' paste succeeds');
 assert.equal(run('Object.keys(board().placed).length'),2);
 assert.ok(run('[...regionSelection.tiles].every(id=>cellAt(id).edges.every(k=>board().borders[k]===4))'),geo+' translated borders align exactly');
 run('deleteRegion()');assert.equal(run('Object.keys(board().placed).length'),1);run('undo()');assert.equal(run('Object.keys(board().placed).length'),2);
 run("$('#clear').onclick()");assert.equal(run('Object.keys(board().placed).length+Object.keys(board().borders).length'),0);run('undo()');assert.equal(run('Object.keys(board().placed).length'),2);
 run('selectRegion([-3,-3],[3,3]);copyRegion();');
 run('(()=>{const plan=pastePlan({c:cellAt(family()==="tri"?"50,50,0":"50,50")});const id=Object.keys(plan.placed)[0],c=cellAt(id);const neighbor=Object.values(plan.borders).length;const k=c.edges[0];board().borders[k]=0;clipboard.borders=[];})();');
 const before=run('JSON.stringify(board())');assert.equal(run('pasteRegion({c:cellAt(family()==="tri"?"50,50,0":"50,50")})'),false);assert.equal(run('JSON.stringify(board())'),before,'Failed paste is atomic');
}
console.log('PASS: region selection, copy/paste including exactly aligned borders, delete, clean all, undo, and atomic Wang conflict rejection in all 5 geometries.');

vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/solver.js'),'utf8'),sandbox);
run('state.geometry="square";ensure();board().placed={};board().borders={};pan={x:0,y:0};zoom=1;rebuild();for(let y=0;y<3;y++)for(let x=0;x<3;x++){const c=cellAt(`${x},${y}`);if(y===0)board().borders[c.edges[0]]=4;if(x===2)board().borders[c.edges[1]]=4;if(y===2)board().borders[c.edges[2]]=4;if(x===0)board().borders[c.edges[3]]=4;}');
assert.equal(run('closedRegion(cellAt("1,1")).cells.length'),9);
run('board().placed["1,1"]=[4,4,4,4]');assert.equal(run('closedRegion(cellAt("1,1")).cells.find(c=>c.id==="1,1").fixed[0]'),4);
assert.throws(()=>run('closedRegion(cellAt("-1,-1"))'),/esterno/);
run('delete board().borders[cellAt("0,0").edges[0]]');assert.throws(()=>run('closedRegion(cellAt("1,1"))'),/aperto/);
console.log('PASS: closed region detection, exterior/open rejection, fixed tiles payload.');

const dashes=[];exportCtx.setLineDash=v=>dashes.push([...v]);
for(const geo of ['square','hex-flat','hex-point','tri-up','tri-side']){
 run(`state.geometry='${geo}';ensure();board().placed={};board().borders={};pan={x:0,y:0};zoom=1;rebuild();borderWildcard=false;$('#wildcardBorder').onclick();`);
 assert.equal(run('mode'), 'border');assert.equal(run('borderWildcard'),true);
 run('(()=>{const c=cellAt(family()==="tri"?"0,0,0":"0,0");board().placed[c.id]=Array(count()).fill(4);c.edges.forEach((k,edge)=>act({c,edge}));})();');
 assert.ok(run('Object.values(board().borders).every(v=>v===null)'));
 assert.equal(run('Object.keys(board().borders).length'),geo==='square'?4:geo.startsWith('hex')?6:3);
 assert.equal(run('conflicts(cellAt(family()==="tri"?"0,0,0":"0,0"),Array(count()).fill(0))'),false);
 assert.doesNotThrow(()=>run('validate(JSON.parse(JSON.stringify({version:1,...state})))'));
 const paletteBefore=run('JSON.stringify(state.palette)');
 run('selectRegion([-3,-3],[3,3]);copyRegion();');
 assert.equal(run('pasteRegion({c:cellAt(family()==="tri"?"5,5,0":"5,5")})'),true);
 assert.equal(run('JSON.stringify(state.palette)'),paletteBefore);
 assert.ok(run('[...regionSelection.borders].every(k=>board().borders[k]===null)'));
 dashes.length=0;assert.doesNotThrow(()=>run('exportCanvas("all")'));assert.ok(dashes.some(v=>v.length===2));assert.deepEqual(dashes.at(-1),[]);
 run('mode="border";act({c:cellAt(family()==="tri"?"0,0,0":"0,0"),edge:0})');
 assert.equal(run('board().borders[cellAt(family()==="tri"?"0,0,0":"0,0").edges[0]]'),undefined);
}
run('state.geometry="square";ensure();board().placed={};board().borders={};rebuild();cellAt("0,0").edges.forEach(k=>board().borders[k]=null);');
assert.equal(run('closedRegion(cellAt("0,0")).cells.length'),1);
assert.equal(run('JSON.stringify(closedRegion(cellAt("0,0")).cells[0].required)'), '[null,null,null,null]');
run('board().borders[cellAt("0,0").edges[0]]=0');
assert.equal(run('JSON.stringify(closedRegion(cellAt("0,0")).cells[0].required)'), '[0,null,null,null]');
run('board().placed["1,0"]=[4,4,4,4]');
assert.equal(run('closedRegion(cellAt("0,0")).cells[0].required[1]'),4,'External tiles still constrain adjacency');
assert.equal(run('conflicts(cellAt("0,0"),[0,0,0,0])'),true);
run('delete board().borders[cellAt("0,0").edges[2]]');
assert.throws(()=>run('closedRegion(cellAt("0,0"))'),/aperto/);
assert.throws(()=>run('board().borders[cellAt("0,0").edges[2]]="wildcard";validate({version:1,...clone(state)})'),/Bordo/);
console.log('PASS: wildcard border UI, all geometries, placement, copy/paste, serialization, transparent PNG, mixed solver boundaries, adjacency and open-contour detection.');
