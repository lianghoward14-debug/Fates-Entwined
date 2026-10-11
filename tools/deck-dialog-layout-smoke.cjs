const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.tmp','dialog-layout');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile-'+Date.now()));
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const styles=[...index.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(match=>match[0]).join('\n');
fs.writeFileSync(path.join(out,'fixture.html'),`<!doctype html><html><head><base href="${pathToFileURL(root+'/').href}">${styles}</head><body><div class="overlay on" id="modal"><div class="modal"><div class="modal-title" id="modal-title"></div><div class="modal-body" id="modal-body"></div><div class="modal-acts" id="modal-acts"></div></div></div></body></html>`);
const source=fs.readFileSync(path.join(root,'src/scripts/06-rendering-and-helpers.js'),'utf8');
const gallery=source.slice(source.indexOf('function showCanvasCardGalleryModal('),source.indexOf('\nfunction renderOppHand(',source.indexOf('function showCanvasCardGalleryModal(')));
const confirm=source.slice(source.indexOf('function confirmCardDiscard('),source.indexOf('\nwindow.confirmCardDiscard'));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
  try{
    await win.loadFile(path.join(out,'fixture.html'));
    await win.webContents.executeJavaScript(`
      function closeModal(){};
      function showModal(title,body,actions){document.querySelector('#modal .modal').className='modal';document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=body;document.getElementById('modal-acts').innerHTML='';actions.forEach(a=>{const b=document.createElement('button');b.className='btn sm'+(a.danger?' danger':'');b.textContent=a.label;b.onclick=a.action;document.getElementById('modal-acts').append(b);});}
      function escapePlacementAnimHtml(s){return s;} function getPerspectivePlayerIndex(){return 0;}
      function getCardVisualData(card){return card;} function showHoverPreview(){} function positionHoverPreview(){} function removeHoverPreview(){}
      ${confirm}\n${gallery}
      confirmCardDiscard({name:'Kazumi'},()=>{});
    `);
    await win.webContents.capturePage(); await new Promise(r=>setTimeout(r,250));
    fs.writeFileSync(path.join(out,'discard.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`showCanvasCardGalleryModal('Remaining Cards · 12',Array.from({length:12},(_,i)=>({id:String(i),name:'Card '+i,img:['05.png','27.png','32.png'][i%3]})),{immediate:true});document.querySelector('#modal .modal').classList.add('remaining-deck-modal');document.getElementById('modal-acts').insertAdjacentHTML('afterbegin','<button class="btn sm">Back to Deck</button>');`);
    for(const [width,height] of [[1280,900],[540,620]]){
      win.setSize(width,height);await win.webContents.capturePage();await new Promise(r=>setTimeout(r,400));
      const report=await win.webContents.executeJavaScript(`(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect(),m=document.querySelector('#modal .modal').getBoundingClientRect(),a=document.getElementById('modal-acts').getBoundingClientRect();return {ratio:r.width/r.height,intrinsic:c.width/c.height,bottom:m.bottom,actionsBottom:a.bottom,viewport:innerHeight};})()`);
      if(Math.abs(report.ratio-report.intrinsic)>.01 || report.bottom>report.viewport || report.actionsBottom>report.viewport) throw Error(JSON.stringify(report));
      fs.writeFileSync(path.join(out,'deck-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
      console.log(JSON.stringify({width,...report}));
    }

    const {SUPPORT_COMPANY_CATEGORIES}=await import('../shared/support-company.mjs');
    const support=fs.readFileSync(path.join(root,'src/scripts/support-company.mjs'),'utf8');
    const icons=support.slice(support.indexOf('const categoryPaths='),support.indexOf('let busy'));
    const categoryWindow=support.slice(support.indexOf('window.showSupportCompanyCategoryWindow = function'),support.indexOf('\nwindow.openSupportCompany = function'));
    await win.webContents.executeJavaScript('const SUPPORT_COMPANY_CATEGORIES='+JSON.stringify(SUPPORT_COMPANY_CATEGORIES)+';const SUPPORT_COMPANY_NAMES={call:"Call to Arms",desperate:"Desperate Reinforcement"};const escape=s=>String(s);'+icons+categoryWindow+';window.showSupportCompanyCategoryWindow({ability:"desperate",cost:100,onSelect:()=>{}});');
    for(const [width,height] of [[1920,1080],[1280,720],[540,620]]){
      win.setSize(width,height);await win.webContents.capturePage();await new Promise(r=>setTimeout(r,350));
      const report=await win.webContents.executeJavaScript('(()=>{const m=document.querySelector("#modal .modal"),body=document.getElementById("modal-body"),w=document.querySelector(".sc-category-window"),items=[...document.querySelectorAll(".sc-category")],last=items.at(-1).getBoundingClientRect(),acts=document.getElementById("modal-acts").getBoundingClientRect();return {items:items.length,icons:document.querySelectorAll(".sc-category-icon svg").length,scroll:Math.max(m.scrollHeight-m.clientHeight,body.scrollHeight-body.clientHeight,w.scrollHeight-w.clientHeight),lastBottom:last.bottom,footerTop:acts.top,bottom:acts.bottom,viewport:innerHeight};})()');
      fs.writeFileSync(path.join(out,'call-to-arms-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
      console.log(JSON.stringify({width,...report}));
      if(report.scroll>2||report.lastBottom>report.footerTop||report.bottom>report.viewport||report.icons!==11)throw Error(JSON.stringify(report));
    }
  }catch(e){console.error(e.stack);process.exitCode=1;}finally{app.exit(process.exitCode||0);}
});

