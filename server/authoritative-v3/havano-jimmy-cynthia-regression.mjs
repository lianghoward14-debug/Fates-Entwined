import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
const require=createRequire(import.meta.url);
const defs=require('../fate-card-catalog.js').getCardCatalog().cards;
for(const seat of [0,1])for(const react of [false,true]){
 let state=createInitialState({matchId:`jimmy-${seat}-${react}`,seed:'jimmy',activePlayer:seat,handSize:99,cardDefinitions:defs,
  players:[0,1].map(p=>({id:'p'+p,deckIds:p===seat?['bh18']:['79','32','32','05','05','05']}))});
 const opponent=1-seat,source=state.players[seat].hand.pop();source.faceDown=true;
 state.board[0][seat===0?2:0][0]=source;
 const defender=state.players[opponent];defender.deck=defender.hand.filter(c=>c.id==='05');defender.hand=defender.hand.filter(c=>c.id!=='05');
 const havano=defender.hand.find(c=>c.id==='79'),otherIids=defender.hand.filter(c=>c!==havano).map(c=>c.iid);
 const deckBefore=defender.deck.map(c=>c.iid);let n=0;
 function send(p,type,payload){const result=reduceCommand(state,{commandId:String(++n),matchId:state.matchId,expectedRevision:state.revision,type,payload},{playerId:'p'+p});assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;}
 send(seat,'FLIP_CARD',{cardIid:source.iid});
 assert.equal(state.pendingPrompt.type,'REACTION');
 assert.ok(state.pendingPrompt.options.some(o=>o.kind==='HAVANO'&&o.reactionIid===havano.iid));
 if(react){
  send(opponent,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,reactionIid:havano.iid,choice:'NEGATE'});
  assert.equal(state.pendingPrompt.context,'HAVANO_SET');
  send(opponent,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,destination:state.pendingPrompt.eligible[0]});
  assert.deepEqual(state.players[opponent].hand.map(c=>c.iid),otherIids,'Jimmy must not discard the remaining hand');
  assert.deepEqual(state.players[opponent].deck.map(c=>c.iid),deckBefore,'Jimmy must not draw replacements');
  assert.equal(state.players[opponent].discard.length,0);
  assert.ok(state.board.flat(3).some(c=>c?.iid===havano.iid),'Havano deploys');
 }else{
  send(opponent,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,choice:'DECLINE'});
  assert.equal(state.players[opponent].discard.length,3,'declining Havano lets Jimmy discard the hand');
  assert.equal(state.players[opponent].deck.length,0);
  assert.equal(state.players[opponent].hand.length,3);
 }
 assert.equal(state.pendingPrompt,null);assert.equal(state.effectStack.length,0);
}
console.log('PASS Havano vs Jimmy (Post-Cynthia Hug), both seats: reaction offered, negate preserves hand/deck and deploys Havano; passing resolves discard/redraw.');
