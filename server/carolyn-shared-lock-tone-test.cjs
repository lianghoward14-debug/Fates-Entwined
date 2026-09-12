const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const h=fs.readFileSync('src/scripts/00-structural-helpers.js','utf8'),o=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
for(const mode of ['singleplayer','multiplayer']){
 let starts=0,samples=0;const frequencies=[];const param={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
 const ctx={state:'running',currentTime:0,destination:{},createGain:()=>({gain:{...param},connect(){}}),createOscillator:()=>({frequency:{...param,setValueAtTime(f){frequencies.push(f)}},connect(){},start(){starts++},stop(){}})};
 const c={window:{},_masterVol:1,_sfxVol:0.8,getAudioCtx:()=>ctx,playSfx:()=>{samples++}};vm.createContext(c);
 vm.runInContext(h.slice(h.indexOf('let _lastCarolynLockSfxAt'),h.indexOf('function showWineCountryGuerillaSentBanner')),c);
 c.window.playCarolynLockSfx=c.playCarolynLockSfx;
 if(mode==='singleplayer')c.playCarolynLockSfx('local:0:1:0');
 else{vm.runInContext(o.slice(o.indexOf('  function phase7PresentNewCarolynSquares('),o.indexOf('  function phase7CommitCurrentView(')),c);c.phase7PresentNewCarolynSquares({blockedCells:[]},{blockedCells:[{type:'carolyn',z:0,r:1,c:0}]});}
 assert.equal(starts,3,mode);assert.deepEqual(frequencies,[880,440,110]);assert.equal(samples,0);
 c.playCarolynLockSfx(mode==='singleplayer'?'local:0:1:0':'carolyn-square:0:1:0');assert.equal(starts,3,'duplicate silent');
 c._sfxVol=0;assert.equal(c.playCarolynLockTone(),false);assert.equal(starts,3,'mute honored');
}
console.log('Both modes generate new lock tone directly; no sample dependency; deduplication and mute pass.');
