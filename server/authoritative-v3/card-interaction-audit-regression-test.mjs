import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as E from '../../shared/engine/index.mjs';
import {eligibleCardTargets} from '../../shared/engine/prompts.mjs';
import catalog from '../fate-card-catalog.js';

const definitions = catalog.getCardCatalog().cards;
let sequence = 0;
function fixture(ids, opponents = [], settings = {}){
  return E.createInitialState({matchId:`interaction-${++sequence}`, seed:'interaction-audit', handSize:12,
    cardDefinitions:definitions, gameSettings:settings,
    players:[{id:'p0', deckIds:ids}, {id:'p1', deckIds:opponents}]});
}
function take(state, id, player = 0){
  for(const pile of ['hand', 'deck', 'discard']){
    const cards = state.players[player][pile];
    const index = cards.findIndex(card=>card.id === id);
    if(index >= 0) return cards.splice(index, 1)[0];
  }
  throw new Error(`missing card ${id}`);
}
function place(state, id, z = 0, r = 2, c = 0, player = 0){
  const card = take(state, id, player);
  state.board[z][r][c] = card;
  return card;
}
function context(state){return {state, events:[], ruleEvents:[]};}
function command(state, type, payload, player = 0){
  const result = E.reduceCommand(state, {commandId:`audit-${++sequence}`, matchId:state.matchId,
    expectedRevision:state.revision, type, payload}, {playerIndex:player});
  assert.equal(result.ok, true, JSON.stringify(result.rejection));
  return result;
}
function answer(state, values, player = 0){
  return command(state, 'ANSWER_PROMPT', {promptId:state.pendingPrompt.promptId, ...values}, player);
}

// Actual canonical instance IDs contain colons. Marks must retain the correct owner.
for(const owner of [0, 1]){
  const state = fixture(['52', '05', '32'], ['52', '05', '32']);
  const source = place(state, '52', 0, owner === 0 ? 2 : 0, 0, owner);
  const target = place(state, '05', 0, owner === 0 ? 0 : 2, 0, 1 - owner);
  const ctx = context(state);
  E.applyOperation(ctx, {type:'CREATE_CARD_MARK', targetIid:target.iid, sourceIid:source.iid, sourceController:owner});
  const before = state.players.map(player=>player.hand.length);
  E.applyOperation(ctx, {type:'DISCARD_CARD', targetIid:target.iid, sourceIid:source.iid, sourceController:owner});
  assert.equal(state.players[owner].hand.length, before[owner]);
  assert.equal(state.players[1-owner].hand.length, before[1-owner] - 1);
}

// Abed must amplify ordinary permanent gains, including effects without bespoke flags.
{
  let state = fixture(['bh19', '05', '23']);
  const abed = place(state, 'bh19');
  const target = place(state, '23', 0, 2, 1);
  state.statuses.push({statusId:'abed', type:'PERMANENT_FATE_GAIN_POTENCY', playerIndex:0,
    sourceIid:abed.iid, remainingOwnerTurns:1});
  const supporter = state.players[0].hand.find(card=>card.id === '05');
  state = command(state, 'SET_CARD', {cardIid:supporter.iid, destination:{z:0,r:2,c:2}}).state;
  state = answer(state, {selectedIids:[target.iid]}).state;
  assert.equal(E.findBoardCard(state, target.iid).card.currentFate, target.currentFate + 6);
}
{
  const state = fixture(['01', '05']);
  place(state, '01');
  const target = place(state, '05', 0, 2, 1);
  const before = E.effectiveFate(state, target);
  assert.equal(before, 5);
  E.applyOperation(context(state), {type:'MODIFY_FATE', targetIid:target.iid, sourceController:0, multiplier:2, amount:5});
  assert.equal(E.effectiveFate(state, target), 15);
}

// All three triggered Coordinators obey suppression.
for(const id of ['bh02', '15', 'bh08']){
  const state = fixture([id, '01'], ['05']);
  const source = place(state, id);
  source.statuses.push('EFFECTS_SUPPRESSED');
  const target = place(state, '01', 0, 2, 1);
  const opponent = place(state, '05', 0, 0, 0, 1);
  const before = target.currentFate;
  const event = id === 'bh02' ? {type:'DRAW_EFFECT_ACTIVATED', playerIndex:0}
    : id === '15' ? {type:'CARD_SET', playerIndex:0, cardIid:target.iid}
      : {type:'EFFECT_REACTED', mode:'SUPPRESS', playerIndex:0, sourceIid:opponent.iid};
  E.emitRuleEvent(context(state), event);
  assert.equal(target.currentFate, before, `${id} cannot proc while suppressed`);
}

// Effective types drive effect triggers, independently from ordinary set limits.
for(const mode of ['chloe', 'blame-game', 'printed']){
  const state = fixture(['15', '05']);
  place(state, '15');
  const card = state.players[0].hand.find(item=>item.id === '05');
  const ctx = context(state);
  if(mode === 'chloe') E.applyOperation(ctx, {type:'CHANGE_CARD_TYPE', playerIndex:0, targetIid:card.iid, cardType:'Coordinator'});
  if(mode === 'blame-game') state.statuses.push({statusId:'types', type:'SUPPORTERS_AS_CHARACTERS', playerIndex:0, remainingTargetTurns:5});
  state.statuses.push({statusId:'ballad', type:'CONSOLIDATION_FATE_BONUS', playerIndex:0, value:3});
  E.applyOperation(ctx, {type:'SET_CARD', playerIndex:0, cardIid:card.iid, destination:{z:0,r:2,c:1}});
  assert.equal(state.statuses.some(status=>status.statusId === 'ballad'), mode !== 'printed');
  assert.equal(card.currentFate, mode === 'chloe' ? 2 : 1);
}

// Copy selection honors timing and includes passive-only effects.
{
  const state = fixture(['bh05', '01', 'bh06', 'bh25']);
  const taylor = place(state, 'bh05');
  const filter = E.cardRule('bh05').program[0].filter;
  const frame = {sourceIid:taylor.iid, controller:0, locals:{}};
  let eligible = eligibleCardTargets(state, frame, filter);
  assert.ok(eligible.includes(state.players[0].hand.find(card=>card.id === '01').iid));
  assert.ok(!eligible.includes(state.players[0].hand.find(card=>card.id === 'bh06').iid));
  state.turn = 6;
  eligible = eligibleCardTargets(state, frame, filter);
  assert.ok(eligible.includes(state.players[0].hand.find(card=>card.id === 'bh06').iid));
}
{
  const state = fixture(['bh05', '05']);
  const taylor = place(state, 'bh05');
  taylor.counters.copiedPassiveId = '02';
  const card = state.players[0].hand.find(item=>item.id === '05');
  E.applyOperation(context(state), {type:'SET_CARD', playerIndex:0, cardIid:card.iid, destination:{z:0,r:2,c:1}});
  assert.equal(card.currentFate, 5);
}
{
  const state = fixture(['37']);
  const fusiliers = place(state, '37');
  fusiliers.counters.copiedPassiveId = '95';
  const ctx = context(state);
  E.emitRuleEvent(ctx, {type:'TURN_STARTED', playerIndex:0});
  E.emitRuleEvent(ctx, {type:'TURN_STARTED', playerIndex:1});
  assert.equal(fusiliers.currentFate, fusiliers.baseFate + 1);
}

for(const id of ['99', '100']){
  const state = fixture([id, '05', '01']);
  const supporter = place(state, '05');
  const character = place(state, '01', 0, 2, 1);
  const target = state.players[0].hand.find(card=>card.id === id);
  assert.equal(E.canUseAsConsolidationTribute(state, E.findBoardCard(state, supporter.iid), 0, target).ok, false);
  assert.equal(E.canUseAsConsolidationTribute(state, E.findBoardCard(state, character.iid), 0, target).ok, true);
  state.statuses.push({statusId:'types', type:'SUPPORTERS_AS_CHARACTERS', playerIndex:0, remainingTargetTurns:5});
  assert.equal(E.canUseAsConsolidationTribute(state, E.findBoardCard(state, supporter.iid), 0, target).ok, true);
}
{
  const state = fixture(['99', '15']);
  const relative = place(state, '15');
  const card = state.players[0].hand.find(item=>item.id === '99');
  const option = E.legalCommandTemplates(state, 0).find(item=>item.type === 'CONSOLIDATE_CARD'
    && item.payload.cardIid === card.iid && item.payload.tributeIids.length === 0);
  assert.ok(option, 'zero-cost Youth must offer an empty-square consolidation');
  const result = command(state, option.type, option.payload);
  assert.ok(E.findBoardCard(result.state, relative.iid), 'no card was sacrificed');
  assert.ok(E.findBoardCard(result.state, card.iid));
  assert.equal(result.state.players[0].discard.length, 0);
}

// Free consolidations preserve Visegrad's counter but trigger Marie, Jakob and Ballad.
for(const sourceId of ['08', '84']){
  let state = fixture([sourceId, '23', '88', 'bh17', '09', '05'], ['36']);
  const first = place(state, '09');
  const second = place(state, '05', 0, 2, 1);
  place(state, 'bh17', 2, 2, 0);
  place(state, '36', 1, 0, 0, 1);
  const selected = take(state, sourceId === '08' ? '23' : '88');
  state.players[0].deck.push(selected);
  const source = state.players[0].hand.find(card=>card.id === sourceId);
  state = command(state, 'CONSOLIDATE_CARD', {cardIid:source.iid,
    tributeIids:[first.iid, second.iid], destination:{z:0,r:2,c:0}}).state;
  state = answer(state, {selectedIids:[selected.iid]}).state;
  state.statuses.push({statusId:'tax', type:'CONSOLIDATION_COST_MODIFIER', playerIndex:0, value:1, remaining:2});
  state.statuses.push({statusId:'ballad', type:'CONSOLIDATION_FATE_BONUS', playerIndex:0, value:3});
  const result = answer(state, {destination:{z:1,r:2,c:0}});
  assert.equal(result.state.statuses.find(status=>status.statusId === 'tax').remaining, 2);
  assert.ok(result.events.some(event=>event.type === 'CARD_CONSOLIDATED' && event.cost === 0));
  assert.ok(result.events.some(event=>event.reason === 'CRUSHING_MOMENTUM'));
  assert.ok(result.events.some(event=>event.reason === 'KVETKA_BALLAD_CONSOLIDATION'));
  assert.ok(result.state.statuses.some(status=>status.reason === 'MARIE_DETERRANCE'));
}
{
  const state = fixture(['45', '23']);
  place(state, '45');
  const character = state.players[0].hand.find(card=>card.id === '23');
  assert.throws(()=>E.applyOperation(context(state), {type:'SET_CARD', playerIndex:0, cardIid:character.iid,
    destination:{z:0,r:2,c:1}, consolidated:true}), error=>error.code === 'CHINGACHLOOK_ZONE_RESTRICTED');
}

for(const pressureCardReworks of [false, true]){
  const state = fixture(['34'], [], {healthPressureSeals:true, pressureCardReworks, zoneControlRework:true});
  state.turn = 4;
  state.landscapeId = 'igb1';
  const rozsi = place(state, '34');
  rozsi.counters.moraleAffiliation = rozsi.affiliation;
  E.resolveMoralePressureCycle(context(state));
  assert.equal(state.moralePressure.morale[1], 198);
}

// The retired Great Oak +3 must remain disabled.
{
  const state = fixture(['48', '47']);
  const tribute = place(state, '47');
  const character = state.players[0].hand.find(card=>card.id === '48');
  E.applyOperation(context(state), {type:'CONSOLIDATE_CARD', playerIndex:0, cardIid:character.iid,
    tributeIids:[tribute.iid], destination:{z:0,r:2,c:0}});
  assert.equal(character.currentFate, character.baseFate);
}
// Exercise the local AI placement path with the real Marie/Jakob handlers.
const coreSource = fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const aiSource = fs.readFileSync(new URL('../../src/scripts/07-ai.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
function legacyFunction(source, name){
  const match = new RegExp('(?:async )?function ' + name + '\\(').exec(source);
  assert.ok(match, name);
  return source.slice(match.index, source.indexOf('\n}\n', match.index) + 3);
}
for(const player of [0, 1]){
  const card = {id:'23', iid:'free-character', owner:player, type:'Initiator', fate:2};
  const board = Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array(4).fill(null)));
  const row = player === 0 ? 2 : 0;
  board[0][2-row][0] = {id:'36', iid:'marie', owner:1-player};
  board[1][row][0] = {id:'bh17', iid:'jakob', owner:player};
  const g = {currentPlayer:player, aiPlayer:player, turn:6, board, fateModifiers:{},
    players:[{hand:[]}, {hand:[]}], _linaFreeIids:new Set([card.iid]), taxRemaining:2};
  g.players[player].hand.push(card);
  const context = vm.createContext({G:g, Set, Number, String, Array, Object, Math,
    AI_VISUAL_PAUSE_PLACE:0, newInstance:card=>({...card}), getPlacedCardFate:card=>card.fate,
    isCardSupporterForRules:card=>card.type === 'Supporter',
    isFaceDownCard:card=>card.faceDown === true, isCardEffectSuppressed:()=>false,
    cardActsAsPassive:(card,id)=>card.id === id,
    forEachBoardCard:callback=>board.forEach((zone,z)=>zone.forEach((row,r)=>row.forEach((card,c)=>{if(card)callback(card,z,r,c);}))),
    getZoneScore:(z,owner)=>owner === player ? 10 : 0,
    applyPairedOverlayFateGain:(card,amount)=>{card.currentFate += amount;},
    consumePendingPlacementFlags:()=>{}, log:()=>{}, toast:()=>{}, flashCardEffect:()=>{},
    playCardSetAudio:()=>{}, renderBoardActionForPlayer:()=>{},
    resolveSetCardAfterPlacement:async()=>{}, aiSleep:async()=>{},
    consumeAdministrativeBloatForPlayer:()=>{g.taxRemaining--;}
  });
  context.window = context;
  for(const name of ['applyMarieDeterranceForConsolidation','applyCrushingMomentumAfterConsolidation']){
    vm.runInContext(legacyFunction(coreSource,name),context);
  }
  vm.runInContext(legacyFunction(aiSource,'aiDoPlace'), context);
  await context.aiDoPlace({card,z:0,r:row,c:1});
  const placed = board[0][row][1];
  assert.equal(placed._wasConsolidated, true);
  assert.equal(placed.currentFate, 5, 'local free Character receives Jakob bonus');
  assert.equal(g.fateModifiers.deterrance_z0, -4, 'local free Character triggers Marie');
  assert.equal(g.taxRemaining, 2, 'local free Character preserves Visegrad uses');
  assert.equal(g.players[player].hand.length, 0);
}
console.log('Card interaction audit regressions passed.');
