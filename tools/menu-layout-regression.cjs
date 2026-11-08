const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join(root,'.tmp/menu-layout-test-profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1600,height:900,webPreferences:{backgroundThrottling:false}});
 try{
  const src=fs.readFileSync(path.join(root,'src/scripts/09-challenger-mode.js'),'utf8');
  const a=src.indexOf('function setChTabPaneVisibility('),b=src.indexOf('\nfunction restoreChTabScroll(',a);
  const html='<html><body><div id="s-challenger"><div id="ch-content"><div class="ch-tab-pane active" data-tab="play">Play</div><div class="ch-tab-pane ch-cdb-content" data-tab="deckbuilder">Deck</div></div></div></body></html>';
  await win.loadURL('data:text/html,'+encodeURIComponent(html));
  await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles/zz-codex-last.css'),'utf8'));
  await win.webContents.executeJavaScript(src.slice(a,b));
  const results=await win.webContents.executeJavaScript(`(async()=>{
   const content=document.getElementById('ch-content'),play=content.children[0],deck=content.children[1];
   setChTabPaneVisibility(content,deck);setChTabPaneVisibility(content,play);
   const hiddenDeck={display:getComputedStyle(deck).display,rects:deck.getClientRects().length,hidden:deck.hidden};
   let mutations=0;const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(content,{subtree:true,attributes:true});
   setChTabPaneVisibility(content,play);setChTabPaneVisibility(content,play);await Promise.resolve();observer.disconnect();
   setChTabPaneVisibility(content,deck);
   return {hiddenDeck,repeatedVisibilityMutations:mutations,restoredDeckDisplay:getComputedStyle(deck).display,hiddenPlayRects:play.getClientRects().length};
  })()`);
  console.log(JSON.stringify(results));
  if(results.hiddenDeck.display!=='none'||results.hiddenDeck.rects!==0||results.repeatedVisibilityMutations!==0||results.restoredDeckDisplay!=='flex'||results.hiddenPlayRects!==0)throw Error('layout regression');
  console.log('PASS: inactive deck builder leaves layout, cached pane restores flex layout, repeated visibility calls cause zero mutations.');
 }catch(e){console.error(e);process.exitCode=1;}finally{win.destroy();app.exit(process.exitCode||0);}
});

