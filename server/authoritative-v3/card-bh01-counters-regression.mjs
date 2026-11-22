import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
assert(definitions.some(card=>card.id==='bh01'&&card.type==='Improvisor'&&card.fate===13&&card.cost===2));
let state=createInitialState({matchId:'BH01COUNTERS',seed:'bh01-counters',handSize:99,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['bh01','32','32']},{id:'p1',deckIds:['32']}],
  gameSettings:{healthPressureSeals:true}});
const card=takeFromHandToBoard(state,0,'bh01',{z:0,r:2,c:0});
const handBefore=state.players[0].hand.length;
const move=legalCommandTemplates(state,0).find(item=>item.type==='MOVE_CARD'&&item.payload.cardIid===card.iid&&item.payload.destination.z===1);
assert(move,'Voyager can move to another zone');
let result=reduceCommand(state,command(state,'p0',1,move.type,move.payload),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;
const moved=state.board[move.payload.destination.z][move.payload.destination.r][move.payload.destination.c];
assert.equal(moved.currentFate,14);
assert.equal(moved.counters.braveHorizonsCounters,1);
assert.equal(state.players[0].hand.length,handBefore,'movement no longer draws');
assert(!legalCommandTemplates(state,0).some(item=>item.type==='MOVE_CARD'&&item.payload.cardIid===card.iid),'only one move per turn');
assert(!legalCommandTemplates(state,0).some(item=>item.type==='ACTIVATE_EFFECT'&&item.payload.sourceIid===card.iid),'Call to Arms needs two counters');
moved.counters.braveHorizonsCounters=2;
assert(legalCommandTemplates(state,0).some(item=>item.type==='ACTIVATE_EFFECT'&&item.payload.sourceIid===card.iid));
result=reduceCommand(state,command(state,'p0',2,'ACTIVATE_EFFECT',{sourceIid:card.iid,userActivated:true}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
assert.equal(result.state.board[move.payload.destination.z][move.payload.destination.r][move.payload.destination.c].counters.braveHorizonsCounters,0);
assert(result.state.pendingPrompt,'Call to Arms offers a choice after spending counters');
console.log('PASS Voyager movement adds Fate and counters; two counters trigger Call to Arms');
