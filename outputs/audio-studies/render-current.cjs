const {chromium}=require('playwright');
const fs=require('fs');
const path=require('path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../../src/scripts/render-v2/19-approved-activation-sfx.js'),'utf8')});
  for(const [id,name] of [['bh04','selva-current-motion'],['77','heyward-current-motion']]){
   const channels=await page.evaluate(async id=>{
    const ctx=new OfflineAudioContext(2,32000*2.2,32000);
    window.FateApprovedActivationSfx.schedule(ctx,ctx.destination,id,1);
    const b=await ctx.startRendering();
    return [Array.from(b.getChannelData(0)),Array.from(b.getChannelData(1))];
   },id);
   const frames=channels[0].length, b=Buffer.alloc(44+frames*4);
   b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(32000,24);b.writeUInt32LE(128000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*4,40);
   let peak=0,power=0;
   for(let i=0;i<frames;i++)for(let c=0;c<2;c++){
    const v=channels[c][i];if(!Number.isFinite(v)||Math.abs(v)>1)throw Error('Invalid or clipped output');
    peak=Math.max(peak,Math.abs(v));power+=v*v;b.writeInt16LE(Math.round(v*32767),44+i*4+c*2);
   }
   if(peak===0)throw Error('Silent output');
   fs.writeFileSync(path.join(__dirname,name+'.wav'),b);
   console.log(name,JSON.stringify({peak,rms:Math.sqrt(power/(frames*2)),seconds:frames/32000}));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
