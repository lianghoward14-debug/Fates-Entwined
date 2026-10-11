import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand,applyOperation,legalCommandTemplates,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {emitRuleEvent} from '../../shared/engine/operations.mjs';
const defs=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
function fixture(owner=0,hidden=false,morale=false){
  let state=createInitialState({matchId:'anne',seed:'anne',handSize:4,activePlayer:owner,cardDefinitions:defs,gameSettings:{healthPressureSeals:morale},
    players:[0,1].map(p=>({id:'p'+p,deckIds:['107',...Array(20).fill('32')]}))});
  // Draw order is shuffled; move Anne into the fixture hand explicitly.
  const player=state.players[owner];let source=player.hand.find(c=>c.id==='107');
  if(!source){source=player.deck.find(c=>c.id==='107');player.deck=player.deck.filter(c=>c!==source);player.hand.push(source);}
  let sequence=0;const row=owner===0?2:0;
  const api={get state(){return state;},get source(){return state.board[0][row][0];},owner,enemy:1-owner,
    op(operation){const ctx={state,events:[],ruleEvents:[]};applyOperation(ctx,operation);return ctx;},
    event(event){const ctx={state,events:[],ruleEvents:[]};emitRuleEvent(ctx,event);return ctx;},
    send(p,type,payload={}){const result=reduceCommand(state,{commandId:String(++sequence),matchId:state.matchId,expectedRevision:state.revision,type,payload},{playerId:'p'+p});assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;return result;},
    declare(action){this.send(owner,'ACTIVATE_EFFECT',{sourceIid:this.source.iid,userActivated:true});assert.equal(state.pendingPrompt.options.length,6);assert.equal(state.pendingPrompt.cancellable,false);assert(!legalCommandTemplates(state,owner).some(command=>command.payload?.cancel===true),'Anne has no cancel command');this.send(owner,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,choice:action});}
  };
  api.op({type:'SET_CARD',playerIndex:owner,cardIid:source.iid,destination:{z:0,r:row,c:0},faceDown:hidden});
  return api;
}
for(const owner of [0,1])for(const hidden of [false,true])for(const action of ['DRAW','SEARCH','FATE','MOVEMENT','STATUS','MORALE']){
  const h=fixture(owner,hidden,action==='MORALE');h.declare(action);
  assert.equal(h.source.faceDown,hidden);
  assert.equal(h.source.counters.anneLastActivatedTurn,h.state.turn);
  if(hidden)assert.deepEqual(projectStateForPlayer(h.state,h.enemy).board[0][owner?0:2][0].counters,{});
  const before=h.source.currentFate;
  h.event({type:'DECK_SEARCHED',sourceController:h.enemy,playerIndex:h.enemy});assert.equal(h.source.currentFate,before,'no reward on own turn');
  if(action==='STATUS')h.op({type:'CREATE_TIMED_PLAYER_STATUS',playerIndex:h.enemy,sourceIid:h.source.iid,sourceController:owner,statusType:'SUPPORTER_EFFECTS_BLOCKED',targetTurns:1,startsNextTargetTurn:true});
  h.send(owner,'END_TURN');
  const trigger=()=>{
    if(action==='DRAW')h.op({type:'DRAW_CARD',playerIndex:h.enemy,count:1,activatedEffect:true});
    if(action==='SEARCH')h.event({type:'DECK_SEARCHED',sourceController:h.enemy,playerIndex:h.enemy,count:1});
    if(action==='FATE')h.op({type:'MODIFY_FATE',targetIid:h.state.players[h.enemy].hand[0].iid,amount:-1,sourceController:h.enemy});
    if(action==='MOVEMENT')h.event({type:'CARD_MOVED',sourceController:h.enemy,playerIndex:h.enemy});
    if(action==='STATUS')h.op({type:'CREATE_MATCH_STATUS',status:{type:'NEXT_SUPPORTER_SET_EXEMPT',playerIndex:h.enemy,sourceIid:h.state.players[h.enemy].hand[0].iid,remaining:1}});
    if(action==='MORALE')h.op({type:'MODIFY_MORALE',playerIndex:h.enemy,amount:5,sourceController:h.enemy});
  };
  trigger();assert.equal(h.source.currentFate,before+8,`${action} ${owner} ${hidden}`);
  trigger();assert.equal(h.source.currentFate,before+8,'only one reward per declaration');
  assert.equal(h.source.counters.anneFateGained,8);
  h.send(h.enemy,'END_TURN');h.declare('SEARCH');h.send(owner,'END_TURN');
  h.event({type:'DECK_SEARCHED',sourceController:h.enemy,playerIndex:h.enemy});assert.equal(h.source.currentFate,before+16);
  assert.equal(h.source.counters.anneFateGained,16);
  h.send(h.enemy,'END_TURN');
  assert(!legalCommandTemplates(h.state,owner).some(c=>c.type==='ACTIVATE_EFFECT'&&c.payload.sourceIid===h.source.iid),'two-use limit');
}
for(const action of ['SEARCH','FATE','MOVEMENT','STATUS','MORALE']){
  const h=fixture();h.declare(action);h.send(0,'END_TURN');h.send(1,'END_TURN');h.send(0,'END_TURN');
  h.event({type:'DECK_SEARCHED',sourceController:1,playerIndex:1});h.op({type:'MODIFY_FATE',targetIid:h.state.players[1].hand[0].iid,amount:2});
  assert.equal(h.source.currentFate,2,'missed declarations expire');
}
{
  const h=fixture();h.declare('SEARCH');h.declare('SEARCH');h.send(0,'END_TURN');h.event({type:'DECK_SEARCHED',sourceController:1,playerIndex:1});
  assert.equal(h.source.currentFate,18,'both independently armed declarations resolve');
}
{
  const h=fixture();h.declare('FATE');h.send(0,'END_TURN');
  const unit=h.state.players[1].hand[0];h.op({type:'SET_CARD',playerIndex:1,cardIid:unit.iid,destination:{z:1,r:0,c:0}});
  assert.equal(h.source.currentFate,2,'printed Fate on arrival is not an increase effect');
  h.op({type:'SET_FATE',targetIid:unit.iid,value:0,sourceController:1});assert.equal(h.source.currentFate,10,'absolute Fate changes count');
}
{
  const h=fixture();h.declare('STATUS');
  h.op({type:'CREATE_TIMED_PLAYER_STATUS',playerIndex:1,sourceIid:h.source.iid,sourceController:0,statusType:'SUPPORTER_EFFECTS_BLOCKED',targetTurns:1,startsNextTargetTurn:true});
  assert.equal(h.source.currentFate,2);h.send(0,'END_TURN');assert.equal(h.source.currentFate,2,'existing status alone does not activate an effect');
}
{
  const h=fixture();h.declare('MOVEMENT');h.send(0,'END_TURN');
  const unit=h.state.players[1].hand[0];h.op({type:'SET_CARD',playerIndex:1,cardIid:unit.iid,destination:{z:1,r:0,c:0}});
  h.op({type:'MOVE_CARD',cardIid:unit.iid,destination:{z:1,r:0,c:1},sourceIid:unit.iid,sourceController:1});
  assert.equal(h.source.currentFate,10,'actual movement operation qualifies');
}
for(const delta of [1,-1]){
  const h=fixture();
  const unit=h.state.players[1].hand[0];unit.id='106';unit.type='Coordinator';
  h.op({type:'SET_CARD',playerIndex:1,cardIid:unit.iid,destination:{z:1,r:0,c:0}});
  // Jose's tier changes are continuous Fate, not permanent MODIFY_FATE calls.
  h.op({type:'SET_CARD_COUNTER',targetIid:unit.iid,counterKey:'joseFieldTurns',value:delta>0?0:3});
  h.declare('FATE');h.send(0,'END_TURN');
  h.op({type:'SET_CARD_COUNTER',targetIid:unit.iid,counterKey:'joseFieldTurns',sourceController:1,value:delta>0?3:0});
  assert.equal(h.source.currentFate,10,'continuous Fate '+delta+' qualifies');
}
{
  const h=fixture();h.declare('STATUS');h.send(0,'END_TURN');
  h.op({type:'CREATE_STATUS',sourceIid:h.state.players[1].hand[0].iid,targetIid:h.state.players[1].hand[0].iid,status:'IMMUNE_TO_OPPONENT_EFFECTS'});
  assert.equal(h.source.currentFate,10,'a status activated on an opponent hand card counts too');
  // Card-local statuses on the board also qualify, regardless of who applied them.
  const card=h.state.players[1].hand[0];h.op({type:'SET_CARD',playerIndex:1,cardIid:card.iid,destination:{z:1,r:0,c:0}});
  assert.equal(h.source.currentFate,10);
}
{
  const h=fixture();h.declare('SEARCH');h.send(0,'END_TURN');
  h.source.statuses.push('EFFECTS_SUPPRESSED');h.event({type:'DECK_SEARCHED',sourceController:1,playerIndex:1});assert.equal(h.source.currentFate,2);
  h.source.statuses=[];h.event({type:'DECK_SEARCHED',playerIndex:0});assert.equal(h.source.currentFate,2,'owner search cannot satisfy opponent search');
  h.event({type:'DECK_SEARCHED',sourceController:1,playerIndex:1});assert.equal(h.source.currentFate,10);
}
{
  const h=fixture();h.declare('SEARCH');const iid=h.source.iid;
  h.op({type:'DISCARD_CARD',targetIid:iid});
  h.op({type:'TRANSFER_CARDS',targetIid:iid,playerIndex:0,destinationPile:'hand'});
  h.op({type:'SET_CARD',cardIid:iid,playerIndex:0,destination:{z:0,r:2,c:0}});
  assert.equal(h.source.counters.anneDeclarations,undefined,'re-entry clears the old plan');
  assert.equal(h.source.counters.effectUses,1,'re-entry keeps the use budget');
}
console.log('PASS Anne 107: all six declarations, both seats, face-down privacy, expiry, permanent/continuous Fate, active/new statuses, movement, suppression, re-entry and two-use limit.');

for(const action of ['DRAW','SEARCH','FATE','MOVEMENT','STATUS','MORALE']){
 const h=fixture(0,false,true);h.declare(action);h.send(0,'END_TURN');
 assert.equal(h.source.currentFate,2,'normal turn draw must not satisfy '+action);
 const event={DRAW:'CARD_DRAWN',SEARCH:'DECK_SEARCHED',FATE:'FATE_CHANGED',MOVEMENT:'CARD_MOVED',STATUS:'STATUS_CREATED',MORALE:'MORALE_DAMAGED'}[action];
 h.event({type:event,playerIndex:1,amount:8,status:{type:'NORMAL_GAME_STATUS'}});
 assert.equal(h.source.currentFate,2,'unattributed normal action must not satisfy '+action);
 h.event({type:action==='DRAW'?'DRAW_EFFECT_ACTIVATED':event,playerIndex:1,sourceController:0,sourceIid:h.source.iid,status:{type:'EFFECT_STATUS'}});
 assert.equal(h.source.currentFate,2,'Anne owner effect cannot satisfy opponent declaration '+action);
 h.event({type:action==='DRAW'?'DRAW_EFFECT_ACTIVATED':event,playerIndex:1,sourceController:1,sourceIid:h.state.players[1].hand[0].iid,amount:8,status:{type:'EFFECT_STATUS'}});
 assert.equal(h.source.currentFate,10,'effect action qualifies for '+action);
 assert.equal(h.source.counters.anneFateGained,8);
}
console.log('PASS Anne effect-only declarations: normal turn draws and unattributed actions excluded in all six categories.');
