import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,reduceCommand} from '../../shared/engine/index.mjs';
import {FateAuthoritativeV3SinglePlayerAdapter} from '../../src/scripts/authoritative-v3-single-player-adapter.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
assert(definitions.some(card=>card.id==='125' && card.fate===0 && card.cost===5 && card.aff==='reality'));
let state=createInitialState({matchId:'CARD125',seed:'card125',handSize:99,activePlayer:0,
  cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['125','32','32','32','32','32']},{id:'p1',deckIds:['40','39','32']}],
  gameSettings:{healthPressureSeals:true,zoneControlRework:true}});
const source=state.players[0].hand.find(card=>card.id==='125');
const tributes=[0,1,2,3,4].map(c=>takeFromHandToBoard(state,0,'32',{z:c>=3?1:0,r:2,c:c>=3?c-3:c}));
let result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{
  cardIid:source.iid,tributeIids:tributes.map(card=>card.iid),destination:{z:0,r:2,c:0}
}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result));state=result.state;
assert(state.pendingPrompt,'the full card catalog picker opens');
assert(state.pendingPrompt.eligibleIids.includes('40'));
assert(state.pendingPrompt.eligibleIids.includes('39'));
assert(legalCommandTemplates(state,0).length<=4,'Investigation AI choices stay bounded instead of enumerating catalog combinations');
const adapter=new FateAuthoritativeV3SinglePlayerAdapter({state,humanPlayerId:'p0',aiPlayerId:'p1'});
const humanChoice=adapter.answerPrompt({promptId:state.pendingPrompt.promptId,selectedIids:['40','39','125']});
assert.equal(humanChoice.ok,true,'a human may still select any valid catalog combination');
result=reduceCommand(state,command(state,'p0',2,'ANSWER_PROMPT',{
  promptId:state.pendingPrompt.promptId,selectedIids:['40','39','125']
}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result));state=result.state;
assert.equal(state.board[0][2][0].currentFate,6,'two matches add 6 to printed X (0) Fate');
assert(result.events.some(event=>event.type==='INVESTIGATION_RESOLVED'&&event.matchCount===2));
console.log('PASS card 125 grants 3 Fate per unique original-deck match');
