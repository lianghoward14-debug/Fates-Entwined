import assert from 'node:assert/strict';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const definitions = [
  {id:'86',name:'Boleslaw Kopewicz',type:'Improvisor',aff:'expanded_worlds',fate:4,cost:2},
  {id:'bh15',name:'Hsei-Ling',type:'Improvisor',aff:'third_great_war',fate:3,cost:2},
  {id:'bh17',name:'Jakob Eltzholtz',type:'Improvisor',aff:'expanded_worlds',fate:6,cost:3},
  {id:'bh25',name:'ALPINE Engineer',type:'Supporter',aff:'expanded_worlds',fate:1,cost:0},
  {id:'32',name:'Temecula Resident',type:'Supporter',aff:'reality',fate:1,cost:0}
];

function take(state,id){
  const index=state.players[0].hand.findIndex(card=>card.id===id);
  assert.notEqual(index,-1,`${id} must be in hand`);
  const card=state.players[0].hand.splice(index,1)[0];
  card.controller=0;
  return card;
}

function scenario(turn){
  const state=createInitialState({
    matchId:`BH25-ENGINEER-${turn}`,seed:`BH25-ENGINEER-${turn}`,handSize:99,
    cardDefinitions:definitions,
    players:[{id:'p0',deckIds:['86','bh15','bh17','bh25','32']},{id:'p1',deckIds:['32']}]
  });
  state.turn=turn;
  const boleslaw=take(state,'86');
  const hsei=take(state,'bh15');
  const jakob=take(state,'bh17');
  const drawCard=take(state,'32');
  state.players[0].deck.push(drawCard);
  state.board[0][2][0]=boleslaw;
  state.board[0][2][1]=hsei;
  state.board[0][1][0]=jakob;
  return {state,boleslaw,hsei,jakob,engineer:state.players[0].hand.find(card=>card.id==='bh25')};
}

{
  const {state,boleslaw,hsei,jakob,engineer}=scenario(18);
  const handBefore=state.players[0].hand.length;
  const result=reduceCommand(state,command(state,'p0',1,'SET_CARD',{
    cardIid:engineer.iid,destination:{z:0,r:2,c:2}
  }),{playerId:'p0'});
  assert.equal(result.ok,true);
  const liveBoleslaw=result.state.board[0][2][0];
  const liveHsei=result.state.board[0][2][1];
  const liveJakob=result.state.board[0][1][0];
  // Boleslaw's +2 proc is still amplified normally by Hsei-Ling. Hsei itself
  // is not treated as a proc source and cannot recurse.
  assert.equal(liveBoleslaw.currentFate,boleslaw.currentFate+3);
  assert.equal(result.state.players[0].hand.length,handBefore);
  assert.equal(liveBoleslaw.counters.alpineEngineerProcCount,1);
  assert.equal(liveHsei.counters.alpineEngineerProcCount,undefined);
  assert.equal(liveJakob.counters.alpineEngineerProcCount,undefined);
  assert.equal(liveHsei.currentFate,hsei.currentFate);
  assert.equal(liveJakob.currentFate,jakob.currentFate);
  const engineerOverlayIndex=result.events.findIndex(event=>event.type==='EFFECT_ACTIVATED'
    && event.semanticSourceCardId==='bh25' && event.sourceIid===liveBoleslaw.iid
    && event.suppressActivationCinematic===true && event.forceEffectOverlay===true);
  const boleslawOverlayIndex=result.events.findIndex(event=>event.type==='EFFECT_ACTIVATED'
    && event.semanticSourceCardId==='86' && event.sourceIid===liveBoleslaw.iid
    && event.suppressActivationCinematic===true);
  assert(engineerOverlayIndex>=0,'the Engineer overlay must appear on the card whose proc is being forced');
  assert.equal(result.events[engineerOverlayIndex].overlayTargetIid,liveBoleslaw.iid,'the Engineer overlay must preserve its explicit affected-card target');
  assert(boleslawOverlayIndex>engineerOverlayIndex,'the affected card must then show its normal overlay without an activation cinematic');
  assert.equal(result.events[boleslawOverlayIndex].deferEffectOverlayMs,3500,'the normal proc overlay must wait for the full Engineer overlay duration');
  assert(result.events.some(event=>event.type==='FATE_CHANGED'
    && event.semanticSourceCardId==='86' && event.sourceIid===liveBoleslaw.iid
    && event.presentationDelayMs===3500),
  'the forced proc Fate change must retain the affected card identity');
}

{
  const {state,boleslaw,engineer}=scenario(17);
  const result=reduceCommand(state,command(state,'p0',1,'SET_CARD',{
    cardIid:engineer.iid,destination:{z:0,r:2,c:2}
  }),{playerId:'p0'});
  assert.equal(result.ok,true);
  assert.equal(result.state.board[0][2][0].currentFate,boleslaw.currentFate);
  assert(result.events.some(event=>event.type==='EFFECT_CONDITION_UNMET' && event.reason==='TURN_BEFORE_18'));
}

console.log('BH25 ALPINE Engineer smoke test passed');
