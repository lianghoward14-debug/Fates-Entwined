const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/scripts/47-idle-chatter.js','utf8');
let now=0,tick,panel;
const audios=[];
class Audio{
  constructor(src){this.src=src;this.events={};this.duration=20;this.currentTime=0;audios.push(this);}
  addEventListener(name,listener){(this.events[name]??=[]).push(listener);}
  play(){for(const listener of this.events.playing||[])listener();return Promise.resolve();}
  pause(){}removeAttribute(){}load(){}
}
const g={board:[[[{id:'02',owner:0}]]],phase:'main',turn:1,currentPlayer:0};
const document={hidden:false,body:{classList:{contains:()=>false},appendChild(){}},
  getElementById:()=>({classList:{contains:name=>name==='active'}}),querySelector:()=>null,
  createElement:()=>{const nodes={p:{textContent:''},img:{src:''},'.chatter-name':{textContent:''}};
    panel={hidden:true,style:{},setAttribute(){},querySelector:key=>nodes[key]};return panel;},addEventListener(){}};
const window={getFateGameState:()=>g,FateActionPresentation:{isActive:()=>false},addEventListener(){}};
vm.runInNewContext(source,{window,document,Audio,Date:{now:()=>now},Math,getPerspectivePlayerIndex:()=>0,
  fateAudioReport:()=>({chatterVolume:0,masterVolume:1}),setInterval:callback=>{tick=callback;}});
while(now<31000){now+=250;tick();}
assert.equal(audios.length,1);
assert.equal(audios[0].muted,true);
assert.equal(panel.hidden,false);
assert(panel.querySelector('p').textContent.length>0);
console.log('PASS muted chatter still shows its portrait and caption box');
