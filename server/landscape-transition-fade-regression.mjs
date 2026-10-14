import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('src/scripts/08-audio-and-meta-ui.js', 'utf8');
function fn(name){ const a=source.indexOf(`function ${name}(`); return source.slice(a,source.indexOf('\n}',a)+2); }
let now=0, next=0;
const timers=new Map(), images=[], frames=[];
function advance(ms){const end=now+ms; while(true){let entry=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;const [id,t]=entry;now=t.at;if(t.repeat)t.at+=t.repeat;else timers.delete(id);t.fn();}now=end;}
function element(){return {dataset:{},style:{setProperty(k,v){this[k]=v;}},children:[],classList:{contains(){return false;}},appendChild(el){el.parentNode=this;this.children.push(el);},querySelectorAll(){return this.children.filter(x=>x.className==='igb17-bg-fade-layer');},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}};}
const game=element(),coin=element(),board=element(), tracks=[];
const c=vm.createContext({console,Math,Date:{now:()=>now}, window:{},G:{landscapeId:'igb1'},GAME_SONGS:Array.from({length:24},(_,i)=>`board${i+1}`),LANDSCAPES:{},
 document:{getElementById:id=>({'s-game':game,'s-coin':coin,board}[id]),createElement:element},getComputedStyle:()=>({position:'relative'}),
 Image:class{constructor(){images.push(this);}}, requestAnimationFrame:f=>frames.push(f),
 setTimeout:(fn,ms)=>{timers.set(++next,{fn,at:now+ms});return next;},clearTimeout:id=>timers.delete(id),
 setInterval:(fn,ms)=>{timers.set(++next,{fn,at:now+ms,repeat:ms});return next;},clearInterval:id=>timers.delete(id),
 getGameLandscapeBackgroundPath:n=>`bg${n}.jpg`,getIgb17RotationIndex:()=>0,getLandscapeClockNow:()=>now,
 initLandscapeForSong:()=>{},getGameAudioSong:s=>s,SET_VOICELINE_PATH:s=>s,isBadMusicSource:()=>false,
 Audio:class{constructor(src){this.src=src;this.volume=1;this.paused=true;tracks.push(this);}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}}
});
vm.runInContext(`let _igb17FadeLayerSeq=0,_igb17RotationTimer=null,_igb17LastRotationIndex=-1;
let _gameMusic=null,_bgMusic=null,_musicRunId=0,_musicEnabled=true,_currentScreen='s-game',_musicVol=.6,_masterVol=1,_lastGameSong=null,_gameMusicLoopTimeout=null,_gameMusicFadeInterval=null;
const _outgoingLandscapeMusic=new Map();
${['igb17BackgroundImageCss','applyLandscapeBackgroundToScreen','prepareIgb17FadeTarget','crossfadeIgb17ScreenBackground','applyIgb17RotatingBackground','scheduleIgb17BackgroundRotation','applyGameBackground','transitionGameLandscape','clearGameMusicLoopState','fadeOutGameMusic','fadeInGameMusic','playGameMusic'].map(fn).join('\n')}`,c);
function load(){while(images.length)images.shift().onload();while(frames.length)frames.shift()();}
c.applyGameBackground('board1');
for(const n of [...Array.from({length:23},(_,i)=>i+2),1]){
 const previous=game.style.backgroundImage;
 c.transitionGameLandscape(`board${n}`,{remote:true});
 assert.equal(game.style.backgroundImage,previous,'old background retained until fade completes');
 assert.equal(game.children.length,1,`board${n} has fade layer`);
 assert.match(game.children[0].style.cssText,/opacity 1400ms ease-in-out/);
 c.applyGameBackground(`board${n}`);assert.equal(game.children.length,1,'repeat snapshots do not interrupt fade');
 load();await Promise.resolve();const audio=tracks.at(-1);assert.equal(audio.volume,0);
 advance(750);assert(audio.volume>0&&audio.volume<.6);assert.equal(game.style.backgroundImage,previous);
 advance(1100);assert.match(game.style.backgroundImage,new RegExp(`bg${n}\\.jpg`));assert.equal(game.children.length,0);assert.equal(coin.children.length,0);
 assert.equal(audio.volume,.6);if(tracks.length>1){assert.equal(tracks.at(-2).volume,0);assert(tracks.at(-2).paused);}
}
c.transitionGameLandscape('board3',{remote:true});load();await Promise.resolve();advance(300);
c.transitionGameLandscape('board4',{remote:true});load();await Promise.resolve();advance(300);
c.transitionGameLandscape('board5',{remote:true});load();await Promise.resolve();advance(2000);
assert.match(game.style.backgroundImage,/bg5\.jpg/);assert.equal(game.children.length,0);
assert(tracks.slice(0,-1).every(a=>a.paused&&a.volume===0),'all outgoing music finishes fading');
// Late image loads must not overwrite the most recent choice.
c.transitionGameLandscape('board6',{remote:true});c.transitionGameLandscape('board7',{remote:true});images.reverse();load();await Promise.resolve();advance(2000);
assert.match(game.style.backgroundImage,/bg7\.jpg/);assert.equal(game.children.length,0);
console.log('PASS: all 24 backgrounds, repeated snapshots, image loading, rapid changes, and music fade envelopes.');
