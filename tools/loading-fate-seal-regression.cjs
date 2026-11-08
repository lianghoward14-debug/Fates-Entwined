const {app,BrowserWindow}=require('electron');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const assert=require('assert/strict');

const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'.tmp','loading-fate-seal-regression'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=image=>crypto.createHash('sha256').update(image.toPNG()).digest('hex');

app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1200,height:675,webPreferences:{backgroundThrottling:false}});
  try{
    const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const start=index.indexOf('<div id="fate-loading-screen"');
    const end=index.indexOf('<script>',start);
    const markup=index.slice(start,end);
    await win.loadURL('data:text/html,'+encodeURIComponent(`<body>${markup}</body>`));
    await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles/99-ui-final.css'),'utf8'));
    await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles/loading-fate-dial.css'),'utf8'));
    const details=await win.webContents.executeJavaScript(`(()=>{
      const panel=document.querySelector('.fate-loading-panel');
      panel.style.setProperty('--fate-dial-progress','62%');
      panel.querySelector('.fate-loading-percent').textContent='62%';
      const seal=document.querySelector('.fate-loading-seal');
      const progressStyle=getComputedStyle(seal,'::before');
      return {marks:seal.children.length,clip:getComputedStyle(panel).clipPath,sealAnimation:getComputedStyle(seal).animationName,markAnimation:getComputedStyle(seal.firstElementChild).animationName,progress:progressStyle.backgroundImage,progressBox:[progressStyle.width,progressStyle.height,progressStyle.inset],sealBox:[getComputedStyle(seal).width,getComputedStyle(seal).height]};
    })()`);
    assert.equal(details.marks,12);
    assert.notEqual(details.clip,'none');
    assert.equal(details.sealAnimation,'fateSealTurn');
    assert.equal(details.markAnimation,'fateSealMark');
    assert.match(details.progress,/62%/);
    console.log(details);
    await pause(120);
    const first=await win.webContents.capturePage();
    await pause(720);
    const second=await win.webContents.capturePage();
    assert.notEqual(hash(first),hash(second),'seal should visibly animate');
    fs.writeFileSync(path.join(root,'outputs','loading-wheel-variants','selected-fate-seal.png'),second.toPNG());
    console.log('PASS: Twelve-Point Fate Seal renders 12 animated marks and follows real progress in Electron.');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{win.destroy();app.exit(process.exitCode||0);}
});
