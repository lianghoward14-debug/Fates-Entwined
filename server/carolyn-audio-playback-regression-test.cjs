const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const audio=fs.readFileSync('src/scripts/08-audio-and-meta-ui.js','utf8'),helpers=fs.readFileSync('src/scripts/00-structural-helpers.js','utf8');
(async()=>{for(const mode of ['success','rejected','throws','error']){
 let starts=0;const param={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
 const ctx={state:'running',currentTime:0,destination:{},createGain:()=>({gain:{...param},connect(){}}),createOscillator:()=>({frequency:{...param},connect(){},start(){starts++},stop(){}})};
 class Audio {cloneNode(){return this}play(){if(mode==='throws')throw Error('blocked');if(mode==='rejected')return Promise.reject(Error('blocked'));if(mode==='error')this.onerror();return Promise.resolve();}}
 const c={Audio,window:{},_masterVol:1,_sfxVol:0.8,_fateSampleAudioCache:new Map(),FATE_SAMPLE_SFX:{carolynBlock:{src:'sample',fallbackTone:'carolyn'}},getAudioCtx:()=>ctx};vm.createContext(c);
 vm.runInContext(helpers.slice(helpers.indexOf('function playCarolynLockTone()'),helpers.indexOf('function showWineCountryGuerillaSentBanner')),c);
 vm.runInContext(audio.slice(audio.indexOf('function playFateSampleSfx('),audio.indexOf('function warmFateSampleSfx(')),c);
 c.playFateSampleSfx('carolynBlock',false,0.8);await Promise.resolve();assert.equal(starts,mode==='success'?0:3,mode);
 }
 assert(audio.includes("gain:0.9, fallbackTone:'carolyn'"));
 console.log('Carolyn sample success and rejected/throwing/error playback: fallback oscillators verified.');
})().catch(e=>{console.error(e);process.exitCode=1});
