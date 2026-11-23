import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState} from '../../shared/engine/index.mjs';
import {collectTriggeredOperations} from '../../shared/engine/triggers.mjs';
import {takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
const state=createInitialState({matchId:'NYTRESSSHIZUKU',seed:'nytress-shizuku',handSize:99,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['130','32','32']},{id:'p1',deckIds:['32']}],
  gameSettings:{healthPressureSeals:true}});
const nytress=takeFromHandToBoard(state,0,'130',{z:0,r:2,c:0});
nytress.counters.elementalAffiliationA='expanded_worlds';
nytress.counters.elementalAffiliationB='reality';
const token={...nytress,iid:'shizuku-token',id:'whisper17',name:'Shizuku',type:'Coordinator',
  affiliation:'expanded_worlds',counters:{whisperLandscapeToken:true,copiedPassiveId:'130',
    elementalAffiliationA:'expanded_worlds',elementalAffiliationB:'reality'},statuses:[]};
state.board[1][2][0]=token;
let operations=collectTriggeredOperations(state,{type:'CARD_SET',playerIndex:0,cardIid:token.iid});
assert(operations.some(op=>op.reason==='ELEMENTAL_MASTERY'&&op.targetIid===nytress.iid),
  'normal Nytress must react when Shizuku token is set with a declared affiliation');
const matching=takeFromHandToBoard(state,0,'32',{z:2,r:2,c:0});
operations=collectTriggeredOperations(state,{type:'CARD_SET',playerIndex:0,cardIid:matching.iid});
assert(operations.some(op=>op.reason==='ELEMENTAL_MASTERY'&&op.sourceIid===token.iid&&op.targetIid===matching.iid),
  'Shizuku copying Nytress must grant Fate across zones');
console.log('PASS Nytress and Shizuku token trigger each other across zones');
