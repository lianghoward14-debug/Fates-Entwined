import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
let state=createInitialState({matchId:'EMERALDCOUNTERS',seed:'emerald-counters',handSize:99,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['120','121','32']},{id:'p1',deckIds:['32']}],
  gameSettings:{healthPressureSeals:true}});
const source=takeFromHandToBoard(state,0,'120',{z:0,r:2,c:0});
const eligible=takeFromHandToBoard(state,0,'121',{z:0,r:2,c:1});
const ineligible=takeFromHandToBoard(state,0,'32',{z:0,r:2,c:2});
const result=reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',{sourceIid:source.iid,userActivated:true}),{playerIndex:0});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
assert(result.state.pendingPrompt,'counter target picker must open');
const options=result.state.pendingPrompt.eligibleIids;
assert(options.includes(eligible.iid),'card with counter ability is selectable');
assert(!options.includes(ineligible.iid),'ordinary card is not selectable');
assert(!options.includes(source.iid),'Emerald Eyed Children cannot place a useless counter on itself');
const resolved=reduceCommand(result.state,command(result.state,'p0',2,'ANSWER_PROMPT',
  {promptId:result.state.pendingPrompt.promptId,selectedIids:[eligible.iid]}),{playerIndex:0});
assert.equal(resolved.ok,true,JSON.stringify(resolved.rejection));
assert.equal(resolved.state.board[0][2][1].counters.infernoCounters,1);
assert(resolved.events.some(event=>event.type==='CARD_COUNTER_SET'&&event.reason==='EMERALD_STORY_COUNTER'),
  'counter event carries its distinct sound cue');
console.log('PASS Emerald Eyed Children only offers eligible counter cards');
