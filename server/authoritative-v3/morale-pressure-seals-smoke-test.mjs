import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyOperation,
  calculateMoraleOutcome,
  cardRule,
  createInitialState,
  reduceCommand,
  recordMoralePressureRuleEvent,
  resolveMoralePressureCycle,
  zoneScore
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const definitions = [
  {id:'init', name:'Initiator', type:'Initiator', aff:'reality', fate:6, cost:1},
  {id:'down', name:'Dauntless', type:'Dauntless', aff:'eventide', fate:9, cost:1},
  {id:'support', name:'Known Supporter', type:'Supporter', aff:'expanded_worlds', fate:2, cost:0}
];

const experimental = createInitialState({
  matchId:'morale-pressure-smoke',
  seed:'morale-pressure-smoke',
  players:[
    {id:'p0', name:'P0', deckIds:['init']},
    {id:'p1', name:'P1', deckIds:['down']}
  ],
  cardDefinitions:definitions,
  handSize:1,
  activePlayer:0,
  gameSettings:{
    healthPressureSeals:true,
    pressureCardReworks:false,
    zoneControlRework:true,
    expandedContestedRow:true
  }
});
const ctx = {state:experimental, events:[], ruleEvents:[]};
assert.equal(experimental.moralePressure.maxMorale, 200);
assert.deepEqual(experimental.moralePressure.morale, [200, 200]);

const initiator = experimental.players[0].hand[0];
applyOperation(ctx, {
  type:'SET_CARD', playerIndex:0, cardIid:initiator.iid,
  destination:{z:0,r:2,c:0}, playedFromHand:true
});
recordMoralePressureRuleEvent(ctx, {type:'EFFECT_ACTIVATED', sourceIid:initiator.iid});
assert.equal(experimental.moralePressure.pressure[0], 0, 'Morale mode does not generate Pressure');

const dauntless = experimental.players[1].hand[0];
applyOperation(ctx, {
  type:'SET_CARD', playerIndex:1, cardIid:dauntless.iid,
  destination:{z:0,r:0,c:0}, playedFromHand:true
});
assert.equal(experimental.moralePressure.pressure[1], 0, 'card types do not generate Pressure');

experimental.turn = 2;
resolveMoralePressureCycle(ctx);
assert.deepEqual(experimental.moralePressure.morale, [200, 200], 'Morale damage does not begin before Turn 4');
experimental.turn = 4;
resolveMoralePressureCycle(ctx);
assert.deepEqual(experimental.moralePressure.morale, [199, 200], 'half of the three-point zone Fate deficit, rounded down, deals one Morale damage');
assert(ctx.events.some(event=>event.type === 'MORALE_DAMAGED' && event.playerIndex === 0 && event.amount === 1));
assert(ctx.events.some(event=>event.type === 'MORALE_CYCLE_RESOLVED' && event.damage[0] === 1));

const rozsiDefinitions = [
  {id:'34',name:'Rozsi Szocs',type:'Coordinator',aff:'third_great_war',fate:3,cost:2},
  {id:'match-a',name:'Reality A',type:'Supporter',aff:'reality',fate:1,cost:0},
  {id:'match-b',name:'Reality B',type:'Initiator',aff:'reality',fate:3,cost:1},
  {id:'off-aff',name:'Eventide Card',type:'Supporter',aff:'eventide',fate:1,cost:0}
];
const rozsiState = createInitialState({
  matchId:'rozsi-morale-contributors-smoke',seed:'rozsi-morale-contributors-smoke',
  players:[{id:'p0',deckIds:['34','match-a','match-b','off-aff']},{id:'p1',deckIds:[]}],
  cardDefinitions:rozsiDefinitions,handSize:4,activePlayer:0,
  gameSettings:{healthPressureSeals:true,pressureCardReworks:true,zoneControlRework:true,expandedContestedRow:true}
});
const rozsiCtx = {state:rozsiState,events:[],ruleEvents:[]};
const rozsiDestinations=[{z:0,r:2,c:0},{z:0,r:2,c:1},{z:0,r:2,c:2},{z:0,r:1,c:0}];
for(const [index,id] of ['34','match-a','match-b','off-aff'].entries()){
  const card=rozsiState.players[0].hand.find(candidate=>candidate.id===id);
  applyOperation(rozsiCtx,{type:'SET_CARD',playerIndex:0,cardIid:card.iid,destination:rozsiDestinations[index],playedFromHand:true});
}
const rozsiCard=rozsiState.board[0][2][0];
rozsiCard.counters.moraleAffiliation='reality';
rozsiState.turn=4;
resolveMoralePressureCycle(rozsiCtx);
const rozsiSource=rozsiCtx.events.find(event=>event.type==='MORALE_CYCLE_RESOLVED')
  ?.moraleDamageSources?.flat().find(source=>source.sourceIid===rozsiCard.iid);
assert(rozsiSource,'Rozsi must be recorded as a Morale calculation source');
assert.equal(rozsiSource.amount,4,'Rozsi must inflict 2 Morale Damage for each of the two matching-affiliation contributors');
assert.deepEqual(
  new Set(rozsiSource.affectedIids),
  new Set([rozsiState.board[0][2][1].iid,rozsiState.board[0][2][2].iid]),
  'Rozsi must identify every matching-affiliation contributor and exclude other cards'
);

const lowMorale = createInitialState({
  matchId:'morale-20-discard-smoke',
  seed:'morale-20-discard-smoke',
  players:[
    {id:'p0',name:'P0',deckIds:['init','down','support']},
    {id:'p1',name:'P1',deckIds:['init','down','support']}
  ],
  cardDefinitions:definitions,
  handSize:3,
  activePlayer:0,
  gameSettings:{healthPressureSeals:true,pressureCardReworks:false,zoneControlRework:true,expandedContestedRow:true}
});
const fieldCard = lowMorale.players[0].hand.find(card=>card.id === 'init');
applyOperation({state:lowMorale,events:[],ruleEvents:[]},{
  type:'SET_CARD',playerIndex:0,cardIid:fieldCard.iid,destination:{z:0,r:2,c:0},playedFromHand:true
});
lowMorale.moralePressure.morale[0] = 40;
assert.equal(zoneScore(lowMorale,0,0),6,'20% Morale no longer reduces zone Fate');
const handBeforePenalty = lowMorale.players[0].hand.map(card=>card.iid);
const lowResult = reduceCommand(lowMorale,command(lowMorale,'p0',1,'END_TURN'),{playerId:'p0'});
assert.equal(lowResult.ok,true);
assert.equal(lowResult.state.players[0].hand.length,handBeforePenalty.length-1,'20% Morale discards exactly one hand card at turn end');
const moraleDiscardEvent = lowResult.events.find(event=>event.type === 'MORALE_20_HAND_DISCARDED');
assert(moraleDiscardEvent,'20% Morale emits a dedicated presentation event');
assert(handBeforePenalty.includes(moraleDiscardEvent.cardIid),'the discarded card is chosen from the ending player hand');
assert.notEqual(moraleDiscardEvent.cardName,'Card','the public event names the discarded card');
assert(lowResult.events.some(event=>
  event.type === 'CARD_DISCARDED'
  && event.reason === 'MORALE_20_RANDOM_HAND_DISCARD'
  && event.cardName === moraleDiscardEvent.cardName
),'the underlying discard is revealed and auditable');

const aboveThreshold = createInitialState({
  matchId:'morale-above-20-smoke',seed:'morale-above-20-smoke',
  players:[{id:'p0',deckIds:['init','down']},{id:'p1',deckIds:['init','down']}],
  cardDefinitions:definitions,handSize:2,activePlayer:0,
  gameSettings:{healthPressureSeals:true,pressureCardReworks:false,zoneControlRework:true,expandedContestedRow:true}
});
aboveThreshold.moralePressure.morale[0] = 41;
const aboveHandSize = aboveThreshold.players[0].hand.length;
const aboveResult = reduceCommand(aboveThreshold,command(aboveThreshold,'p0',1,'END_TURN'),{playerId:'p0'});
assert.equal(aboveResult.state.players[0].hand.length,aboveHandSize,'Morale above 20% does not trigger the random discard');
assert(!aboveResult.events.some(event=>event.type === 'MORALE_20_HAND_DISCARDED'));

experimental.moralePressure.morale[0] = 0;
assert.equal(calculateMoraleOutcome(experimental).winner, 1, 'zero Morale immediately loses');

const classic = createInitialState({
  matchId:'classic-rules-smoke',
  seed:'classic-rules-smoke',
  players:[{id:'p0',deckIds:['init']},{id:'p1',deckIds:['down']}],
  cardDefinitions:definitions,
  handSize:1,
  gameSettings:{healthPressureSeals:false,pressureCardReworks:false,zoneControlRework:false}
});
assert.equal(classic.moralePressure, undefined, 'Morale/Pressure remains fully reversible');

const zoneOnly = createInitialState({
  matchId:'zone-only-smoke',
  seed:'zone-only-smoke',
  players:[{id:'p0',deckIds:['init']},{id:'p1',deckIds:['down']}],
  cardDefinitions:definitions,
  handSize:1,
  gameSettings:{healthPressureSeals:false,pressureCardReworks:false,zoneControlRework:true,expandedContestedRow:true}
});
assert.equal(zoneOnly.moralePressure, undefined, 'zone-control geometry does not mount Morale, Pressure, or Seals');
assert.equal(zoneOnly.maxTurns, 24, 'the independent zone-control rework retains the 24-turn match');

assert(!cardRule('03', {gameSettings:{pressureCardReworks:false}}).operations.includes('MODIFY_PRESSURE'));
assert(!cardRule('03', {gameSettings:{pressureCardReworks:true}}).operations.includes('MODIFY_PRESSURE'), 'the Morale card flag no longer rewrites unrelated cards into Pressure effects');
assert(!cardRule('03').operations.includes('MODIFY_PRESSURE'), 'omitting the experimental flag always selects the original card effect');
assert(cardRule('20', {gameSettings:{pressureCardReworks:true}}).timings.includes('WHEN_SET'), 'the Morale rework flag selects the new South Wind Spearman effect');
for(const legacyOnlyId of ['10','41','87','bh19']){
  assert.deepEqual(
    cardRule(legacyOnlyId, {gameSettings:{pressureCardReworks:true}}),
    cardRule(legacyOnlyId, {gameSettings:{pressureCardReworks:false}}),
    `the reversible card flag must not alter legacy-only card ${legacyOnlyId}`
  );
}
assert(cardRule('bh19', {gameSettings:{pressureCardReworks:false}}).timings.includes('WHEN_SET'), 'Abed remains an automatic when-set effect with the experiment off');

const moraleUiSource = fs.readFileSync(path.resolve('src/scripts/27-morale-pressure-ui.js'),'utf8');
assert(moraleUiSource.includes("if(type === 'MORALE_20_HAND_DISCARDED')"),'the morale UI presents the discard event');
assert(moraleUiSource.includes('function resolveLegacyMoraleLowHandDiscard'),'legacy AI matches use the same 20% random-discard rule');
assert(moraleUiSource.includes('was randomly discarded from your hand'),'the notification banner identifies the discarded card');
assert(moraleUiSource.includes('discard 1 random card from your hand'),'the 20% tooltip documents the replacement rule');
assert(!moraleUiSource.includes('Your Fate total in every zone is reduced by 25%.'),'the retired 20% Fate penalty copy is removed');
assert(moraleUiSource.includes('damage[result.damagedPlayer]+=Math.floor(result.difference/2)'),'legacy Morale calculations halve each zone Fate difference and round down');
assert(moraleUiSource.includes('half the Fate difference is dealt as Morale damage (rounded down)'),'the Morale tooltip documents half-difference damage');
assert(!moraleUiSource.includes('Add the Fate deficits from every zone you do not control.'),'the full-difference Morale tooltip is removed');

console.log('authoritative-v3 reversible Morale-only and classic-card smoke test passed');
