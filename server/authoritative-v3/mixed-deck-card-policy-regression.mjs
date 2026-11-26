import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates} from '../../shared/engine/index.mjs';
import {multiplayerEligibleCardIds} from '../../shared/engine/cards/registry.mjs';
import {createCommandOrderer} from '../../shared/ai/ordering.mjs';
import {sampleWorld} from '../../shared/ai/belief.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog').getCardCatalog().cards;
const ids=multiplayerEligibleCardIds();
function fixture(id){
  const state=createInitialState({matchId:'card-policy',seed:'mixed',cardDefinitions:definitions,
    players:[{id:'a',deckIds:[id,'09','09','09','09','09']},{id:'b',deckIds:['28','03','05','07','06','12','60']}]});
  for(const p of state.players)p.hand.push(...p.deck.splice(0));
  const hand=state.players[0].hand;
  const source=hand.splice(hand.findIndex(c=>c.id===id),1)[0];
  hand.splice(0).forEach((c,i)=>{state.board[i%3][2][Math.floor(i/3)]=c;});
  hand.push(source);
  const enemy=state.players[1];
  state.board[0][1][0]=enemy.hand.pop();
  enemy.deck.push(...enemy.hand.splice(0));
  state.phase='main';state.activePlayer=0;state.turn=8;state.pendingPrompt=null;
  return {state,source};
}
let placements=0;
for(const id of ids){
  const {state,source}=fixture(id);
  const order=createCommandOrderer(state,0);
  for(const command of legalCommandTemplates(state,0).filter(c=>c.payload?.cardIid===source.iid)){
    assert.ok(Number.isFinite(order(command)),id);
    placements++;
  }
}
const {state,source}=fixture('113');
state.board[0][2][2]=state.players[0].hand.pop();
const top=state.players[1].deck.slice(0,5);
state.pendingPrompt={playerIndex:0,type:'CARD_SELECTION',ordered:true,opponentDeck:true,sourceIid:source.iid,local:'orderedIids',eligibleCards:top,eligibleIids:top.map(c=>c.iid)};
for(const seed of [0,1,2]){
  const world=sampleWorld(state,0,seed);
  assert.deepEqual(world.players[1].deck.slice(0,5),top);
}
assert.ok(placements>ids.length);
console.log(ids.length+' card fixtures, '+placements+' legal card commands, revealed draw order in three sampled worlds passed.');
const {state:discardState,source:soldier}=fixture('42');
discardState.board[0][2][2]=discardState.players[0].hand.pop();
const cheap={...soldier,id:'28',iid:'spent',type:'Supporter',currentFate:0};
const strong={...cheap,iid:'invested',currentFate:24};
discardState.players[0].hand.push(cheap,strong);
const answer=iid=>({type:'ANSWER_PROMPT',payload:{selectedIids:[iid]}});
discardState.pendingPrompt={type:'HAND_SELECTION',playerIndex:0,sourceIid:soldier.iid,local:'targetIids'};
const discardOrder=createCommandOrderer(discardState,0);
assert.ok(discardOrder(answer(cheap.iid))>discardOrder(answer(strong.iid)));
const tutor={...soldier,id:'84'};
discardState.board[0][2][2]=tutor;
discardState.pendingPrompt={type:'CARD_SELECTION',playerIndex:0,sourceIid:tutor.iid,local:'targetIid'};
const tutorOrder=createCommandOrderer(discardState,0);
assert.ok(tutorOrder(answer(strong.iid))>tutorOrder(answer(cheap.iid)));
const reorder=createCommandOrderer(state,0);
const orderChoice=cards=>({type:'ANSWER_PROMPT',payload:{selectedIids:cards.map(c=>c.iid)}});
assert.notEqual(reorder(orderChoice(top)),reorder(orderChoice(top.slice().reverse())));
console.log('Discard costs, search targets, and opposing draw order ranked by context.');
