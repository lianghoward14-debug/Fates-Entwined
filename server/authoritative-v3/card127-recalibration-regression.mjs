import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';

const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
assert(definitions.some(card=>card.id==='127'&&card.fate===2&&card.cost===4&&card.aff==='reality'));
let state=createInitialState({matchId:'CARD127',seed:'card127',handSize:99,activePlayer:0,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['127','32','32','32','32']},{id:'p1',deckIds:['39','40']}],
  gameSettings:{healthPressureSeals:true,zoneControlRework:true}});
const original=takeFromHandToBoard(state,1,'39',{z:0,r:0,c:0});
state.boardTurnStartSnapshots[1]={turn:2,cards:[{z:0,r:0,c:0,card:structuredClone(original)}]};
state.board[0][0][0]=null;
state.players[1].discard.push(original);
const newcomer=takeFromHandToBoard(state,1,'40',{z:0,r:0,c:1});
const source=state.players[0].hand.find(card=>card.id==='127');
const tributes=[0,1,2,3].map(c=>takeFromHandToBoard(state,0,'32',{z:c===3?1:0,r:2,c:c===3?0:c}));
const result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{
  cardIid:source.iid,tributeIids:tributes.map(card=>card.iid),destination:{z:0,r:2,c:0}
}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result));state=result.state;
assert.equal(state.board[0][0][0].iid,original.iid);
assert.equal(state.board[0][0][1],null);
assert(state.players[1].discard.some(card=>card.iid===newcomer.iid));
assert(!state.players[1].discard.some(card=>card.iid===original.iid));
assert(result.events.some(event=>event.type==='BOARD_RECALIBRATED'));
console.log('PASS card 127 restores opponent board from previous turn start');
