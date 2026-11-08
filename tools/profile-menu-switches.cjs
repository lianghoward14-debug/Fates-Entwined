const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join(root,'.tmp/menu-profile-user'));
const port=24127;let server;
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1600,height:900,webPreferences:{backgroundThrottling:false,offscreen:true}});
 win.webContents.setFrameRate(60);
 // Keep this profiling session offline except for the local game assets.
 win.webContents.session.webRequest.onBeforeRequest((details,cb)=>cb({cancel:/^https?:/.test(details.url)&&!details.url.startsWith('http://127.0.0.1:'+port)}));
 server=spawn(process.execPath,[path.join(root,'tools/solo-static-server.js'),'--port',String(port)],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'ignore',windowsHide:true});
 try{
 await new Promise(r=>setTimeout(r,1200));await win.loadURL('http://127.0.0.1:'+port+'/index.html?electron=1').catch(e=>{if(e.code!=='ERR_ABORTED')throw e;});
 await new Promise(r=>setTimeout(r,6000));
 const report=await win.webContents.executeJavaScript(`(async()=>{
  if(typeof switchChTab!=='function')throw Error('menu code unavailable');
  showScreen('s-challenger');
  const rows=[];
  const tabs=['play','store','collection','deckbuilder','lore','play','store','collection','deckbuilder','lore'];
  for(const tab of tabs){
   await new Promise(r=>setTimeout(r,300));
   const start=performance.now();switchChTab(tab);const sync=performance.now()-start;
   const layoutStart=performance.now();document.getElementById('ch-content').getBoundingClientRect();const layout=performance.now()-layoutStart;
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const effects=[...document.querySelectorAll('#s-challenger *')].filter(n=>n.getClientRects().length).map(n=>{const c=getComputedStyle(n);return {node:n.tagName+'.'+n.className,filter:c.filter,backdrop:c.backdropFilter,animation:c.animationName};}).filter(e=>e.filter!=='none'||e.backdrop!=='none'||e.animation!=='none');
   rows.push({tab,effects,syncMs:Math.round(sync),layoutMs:Math.round(layout),twoFramesMs:Math.round(performance.now()-start),nodes:document.getElementById('ch-content').querySelectorAll('*').length});
  }
  return {rows,views:window.FateMenuViews?.report(),images:[...document.querySelectorAll('#s-challenger .screen-bg img')].map(i=>({src:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight}))};
 })()`);
 fs.mkdirSync(path.join(root,'diagnostics'),{recursive:true});fs.writeFileSync(path.join(root,'diagnostics/menu-switch-profile.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){console.error(e);process.exitCode=1;}finally{server?.kill();win.destroy();app.exit(process.exitCode||0);}
});
