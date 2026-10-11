const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/scripts/47-idle-chatter.js'), 'utf8');
function harness(){
  let now = 0, tick, busy = false, volume = 1, panel;
  const handlers = {}, audios = [], classes = new Set();
  const g = {board:[[[{id:'02', owner:0}]]], phase:'main', turn:1, currentPlayer:0};
  class Audio {
    constructor(src){this.src=src;this.events={};this.duration=20;this.currentTime=0;audios.push(this);}
    addEventListener(name, fn){(this.events[name] ||= []).push(fn);}
    emit(name){for(const fn of this.events[name] || []) fn();}
    play(){this.emit('playing');return Promise.resolve();}
    pause(){this.paused=true;this.emit('pause');}
    removeAttribute(){}
    load(){}
  }
  const document = {hidden:false, body:{classList:{contains:n=>classes.has(n)}, appendChild(){}},
    getElementById:()=>({classList:{contains:n=>n==='active'}}), querySelector:()=>null,
    createElement:()=>{const nodes={p:{textContent:''},img:{src:''},'.chatter-name':{textContent:''}};panel={hidden:true,style:{},setAttribute(){},querySelector:s=>nodes[s]};return panel;},
    addEventListener:(name, fn)=>{handlers[name]=fn;}};
  const window = {getFateGameState:()=>g, FateActionPresentation:{isActive:()=>busy}, addEventListener(){}};
  vm.runInNewContext(source, {window,document,Audio,Date:{now:()=>now},Math,getPerspectivePlayerIndex:()=>0,
    fateAudioReport:()=>({voiceVolume:volume,masterVolume:1}),setInterval:fn=>{tick=fn;}});
  return {g,window,document,audios,classes,get panel(){return panel;},
    advance(ms){for(let end=now+ms;now<end;){now+=250;tick();}},
    busy(v){busy=v;},volume(v){volume=v;},input(){handlers.pointerdown();}};
}
const h=harness();
h.advance(14750);assert.equal(h.audios.length,0);
h.advance(250);assert.equal(h.audios.length,1);assert.equal(h.panel.hidden,false);
h.busy(true);h.input();h.advance(750);assert.notEqual(h.audios[0].paused,true);assert.equal(h.panel.hidden,false);
assert.equal(h.window.FateIdleChatter.report().used,0,'starting a line does not consume it');
h.busy(false);h.audios[0].emit('ended');h.advance(15000);assert.equal(h.audios.length,2);
h.audios[1].emit('ended');h.advance(14750);assert.equal(h.audios.length,2,'next chatter waits the full 15 seconds');h.advance(250);assert.equal(h.audios.length,3);
for(let i=0;i<2;i++){h.audios.at(-1).emit('ended');h.advance(15000);}
assert.equal(h.audios.length,5);assert.equal(new Set(h.audios.map(a=>a.src)).size,5);
h.audios.at(-1).emit('ended');
h.g.board=[];h.advance(1000);h.g.board=[[[{id:'02',owner:0}]]];h.advance(180000);
assert.equal(h.audios.length,5,'exhausted chatter stays silent after re-entry');
assert.equal(h.window.FateIdleChatter.report().remaining,0);
h.window.FateIdleChatter.reset();h.advance(16000);assert.equal(h.audios.length,6);
h.g.currentPlayer=1;h.advance(250);assert.notEqual(h.audios[5].paused,true,'turn changes do not interrupt chatter');
const quiet=harness();quiet.busy(true);quiet.advance(30000);assert.equal(quiet.audios.length,0);
quiet.busy(false);quiet.advance(7750);assert.equal(quiet.audios.length,0);quiet.advance(250);assert.equal(quiet.audios.length,1);
const absent=harness();absent.g.board[0][0][0].owner=1;absent.advance(40000);assert.equal(absent.audios.length,0);
absent.g.board[0][0][0].owner=0;absent.g.board[0][0][0].faceDown=true;absent.advance(20000);assert.equal(absent.audios.length,0);
const mute=harness();mute.volume(0);mute.advance(30000);assert.equal(mute.audios.length,0);
mute.volume(1);mute.advance(8000);assert.equal(mute.audios.length,1);mute.document.hidden=true;mute.advance(750);assert.equal(mute.panel.hidden,true);
const input=harness();input.advance(14000);input.input();input.advance(7750);assert.equal(input.audios.length,0);input.advance(250);assert.equal(input.audios.length,1);
const voice=harness();const setVoice={addEventListener(){}};
const release=voice.window.FateIdleChatter.trackVoice(setVoice);voice.advance(40000);assert.equal(voice.audios.length,0);release();voice.advance(8000);assert.equal(voice.audios.length,1);
const online=harness();let id='match-a';let presenting=true;
online.window.FatePhase7CurrentMultiplayerUi={report:()=>({active:true,matchId:id,presentationBusy:presenting})};
online.advance(30000);assert.equal(online.audios.length,0);presenting=false;online.advance(8000);assert.equal(online.audios.length,1);
id='match-b';online.advance(750);assert.equal(online.window.FateIdleChatter.report().used,0);assert.equal(online.panel.hidden,true);
const local=harness();local.g.board=[];local.classes.add('fate-authority-v3-single-player-active');
local.window.FateAuthorityV3SinglePlayer={currentScreen:()=>({view:{playerIndex:0,state:{matchId:'local',turn:1,activePlayer:0,board:[[[{id:'bh01',owner:0}]]]}}})};
local.advance(16000);assert.equal(local.audios.length,1,'local authority board is used');
const felicyta=harness();felicyta.g.board=[[[{id:'01',owner:0}]]];felicyta.advance(15000);
assert.match(felicyta.audios[0].src,/Felicyta[1-5]\.mp3$/);assert.equal(felicyta.panel.querySelector('img').src,'pfp/pfp1.png');assert.equal(felicyta.panel.querySelector('.chatter-name').textContent,'Felicyta Janowicz');
for(const character of ['Anicka','Felicyta'])for(let i=1;i<=5;i++)assert.ok(fs.statSync(path.join(__dirname,`../assets/audio/chatter/${character}${i}.mp3`)).size>0);
// Each supported consolidation signal cancels without consuming the line; stale
// completion events from canceled audio must not consume a later retry either.
for(const signal of ['legacy','online','cinematic']){
  const retry=harness();retry.advance(15000);
  const canceled=retry.audios[0];
  if(signal==='legacy') retry.g.consolidating=true;
  if(signal==='online') retry.window.FatePhase7CurrentMultiplayerUi={report:()=>({active:true,consolidationActive:true})};
  if(signal==='cinematic') retry.document.querySelector=s=>s.includes(':not(.effect-activation-cinematic)')?{}:null;
  retry.advance(750);
  assert.equal(canceled.paused,true,signal+' consolidation interrupts');
  assert.equal(retry.window.FateIdleChatter.report().used,0);
  assert.equal(retry.window.FateIdleChatter.report().remaining,5);
  retry.g.consolidating=false;retry.window.FatePhase7CurrentMultiplayerUi=undefined;retry.document.querySelector=()=>null;
  retry.advance(15000);canceled.emit('ended');
  assert.equal(retry.window.FateIdleChatter.report().used,0,'stale completion ignored');
  for(let i=0;i<5;i++){retry.audios.at(-1).emit('ended');retry.advance(15000);}
  assert.equal(retry.window.FateIdleChatter.report().used,5);
  assert.ok(retry.audios.slice(1).some(a=>a.src===canceled.src),'canceled line can play again');
}
const ongoing=harness();ongoing.advance(15000);
ongoing.window.FateIdleChatter.trackVoice({addEventListener(){}});
ongoing.g.placing=true;ongoing.g.pendingEffect={};ongoing.g.board=[];
ongoing.document.querySelector=s=>s.includes('#modal.on')?{}:null;
ongoing.advance(1000);
assert.notEqual(ongoing.audios[0].paused,true,'placement, prompts, effects, other voices and card removal preserve chatter');
console.log('PASS idle chatter: cadence, start gates, board-action persistence, consolidation cancellation and retry, completion-only exhaustion, character eligibility and lifecycle cleanup.');
