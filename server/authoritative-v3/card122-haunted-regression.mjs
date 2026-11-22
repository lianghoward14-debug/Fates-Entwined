import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {projectStateForPlayer} from '../../shared/engine/projections.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
assert(definitions.some(card=>card.id==='122' && card.fate===4 && card.cost===1 && card.aff==='reality'));
let sequence=0;
function act(state,type,payload){
  const result=reduceCommand(state,command(state,'p0',++sequence,type,payload),{playerIndex:0});
  assert.equal(result.ok,true,JSON.stringify(result));
  return result;
}
let state=createInitialState({matchId:'CARD122',seed:'card122',handSize:99,activePlayer:0,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['122','47','32','32','32','32']},{id:'p1',deckIds:['32','32']}],
  gameSettings:{healthPressureSeals:true,zoneControlRework:true}});
const haunted=state.players[0].hand.find(card=>card.id==='47');
state.players[0].hand=state.players[0].hand.filter(card=>card!==haunted);
state.players[0].discard.push(haunted);
const source=state.players[0].hand.find(card=>card.id==='122');
const tributes=[takeFromHandToBoard(state,0,'32',{z:0,r:2,c:0})];
let result=act(state,'CONSOLIDATE_CARD',{cardIid:source.iid,tributeIids:tributes.map(card=>card.iid),destination:{z:0,r:2,c:0}});
state=result.state;
assert(result.events.some(event=>event.type==='EFFECT_ACTIVATED'&&event.sourceIid===source.iid),
  'Ellie must emit the activation event that starts her cinematic');
assert(state.pendingPrompt,'card 122 asks for a discarded card');
result=act(state,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIids:[haunted.iid]});state=result.state;
assert(state.pendingPrompt,'card 122 asks for a destination');
result=act(state,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,destination:{z:1,r:2,c:0}});state=result.state;
const placed=state.board[1][2][0];
assert.equal(placed?.iid,haunted.iid);
assert(placed.statuses.includes('HAUNTED_NO_EFFECTS'));
assert.equal(placed.counters.ellieHauntedVisual,true);
for(const viewer of [0,1]){
  const projected=projectStateForPlayer(state,viewer).board[1][2][0];
  assert(projected.statuses.includes('HAUNTED_NO_EFFECTS'));
  assert.equal(projected.counters.ellieHauntedVisual,true);
  assert(!projected.statuses.includes('EFFECTS_SUPPRESSED'),'haunting must not draw the ordinary suppression lock');
}
assert.equal(state.players[0].discard.some(card=>card.iid===haunted.iid),false);
assert(result.events.some(event=>event.type==='CARD_SET'&&event.cardIid===haunted.iid));
assert.equal(state.pendingPrompt,null,'the revived card opens no effect prompt');
console.log('PASS card 122 revives a discarded card for free with effects disabled');
