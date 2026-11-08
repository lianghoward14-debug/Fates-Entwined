const {app, BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'.tmp/menu-grid-test-profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
 try {
  await win.loadURL('data:text/html,'+encodeURIComponent('<style>.screen:not(.active),[hidden]{display:none!important}#grid{width:700px;height:400px;overflow:auto}</style><div class="screen active"><div class="ch-tab-pane active"><div id="grid"></div></div></div>'));
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'src/scripts/24-card-grid-canvas-renderer.js'),'utf8'));
  const result=await win.webContents.executeJavaScript('(async()=>{'+
   'const pause=ms=>new Promise(r=>setTimeout(r,ms));const grid=document.getElementById("grid"),pane=grid.parentElement,screen=pane.parentElement;'+
   'let paints=0;const original=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){paints++;return original.apply(this,args)};'+
   'renderCanvasDeckCollection(grid,Array.from({length:60},(_,id)=>({card:{id,name:"Card "+id}})),{virtualize:true});'+
   'await pause(160);const visiblePaints=paints;pane.hidden=true;pane.classList.remove("active");'+
   'for(let i=0;i<20;i++)grid.__fateCanvasGridState.draw();await pause(750);const hiddenPaints=paints-visiblePaints;'+
   'pane.hidden=false;pane.classList.add("active");window.dispatchEvent(new Event("fate-challenger-tab-changed"));await pause(200);const resumedPaints=paints-visiblePaints;const hits=grid.querySelectorAll("button").length;'+
   'screen.classList.remove("active");const before=paints;grid.__fateCanvasGridState.draw();await pause(100);'+
   'return {visiblePaints,hiddenPaints,resumedPaints,hits,hiddenScreenPaints:paints-before};})()');
  console.log(result);assert(result.visiblePaints>0);assert.strictEqual(result.hiddenPaints,0);assert(result.resumedPaints>0);assert(result.hits>0);assert.strictEqual(result.hiddenScreenPaints,0);
  console.log('PASS: hidden cached grids skip painting and restore drawing and card targets when visible.');
 }catch(e){console.error(e);process.exitCode=1}finally{win.destroy();app.exit(process.exitCode||0)}
});
