'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const html = read('index.html');
let loader, count=0;
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(/\bsrc\s*=|type=["'](?:module|application\/)/i.test(match[1])) continue;
  new vm.Script(match[2], {filename:'index-inline-'+(++count)});
  if(match[2].includes('var modules = [')) loader=match[2];
}
assert.ok(loader);
const browser={window:{},location:{search:'',href:'http://localhost/'},navigator:{userAgent:'test'},document:{readyState:'loading',addEventListener(){}},URLSearchParams};
vm.runInNewContext(loader,browser);
assert.equal(typeof browser.window.showSocial,'function');
assert.equal(typeof browser.window.FateOnlineReady,'function');
assert.equal(browser.window.__fateOnlineModuleState.modules.length,6);
for(const url of browser.window.__fateOnlineModuleState.modules) assert.ok(fs.existsSync(path.join(root,url.split('?')[0])));
console.log('PASS: all '+count+' classic inline scripts parse; Social/online loader installs with six valid module paths.');

const setup=read('src/scripts/04-game-setup.js');
const helpers=read('src/scripts/06-rendering-and-helpers.js');
const add=setup.slice(setup.indexOf('const queuedSearchHandMotions ='),setup.indexOf('function triggerSelvaIslandsPirateHandArrival('));
const queue=helpers.slice(helpers.indexOf('function queueSearchToHandMotion('),helpers.indexOf('function searchDeckForType('));
const motions=[];
const local={G:{players:[{hand:[],deck:[],discard:[]},{hand:[],deck:[],discard:[]}]},
  window:{FateV2CardMotionFx:{searchCardToHand:(...args)=>{motions.push(args);return true;}}},
  document:{getElementById:()=>({classList:{contains:()=>true}})}};
vm.createContext(local);vm.runInContext(add+'\n'+queue,local);
for(const label of ['Fisherman','Villager','Flower Picking']){
  const card={id:'test',iid:label,type:'Supporter'};
  const before=motions.length;
  local.addCardToHand(0,card,{arrivalKind:'search'});
  assert.equal(motions.length,before+1,label+' must animate even after removal from deck');
}
const card={id:'test',iid:'explicit',type:'Supporter'};
local.queueSearchToHandMotion(0,card,'discard',0,0,1);
const before=motions.length;
local.addCardToHand(0,card,{arrivalKind:'search'});
assert.equal(motions.length,before,'existing helper must not double-animate');
local.addCardToHand(0,card,{arrivalKind:'search'});
assert.equal(motions.length,before+1,'later searches of the same card must animate again');
for(const arrivalKind of ['draw','ali-transfer','achilles-token']) local.addCardToHand(0,{id:'test',iid:arrivalKind,type:'Supporter'},{arrivalKind});
local.addCardToHand(0,{id:'test',iid:'silent',type:'Supporter'},{arrivalKind:'search',animate:false});
assert.equal(motions.length,before+1,'draws, transfers, tokens and disabled animations must not become searches');
const recovered={id:'test',iid:'recovered',type:'Supporter'};
local.G.players[0].discard.push(recovered);
local.addCardToHand(0,recovered,{arrivalKind:'discard_recovery'});
assert.equal(motions.at(-1)[2],'discard');
console.log('PASS: shared search arrival fallback, deduplication, repeated searches, discard source and non-search exclusions.');
local.G.aiEnabled=true;
for(const aiPlayer of [0,1]){
  local.G.aiPlayer=aiPlayer;
  const beforeAi=motions.length;
  const aiCard={id:'test',iid:'ai-search-'+aiPlayer,type:'Supporter'};
  assert.equal(local.queueSearchToHandMotion(aiPlayer,aiCard,'deck'),false);
  local.addCardToHand(aiPlayer,aiCard,{arrivalKind:'search'});
  assert.equal(motions.length,beforeAi,'AI searches must have no search animation');
  assert.ok(local.G.players[aiPlayer].hand.includes(aiCard),'AI still receives the searched card');
  local.addCardToHand(1-aiPlayer,{id:'test',iid:'human-search-'+aiPlayer,type:'Supporter'},{arrivalKind:'search'});
  assert.equal(motions.length,beforeAi+1,'human searches must still animate');
}
console.log('PASS: AI search animations suppressed for either seat; human searches and AI card receipt preserved.');
