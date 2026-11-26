import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {chooseCommand} from '../../shared/ai/policy.mjs';
const require=createRequire(import.meta.url);
const cardDefinitions=require('../fate-card-catalog').getCardCatalog().cards;
for(const player of [0,1]){
  const state=createInitialState({matchId:'opening-options',seed:'fixture',activePlayer:player,handSize:5,cardDefinitions,
    players:[0,1].map(p=>({id:String(p),deckIds:p===player?['09','32','05']:['28']}))});
  state.turn=state.maxTurns;
  state.baseSupportersPerTurn=1;
  const hand=state.players[player].hand;
  const draw=hand.find(c=>c.id==='32');
  draw.baseFate=draw.currentFate=25;
  const threat=state.players[1-player].hand.pop();
  threat.baseFate=threat.currentFate=12;
  state.board[0][player===0?0:2][0]=threat;
  let trace;
  const cmds=legalCommandTemplates(state,player).filter(c=>c.type==='SET_CARD' && c.payload.destination.z===0 &&
    c.payload.destination.c===0 && c.payload.destination.r===(player===0?2:0));
  assert.ok(cmds.some(c=>c.payload.cardIid===draw.iid));
  assert.ok(cmds.some(c=>c.payload.cardIid===hand.find(h=>h.id==='09').iid));
  const choice=chooseCommand(cmds,projectStateForPlayer(state,player),{canonicalState:state,playerIndex:player,
    samples:1,width:3,nodeBudget:36,maxNodeBudget:36,onDecision:t=>{trace=t;}});
  assert.equal(choice.payload.cardIid,draw.iid);
  assert.ok(trace.alternatives.length>=2);
}
console.log('Both seats compared opening supporters and chose the stronger play.');
const forced={type:'END_TURN',payload:{}};
let forcedTrace;
assert.equal(chooseCommand([forced,{type:'CONCEDE',payload:{}}],null,{onDecision:t=>{forcedTrace=t;}}),forced);
assert.equal(forcedTrace.simulations,0);
