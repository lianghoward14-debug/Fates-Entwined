import assert from 'node:assert/strict';
import {createInitialState} from '../../shared/engine/index.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';
import catalog from '../fate-card-catalog.js';

for(const seat of [0,1]){
  const state=createInitialState({matchId:`shizuku-broadcast-${seat}`,seed:'shizuku',activePlayer:seat,
    landscapeId:'igb17',handSize:40,cardDefinitions:catalog.getCardCatalog().cards,
    players:[0,1].map(p=>({id:`p${p}`,deckIds:['10','05']}))});
  const row=seat===0?2:0;
  const hand=state.players[seat].hand;
  state.board[1][row][0]=hand.splice(hand.findIndex(c=>c.id==='10'),1)[0];
  state.supportersSetThisTurn[seat]=2;
  const actor=new AuthoritativeRoomActor({state,store:{commandResponse:()=>null,appendAccepted(){}}});
  let sequence=0;
  async function submit(template){
    const result=await actor.dispatch(`p${seat}`,{...template,commandId:`command-${++sequence}`,
      matchId:state.matchId,expectedRevision:actor.state.revision});
    assert.equal(result.response.kind,'accepted',JSON.stringify(result.response.rejection));
    return result;
  }
  await submit(actor.snapshotForPlayer(seat).legalCommands.find(c=>c.type==='ACTIVATE_LANDSCAPE'));
  const token=actor.state.players[seat].hand.find(c=>c.id==='whisper17');
  const place=actor.snapshotForPlayer(seat).legalCommands.find(c=>c.type==='SET_CARD'&&c.payload.cardIid===token.iid);
  assert(place,'Shizuku placement remains available after using the Supporter allowance');
  const result=await submit(place);
  assert.equal(result.broadcasts.length,2);
  for(const {message} of result.broadcasts){
    assert(message.state.board.flat(2).some(c=>c?.iid===token.iid),'both clients receive Shizuku on the board');
    assert(message.events.some(e=>e.type==='CARD_SET'&&e.cardIid===token.iid));
  }
  assert(!actor.state.players[seat].hand.some(c=>c.iid===token.iid));
}
console.log('Shizuku placement broadcasts to both players for either seat after the Supporter allowance is used');
