import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, reduceCommand} from '../shared/engine/index.mjs';
import {command} from './authoritative-v3/test-helpers.mjs';

const rendering = fs.readFileSync(new URL('../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
for(const name of ['showEffectActivationCinematic', 'playEffectActivationCinematic']){
  const start = rendering.indexOf(`function ${name}(`);
  const end = rendering.indexOf('\n}\n', start);
  const context = {};
  vm.runInNewContext(rendering.slice(start, end + 3), context);
  assert.equal(await context[name]({id:'34', type:'Coordinator'}), false,
    `${name} must skip Rozsi before touching presentation or broadcasting`);
}

const setup = fs.readFileSync(new URL('../src/scripts/04-game-setup.js', import.meta.url), 'utf8');
const timers = [];
let picks = 0;
const context = {
  G:{_villagerSearchReady:true, _villagerSearchQueue:[{player:0,source:{id:'91'}}],
    currentPlayer:0, phase:'main', _deferredCardPickers:1,
    players:[{deck:[{id:'82',effect:'landscape'}]}], board:[]},
  setTimeout:fn=>timers.push(fn),
  document:{getElementById:()=>null},
  pickCardsVisual:()=>picks++
};
vm.runInNewContext(setup.slice(setup.indexOf('function drainVillagerSearches()'), setup.indexOf('function addCardToHand(')), context);
context.drainVillagerSearches();
timers.shift()();
assert.equal(picks, 0, 'Villager waits for a delayed picker');
context.G._deferredCardPickers = 0;
context.G._whenSetEffectsResolving = 1;
timers.shift()();
assert.equal(picks, 0, 'Villager waits between West German draw and discard picker');
context.G._whenSetEffectsResolving = 0;
context.G.board = [[[{_effectActivationInFlight:true}]]];
timers.shift()();
assert.equal(picks, 0, 'Villager waits for the source effect to finish');
context.G.board = [];
context.window = {FateActionPresentation:{isActive:()=>true}};
timers.shift()();
assert.equal(picks, 0, 'Villager waits for search-to-hand presentation');
context.window.FateActionPresentation.isActive=()=>false;
context.G.currentPlayer=1;
timers.shift()();
assert.equal(picks, 1, 'Villager opens after presentation even outside its recipient turn');

let state = createInitialState({matchId:'villager-last',seed:'villager-last',handSize:0,
  cardDefinitions:[
    {id:'06',name:'Jorge',type:'Initiator',fate:1,cost:1},
    {id:'91',name:'Villager',type:'Supporter',fate:1,cost:0},
    {id:'82',name:'Landscape card',type:'Supporter',fate:1,cost:2,effect:'landscape'},
    {id:'32',name:'Resident',type:'Supporter',fate:1,cost:0}
  ],players:[{id:'p0',deckIds:['06','91','82']},{id:'p1',deckIds:['32']}]});
const take = id=>state.players[0].deck.splice(state.players[0].deck.findIndex(c=>c.id===id),1)[0];
const jorge = take('06');
jorge.controller = 0;
state.board[0][2][0] = jorge;
const villager = take('91');
state.players[0].hand.push(villager);
state.villagerArrivals = [{sourceIid:villager.iid,controller:0}];
let result = reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',{sourceIid:jorge.iid}),{playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.state.villagerArrivals.length,1,'existing effect picker precedes Villager');
state = result.state;
result = reduceCommand(state,command(state,'p0',2,'ANSWER_PROMPT',{
  promptId:state.pendingPrompt.promptId,selectedIid:state.pendingPrompt.eligibleIids[0]
}),{playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.state.villagerArrivals.length,0,'Villager drains after the effect completes');
console.log('Villager ordering and coordinator cinematic regressions passed');

state = createInitialState({matchId:'west-german-villager',seed:'west-german',handSize:0,
  cardDefinitions:[
    {id:'42',name:'West German Soldier',type:'Supporter',fate:1,cost:0},
    {id:'91',name:'Villager',type:'Supporter',fate:1,cost:0},
    {id:'82',name:'Landscape card',type:'Supporter',fate:1,cost:2,effect:'landscape'},
    {id:'32',name:'Resident',type:'Supporter',fate:1,cost:0}
  ],players:[{id:'p0',deckIds:['42','91','32','32','82']},{id:'p1',deckIds:['32']}]});
const soldier = take('42');
state.players[0].hand.push(soldier);
state.players[0].deck.sort((a,b)=>(a.id==='82')-(b.id==='82'));
result = reduceCommand(state,command(state,'p0',1,'SET_CARD',{
  cardIid:soldier.iid,destination:{z:0,r:2,c:0}
}),{playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.prompt.min,3,'West German discard opens first');
assert.equal(result.state.villagerArrivals.length,1,'Villager stays queued through mandatory discard');
state = result.state;
result = reduceCommand(state,command(state,'p0',2,'ANSWER_PROMPT',{
  promptId:state.pendingPrompt.promptId,selectedIids:state.pendingPrompt.eligibleIids.slice(0,3)
}),{playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.state.effectStack.at(-1).sourceCardId,'91','Villager opens after West German discard');
assert.equal(result.prompt.eligibleCards[0].id,'82');
console.log('West German discard then Villager search passed');

// IB Student must trigger Villager on a search, including the no-target outcome.
for(const eligible of [true,false]){
  state=createInitialState({matchId:'ib-villager-'+eligible,seed:'ib',handSize:0,
    cardDefinitions:[{id:'60',name:'IB Student',type:'Supporter',fate:1,cost:0},
      {id:'91',name:'Villager',type:'Supporter',fate:1,cost:0},
      {id:'82',name:'Target',type:'Supporter',fate:1,cost:2,effect:eligible?'landscape':'nothing'}],
    players:[{id:'p0',deckIds:['60','91','82']},{id:'p1',deckIds:['82']}]});
  const ib=take('60');state.players[0].hand.push(ib);
  result=reduceCommand(state,command(state,'p0',1,'SET_CARD',{cardIid:ib.iid,destination:{z:0,r:2,c:0}}),{playerId:'p0'});
  assert.equal(result.ok,true);state=result.state;
  const selectedIid=state.pendingPrompt.eligibleCards.find(c=>c.id==='91').iid;
  result=reduceCommand(state,command(state,'p0',2,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIid}),{playerId:'p0'});
  assert.equal(result.ok,true);
  if(eligible){
    assert.equal(result.state.effectStack.at(-1).sourceCardId,'91');
    assert.equal(result.prompt.eligibleCards[0].id,'82');
  }else{
    assert.equal(result.events.filter(e=>e.type==='VILLAGER_SEARCH_EMPTY').length,1);
    assert.equal(result.state.villagerArrivals.length,0);
  }
}
console.log('IB Student search triggers Villager or reports no eligible target');
