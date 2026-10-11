const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CARIBBEA_PLAYWRIGHT || 'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage();await page.goto('about:blank');
for(const file of ['19-approved-activation-art.js','19-approved-activation-sfx.js','19-signature-activation-fx.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'src/scripts/render-v2',file),'utf8')});
const results=await page.evaluate(async()=>{
const results=[];for(const id of ['21']){
 if(!FateApprovedActivationArt.handles(id)||FateSignatureActivationFx.durationFor({id})!==2000)throw Error('Missing route '+id);
 const canvas=document.createElement('canvas');canvas.width=700;canvas.height=430;const ctx=canvas.getContext('2d');
 for(let i=0;i<=120;i++)FateApprovedActivationArt.draw(ctx,id,i/120);
 FateApprovedActivationArt.draw(ctx,id,.55);if(!ctx.getImageData(0,0,700,430).data.some((x,i)=>i%4===3&&x))throw Error('Blank '+id);
 const ac=new OfflineAudioContext(1,105600,48000);FateApprovedActivationSfx.schedule(ac,ac.destination,id,1);const data=(await ac.startRendering()).getChannelData(0);
 let peak=0,power=0,tail=0;for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i]))throw Error('Nonfinite audio');peak=Math.max(peak,Math.abs(data[i]));power+=data[i]**2;if(i>=96000)tail=Math.max(tail,Math.abs(data[i]));}
 if(peak>=1||power===0||tail!==0)throw Error('Bad audio '+id+' '+peak+' '+tail);
 const cancel=new OfflineAudioContext(1,96000,48000);FateApprovedActivationSfx.schedule(cancel,cancel.destination,id,1).stop();if((await cancel.startRendering()).getChannelData(0).some(x=>x!==0))throw Error('Cancel failure');
 const muted=new OfflineAudioContext(1,96000,48000);if(FateApprovedActivationSfx.schedule(muted,muted.destination,id,0)!==null)throw Error('Mute failure');
 results.push({id,peak,rms:Math.sqrt(power/data.length),image:canvas.toDataURL(),samples:Array.from(data.slice(0,96000))});
}
return results;});
const out=path.join(root,'artifacts/henry-forged');fs.mkdirSync(out,{recursive:true});
for(const r of results){fs.writeFileSync(path.join(out,r.id+'.png'),Buffer.from(r.image.split(',')[1],'base64'));const pcm=Buffer.alloc(44+r.samples.length*2);pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(48000,24);pcm.writeUInt32LE(96000,28);pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(r.samples.length*2,40);r.samples.forEach((x,i)=>pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));fs.writeFileSync(path.join(out,r.id+'.wav'),pcm);console.log(JSON.stringify({id:r.id,peak:r.peak,rms:r.rms}));}
assert.equal(await page.evaluate(()=>FateApprovedActivationSfx.handles('jose-clock')),true);
// Exercise the real route, including one banner and silent opt-out.
const route=await page.evaluate(()=>{let banners=0;window.FateActivationBanner={play(){banners++}};const results=[FateSignatureActivationFx.playPlacement({id:'104',type:'Improvisor'},{sfx:false}),FateSignatureActivationFx.playPlacement({id:'105',type:'Improvisor'},{sfx:false}),FateSignatureActivationFx.playCoordinator({id:'106',type:'Coordinator'},{sfx:false})];return{results,banners,hidden:FateSignatureActivationFx.playPlacement({id:'104',type:'Improvisor',faceDown:true},{sfx:false})};});assert.deepEqual(route,{results:[true,true,true],banners:3,hidden:false});
console.log('PASS: selected art renders; Henry soundtrack finite, unclipped, silent after two seconds; mute/cancel and production routes pass.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
