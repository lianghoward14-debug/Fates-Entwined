import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
let state=createInitialState({matchId:'BH25-RECENT',seed:'bh25-recent',handSize:99,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['bh25','130','bh01','46']},{id:'p1',deckIds:['32']}],
  gameSettings:{healthPressureSeals:true}});
state.turn=18;
const nytress=takeFromHandToBoard(state,0,'130',{z:0,r:2,c:0});
nytress.counters.elementalAffiliationA='reality';
nytress.counters.elementalAffiliationB='eventide';
const voyager=takeFromHandToBoard(state,0,'bh01',{z:1,r:2,c:0});
const phil=takeFromHandToBoard(state,0,'46',{z:2,r:2,c:0});
const opponent=takeFromHandToBoard(state,1,'32',{z:0,r:0,c:0});
const engineer=state.players[0].hand.find(card=>card.id==='bh25');
const result=reduceCommand(state,command(state,'p0',1,'SET_CARD',
  {cardIid:engineer.iid,destination:{z:0,r:2,c:1}}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
const board=result.state.board;
assert.equal(board[0][2][0].currentFate,nytress.currentFate+1);
assert.equal(board[0][0][0].currentFate,opponent.currentFate+1,'Elemental Mastery affects both sides of its zone');
assert.equal(board[0][2][1].currentFate,engineer.currentFate+1);
assert.equal(board[1][2][0].currentFate,voyager.currentFate+1);
assert.equal(board[1][2][0].counters.braveHorizonsCounters,1);
assert.equal(board[2][2][0].currentFate,phil.currentFate+3);
for(const source of [nytress,voyager,phil])assert(result.events.some(event=>event.type==='EFFECT_ACTIVATED'
  && event.semanticSourceCardId==='bh25'&&event.sourceIid===source.iid));
const undeclared=structuredClone(state);
delete undeclared.board[0][2][0].counters.elementalAffiliationB;
const withoutDeclaration=reduceCommand(undeclared,command(undeclared,'p0',1,'SET_CARD',
  {cardIid:engineer.iid,destination:{z:0,r:2,c:1}}),{playerIndex:0});
assert.equal(withoutDeclaration.ok,true,JSON.stringify(withoutDeclaration.rejection));
assert(!withoutDeclaration.events.some(event=>event.type==='EFFECT_ACTIVATED'
  && event.semanticSourceCardId==='bh25'&&event.sourceIid===nytress.iid),'undeclared Elemental Mastery cannot proc');
console.log('PASS ALPINE Engineer procs Elemental Mastery, Brave Horizons, and updated Phil gain');
