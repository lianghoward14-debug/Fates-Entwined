import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInitialState, legalCommandTemplates, reduceCommand} from '../../shared/engine/index.mjs';
import {effectiveFate} from '../../shared/engine/modifiers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rooms = fs.readFileSync(path.join(ROOT, 'src/scripts/18-online-rooms.js'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'src/scripts/05-gameplay-core.js'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'src/scripts/01-data-and-state.js'), 'utf8');
const rendering = fs.readFileSync(path.join(ROOT, 'src/scripts/06-rendering-and-helpers.js'), 'utf8');

const definitions = [
  {id:'16', name:'MINAE Death Squad', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'31', name:'Oathbound Noble Fighter', type:'Supporter', aff:'eventide', fate:1, cost:0, rarity:'circle'},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'41', name:'Jimmy', type:'Dauntless', aff:'reality', fate:0, cost:3, rarity:'triangle'}
  ,{id:'58', name:'Crossroads Worker', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'}
  ,{id:'29', name:'Dylan Kirby', type:'Initiator', aff:'third_great_war', fate:3, cost:1, rarity:'square'}
];

function initial(matchId, p0, p1){
  return createInitialState({
    matchId,
    seed:`${matchId}-seed`,
    handSize:99,
    activePlayer:0,
    cardDefinitions:definitions,
    players:[{id:'p0', deckIds:p0}, {id:'p1', deckIds:p1}]
  });
}

function command(state, number, type, payload = {}){
  return {commandId:`p0:${number}`, matchId:state.matchId, expectedRevision:state.revision, type, payload};
}

function handCard(state, playerIndex, id){
  return state.players[playerIndex].hand.find(card=>String(card.id) === String(id));
}

function boardCard(state, iid){
  for(const zone of state.board) for(const row of zone) for(const card of row){
    if(String(card?.iid || '') === String(iid || '')) return card;
  }
  return null;
}

// A normal Supporter remains placeable in the contested row even when its
// mandatory WHEN_SET target does not currently exist. The effect fizzles; the
// placement itself must not be rejected.
let state = initial('LIVE-PLACEMENT-FIZZLE', ['16'], ['32']);
const minae = handCard(state, 0, '16');
let legal = legalCommandTemplates(state, 0);
let setMinae = legal.find(entry=>entry.type === 'SET_CARD'
  && entry.payload.cardIid === minae.iid
  && entry.payload.destination.z === 0
  && entry.payload.destination.r === 1
  && entry.payload.destination.c === 0);
assert(setMinae, 'human contested-row placement must be offered even with no current WHEN_SET target');
let result = reduceCommand(state, command(state, 1, setMinae.type, setMinae.payload), {playerId:'p0'});
assert.equal(result.ok, true, result.rejection?.reason);
assert.equal(result.state.pendingPrompt, null, 'unavailable WHEN_SET target must fizzle without stalling');
assert.equal(boardCard(result.state, minae.iid)?.id, '16', 'the legally set Supporter must remain on the board');

// Empty effects do not "activate" for presentation or reaction purposes.
// Crossroads with no Supporter in discard is set normally, emits a skip, and
// never emits EFFECT_ACTIVATED (so no activation cinematic can be shown).
state = initial('LIVE-EMPTY-CROSSROADS', ['58'], ['32']);
const crossroads = handCard(state, 0, '58');
legal = legalCommandTemplates(state, 0);
const setCrossroads = legal.find(entry=>entry.type === 'SET_CARD' && entry.payload.cardIid === crossroads.iid);
assert(setCrossroads, 'Crossroads itself must remain placeable with an empty discard');
result = reduceCommand(state, command(state, 31, setCrossroads.type, setCrossroads.payload), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.pendingPrompt, null);
assert.equal(result.events.some(event=>event.type === 'EFFECT_ACTIVATED'), false, 'empty Crossroads must not activate');
assert.equal(result.events.some(event=>event.type === 'EFFECT_SKIPPED' && event.reason === 'NO_LEGAL_TARGETS'), true);

// An auto-activated Character with no current search targets is still legal
// to consolidate. Target availability controls the effect, never the card's
// placement itself.
state = initial('LIVE-ACTIVATE-FIZZLE-CONSOLIDATION', ['29', '16'], ['32']);
state.testRules = {zeroReinforcementCost:true};
const dylan = handCard(state, 0, '29');
const dylanTribute = handCard(state, 0, '16');
state.players[0].hand.splice(state.players[0].hand.indexOf(dylanTribute), 1);
dylanTribute.controller = 0;
state.board[0][1][0] = dylanTribute;
legal = legalCommandTemplates(state, 0);
const consolidateDylan = legal.find(entry=>entry.type === 'CONSOLIDATE_CARD'
  && entry.payload.cardIid === dylan.iid
  && entry.payload.tributeIids.includes(dylanTribute.iid));
assert(consolidateDylan, 'Dylan must remain consolidatable when his up-to-two search currently has zero targets');
result = reduceCommand(state, command(state, 32, consolidateDylan.type, consolidateDylan.payload), {playerId:'p0'});
assert.equal(result.ok, true, result.rejection?.reason);
assert.equal(boardCard(result.state, dylan.iid)?.id, '29', 'Dylan placement must commit before the unavailable effect fizzles');
assert.equal(result.state.pendingPrompt, null, 'empty Dylan search must not leave a blocking prompt');

// Oathbound cancellation is a real no-op command. It must neither select the
// newly set Oathbound nor reduce its Fate.
state = initial('LIVE-OATHBOUND-CANCEL', ['31'], ['32']);
const oathbound = handCard(state, 0, '31');
legal = legalCommandTemplates(state, 0);
const setOathbound = legal.find(entry=>entry.type === 'SET_CARD'
  && entry.payload.cardIid === oathbound.iid
  && entry.payload.destination.r === 1);
assert(setOathbound, 'Oathbound must have a contested-row set command');
result = reduceCommand(state, command(state, 2, setOathbound.type, setOathbound.payload), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.pendingPrompt?.type, 'BOARD_TARGET');
assert.equal(result.state.pendingPrompt?.cancellable, true);
assert.equal(result.state.pendingPrompt?.min, 0);
const beforeCancel = boardCard(result.state, oathbound.iid).currentFate;
state = result.state;
const cancel = legalCommandTemplates(state, 0).find(entry=>entry.type === 'ANSWER_PROMPT' && entry.payload.cancel === true);
assert(cancel, 'Oathbound must expose an authoritative cancel command');
result = reduceCommand(state, command(state, 3, cancel.type, cancel.payload), {playerId:'p0'});
assert.equal(result.ok, true);
assert.equal(result.state.pendingPrompt, null);
assert.equal(boardCard(result.state, oathbound.iid).currentFate, beforeCancel, 'cancel must not auto-target Oathbound');

// Jimmy's Fate is a stable authoritative derived value: exactly +3 per
// opponent-Fate-reducing effect command, and unchanged by unrelated or
// non-opponent reductions.
state = initial('LIVE-JIMMY-LIFECYCLE', ['41', '32'], ['31']);
const jimmy = handCard(state, 0, '41');
state.players[0].hand.splice(state.players[0].hand.indexOf(jimmy), 1);
jimmy.controller = 0;
state.board[0][2][0] = jimmy;
const enemy = handCard(state, 1, '31');
state.players[1].hand.splice(state.players[1].hand.indexOf(enemy), 1);
enemy.controller = 1;
enemy.currentFate = 40;
state.board[0][0][0] = enemy;
const own = handCard(state, 0, '32');
state.players[0].hand.splice(state.players[0].hand.indexOf(own), 1);
own.controller = 0;
own.currentFate = 20;
state.board[0][2][1] = own;
assert.equal(effectiveFate(state, jimmy), 0);
for(let use = 1; use <= 10; use += 1){
  result = reduceCommand(state, command(state, 10 + use, 'MODIFY_FATE', {
    targetIid:enemy.iid,
    amount:-1,
    sourceIid:own.iid,
    reason:'JIMMY_LIFECYCLE_TEST'
  }), {playerId:'p0', allowDebugCommands:true});
  assert.equal(result.ok, true);
  state = result.state;
  assert.equal(state.fateReductionEffectUses[0], use);
  assert.equal(effectiveFate(state, boardCard(state, jimmy.iid)), use * 3, `Jimmy use ${use} must equal ${use * 3}`);
}
const afterTen = effectiveFate(state, boardCard(state, jimmy.iid));
result = reduceCommand(state, command(state, 30, 'MODIFY_FATE', {
  targetIid:own.iid,
  amount:-1,
  sourceIid:own.iid,
  reason:'OWN_CARD_REDUCTION'
}), {playerId:'p0', allowDebugCommands:true});
assert.equal(result.ok, true);
assert.equal(effectiveFate(result.state, boardCard(result.state, jimmy.iid)), afterTen, 'reducing an own card must not change Jimmy');

// Shipping-client presentation guards: both modes wait for a painted placement,
// optional board prompts respect min=0, and Phase 7 ignores legacy Jimmy sources.
assert.match(core, /_placementUiLockUntil\s*=\s*Math\.max[\s\S]{0,180}resolveSetCardAfterPlacement/);
assert.match(rooms, /Phase 7 authoritative placement preview[\s\S]{0,400}_placementUiLockUntil[\s\S]{0,300}await phase7NextFrame\(\)[\s\S]{0,80}await phase7NextFrame\(\)/);
assert.match(rooms, /commandField:'selectedIid',[\s\S]{0,100}minCount:Math\.max\(0, Number\(prompt\.min\)/);
assert.match(core, /_phase7CurrentMultiplayer === true\) return 0/);
assert.match(core, /cardActsAsPassive\(card, '65'\)[\s\S]{0,180}G\?\._phase7CurrentMultiplayer !== true\) bonus \+= 3/, 'authoritative Marines must not receive the legacy +3 projection twice');
assert.match(rendering, /_phase7CurrentMultiplayer === true \? null/);
assert.match(rooms, /preselectedTributeIid:[\s\S]{0,160}droppedOnIid/);
assert.match(rooms, /'Chaparral Hoplite'[\s\S]{0,700}'Normal Set'[\s\S]{0,240}'Set Face Down'/);
assert.match(rooms, /showAffiliationPickerVisual[\s\S]{0,1800}showLandscapeChoiceModal[\s\S]{0,1800}chooseDestructionOfParadiseType[\s\S]{0,2200}showZonePickerVisual/);
assert.match(rooms, /phase7FastPresentationMode[\s\S]{0,180}fateV3PresentationE2E/);
assert.match(rooms, /fateEffectActivationPredecessorRemaining/);
assert.match(rooms, /phase7CommitWithConsolidationMotion[\s\S]{0,700}onlineApproxBoardCellRect[\s\S]{0,700}onlineRelativeBoardCellRect/, 'Phase 7 consolidation motion must retain production VFX geometry while the direct hit map is between layouts');
assert.match(rooms, /authoritativeTurnChanged[\s\S]{0,500}_turnStartedAt\s*=\s*\(typeof window\.fateAuthorityServerNow/, 'each authoritative turn handoff must install a fresh client timer origin');
assert.match(data, /FATE_PLAYER_TIMED_MANUAL_EFFECT_CARD_IDS\s*=\s*Object\.freeze\(\[['"]26['"],\s*['"]38['"],\s*['"]40['"],\s*['"]93['"]\]\)/, 'player-timed effects must have one centralized manual-only identity list');
assert.match(core, /fateEffectRequiresManualActivationId\?\.\(card\)[\s\S]{0,140}continue;/, 'automatic single-player resolution must consult the centralized manual-only invariant');

console.log('phase7 live interaction regressions smoke test passed');
