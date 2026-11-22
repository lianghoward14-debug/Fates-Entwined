import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {legalCommandTemplates} from '../../shared/engine/legal-commands.mjs';

const {cards}=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog();
for(const [id,key] of [['36','deterranceCounters'],['121','infernoCounters']]){
  let state=createInitialState({matchId:'counter-spend-'+id,seed:'counter-spend-'+id,handSize:99,
    activePlayer:0,cardDefinitions:cards,players:[{id:'p0',deckIds:[id,'32']},{id:'p1',deckIds:['32','32']}]});
  const source=state.players[0].hand.splice(state.players[0].hand.findIndex(card=>card.id===id),1)[0];
  state.board[0][2][0]=source;
  state.players[1].deck.push(state.players[1].hand.pop());
  source.counters[key]=1;
  const command=legalCommandTemplates(state,0).find(item=>item.type==='ACTIVATE_EFFECT'&&item.payload.sourceIid===source.iid);
  assert(command,`${id} offers a manual counter-spend action`);
  const beforeDeck=state.players[1].deck.length;
  const result=reduceCommand(state,{commandId:'spend-'+id,matchId:state.matchId,expectedRevision:state.revision,
    type:'ACTIVATE_EFFECT',payload:{...command.payload,userActivated:true}},{playerId:'p0'});
  assert.equal(result.ok,true,JSON.stringify(result.rejection));
  assert.equal(result.state.board[0][2][0].counters[key],0);
  if(id==='36')assert(result.state.statuses.some(status=>status.reason==='MARIE_DETERRANCE'&&status.value===-4));
  else {
    assert.equal(result.state.players[1].deck.length,beforeDeck-1);
    assert(result.events.some(event=>event.type==='CARD_DISCARDED'&&event.reason==='BLAZING_INFERNO'));
  }
  assert(!legalCommandTemplates(result.state,0).some(item=>item.type==='ACTIVATE_EFFECT'&&item.payload.sourceIid===source.iid));
}
console.log('Marie and Seventh Magician spend one counter per manual activation.');
