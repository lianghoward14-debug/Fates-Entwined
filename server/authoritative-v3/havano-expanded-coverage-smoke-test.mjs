import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {cardRule} from '../../shared/engine/cards/registry.mjs';
import {command} from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');
const {HAVANO_TARGETING_SOURCE_IDS} = require('../../src/scripts/02-effect-rule-metadata.js');
const onlineRooms = fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js', import.meta.url), 'utf8');
const DEFINITIONS = getCardCatalog().cards.filter(card=>
  card.retired !== true && card.temporarilyDisabled !== true
);

for(const sourceId of HAVANO_TARGETING_SOURCE_IDS){
  assert.equal(cardRule(sourceId)?.havanoTargeting, 'OPPONENT', `${sourceId} must share Havano targeting eligibility in authority and browser rules`);
}

// Only effects that still have limits are projected into match trackers.
assert.doesNotMatch(onlineRooms, /usMarinesUses/, 'retired Marines match-use tracker must not be projected');
assert.match(onlineRooms, /rule-use:snowy_village:p/);
assert.match(onlineRooms, /_snowyVillageUses:\[0,1\]\.map/);
for(const [cardId, maxUses] of [['20', 2], ['40', 2], ['bh16', 2]]){
  assert.match(
    onlineRooms,
    new RegExp(`['"]${cardId}['"]\\s*:\\s*${maxUses}`),
    `${cardId} remaining-effect uses must be projected for multiplayer trackers`
  );
}
assert.match(onlineRooms, /_bh08ProcCount\s*=\s*Math\.max\([^;]+card\.counters\?\.bh08ProcCount/);
assert.match(onlineRooms, /_wintertideTriggerCount\s*=\s*Math\.max\([^;]+card\.counters\?\.wintertideTriggerCount/);

function takeCard(state, playerIndex, cardId){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>String(card.id) === String(cardId));
    if(index < 0) continue;
    return state.players[playerIndex][pile].splice(index, 1)[0];
  }
  throw new Error(`missing fixture card ${cardId}`);
}

function putOnBoard(state, playerIndex, cardId, destination, faceDown = false){
  const card = takeCard(state, playerIndex, cardId);
  card.controller = playerIndex;
  card.faceDown = faceDown;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

function sourceFixture(sourceId, reactorId = '79'){
  const state = createInitialState({
    matchId:`HAVANO-EXPANDED-${sourceId}`,
    seed:`havano-expanded-${sourceId}`,
    handSize:99,
    activePlayer:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:[sourceId, ...Array(14).fill('32')]},
      {id:'p1', deckIds:[reactorId, ...Array(14).fill('32')]}
    ]
  });
  const timing = cardRule(sourceId, state)?.timings?.includes('ACTIVATE') ? 'ACTIVATE' : 'WHEN_SET';
  const source = putOnBoard(state, 0, sourceId, {z:0,r:2,c:1}, timing === 'WHEN_SET');
  putOnBoard(state, 1, '32', {z:0,r:1,c:1});
  const reactor = reactorId === '79'
    ? takeCard(state, 1, reactorId)
    : putOnBoard(state, 1, reactorId, {z:1,r:0,c:0});
  if(reactorId === '79') state.players[1].hand.push(reactor);
  return {state, source, reactor, timing};
}

for(const sourceId of ['18', '72', '81', '93', '97', 'bh04', 'bh16']){
  const value = sourceFixture(sourceId);
  const type = value.timing === 'ACTIVATE' ? 'ACTIVATE_EFFECT' : 'FLIP_CARD';
  const payload = value.timing === 'ACTIVATE'
    ? {sourceIid:value.source.iid, ...(sourceId === 'bh16' ? {userActivated:true} : {})}
    : {cardIid:value.source.iid};
  const opened = reduceCommand(
    value.state,
    command(value.state, 'p0', 1, type, payload),
    {playerId:'p0'}
  );
  assert.equal(opened.ok, true, `${sourceId} must activate: ${JSON.stringify(opened.rejection || {})}`);
  assert.equal(opened.prompt?.type, 'REACTION', `${sourceId} must open Havano`);
  const option = opened.prompt.options.find(candidate=>candidate.kind === 'HAVANO');
  assert(option, `${sourceId} must expose Havano from hand`);
  assert.equal(option.reactionIid, value.reactor.iid);
  assert.deepEqual([...option.modes], ['NEGATE', 'SUPPRESS']);
}

// Secules also covers the newer sources that meet his narrower printed rule:
// Initiator effects and Supporter WHEN_SET effects.
for(const sourceId of ['81', '97', 'bh04']){
  const value = sourceFixture(sourceId, '67');
  const opened = reduceCommand(
    value.state,
    command(value.state, 'p0', 1, 'FLIP_CARD', {cardIid:value.source.iid}),
    {playerId:'p0'}
  );
  assert.equal(opened.ok, true);
  assert.equal(opened.prompt?.type, 'REACTION');
  const option = opened.prompt.options.find(candidate=>candidate.kind === 'SECULES');
  assert(option && option.reactionIid === value.reactor.iid, `${sourceId} must expose Secules`);
}

// Passive sources must offer suppression as soon as they are revealed.
for(const id of ['36','bh18']){
  const {state,source,reactor}=sourceFixture(id);
  let result=reduceCommand(state,command(state,'p0',1,'FLIP_CARD',{cardIid:source.iid}),{playerId:'p0'});
  assert.equal(result.ok,true);
  assert.equal(result.prompt?.type,'REACTION',id+' offers suppression on entry');
  result=reduceCommand(result.state,command(result.state,'p1',2,'ANSWER_PROMPT',{promptId:result.prompt.promptId,choice:'SUPPRESS',reactionIid:reactor.iid}),{playerId:'p1'});
  assert.equal(result.ok,true);
  assert(result.state.board[0][2][1].statuses.includes('EFFECTS_SUPPRESSED'),id+' stays suppressed');
}
{
  const {state}=sourceFixture('bh18');
  const deckSize=state.players[1].deck.length;
  const result=reduceCommand(state,command(state,'p0',1,'END_TURN',{}),{playerId:'p0'});
  assert.equal(result.ok,true);
  assert(!result.events.some(e=>e.type==='CARD_DISCARDED'&&e.reason==='GENESIS_OF_ALL_INCELDOM'));
}

console.log('expanded Havano source coverage smoke test passed');

// Makenna's protection must not offer Havano.
for(const sourceId of ['03','05','12','40','73','76','77','80','82','bh05','bh20']){
  const value=sourceFixture(sourceId);
  const type=value.timing==='ACTIVATE'?'ACTIVATE_EFFECT':'FLIP_CARD';
  const payload=value.timing==='ACTIVATE'?{sourceIid:value.source.iid,userActivated:true}:{cardIid:value.source.iid};
  const result=reduceCommand(value.state,command(value.state,'p0',1,type,payload),{playerId:'p0'});
  assert.equal(result.ok,true,sourceId+': '+JSON.stringify(result.rejection));
  assert.notEqual(result.prompt?.type,'REACTION',sourceId+' must not offer Havano for a friendly setup effect');
}
{
  const value=sourceFixture('49','67');
  const result=reduceCommand(value.state,command(value.state,'p0',1,'FLIP_CARD',{cardIid:value.source.iid}),{playerId:'p0'});
  assert.equal(result.ok,true);
  assert.notEqual(result.prompt?.type,'REACTION','Secules cannot negate Irvine passive entry');
}

const core=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
function functionSource(name){
 const start=core.indexOf('function '+name+'(');
 const next=core.indexOf('\nfunction ',start+1);
 return core.slice(start,next<0?undefined:next);
}
const metadata=require('../../src/scripts/02-effect-rule-metadata.js');
for(const owner of [0,1]){
 const opponent=1-owner;
 const game={currentPlayer:owner,players:[{hand:[]},{hand:[]} ]};
 game.players[opponent].hand=[{id:'79',owner:opponent}];
 let board=[];
 const sandbox=vm.createContext({G:game,window:{FateEffectRuleMetadata:metadata},pressureCardReworkTimingActive:()=>false,isPersistentSupporterEffectOnSet:()=>false,isEffectImmuneSource:()=>false,isSupporterEffectSuppressed:()=>false,isFaceDownCard:()=>false,hasAuthoritativeWhenSetEffect:card=>cardRule(card.id)?.timings?.includes('WHEN_SET'),forEachBoardCard:callback=>board.forEach(callback)});
 vm.runInContext(['isHavanoReactionSource','getSupporterEffectAffectedOwners','getCharacterEffectAffectedOwners','checkReactions'].map(functionSource).join('\n'),sandbox);
 for(const id of ['03','05','12','40','73','76','77','80','82','bh05','bh20']){
  const definition=DEFINITIONS.find(card=>card.id===id);
  const card={...definition,owner};
  const owners=definition.type==='Supporter'?sandbox.getSupporterEffectAffectedOwners(card,0,0,0,owner,opponent):sandbox.getCharacterEffectAffectedOwners(card,0,0,0,owner,opponent);
  const data={card,sourceOwner:owner,affectedOwners:owners};
  assert.equal(sandbox.isHavanoReactionSource(data),false,id+' browser should not trigger Havano before an enemy target');
  assert.equal(await sandbox.checkReactions('supporter_effect',data),true);
 }
 for(const id of ['31']) assert.equal(sandbox.isHavanoReactionSource({card:{id,owner},sourceOwner:owner,affectedOwners:[opponent]}),true,id+' enemy target should trigger Havano');
 board=[{id:'67',owner:opponent,usesLeft:1}];
 game.players[opponent].hand=[];
 assert.equal(await sandbox.checkReactions('supporter_effect',{card:{id:'49',type:'Supporter',owner},sourceOwner:owner}),true,'browser Secules cannot react to Irvine passive');
}
console.log('Havano false-trigger and Secules passive-entry regressions passed in both engines.');

// Positive Fate buffs remain non-reactable even if an opposing card is selected.
for(const sourceId of ['03','05']){
 const value=sourceFixture(sourceId);
 let result=reduceCommand(value.state,command(value.state,'p0',1,sourceId==='03'?'ACTIVATE_EFFECT':'FLIP_CARD',sourceId==='03'?{sourceIid:value.source.iid}:{cardIid:value.source.iid}),{playerId:'p0'});
 assert.equal(result.ok,true);
 assert.equal(result.prompt?.type,'BOARD_TARGET');
 result=reduceCommand(result.state,command(result.state,'p0',2,'ANSWER_PROMPT',{promptId:result.prompt.promptId,selectedIid:value.state.board[0][1][1].iid}),{playerId:'p0'});
 assert.equal(result.ok,true);
 assert.notEqual(result.prompt?.type,'REACTION');
}
for(const sourceId of ['17','31','34','62','64','81','bh21']){
 const value=sourceFixture(sourceId);
 value.state.gameSettings={...(value.state.gameSettings||{}),pressureCardReworks:true};
 const result=reduceCommand(value.state,command(value.state,'p0',1,'FLIP_CARD',{cardIid:value.source.iid}),{playerId:'p0'});
 assert.equal(result.ok,true,sourceId);
 assert.equal(result.prompt?.type,'REACTION',sourceId+' retains its valid Havano reaction');
}
console.log('Howard target choice and preserved Havano triggers passed.');

const copySource=core.slice(core.indexOf('async function resolveTaylorCopiedEffect('),core.indexOf('window.resolveTaylorCopiedEffect'));
for(const id of ['12','31','bh21']){
 const selected=DEFINITIONS.find(card=>card.id===id);
 const taylor={id:'bh05',type:'Initiator',owner:0};
 const game={turn:10,_suppressEffectPrompt:false};
 const eligible=[];
 let executions=0;
 const sandbox=vm.createContext({G:game,window:{FateEffectRuleMetadata:metadata},liveTaylorCopySource:c=>c,isTaylorCopyAvailable:()=>true,INITIAL_SET_INITIATOR_IDS:new Set(),WHEN_SET_IDS:new Set(),runWhenSetEffect:async()=>{executions++;},triggerCharacterEffect:async()=>{executions++;},toast:()=>{},renderEffectResolutionForPlayer:()=>{}});
 vm.runInContext(functionSource('isHavanoReactionSource')+functionSource('getCharacterEffectAffectedOwners'),sandbox);
 sandbox.checkReactions=async(type,data)=>{const active=sandbox.isHavanoReactionSource(data);eligible.push(active);assert.equal(data.lydiaEligible,false,'copy must not duplicate Lydia window');return !active;};
 vm.runInContext(copySource,sandbox);
 await sandbox.resolveTaylorCopiedEffect(taylor,0,2,0,selected);
 assert.deepEqual(eligible,[id!=='12'],'Taylor follows the copied effect');
 assert.equal(executions,id==='12'?1:0,'negated copied effects do not execute');
 assert.equal(taylor.id,'bh05','Taylor identity restored');
 assert.equal(game._suppressEffectPrompt,false,'prompt guard restored');
}
{
 const boleslaw={id:'86',iid:'boleslaw',owner:1,currentFate:2};
 const game={board:[[[boleslaw]]]};
 let data;
 const sandbox=vm.createContext({G:game,getReadyBoleslawSearchReactions:()=>[{card:boleslaw,z:0,r:0,c:0,owner:1}],checkReactions:async(type,value)=>{data=value;return true;},drawCard:async()=>{},toast:()=>{},log:()=>{},renderEffectResolutionForPlayer:()=>{}});
 const source=core.slice(core.indexOf('async function resolveBoleslawOpponentSearch('),core.indexOf('function resolveBoleslawAfterSearchSelection('));
 vm.runInContext(source,sandbox);
 await sandbox.resolveBoleslawOpponentSearch(0);
 assert.deepEqual(Array.from(data.affectedOwners),[1],'Boleslaw affects its controller, not the searching opponent');
 assert.equal(boleslaw.currentFate,4);
}
console.log('Copied-effect eligibility and Boleslaw owner regression checks passed.');

for(const id of ['12','31','bh21','35']){
 const value=sourceFixture('bh05');
 value.state.gameSettings={pressureCardReworks:true};
 const selected=value.state.players[0].hand.find(card=>card.id==='32');
 const def=DEFINITIONS.find(card=>card.id===id);
 Object.assign(selected,{id,type:def.type,name:def.name});
 let result=reduceCommand(value.state,command(value.state,'p0',1,'FLIP_CARD',{cardIid:value.source.iid}),{playerId:'p0'});
 assert.equal(result.ok,true);
 assert.equal(result.prompt?.type,'CARD_SELECTION');
 result=reduceCommand(result.state,command(result.state,'p0',2,'ANSWER_PROMPT',{promptId:result.prompt.promptId,selectedIid:selected.iid}),{playerId:'p0'});
 assert.equal(result.ok,true,JSON.stringify(result.rejection));
 assert.equal(result.prompt?.type==='REACTION',id!=='12','multiplayer Taylor copying '+id+' uses copied Havano eligibility');
 if(id!=='12') assert(result.prompt.options.every(option=>option.kind==='HAVANO'),'no repeated Lydia/Secules window');
}
console.log('Multiplayer Taylor copied-effect Havano windows passed.');

// Secules timing and source availability matrix.
for(const sourceId of ['24','44','49','53','59','63','73','92','95','20','26','93','32','64','03','27','08','81']){
 const value=sourceFixture(sourceId,'67');
 value.state.gameSettings={pressureCardReworks:true};
 const rule=cardRule(sourceId,value.state);
 const timing=rule.timings.includes('ACTIVATE')?'ACTIVATE':'WHEN_SET';
 value.source.faceDown=timing!=='ACTIVATE';
 const expected=value.source.type==='Initiator'||(value.source.type==='Supporter'&&rule.timings.includes('WHEN_SET'));
 const result=reduceCommand(value.state,command(value.state,'p0',1,timing==='ACTIVATE'?'ACTIVATE_EFFECT':'FLIP_CARD',timing==='ACTIVATE'?{sourceIid:value.source.iid,userActivated:true}:{cardIid:value.source.iid}),{playerId:'p0'});
 assert.equal(result.ok,true,sourceId+': '+JSON.stringify(result.rejection));
 assert.equal(result.prompt?.options?.some(option=>option.kind==='SECULES')||false,expected,'Secules timing for '+sourceId);
}
for(const unavailable of ['faceDown','suppressed','spent']){
 const value=sourceFixture('32','67');
 if(unavailable==='faceDown')value.reactor.faceDown=true;
 if(unavailable==='suppressed')value.reactor.statuses=['EFFECTS_SUPPRESSED'];
 if(unavailable==='spent')value.reactor.counters.reactionUses=1;
 const result=reduceCommand(value.state,command(value.state,'p0',1,'FLIP_CARD',{cardIid:value.source.iid}),{playerId:'p0'});
 assert.equal(result.ok,true);
 assert.equal(result.prompt?.options?.some(option=>option.kind==='SECULES')||false,false,unavailable+' Secules cannot react');
}
{
 const start=core.indexOf('function checkReactions('),end=core.indexOf('    if(reactions.length === 0)',start);
 const picker=core.slice(start,end)+'    resolve(reactions); }); }';
 let reactor={id:'67',owner:1,usesLeft:1};
 const sandbox=vm.createContext({G:{currentPlayer:0,players:[{hand:[]},{hand:[]}]},window:{},isEffectImmuneSource:()=>false,isFaceDownCard:card=>!!card.faceDown,isCardEffectSuppressed:card=>!!card.suppressed,isHavanoReactionSource:()=>false,forEachBoardCard:fn=>fn(reactor,0,0,0),hasAuthoritativeWhenSetEffect:card=>cardRule(card.id,{gameSettings:{pressureCardReworks:true}})?.timings.includes('WHEN_SET')});
 vm.runInContext(picker,sandbox);
 for(const [id,type,expected] of [['49','supporter_effect',false],['24','supporter_effect',false],['32','supporter_effect',true],['26','activated_supporter_effect',false],['93','activated_supporter_effect',false],['08','when_set_effect',true],['12','when_set_effect',false],['03','initiator_effect',true]]){
  const card=DEFINITIONS.find(c=>c.id===id);
  const options=await sandbox.checkReactions(type,{card:{...card,owner:0},sourceOwner:0});
  assert.equal(options.some(option=>option.type==='secules'),expected,'browser Secules '+id+'/'+type);
 }
 for(const flag of ['faceDown','suppressed']){
  reactor={id:'67',owner:1,usesLeft:1,[flag]:true};
  assert.equal((await sandbox.checkReactions('supporter_effect',{card:{id:'32',owner:0},sourceOwner:0})).length,0,'browser '+flag+' Secules');
 }
}
console.log('Secules timing and unavailable-reactor matrices passed in both engines.');
