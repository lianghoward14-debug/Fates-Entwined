const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
async function main(){
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'src/scripts/render-v2/19-approved-activation-sfx.js'),'utf8')});
    const results=await page.evaluate(async()=>{
      const api=window.FateApprovedActivationSfx,results=[];
      for(const id of api.ids){
        const ac=new OfflineAudioContext(1,48000*2.2,48000);
        api.schedule(ac,ac.destination,id,1);
        const data=(await ac.startRendering()).getChannelData(0);
        let peak=0,power=0,tail=0,finite=true;
        for(let i=0;i<data.length;i++){finite=finite&&Number.isFinite(data[i]);peak=Math.max(peak,Math.abs(data[i]));power+=data[i]*data[i];if(i>=96000)tail=Math.max(tail,Math.abs(data[i]));}
        results.push({id,peak,rms:Math.sqrt(power/data.length),tail,finite});
      }
      const muted=new OfflineAudioContext(1,48000,48000);
      if(api.schedule(muted,muted.destination,'07',0)!==null)throw Error('zero volume schedules audio');
      const cancelled=new OfflineAudioContext(1,48000,48000),handle=api.schedule(cancelled,cancelled.destination,'61',1);
      handle.stop();handle.stop();
      if((await cancelled.startRendering()).getChannelData(0).some(x=>x!==0))throw Error('cancelled sound remains audible');
      let opens=0;window._masterVol=0;window._sfxVol=1;window.getAudioCtx=()=>{opens++;throw Error('muted context opened');};window.getSfxBus=()=>({});
      api.play('07');window._masterVol=1;window._sfxVol=0;api.play('07');if(opens)throw Error('mute ignored');
      return results;
    });
    const expected=['15','34',"55","85","36","bh02","bh08","57","12","23",'41','89','35','88','11','46','10','19','bh12','01','bh07','bh11','45','02','86','bh04','03','04','06','17','22','27','40','48','bh20','bh19','bh01','14','bh09','66','87','67','bh21','38','bh22','56','bh05','bh13','07','08','13','21','29','30','39','43','51','61','81','82','83','84','90','99','bh06','bh10','bh14','bh16'];
    assert.deepEqual(results.map(x=>x.id).sort(),expected.sort(),'Only implemented new animations get cues');
    for(const r of results){assert.ok(r.finite,r.id+' finite samples');assert.ok(r.rms>.018,r.id+' clearly audible energy');assert.ok(r.peak<1,r.id+' unclipped raw mix: '+r.peak);assert.equal(r.tail,0,r.id+' score ends by 2 seconds');}
    console.table(results.map(r=>({id:r.id,peak:r.peak.toFixed(3),rms:r.rms.toFixed(3)})));
    console.log('PASS: 68 layered scores render audible, unclipped audio, end within two seconds, respect mute and cancel cleanly.');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
