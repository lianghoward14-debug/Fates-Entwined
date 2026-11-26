import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState} from '../../shared/engine/index.mjs';
import {boardEntries} from '../../shared/engine/selectors.mjs';
import {counterImprovisorPrior,canChargeSantiago} from '../../shared/ai/counter-improvisors.mjs';
const require=createRequire(import.meta.url);
const defs=require('../fate-card-catalog').getCardCatalog().cards;
for(const player of [0,1]){
  const state=createInitialState({matchId:'counter-ai',seed:'test',cardDefinitions:defs,handSize:8,
    players:[0,1].map(id=>({id:String(id),deckIds:['103','86','48','32','05']}))});
  const hand=state.players[player].hand;
  const get=id=>hand.find(c=>c.id===id);
  const row=player===0?2:0;
  const santiago=get('103'),boleslaw=get('86'),strong=get('05'),weak=get('32');
  for(const [i,card] of [santiago,boleslaw,strong,weak].entries())state.board[i%3][row][Math.floor(i/3)]=card;
  strong.baseFate=strong.currentFate=20;weak.baseFate=weak.currentFate=1;
  const entries=boardEntries(state),cards=new Map(hand.map(c=>[c.iid,c]));
  const rank=()=>counterImprovisorPrior(state,player,entries,cards);
  assert.ok(canChargeSantiago(state,player,entries));
  santiago.counters.santiagoCounterGainTurn=state.turn;
  assert.equal(canChargeSantiago(state,player,entries),false);
  state.pendingPrompt={sourceIid:santiago.iid,local:'santiagoTarget'};
  const strike=card=>rank()({type:'ANSWER_PROMPT',payload:{selectedIid:card.iid}});
  assert.ok(strike(strong)>strike(weak));
  state.pendingPrompt=null;
  const place=z=>rank()({type:'CONSOLIDATE_CARD',payload:{cardIid:get('48').iid,destination:{z}}});
  assert.ok(place(1)>place(0));
  const use=()=>rank()({type:'ACTIVATE_EFFECT'},boleslaw);
  state.successfulWhenSetHistory=[{cardId:'32'}];const draw=use();
  state.successfulWhenSetHistory.push({cardId:'69'});
  assert.ok(use()<draw);
}
console.log('Both seats passed counter timing, strike targeting, Boleslaw placement and replay pool checks.');
