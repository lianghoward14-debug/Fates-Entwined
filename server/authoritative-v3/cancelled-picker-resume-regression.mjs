import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, reduceCommand, legalCommandTemplates, canonicalHash, projectStateForPlayer} from '../../shared/engine/index.mjs';
import {FateAuthoritativeV3LocalSession} from '../../src/scripts/authoritative-v3-local-session.mjs';
import {command} from './test-helpers.mjs';

const definitions = [
  {id:'05', name:'Regiment', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'07', name:'Maja', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'06', name:'Searcher', type:'Initiator', aff:'reality', fate:1, cost:1},
  {id:'32', name:'Resident', type:'Supporter', aff:'reality', fate:1, cost:0}
];
function fixture(id='05'){
  return createInitialState({matchId:'RESUME', seed:'resume', handSize:99, activePlayer:0,
    cardDefinitions:definitions, players:[{id:'p0', deckIds:[id,'32','32']},{id:'p1', deckIds:['32']}]});
}
let sequence = 0;
function step(state, type, payload={}, player='p0'){
  const input = command(state, player, ++sequence, type, payload);
  const result = reduceCommand(state, input, {playerId:player});
  assert.equal(result.ok, true, JSON.stringify(result.rejection));
  // The local session and remote reducer must produce precisely the same state.
  const session = new FateAuthoritativeV3LocalSession({state, playerId:player});
  const local = session.dispatch(type, payload, input.commandId);
  assert.equal(local.ok, true, JSON.stringify(local.rejection));
  assert.equal(canonicalHash(session.state), canonicalHash(result.state));
  assert.deepEqual(legalCommandTemplates(session.state, session.playerIndex(player)), legalCommandTemplates(result.state, session.playerIndex(player)));
  return result.state;
}
function place(state, id){
  return step(state, 'SET_CARD', {cardIid:state.players[0].hand.find(card=>card.id===id).iid, destination:{z:0,r:2,c:0}});
}
function cancel(state){ return step(state, 'ANSWER_PROMPT', {promptId:state.pendingPrompt.promptId, cancel:true}); }
function resumeCommand(state){ return legalCommandTemplates(state, 0).find(item=>item.deferredPicker); }

let state=place(fixture(), '05');
const source=state.board[0][2][0];
const initialFate=source.currentFate;
state=cancel(state);
assert.equal(state.pendingPrompt, null);
assert.equal(state.effectStack.length, 0);
assert.equal(resumeCommand(state)?.manualOnly, true);
assert.equal(projectStateForPlayer(state,1).deferredPickerEffects, undefined, 'private continuations must not leak to the opponent');
for(let i=0;i<2;i++){
  state=step(state, 'ACTIVATE_EFFECT', resumeCommand(state).payload);
  assert.equal(state.pendingPrompt.type, 'BOARD_TARGET');
  state=cancel(state);
  assert.equal(state.deferredPickerEffects.length,1, 'repeated cancel must not duplicate continuations');
}
state=step(state, 'ACTIVATE_EFFECT', resumeCommand(state).payload);
state=step(state, 'ANSWER_PROMPT', {promptId:state.pendingPrompt.promptId,selectedIid:source.iid});
assert.equal(state.board[0][2][0].currentFate, initialFate+3);
assert.equal(resumeCommand(state),undefined);

state=cancel(place(fixture(),'05'));
state=step(state,'END_TURN');
assert.equal(state.deferredPickerEffects.length,0);
state=step(state,'END_TURN',{},'p1');
assert.equal(resumeCommand(state),undefined,'canceled effects expire at end of turn');

state=cancel(place(fixture(),'05'));
state=step(state,'DISCARD_CARD',{targetIid:state.board[0][2][0].iid});
assert.equal(resumeCommand(state),undefined,'discarded sources cannot resume');

// Maja grants extra sets before opening her search. Resuming must not grant them again.
state=fixture('07');
state.players[0].deck.push(state.players[0].hand.pop());
state=place(state,'07');
const extraSets=state.extraSupportersThisTurn[0];
state=cancel(state);
state=step(state,'ACTIVATE_EFFECT',resumeCommand(state).payload);
assert.equal(state.extraSupportersThisTurn[0],extraSets);
state=step(state,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIids:[state.pendingPrompt.eligibleIids[0]]});
assert.equal(state.extraSupportersThisTurn[0],extraSets);

// An ACTIVATE effect may have already consumed its only use when the picker opens.
state=fixture('06');
const searcher=state.players[0].hand.splice(state.players[0].hand.findIndex(card=>card.id==='06'),1)[0];
searcher.controller=0;
state.board[0][2][0]=searcher;
state.players[0].deck.push(state.players[0].hand.pop());
state=step(state,'ACTIVATE_EFFECT',{sourceIid:searcher.iid});
const uses=state.board[0][2][0].counters.effectUses;
state=cancel(state);
state=step(state,'ACTIVATE_EFFECT',resumeCommand(state).payload);
assert.equal(state.board[0][2][0].counters.effectUses,uses,'resume must not consume another use');
state=step(state,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIid:state.pendingPrompt.eligibleIids[0]});
assert.equal(resumeCommand(state),undefined);

// Exercise the real confirmation callback: opening/canceling never discards;
// confirming once discards once even under a double click.
const rendering=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const start=rendering.indexOf('function confirmCardDiscard(');
const end=rendering.indexOf('\nwindow.confirmCardDiscard',start);
let actions, discards=0, returns=0;
const context={window:{},document:{querySelector:()=>({classList:{add(){}},focus(){}})},
  escapePlacementAnimHtml:value=>String(value), closeModal(){},showModal(title,body,buttons){actions=buttons;}};
vm.createContext(context);
vm.runInContext(rendering.slice(start,end),context);
context.confirmCardDiscard({name:'Regiment'},()=>discards++,()=>returns++);
assert.equal(discards,0);
actions[0].action();
assert.equal(discards,0);
assert.equal(returns,1);
context.confirmCardDiscard({name:'Regiment'},()=>discards++);
actions[1].action(); actions[1].action();
assert.equal(discards,1);
console.log('Canceled picker regression passed: local/remote parity, resume, repeated cancel, expiry, removal, no duplicate rewards/uses, discard confirmation.');
