import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {reduceCommand, projectStateForPlayer, projectStateForSpectator, projectEvents, applyOperation} from '../shared/engine/index.mjs';
import {testState, takeFromHandToBoard, command} from './authoritative-v3/test-helpers.mjs';

let state = testState({player0:['30'], player1:['32']});
const santiago = takeFromHandToBoard(state, 0, '30', {z:0,r:2,c:0});
const target = takeFromHandToBoard(state, 1, '32', {z:0,r:1,c:0});
target.faceDown = true;
const hidden = projectStateForPlayer(state, 0).board[0][1][0];
assert.equal(hidden.hidden, true);
let result = reduceCommand(state, command(state,'p0',1,'ACTIVATE_EFFECT',{sourceIid:santiago.iid}),{playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.board[0][1][0].faceDown, true, 'targeting must not reveal');
state = result.state;
result = reduceCommand(state, command(state,'p0',2,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIid:target.iid}),{playerId:'p0'});
assert.equal(result.ok, true, JSON.stringify(result.rejection));
assert.equal(result.state.board[0][1][0], null);
const discarded = result.state.players[1].discard.find(card=>card.iid===target.iid);
assert.equal(discarded.faceDown, false);
const event = result.events.find(e=>e.type==='CARD_DISCARDED');
assert.equal(event.revealedOnDiscard, true);
assert.equal(event.reason, 'SANTIAGO_DISCARD');
assert.equal(event.cardName, target.name);
for(const seat of [0,1]){
  assert.equal(projectStateForPlayer(result.state,seat).players[1].discard[0].id,target.id);
  assert.equal(projectEvents(result.events,seat).find(e=>e.type==='CARD_DISCARDED').cardName,target.name);
}
assert.equal(projectStateForSpectator(result.state).players[1].discard[0].id,target.id);

// Negation leaves the face-down target on the board without announcing it.
{
  const blockedState = testState({player0:['30'],player1:['56','32']});
  const source = takeFromHandToBoard(blockedState,0,'30',{z:0,r:2,c:0});
  const victim = takeFromHandToBoard(blockedState,1,'32',{z:0,r:1,c:0});
  victim.faceDown = true;
  const lydia = takeFromHandToBoard(blockedState,1,'56',{z:1,r:0,c:0});
  let blocked = reduceCommand(blockedState,command(blockedState,'p0',1,'ACTIVATE_EFFECT',{sourceIid:source.iid}),{playerId:'p0'});
  assert.equal(blocked.prompt.type,'REACTION');
  blocked = reduceCommand(blocked.state,command(blocked.state,'p1',2,'ANSWER_PROMPT',{
    promptId:blocked.state.pendingPrompt.promptId,choice:'NEGATE',reactionIid:lydia.iid
  }),{playerId:'p1'});
  assert.equal(blocked.ok,true);
  assert.equal(blocked.state.board[0][1][0].faceDown,true);
  assert(!blocked.events.some(e=>e.type==='CARD_DISCARDED' || e.revealedOnDiscard));
}

// Movement and Fate reduction leave the opponent's identity redacted.
state = testState({player0:['39'],player1:['32']});
const mover = takeFromHandToBoard(state,0,'39',{z:0,r:2,c:0});
const concealed = takeFromHandToBoard(state,1,'32',{z:0,r:1,c:0});
concealed.faceDown = true;
const ctx = {state,events:[],ruleEvents:[]};
applyOperation(ctx,{type:'MOVE_CARD',cardIid:concealed.iid,sourceIid:mover.iid,sourceController:0,destination:{z:1,r:1,c:0}});
applyOperation(ctx,{type:'MODIFY_FATE',targetIid:concealed.iid,sourceIid:mover.iid,sourceController:0,amount:-1});
assert.equal(concealed.faceDown,true);
assert.equal(projectStateForPlayer(state,0).board[1][1][0].hidden,true);
assert(!ctx.events.some(e=>e.revealedOnDiscard || e.cardName || e.cardId));

// Multiplayer animation resolves the actual discarded card, not the old back.png.
const online = fs.readFileSync(new URL('../src/scripts/18-online-rooms.js',import.meta.url),'utf8');
const helper = online.slice(online.indexOf('  function phase7DiscardPresentationCard('),online.indexOf('  function phase7FindProjectedEntry('));
const presentation = vm.createContext({
  phase7FindProjectedEntry:()=>({zone:'discard',card:{...discarded,img:'32.png'}}),
  phase7PresentationCard:card=>card
});
vm.runInContext(helper,presentation);
const revealed = presentation.phase7DiscardPresentationCard({},event,hidden);
assert.equal(revealed.img,'32.png');
assert.equal(revealed.faceDown,false);
assert.equal(hidden.hidden,true,'presentation must not mutate the old hidden snapshot');
for(const type of ['CARD_MOVED','FATE_CHANGED','AFFILIATION_CHANGED']){
  assert.equal(presentation.phase7DiscardPresentationCard({}, {type}, hidden),hidden);
}

// Both clients' actual discard branch passes revealed art to motion and the banner.
const branchStart = online.indexOf("      if(type === 'CARD_DISCARDED' && target){");
const branchEnd = online.indexOf("      if(type === 'CARD_TRANSFERRED'",branchStart);
let onlineMotion, onlineBanner;
presentation.window = {
  FateV2CardMotionFx:{flyBoardCard:card=>{onlineMotion=card;return true;}},
  showSantiagoDiscardBanner:card=>{onlineBanner=card.name;},
  playDiscardSfx(){}
};
vm.runInContext('function presentDiscard(event,target){ const type=event.type; const view={}; const targetLocation={zone:"board",z:0,r:1,c:0}; let resultMotionStarted=false; '+online.slice(branchStart,branchEnd)+'}',presentation);
for(const oldCard of [hidden,{...target,faceDown:true}]){
  presentation.presentDiscard(event,oldCard);
  assert.equal(onlineMotion.faceDown,false);
  assert.equal(onlineMotion.img,'32.png');
  assert.equal(onlineBanner,target.name);
}

// The real recipes draw normal art during discard and card backs during movement.
const visuals = vm.createContext({window:{},getPerspectivePlayerIndex:()=>0});
for(const file of ['12-vfx-primitives.js','13-vfx-recipes.js']){
  vm.runInContext(fs.readFileSync(new URL('../src/scripts/render-v2/'+file,import.meta.url),'utf8'),visuals);
}
const rect = {x:0,y:0,w:80,h:120};
const recipes = visuals.window.FateVfxRecipes;
const discardMotion = recipes.expand('DISCARD_CARD',{card:revealed,fromRect:rect,toRect:rect});
assert.equal(discardMotion.find(p=>p.kind==='cardMove').faceDown,false);
const moveMotion = recipes.expand('MOVE_CARD',{card:{id:'32',faceDown:true,img:'32.png'},fromRect:rect,toRect:rect});
assert.equal(moveMotion.find(p=>p.kind==='cardMove').faceDown,true);

const swapMotion = recipes.expand('SWAP_CARDS',{a:{card:{faceDown:true},fromRect:rect},b:{card:{faceDown:false},fromRect:rect}});
assert.deepEqual(Array.from(swapMotion.filter(p=>p.kind==='cardMove'),p=>p.faceDown),[true,false]);
assert(!recipes.expand('FATE_LOSS',{card:hidden,rect}).some(p=>p.kind==='cardFlip' || p.kind==='cardMove'));

// Legacy single-player reveals before handing the card to the animation/banner.
const rendering = fs.readFileSync(new URL('../src/scripts/06-rendering-and-helpers.js',import.meta.url),'utf8');
const legacySource = rendering.slice(rendering.indexOf('function showSantiagoDiscardBanner('),rendering.indexOf('let _hoverPreviewEl'));
let motion, banner;
const legacyCard = {id:'32',name:'Bob',img:'32.png',owner:1,faceDown:true};
const legacy = vm.createContext({
  G:{board:[[[legacyCard]]],players:[{discard:[]},{discard:[]}]},
  window:{FateV2CardMotionFx:{flyBoardCard:card=>{motion={...card};}}},
  toast:msg=>{banner=msg;},
  discardBerkeleyHomelessWithHandCost:()=>false,
  rendererV2OwnsBoardScene:()=>true,
  playDiscardSfx(){},
  fatePushDiscard(owner,card){legacy.G.players[owner].discard.push(card);}
});
vm.runInContext(legacySource,legacy);
legacy.discardBoardCard(legacyCard,0,0,0,{revealDiscard:true});
assert.equal(motion.faceDown,false);
assert.equal(motion.img,'32.png');
assert.equal(banner,'Santiago discarded Bob.');
assert.equal(legacy.G.players[1].discard[0].faceDown,false);
motion = null; banner = '';
const immune = {id:'76',owner:1,faceDown:true,name:'ALPINE Infantry'};
legacy.discardBoardCard(immune,0,0,0,{revealDiscard:true});
assert.equal(immune.faceDown,true);
assert.equal(motion,null);
assert(!banner.startsWith('Santiago discarded'));
console.log('Santiago reveal regression passed: authoritative/public identity, hidden non-discard effects, animation artwork, and single-player banner.');
