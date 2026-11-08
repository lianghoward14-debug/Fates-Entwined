const {app,BrowserWindow}=require('electron');
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');

const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'.tmp','call-to-arms-dossier-regression'));

app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{backgroundThrottling:false}});
  try{
    await win.loadURL('data:text/html,'+encodeURIComponent('<div id="modal"><div class="modal"><h2 id="modal-title"></h2><div id="modal-body"></div><div id="modal-acts"></div></div></div>'));
    await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles/support-company.css'),'utf8'));
    let source=fs.readFileSync(path.join(root,'src/scripts/support-company.mjs'),'utf8');
    source=source.replace(/^import .*;\r?\n/gm,'');
    const result=await win.webContents.executeJavaScript(`(()=>{
      window.callToArmsReserveValue=window.recruitmentDeckFit=window.assessRecruitment=()=>0;
      window.SUPPORT_COMPANY_NAMES={call:'Call to Arms',desperate:'Desperate Measures'};
      window.SUPPORT_COMPANY_CATEGORIES=[{id:'deploy',name:'Deploy',description:'Gain Reinforcement and deployment options.',cardIds:['1']}];
      window.supportCompanyCardEligible=()=>true;
      window.supportCompanyAvailability=()=>({call:true,desperate:true,cost:20});
      window.createSupportCompanyPool=()=>({});window.supportCompanyOffers=()=>[];
      window.pickRoyalSeal=()=>{};window.playSupportCompanyAnimation=()=>{};
      window.CARDS=[{id:'1',name:'Test Recruit',type:'Supporter',fate:1,img:'1.png'}];
      window.G={currentPlayer:0,phase:'main',players:[{}]};
      window.isPerspectivePlayer=()=>true;
      window.__sounds=[];window.playSfx=type=>window.__sounds.push(type);
      window.showModal=(title,body)=>{document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=body;};
      window.closeModal=()=>{};
      ${source}
      showSupportCompanyCategoryWindow({categories:SUPPORT_COMPANY_CATEGORIES,onSelect:()=>{},cancellable:false});
      const category=document.querySelector('.sc-category');
      category.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
      const modal=document.getElementById('modal'),overlay=document.querySelector('.sc-roster-overlay');
      const before={
        sourceHidden:modal.classList.contains('sc-roster-source-hidden'),
        sourceInert:modal.inert,
        overlay:!!overlay,
        footer:!!document.querySelector('.sc-roster-footer'),
        footerCopy:document.body.textContent.includes('These are the possible recruits'),
        sound:window.__sounds.at(-1),
        cornerBorder:getComputedStyle(document.querySelector('.sc-roster-dossier'),'::before').borderTopStyle,
        cornerClip:getComputedStyle(document.querySelector('.sc-roster-dossier'),'::before').clipPath
      };
      document.querySelector('.sc-roster-close').click();
      return {before,after:{sourceHidden:modal.classList.contains('sc-roster-source-hidden'),sourceInert:modal.inert,overlay:!!document.querySelector('.sc-roster-overlay'),category:!!document.querySelector('.sc-category-window')}};
    })()`);
    assert.deepEqual(result.before.sourceHidden,true);
    assert.deepEqual(result.before.sourceInert,true);
    assert.deepEqual(result.before.overlay,true);
    assert.deepEqual(result.before.footer,false);
    assert.deepEqual(result.before.footerCopy,false);
    assert.equal(result.before.sound,'dossierOpen');
    assert.equal(result.before.cornerBorder,'solid');
    assert.notEqual(result.before.cornerClip,'none');
    assert.deepEqual(result.after,{sourceHidden:false,sourceInert:false,overlay:false,category:true});
    console.log('PASS: dossier replaces categories, has its own sound and corner frame, removes footer copy, and X returns to categories.');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{win.destroy();app.exit(process.exitCode||0);}
});
