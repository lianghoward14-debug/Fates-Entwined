import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand,legalCommandTemplates} from '../../shared/engine/index.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const {cards}=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog();
for(const seat of [0,1]){
 const state=createInitialState({matchId:'blockade-turns',seed:'blockade',handSize:99,activePlayer:seat,cardDefinitions:cards,players:[0,1].map(i=>({id:'p'+i,deckIds:['114','114','32','27']}))});
 const row=p=>p?0:2;
 for(const c of [0,1])takeFromHandToBoard(state,1-seat,'114',{z:0,r:row(1-seat),c});
 const supporter=state.players[seat].hand.find(c=>c.id==='32');
 let result=reduceCommand(state,command(state,'p'+seat,1,'SET_CARD',{cardIid:supporter.iid,destination:{z:0,r:row(seat),c:0}}),{playerId:'p'+seat});
 assert(result.ok,JSON.stringify(result.error));
 const placed=result.state,entryTurn=placed.turn;
 const character=placed.players[seat].hand.find(c=>c.id==='27');
 const payload={cardIid:character.iid,tributeIids:[supporter.iid],destination:{z:0,r:row(seat),c:0}};
 // The opponent of the Havano owner takes their first and second subsequent turns.
 for(const [elapsed,allowed] of [[0,false],[2,false],[4,true]]){
  const s=structuredClone(placed);s.turn=entryTurn+elapsed;
  const available=legalCommandTemplates(s,seat).some(c=>c.type==='CONSOLIDATE_CARD'&&c.payload.cardIid===character.iid&&c.payload.tributeIids.includes(supporter.iid));
  assert.equal(available,allowed,'legal picker must honor stacked owner turns');
  result=reduceCommand(s,command(s,'p'+seat,10+elapsed,'CONSOLIDATE_CARD',payload),{playerId:'p'+seat});
  assert.equal(result.ok,allowed,JSON.stringify(result.error));
  if(!allowed)assert.equal(result.rejection.code,'TRIBUTE_PREVENTED');
 }
}
console.log('PASS: real placement, legal picker and submitted consolidation block through first opponent turn; release on second, both seats.');
