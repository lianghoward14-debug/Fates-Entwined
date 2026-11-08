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

for(const [id,file] of [["30","Santiago"],["34","Rozsi"],["35","Alexander"],["36","Marie"],["22","Isaac"],["38","Jake"],["39","Juan"],["40","Chris"],["41","Jimmy"],["bh18","Jimmy"],["43","Mark"],["45","Chingachlook"],["46","Phil"]]){
 const h=harness();h.g.board=[[[{id,owner:0}]]];h.advance(15000);
 for(let i=0;i<5;i++){
  const a=h.audios.at(-1);assert(a.src.includes(file));assert(h.panel.querySelector('p').textContent.length>0);assert(fs.statSync(path.join(__dirname,'../',a.src)).size>0);
  a.currentTime=10;a.emit('timeupdate');assert(h.panel.querySelector('p').textContent.length>0);a.emit('ended');h.advance(15000);
 }
 assert.equal(h.audios.length,5);assert.equal(new Set(h.audios.map(a=>a.src)).size,5);assert.equal(h.window.FateIdleChatter.report().remaining,0);
 assert.equal(h.window.FateIdleChatter.clipsForCard(id).length,5);
}
console.log('PASS: new characters play five unique clips each, with captions and no replay after exhaustion.');
