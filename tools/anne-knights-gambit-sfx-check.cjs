const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage();await page.setContent('<div></div>');
 await page.addScriptTag({content:fs.readFileSync('src/scripts/render-v2/19-approved-activation-sfx.js','utf8')});
 const result=await page.evaluate(async()=>{
  if(!FateApprovedActivationSfx.handles('107'))throw Error('Missing sound registration');
  const rate=44100,ac=new OfflineAudioContext(1,rate*2,rate);
  const sound=FateApprovedActivationSfx.schedule(ac,ac.destination,'107',.8);
  if(!sound)throw Error('Sound not scheduled');
  const buffer=await ac.startRendering(),data=buffer.getChannelData(0);
  const rms=(a,b)=>Math.sqrt(data.slice(a*rate,b*rate).reduce((sum,x)=>sum+x*x,0)/((b-a)*rate));
  const peak=data.reduce((p,x)=>Math.max(p,Math.abs(x)),0);
  const levels={before:rms(0,.15),trace:rms(.17,.55),leap:rms(.65,1.3),landing:rms(1.4,1.55),tail:rms(1.94,2)};
  const bytes=new Uint8Array(data.length*2),view=new DataView(bytes.buffer);data.forEach((x,i)=>view.setInt16(i*2,Math.round(Math.max(-1,Math.min(1,x))*32767),true));
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  sound.stop();sound.stop();
  return {peak,levels,pcm:btoa(binary)};
 });
 assert(result.peak>0&&result.peak<1);assert.equal(result.levels.before,0);assert.equal(result.levels.tail,0);
 for(const beat of ['trace','leap','landing'])assert(result.levels[beat]>.001,beat);
 const pcm=Buffer.from(result.pcm,'base64'),header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(44100,24);header.writeUInt32LE(88200,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
 fs.writeFileSync('artifacts/anne-107/knights-gambit-sfx.wav',Buffer.concat([header,pcm]));
 console.log('PASS: trace, leap, landing, no clipping, silent boundaries, safe cleanup',JSON.stringify({peak:result.peak,levels:result.levels}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
