import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {collectTriggeredOperations} from '../../shared/engine/triggers.mjs';
import {command} from './test-helpers.mjs';

const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
{
  const data=fs.readFileSync(new URL('../../src/scripts/01-data-and-state.js',import.meta.url),'utf8');
  const gameplay=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
  const context={window:{fateAutoActivateEffectsEnabled:()=>true},
    G:{board:[[[{id:'86',iid:'b',owner:0,counters:{boleslawCounters:2}},
      {id:'103',iid:'s',owner:0,counters:{santiagoSupporterCounters:2}}]]]},
    getCardRuntimeEffectId:card=>card.id,
    MANUAL_EFFECT_BLOCKED_CARD_IDS:new Set(),AUTHORITATIVE_ACTIVATE_EFFECT_IDS:new Set()};
  vm.createContext(context);
  vm.runInContext(data.slice(data.indexOf('window.FATE_PLAYER_TIMED_MANUAL_EFFECT_CARD_IDS'),
    data.indexOf('const CARDS =')),context);
  for(const [start,end] of [
    ['function canUseManualCharacterEffect(card) {','function automaticBoardEffectsEnabled()'],
    ['function shouldShowManualCharacterEffectButton(card) {','// Keep the board']]){
    vm.runInContext(gameplay.slice(gameplay.indexOf(start),gameplay.indexOf(end,gameplay.indexOf(start))),context);
  }
  for(const card of context.G.board[0][0]){
    assert.equal(context.shouldShowManualCharacterEffectButton(card),true,
      `${card.id} must retain its spend button while automatic effects are enabled`);
  }
}
for(const [id,key] of [['86','boleslawCounters'],['103','santiagoSupporterCounters']]){
  assert.equal(definitions.find(card=>card.id===id)?.counterResourceKey,key,
    `${id} must be visible to Emerald-Eyed Children's local counter picker`);
}
{
  const gameplay=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
  const context={G:{successfulWhenSetHistory:[]},window:{},hasAuthoritativeWhenSetEffect:()=>false};
  vm.createContext(context);
  vm.runInContext(gameplay.slice(gameplay.indexOf('function recordSuccessfulWhenSetForBoleslaw(inst){'),
    gameplay.indexOf('async function triggerWhenSet(',gameplay.indexOf('function recordSuccessfulWhenSetForBoleslaw(inst){'))),context);
  const dylan={id:'29',type:'Initiator',owner:0};
  context.recordSuccessfulWhenSetForBoleslaw(dylan);
  context.recordSuccessfulWhenSetForBoleslaw(dylan);
  assert.equal(context.G.successfulWhenSetHistory.length,1,'a resolved local Initiator is recorded once');
  context.recordSuccessfulWhenSetForBoleslaw({id:'107',type:'Initiator',owner:0});
  assert.equal(context.G.successfulWhenSetHistory.length,1,'player-timed Anne is not a When Set effect');
}
{
  const gameplay=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
  const context={G:{},window:{},Promise,Set};
  vm.createContext(context);
  vm.runInContext(gameplay.slice(gameplay.indexOf('function createBoleslawCopyPickerSession(){'),
    gameplay.indexOf('async function triggerWhenSet(',gameplay.indexOf('function createBoleslawCopyPickerSession(){'))),context);
  const session=vm.runInContext('createBoleslawCopyPickerSession()',context);
  context.G._boleslawCopyPickerSession=session;
  let finishSecond;
  const first=context.window.trackBoleslawCopyPicker(()=>{
    const second=context.window.trackBoleslawCopyPicker(()=>true);
    finishSecond=second.confirm;
  });
  let completed=false;
  const wait=session.wait().then(value=>{completed=value;});
  first.confirm();
  await Promise.resolve();
  assert.equal(completed,false,'a chained destination picker must keep the copy pending');
  finishSecond();
  await wait;
  assert.equal(completed,true,'the copy completes after the final destination');
  const cancelled=vm.runInContext('createBoleslawCopyPickerSession()',context);
  context.G._boleslawCopyPickerSession=cancelled;
  context.window.trackBoleslawCopyPicker(()=>true).cancel();
  assert.equal(await cancelled.wait(),false,'cancelling a copied effect must not mark it resolved');
}
function fixture(){
  const state=createInitialState({matchId:'boleslaw-santiago-regression',seed:'counter-effects',
    handSize:99,activePlayer:0,cardDefinitions:definitions,
    players:[{id:'p0',deckIds:['86','103','39','29','05','32','32']},
      {id:'p1',deckIds:['65','67','32','32']}],gameSettings:{healthPressureSeals:true}});
  function board(id,player,z,r,c){
    const hand=state.players[player].hand;
    const card=hand.find(item=>String(item.id)===id);
    assert(card,`missing ${id}`);
    hand.splice(hand.indexOf(card),1);
    state.board[z][r][c]=card;
    return card;
  }
  return {state,board};
}

{
  const {state,board}=fixture();
  const source=board('103',0,0,2,0);
  const supporter=state.players[0].hand.find(card=>card.id==='32');
  state.players[0].hand.splice(state.players[0].hand.indexOf(supporter),1);
  state.players[0].discard.push(supporter);
  const operations=collectTriggeredOperations(state,{type:'CARD_DISCARDED',cardIid:supporter.iid,
    owner:0,previousZone:'hand'});
  assert(operations.some(op=>op.type==='SET_CARD_COUNTER' && op.targetIid===source.iid
    && op.counterKey==='santiagoSupporterCounters' && op.value===1));
  assert(operations.some(op=>op.counterKey==='santiagoCounterGainTurn' && op.value===state.turn));
  const tribute=collectTriggeredOperations(state,{type:'CARD_DISCARDED',cardIid:supporter.iid,
    owner:0,previousZone:'board',previousController:0,reason:'CONSOLIDATION_TRIBUTE'});
  assert(!tribute.some(op=>op.counterKey==='santiagoSupporterCounters'),
    'consolidation tributes must not grant Santiago a counter');
  source.counters.santiagoCounterGainTurn=state.turn;
  const repeated=collectTriggeredOperations(state,{type:'CARD_DISCARDED',cardIid:supporter.iid,
    owner:0,previousZone:'hand'});
  assert(!repeated.some(op=>op.counterKey==='santiagoSupporterCounters'),
    'a second Supporter discarded in the turn cannot give another counter');
}

{
  const {state,board}=fixture();
  const source=board('86',0,0,2,0);
  const character=board('39',0,0,2,1);
  character.affiliation='expanded_worlds';
  const operations=collectTriggeredOperations(state,{type:'CARD_SET',cardIid:character.iid,
    playerIndex:0,consolidated:false,sourceIid:'free-effect'});
  assert(operations.some(op=>op.type==='SET_CARD_COUNTER' && op.targetIid===source.iid
    && op.counterKey==='boleslawCounters' && op.value===1),
    'a free Expanded Worlds set should grant Boleslaw a counter');
  const consolidated=collectTriggeredOperations(state,{type:'CARD_SET',cardIid:character.iid,
    playerIndex:0,consolidated:true});
  assert(consolidated.some(op=>op.counterKey==='boleslawCounters' && op.value===1));
  const aftermath=collectTriggeredOperations(state,{type:'CARD_CONSOLIDATED',cardIid:character.iid,playerIndex:0});
  assert(!aftermath.some(op=>op.counterKey==='boleslawCounters'),
    'the consolidation event must not grant a second counter');
}

{
  const {state,board}=fixture();
  const source=board('86',0,0,2,0);
  state.successfulWhenSetHistory=[{cardId:'65',sourceType:'Supporter',controller:1}];
  const initialized=collectTriggeredOperations(state,{type:'CARD_SET',cardIid:source.iid,playerIndex:0});
  assert(!initialized.some(op=>op.counterKey==='boleslawLastEligibleWhenSetId'),
    'a newly placed Boleslaw should not show another card\'s effect in his tracker');
}

{
  const {state,board}=fixture();
  const source=board('103',0,0,2,0);
  const target=board('39',0,0,2,1);
  source.counters.santiagoSupporterCounters=2;
  state.moralePressure.morale[1]=60;
  const started=reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',
    {sourceIid:source.iid,userActivated:true}),{playerIndex:0});
  assert.equal(started.ok,true,JSON.stringify(started.rejection));
  assert.equal(started.state.pendingPrompt?.type,'BOARD_TARGET');
  const resolved=reduceCommand(started.state,command(started.state,'p0',2,'ANSWER_PROMPT',
    {promptId:started.state.pendingPrompt.promptId,selectedIids:[target.iid]}),{playerIndex:0});
  assert.equal(resolved.ok,true,JSON.stringify(resolved.rejection));
  const card=resolved.state.board[0][2][0];
  assert.equal(card.counters.santiagoSupporterCounters,0);
  const actual=60-resolved.state.moralePressure.morale[1];
  assert.equal(card.counters.santiagoMoraleInflicted,actual);
  assert(actual>0);
  assert(resolved.events.some(event=>event.type==='SANTIAGO_STRIKE_TARGET' && event.cardIid===target.iid));
  card.counters.santiagoSupporterCounters=2;
  const next=reduceCommand(resolved.state,command(resolved.state,'p0',3,'ACTIVATE_EFFECT',
    {sourceIid:source.iid,userActivated:true}),{playerIndex:0});
  assert.equal(next.ok,true,JSON.stringify(next.rejection));
  assert(!next.state.pendingPrompt.eligibleIids.includes(target.iid),
    'Santiago cannot select the same card twice');
}

{
  const {state,board}=fixture();
  const source=board('86',0,0,2,0);
  source.counters.boleslawCounters=2;
  state.successfulWhenSetHistory=[{cardId:'65',sourceType:'Supporter',controller:0}];
  const activated=reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',
    {sourceIid:source.iid,userActivated:true}),{playerIndex:0});
  assert.equal(activated.ok,true,JSON.stringify(activated.rejection));
  assert.equal(activated.state.board[0][2][0].counters.boleslawCounters,0);
  assert.equal(activated.state.board[0][2][0].counters.boleslawLastActivatedWhenSetId,'65');
  assert.equal(activated.state.successfulWhenSetHistory.length,1,'copies must not enter the pool');
}

{
  const {state,board}=fixture();
  const source=board('86',0,0,2,0);
  const dylan=board('29',0,0,2,1);
  const target=state.players[0].hand.find(card=>card.id==='05');
  state.players[0].hand.splice(state.players[0].hand.indexOf(target),1);
  state.players[0].discard.push(target);
  const started=reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',
    {sourceIid:dylan.iid}),{playerIndex:0});
  assert.equal(started.ok,true,JSON.stringify(started.rejection));
  let result=started;
  if(result.state.pendingPrompt){
    result=reduceCommand(result.state,command(result.state,'p0',2,'ANSWER_PROMPT',
      {promptId:result.state.pendingPrompt.promptId,selectedIid:target.iid}),{playerIndex:0});
    assert.equal(result.ok,true,JSON.stringify(result.rejection));
  }
  assert(result.state.successfulWhenSetHistory.some(entry=>entry.cardId==='29'),
    'Dylan\'s successfully resolved Initiator effect must enter Boleslaw\'s pool');
  result.state.board[0][2][0].counters.boleslawCounters=2;
  result.state.successfulWhenSetHistory=[{cardId:'29',sourceType:'Initiator',controller:0}];
  const copied=reduceCommand(result.state,command(result.state,'p0',3,'ACTIVATE_EFFECT',
    {sourceIid:source.iid,userActivated:true}),{playerIndex:0});
  assert.equal(copied.ok,true,JSON.stringify(copied.rejection));
  assert.equal(copied.state.board[0][2][0].counters.boleslawLastActivatedWhenSetId,'29');
}

{
  const {state,board}=fixture();
  const dylan=board('29',0,0,2,1);
  const sec=board('67',1,1,0,0);
  const target=state.players[0].hand.find(card=>card.id==='05');
  state.players[0].hand.splice(state.players[0].hand.indexOf(target),1);
  state.players[0].discard.push(target);
  const started=reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',
    {sourceIid:dylan.iid}),{playerIndex:0});
  assert.equal(started.ok,true,JSON.stringify(started.rejection));
  assert.equal(started.state.pendingPrompt?.type,'REACTION');
  const negated=reduceCommand(started.state,command(started.state,'p1',2,'ANSWER_PROMPT',
    {promptId:started.state.pendingPrompt.promptId,choice:'NEGATE',reactionIid:sec.iid}),{playerIndex:1});
  assert.equal(negated.ok,true,JSON.stringify(negated.rejection));
  assert(!negated.state.successfulWhenSetHistory?.some(entry=>entry.cardId==='29'),
    'a negated Initiator effect must not enter Boleslaw\'s pool');
}

console.log('Boleslaw and Santiago regression passed');
