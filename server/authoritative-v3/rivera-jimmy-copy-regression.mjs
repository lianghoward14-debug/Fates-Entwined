import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,applyOperation,reduceCommand,effectiveFate,projectStateForPlayer} from '../../shared/engine/index.mjs';
const require=createRequire(import.meta.url),defs=require('../fate-card-catalog.js').getCardCatalog().cards;
for(const owner of [0,1])for(const hidden of [false,true]){
 const enemy=1-owner;
 let state=createInitialState({matchId:`rivera-jimmy-${owner}-${hidden}`,seed:'rivera-jimmy',handSize:99,activePlayer:owner,cardDefinitions:defs,players:[0,1].map(p=>({id:'p'+p,deckIds:['104','41','32']}))});
 const op=o=>applyOperation({state,events:[],ruleEvents:[]},o);
 const put=(p,id,z)=>{const card=state.players[p].hand.find(c=>c.id===id);op({type:'SET_CARD',playerIndex:p,cardIid:card.iid,destination:{z,r:p?0:2,c:0},faceDown:id==='104'&&hidden});return card.iid};
 const rivera=put(owner,'104',0),jimmy=put(enemy,'41',1),target=put(owner,'32',2);
 let n=0;const send=(p,type,payload)=>{const result=reduceCommand(state,{commandId:String(++n),matchId:state.matchId,expectedRevision:state.revision,type,payload},{playerId:'p'+p});assert(result.ok,JSON.stringify(result.rejection));state=result.state};
 send(owner,'ACTIVATE_EFFECT',{sourceIid:rivera,userActivated:true});send(owner,'END_TURN',{});
 const find=iid=>state.board.flat(2).find(c=>c?.iid===iid);
 for(let i=1;i<=3;i++){
  op({type:'MODIFY_FATE',targetIid:target,amount:4,sourceController:owner});
  const riveraBefore=find(rivera).currentFate,jimmyBefore=effectiveFate(state,find(jimmy));
  op({type:'MODIFY_FATE',targetIid:target,amount:-1,sourceIid:jimmy,sourceController:enemy});
  assert.equal(effectiveFate(state,find(jimmy)),jimmyBefore+3,'Jimmy retains his full +3 derived Fate');
  assert.equal(find(rivera).currentFate,riveraBefore+3,'Rivera also receives +3');
  const ownView=projectStateForPlayer(state,owner);const projected=ownView.board.flat(2).find(c=>c?.iid===rivera);assert(projected,'Rivera remains in owner projection');
 }
}
console.log('PASS multiplayer Rivera/Jimmy: three successive +3 gains retained and copied, both seats, face-up and hidden Rivera.');

for(const owner of [0,1])for(const hidden of [false,true]){
 const enemy=1-owner;
 const state=createInitialState({matchId:`rivera-maroon-${owner}-${hidden}`,seed:'rivera-maroon',handSize:99,activePlayer:enemy,cardDefinitions:defs,players:[0,1].map(p=>({id:'p'+p,deckIds:['104','59','32']}))});
 const ctx={state,events:[],ruleEvents:[]};
 const put=(p,id,z,c)=>{
  const card=state.players[p].hand.find(entry=>entry.id===id);
  applyOperation(ctx,{type:'SET_CARD',playerIndex:p,cardIid:card.iid,destination:{z,r:p?0:2,c},faceDown:id==='104'&&hidden});
  return card;
 };
 const rivera=put(owner,'104',2,0);
 put(enemy,'59',0,0);
 state.statuses.push({type:'TIMED_PLAYER_STATUS',statusType:'RIVERA_FATE_TRANSFER',sourceIid:rivera.iid,sourceController:owner,playerIndex:enemy,activeFromTurn:state.turn,remainingTargetTurns:1});
 const before=rivera.currentFate;
 const supporter=put(enemy,'32',0,1);
 assert.equal(effectiveFate(state,supporter),supporter.currentFate+1,'the arriving Supporter receives the Maroon Knights aura');
 assert.equal(rivera.currentFate,before+1,'Rivera copies the +1 aura on arrival across zones');
 assert.equal(rivera.counters.riveraFateTransferred,1,'the tracker records the copied aura');
 applyOperation(ctx,{type:'SET_CARD_COUNTER',targetIid:supporter.iid,counterKey:'unrelated',value:1});
 assert.equal(rivera.currentFate,before+1,'unchanged total Fate is not copied twice');
}
console.log('PASS Rivera/Maroon Knights: Supporter arrival +1 copied once across zones, both seats, face-up and hidden Rivera.');
