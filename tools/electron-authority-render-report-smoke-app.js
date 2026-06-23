#!/usr/bin/env node
'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESULT_PATH = process.env.FATE_AUTHORITY_RENDER_SMOKE_RESULT || '';
let smokeStage = 'startup';
const MIME_TYPES = {
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.mp3':'audio/mpeg',
  '.wav':'audio/wav',
  '.ogg':'audio/ogg',
  '.txt':'text/plain; charset=utf-8'
};

function send(res, status, headers, body){
  res.writeHead(status, headers);
  res.end(body);
}

function writeResult(payload){
  if(!RESULT_PATH) return;
  try{
    fs.writeFileSync(RESULT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  }catch(err){}
}

function setStage(stage){
  smokeStage = stage;
  writeResult({ok:false, pending:true, stage:smokeStage});
}

function startStaticServer(){
  const server = http.createServer((req, res)=>{
    try{
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname || '/');
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const resolved = path.resolve(ROOT, rel);
      if(resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)){
        send(res, 403, {'content-type':'text/plain; charset=utf-8'}, 'Forbidden');
        return;
      }
      fs.stat(resolved, (statErr, stat)=>{
        const target = !statErr && stat.isDirectory() ? path.join(resolved, 'index.html') : resolved;
        fs.readFile(target, (readErr, data)=>{
          if(readErr){
            send(res, 404, {'content-type':'text/plain; charset=utf-8'}, 'Not found');
            return;
          }
          const ext = path.extname(target).toLowerCase();
          send(res, 200, {
            'content-type':MIME_TYPES[ext] || 'application/octet-stream',
            'cache-control':'no-store, no-cache, must-revalidate, max-age=0',
            'pragma':'no-cache',
            'expires':'0'
          }, data);
        });
      });
    }catch(err){
      send(res, 500, {'content-type':'text/plain; charset=utf-8'}, String(err && err.message || err));
    }
  });
  return new Promise((resolve, reject)=>{
    server.once('error', reject);
    server.listen(0, '127.0.0.1', ()=>{
      const address = server.address();
      resolve({
        server,
        url:`http://127.0.0.1:${address.port}/index.html?electron=1&fateAuthorityRenderSmoke=1`
      });
    });
  });
}

async function waitFor(win, expression, label, timeoutMs=15000){
  const started = Date.now();
  while(Date.now() - started < timeoutMs){
    const ok = await win.webContents.executeJavaScript(`Boolean(${expression})`).catch(()=>false);
    if(ok) return true;
    await new Promise(resolve=>setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main(){
  setStage('starting-static-server');
  const { server, url } = await startStaticServer();
  setStage('creating-window');
  const win = new BrowserWindow({
    show:false,
    width:1280,
    height:900,
    backgroundColor:'#06080e',
    webPreferences:{
      contextIsolation:false,
      nodeIntegration:false,
      sandbox:false,
      backgroundThrottling:false
    }
  });

  win.webContents.on('console-message', (_event, level, message)=>{
    if(level >= 2) process.stderr.write(`[renderer] ${message}\n`);
  });
  setStage('loading-url');
  await win.loadURL(url);
  setStage('waiting-for-report-dependencies');
  await waitFor(win, 'window.fateAuthorityRenderReport && window.getFateGameState && window.renderGame', 'authority render report dependencies');

  setStage('executing-render-report');
  const report = await win.webContents.executeJavaScript(`(async function(){
    function emptyBoard(){
      return Array.from({length:3}, function(){
        return Array.from({length:3}, function(){
          return Array.from({length:3}, function(){ return null; });
        });
      });
    }
    function nextFrame(){
      return new Promise(function(resolve){
        requestAnimationFrame(function(){ setTimeout(resolve, 80); });
      });
    }
    document.querySelectorAll('.screen').forEach(function(screen){ screen.classList.remove('active'); });
    var gameScreen = document.getElementById('s-game');
    if(gameScreen) gameScreen.classList.add('active');
    var g = window.getFateGameState();
    var cardDef = (typeof CARDS !== 'undefined' && Array.isArray(CARDS) ? CARDS : []).find(function(card){ return String(card.id) === '01'; }) || {id:'01', name:'Smoke Card', type:'Coordinator', aff:'reality', fate:3, cost:0, img:'1.png'};
    var card = Object.assign({}, cardDef, {
      iid:'authority-render-smoke-1',
      owner:0,
      currentFate:Number(cardDef.fate || cardDef.fateBase || 1) || 1,
      baseFate:Number(cardDef.fate || cardDef.fateBase || 1) || 1
    });
    g.players = [
      {name:'Render Host', deck:[], hand:[], discard:[], color:'var(--p1)'},
      {name:'Render Guest', deck:[], hand:[], discard:[], color:'var(--p2)'}
    ];
    g.board = emptyBoard();
    g.board[0][2][0] = card;
    g.currentPlayer = 0;
    g.turn = 1;
    g.phase = 'main';
    g.selectedHandCard = null;
    g.selectedBoardCard = null;
    g.placing = false;
    g._onlineRoomCode = 'SMOKE';
    g._onlineActionLogMode = 'fly';
    g._onlinePlayerIndex = 0;
    g._onlineActionSeq = 7;
    g._onlineAppliedActionSeq = 7;
    if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
    window.renderGame({force:true});
    await nextFrame();
    await nextFrame();
    return window.fateAuthorityRenderReport();
  })()`, true);

  const ok = !!report
    && report.canonicalBoardCount === 1
    && report.renderedBoardCount === 1
    && report.renderedBoardMatchesCanonical === true
    && !report.renderMismatchReason;
  const payload = {ok, report};
  writeResult(payload);
  console.log(JSON.stringify(payload, null, 2));
  server.close();
  await app.quit();
  if(!ok) process.exitCode = 1;
}

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const watchdog = setTimeout(()=>{
  const payload = {ok:false, error:'Timed out in Electron authority render smoke', stage:smokeStage};
  writeResult(payload);
  try{ app.exit(1); }catch(err){ process.exit(1); }
}, 35000);
process.on('uncaughtException', err=>{
  const payload = {ok:false, error:String(err && err.message || err), stack:String(err && err.stack || '')};
  writeResult(payload);
  process.stderr.write(String(err && err.stack || err) + '\n');
  try{ app.quit().finally(()=>{ process.exitCode = 1; }); }catch(e){ process.exitCode = 1; }
});
process.on('unhandledRejection', err=>{
  const payload = {ok:false, error:String(err && err.message || err), stack:String(err && err.stack || '')};
  writeResult(payload);
  process.stderr.write(String(err && err.stack || err) + '\n');
  try{ app.quit().finally(()=>{ process.exitCode = 1; }); }catch(e){ process.exitCode = 1; }
});
app.whenReady().then(main).catch(err=>{
  const payload = {ok:false, error:String(err && err.message || err), stack:String(err && err.stack || '')};
  writeResult(payload);
  process.stderr.write(String(err && err.stack || err) + '\n');
  app.quit().finally(()=>{ process.exitCode = 1; });
});
