const {app,BrowserWindow}=require('electron');const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join(root,'.tmp/localization-game-profile'));
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});const watchdog=setTimeout(()=>{fs.writeFileSync(path.join(root,'.tmp/localization-game-timeout.txt'),'Game smoke exceeded 90 seconds');app.exit(1);},90000);win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,cb)=>cb({cancel:true}));const errors=[];win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});try{
 console.log('Loading isolated game');const loaded=new Promise(resolve=>win.webContents.once('dom-ready',resolve));win.loadFile(path.join(root,'index.html')).catch(e=>console.log(e.message));await loaded;console.log('DOM ready');await new Promise(r=>setTimeout(r,2500));
 const checks=await win.webContents.executeJavaScript(`(async()=>{
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 if(!window.FateI18n)throw Error('Localization did not load');FateI18n.setLanguage('ja');await pause(800);
 const result={report:FateI18n.report(),screens:[],cards:[],tutorial:[]};
 if(typeof CARDS!=='undefined')result.cards=CARDS.map(c=>({id:c.id,name:c.name,effect:c.effect,translated:FateI18n.t(c.effect)}));
 if(typeof TUTORIAL_STEPS!=='undefined')result.tutorial=TUTORIAL_STEPS;
 function snapshot(name){const texts=[];const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walk.nextNode()){const n=walk.currentNode,p=n.parentElement;if(!p||p.closest('script,style,[translate="no"],.ch-lore-article')||!p.getClientRects().length||getComputedStyle(p).visibility==='hidden')continue;const s=n.nodeValue.trim();if(/[a-z]{3}/i.test(s))texts.push(s);}result.screens.push({name,english:[...new Set(texts)]});}
 snapshot('title');
 if(typeof openFreePlayMenu==='function'){openFreePlayMenu();await pause(500);snapshot('free-play');if(typeof closeModal==='function')closeModal();}
 if(typeof showScreen==='function')showScreen('s-title');
 if(typeof showDeckBuilder==='function'){showDeckBuilder();await pause(1100);snapshot('deck-builder');}
 if(typeof showScreen==='function')showScreen('s-title');
 if(typeof showMissionControl==='function'){showMissionControl();await pause(500);snapshot('missions');if(typeof closeMissionControl==='function')closeMissionControl();}
 if(typeof showScreen==='function')showScreen('s-title');
 result.report=FateI18n.report();return result;
 })()`);
 fs.writeFileSync(path.join(root,'.tmp/localization-game-report.json'),JSON.stringify({checks,errors},null,2));
 await win.webContents.executeJavaScript(`showScreen('s-title');FateI18n.setLanguage('ja')`);await new Promise(r=>setTimeout(r,500));
 fs.writeFileSync(path.join(root,'.tmp/localization-title-ja.png'),(await win.webContents.capturePage()).toPNG());
 console.log(JSON.stringify({screens:checks.screens.map(s=>({name:s.name,untranslated:s.english.length,samples:s.english.slice(0,15)})),cardEffects:checks.cards.length,untranslatedEffects:checks.cards.filter(c=>c.effect&&c.effect===c.translated),errors:errors.slice(0,8)},null,2));
 }catch(e){console.error(e.stack);fs.writeFileSync(path.join(root,'.tmp/localization-game-error.txt'),e.stack);process.exitCode=1;}finally{clearTimeout(watchdog);app.quit();}});
