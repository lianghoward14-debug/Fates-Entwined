const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const src=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
const start=src.indexOf('  const militaryBlockadeSoundSeen'),end=src.indexOf('  function drawMilitaryBlockadeChains',start),calls=[];
const ctx={window:{playCardEffectFlashSfx:(kind)=>calls.push(kind)}};vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
for(const active of [false,true,true,false,false,true])ctx.presentMilitaryBlockadeTransition({iid:'test',_setTurn:1},active);
assert.deepEqual(calls,['military_blockade','military_blockade_release','military_blockade']);
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage();await page.addScriptTag({content:fs.readFileSync('src/scripts/render-v2/19-approved-activation-sfx.js','utf8')});
for(const id of ['military-blockade','military-blockade-release']){
 const result=await page.evaluate(async id=>{const ac=new OfflineAudioContext(1,48000,48000);FateApprovedActivationSfx.schedule(ac,ac.destination,id,1);const data=(await ac.startRendering()).getChannelData(0);return {peak:data.reduce((a,x)=>Math.max(a,Math.abs(x)),0),finite:data.every(Number.isFinite),tail:data.slice(40000).every(x=>x===0),data:Array.from(data)};},id);
 assert(result.finite&&result.peak>0&&result.peak<1&&result.tail);
 const b=Buffer.alloc(44+result.data.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(result.data.length*2,40);result.data.forEach((x,i)=>b.writeInt16LE(Math.round(x*32767),44+i*2));fs.writeFileSync('artifacts/caribbea-game-style/'+id+'.wav',b);
 console.log(id,result.peak);
}
console.log('PASS: appear/release/reappear, no repeat on rerender, finite unclipped audio and silent tails.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
let html=fs.readFileSync('index.html','utf8');for(const name of ['04-match-renderer-adapter.js','19-approved-activation-sfx.js','08-audio-and-meta-ui.js'])html=html.replace(new RegExp('('+name.replaceAll('.','\\.')+'\\?v=)[^"\\s]+','g'),'$120261014-chain-appear-release');fs.writeFileSync('index.html',html);
