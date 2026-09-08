import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {planDecision} from '../../shared/ai/policy.mjs';
const require=createRequire(import.meta.url);
const cardDefinitions=require('../fate-card-catalog.js').getCardCatalog().cards;
function position(ids){return createInitialState({matchId:'morale-ai',seed:'morale-ai',handSize:12,cardDefinitions,
 players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:[]}],gameSettings:{healthPressureSeals:true,pressureCardReworks:true}});}
let state=position(['47','05']);state.turn=5;state.moralePressure.morale[1]=8;
let plan=planDecision(legalCommandTemplates(state,0),projectStateForPlayer(state,0),{canonicalState:state,playerIndex:0,samples:1,nodeBudget:160});
assert.equal(state.players[0].hand.find(c=>c.iid===plan.command.payload.cardIid)?.id,'47','take actual direct morale lethal');
state=position(['20','05']);state.turn=3;state.moralePressure.morale[0]=1;
const shield=state.players[0].hand.splice(state.players[0].hand.findIndex(c=>c.id==='20'),1)[0];state.board[0][2][0]=shield;
state.board[1][0][0]={...structuredClone(state.players[0].hand[0]),iid:'enemy',owner:1,controller:1,currentFate:40};
plan=planDecision(legalCommandTemplates(state,0),projectStateForPlayer(state,0),{canonicalState:state,playerIndex:0,samples:1,nodeBudget:300});
assert(plan.sequence.some(c=>c.type==='ACTIVATE_EFFECT' && c.payload.sourceIid===shield.iid),'search actual prevention before lethal calculation');
console.log('Morale AI decisions passed: direct lethal and prevention through real reducer outcomes.');
