/* Export research examples through the real editor in Chromium. */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const profile=await mkdtemp(join(tmpdir(),'wang-browser-'));
const apiRequests=[], failures=[];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css'};
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path.includes('/api/'))apiRequests.push(path);
  try {
    if(!path.startsWith('/studio/'))throw Error('Outside project path');
    let file=path==='/studio/'?'index.html':decodeURIComponent(path.slice('/studio/'.length));
    let body;
    if(file==='browser_flow.js')body=await readFile(join(root,'tests/browser_flow.js'));
    else if(file==='browser_wasm.js')body=await readFile(join(root,'tests/browser_wasm.js'));
    else {
      const absolute=resolve(root,'dist',file);
      if(!absolute.startsWith(join(root,'dist')+'/'))throw Error('Invalid path');
      body=await readFile(absolute);
    }
    
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  }catch {res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
let browser, socket, call;
try {
  browser=spawn(process.env.CHROMIUM||'chromium',['--headless','--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{
    let stderr='';
    const timeout=setTimeout(()=>reject(Error('Chromium did not start: '+stderr)),15000);
    browser.once('error',error=>{clearTimeout(timeout);reject(error);});
    browser.once('exit',code=>{clearTimeout(timeout);reject(Error('Chromium exited '+code+': '+stderr));});
    browser.stderr.on('data',chunk=>{
      stderr+=chunk;
      const match=/DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if(match){clearTimeout(timeout);resolve(match[1]);}
    });
  });
  const origin=endpoint.replace(/^ws:/,'http:').replace(/\/devtools\/.*/, '');
  const targets=await (await fetch(origin+'/json/list')).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let nextId=0;const pending=new Map();
  socket.onmessage=event=>{
    const data=JSON.parse(event.data);
    if(data.id){const waiter=pending.get(data.id);if(waiter){pending.delete(data.id);data.error?waiter.reject(Error(JSON.stringify(data.error))):waiter.resolve(data.result);}}
    else if(data.method==='Runtime.exceptionThrown')failures.push(data.params.exceptionDetails);
    else if(data.method==='Network.requestWillBeSent'&&new URL(data.params.request.url).pathname.includes('/api/'))apiRequests.push(data.params.request.url);
  };
  call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/studio/`});
  for(let i=0;i<100;i++){
    const ready=await call('Runtime.evaluate',{expression:'document.readyState === "complete" && typeof BoundaryTransition !== "undefined"',returnByValue:true});
    if(ready.result.value)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const response=await call('Runtime.evaluate',{expression:await readFile(join(root,process.argv[2] || 'tools/research-figures-flow.js'),'utf8'),awaitPromise:true,returnByValue:true});
  if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));
  const data=response.result.value;
  const out=join(root,'docs/apertura-ricerca/figure');await mkdir(out,{recursive:true});
  for(const item of data.images){
    await writeFile(join(out,item.name+'.png'),Buffer.from(item.png,'base64'));
    await writeFile(join(out,item.name+'.json'),JSON.stringify(item.project,null,2)+'\n');
    delete item.png;
  }
  await writeFile(join(out,process.argv[3] || 'generazione.json'),JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify(data.transition,null,2));
  console.log('Exported '+data.images.length+' editor figures and reloadable projects.');

} finally {
  if(socket?.readyState===WebSocket.OPEN&&call){
    await Promise.race([call('Browser.close').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1000))]);
  }
  socket?.close();
  if(browser&&browser.exitCode===null){
    const exited=new Promise(resolve=>browser.once('exit',resolve));
    const fallback=setTimeout(()=>browser.kill('SIGKILL'),2000);
    await exited;clearTimeout(fallback);
  }
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
