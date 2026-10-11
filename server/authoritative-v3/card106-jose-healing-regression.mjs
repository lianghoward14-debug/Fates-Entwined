import assert from 'node:assert/strict';
import {createInitialState,effectiveFate,applyOperation,modifyMorale} from '../../shared/engine/index.mjs';
import {collectTriggeredOperations} from '../../shared/engine/triggers.mjs';
const definitions=[{id:'106',name:'Jose Garcia',type:'Coordinator',aff:'eventide',fate:4,cost:3},{id:'33',name:'Ally',type:'Supporter',aff:'eventide',fate:1,cost:0}];
for(const owner of [0,1]){
 const state=createInitialState({matchId:'jose',seed:'jose',handSize:9,players:[{id:'p0',deckIds:['106','33','33']},{id:'p1',deckIds:['106','33','33']}],cardDefinitions:definitions,gameSettings:{healthPressureSeals:true,pressureCardReworks:true}});
 const jose=state.players[owner].hand.find(c=>c.id==='106'),ally=state.players[owner].hand.filter(c=>c.id==='33')[0],other=state.players[owner].hand.filter(c=>c.id==='33')[1],enemy=state.players[1-owner].hand.find(c=>c.id==='33');
 state.board[0][2][0]=jose;state.board[0][2][1]=ally;state.board[1][2][0]=other;state.board[0][0][0]=enemy;
 state.players.forEach(p=>p.hand=[]);state.moralePressure.morale=[100,100];const ctx={state,events:[],ruleEvents:[]};
 for(let turn=1;turn<=9;turn++){
  for(const op of collectTriggeredOperations(state,{type:'TURN_STARTED',playerIndex:turn%2}).filter(op=>op.sourceIid===jose.iid))applyOperation(ctx,op);
  const aura=Math.floor(turn/3);
  assert.equal(jose.counters.joseFieldTurns,turn);assert.equal(effectiveFate(state,ally),1+aura);assert.equal(effectiveFate(state,jose),4+aura);
  assert.equal(effectiveFate(state,enemy),1);assert.equal(effectiveFate(state,other),1);assert.equal(state.moralePressure.morale[owner],100-turn*5);
 }
 jose.faceDown=true;assert.equal(effectiveFate(state,ally),1);jose.faceDown=false;
 jose.statuses.push('EFFECTS_SUPPRESSED');assert.equal(effectiveFate(state,ally),1);jose.statuses=[];
 state.board[0][2][0]=null;assert.equal(effectiveFate(state,ally),1);
 state.players[owner].hand.push(jose);applyOperation(ctx,{type:'SET_CARD',playerIndex:owner,cardIid:jose.iid,destination:{z:0,r:owner===0?2:0,c:2}});assert.equal(jose.counters.joseFieldTurns,0);assert.equal(effectiveFate(state,ally),1);
 const before=state.moralePressure.morale[1-owner];modifyMorale(ctx,{playerIndex:owner,amount:10,sourceController:owner,sourceIid:ally.iid,activatedCardEffect:true});assert.equal(state.moralePressure.morale[1-owner],before);
}
console.log('PASS Jose: both seats, both turn starts, 5 Morale each turn, growing friendly-zone aura, hidden/suppressed/removed aura, no old healing retaliation.');
