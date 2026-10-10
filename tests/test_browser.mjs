/* Real Chromium, static subpath hosting, no npm dependencies or native API. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
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
    if(file==='index.html')body=Buffer.from(body.toString().replace('</body>','<script src="browser_flow.js"></script><script src="browser_wasm.js"></script></body>'));
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  }catch {res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
let browser, socket;
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
  };
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
  await call('Runtime.enable');
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/studio/`});
  const began=Date.now();let result;
  while(Date.now()-began<45000){
    const response=await call('Runtime.evaluate',{expression:'JSON.stringify({flow:document.querySelector("#browser-test-result")?.textContent,wasm:document.querySelector("#wasm-test-result")?.textContent})',returnByValue:true});
    result=JSON.parse(response.result.value||'{}');
    if(result.flow?.startsWith('FAIL')||result.wasm?.startsWith('FAIL'))break;
    if(result.flow&&result.wasm)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.match(result?.flow||'No flow result',/^PASS/);
  assert.match(result?.wasm||'No Wasm result',/^PASS/);
  assert.deepEqual(apiRequests,[],'Static browser mode must never contact a native API');
  assert.deepEqual(failures,[],'No unhandled browser errors');
  console.log(result.flow);console.log(result.wasm);
  console.log('PASS: static /studio/ subpath, no COOP/COEP headers and no native API requests.');
} finally {
  socket?.close();
  if(browser&&browser.exitCode===null){const exited=new Promise(resolve=>browser.once('exit',resolve));browser.kill('SIGKILL');await exited;}
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await rm(profile,{recursive:true,force:true});
}
