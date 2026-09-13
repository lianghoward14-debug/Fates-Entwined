import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,reduceCommand} from '../../shared/engine/index.mjs';
import {cardRule,multiplayerEligibleCardIds} from '../../shared/engine/cards/registry.mjs';
import {filterAiTargets} from '../../shared/ai/targeting.mjs';
import {createCommandOrderer} from '../../shared/ai/ordering.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog').getCardCatalog().cards;
function fixture(id){
  const s=createInitialState({matchId:'effect-audit',seed:'audit',cardDefinitions:definitions,
    gameSettings:{healthPressureSeals:true,pressureCardReworks:true},
    players:[{id:'a',deckIds:[id,'28','05','29','48','27','60']},{id:'b',deckIds:['28','09']}]});
  for(const p of s.players)p.hand.push(...p.deck.splice(0));
  const put=(p,id,z,r,c)=>{const i=s.players[p].hand.findIndex(c=>c.id===id);const card=s.players[p].hand.splice(i,1)[0];s.board[z][r][c]=card;return card;};
  const source=put(0,id,0,2,0);put(0,'28',0,2,1);put(1,'28',0,1,0);
  s.players[0].deck.push(...s.players[0].hand.splice(0));s.phase='main';s.pendingPrompt=null;s.turn=8;
  return {s,source};
}
for(const copied of [false,true])for(const id of ['31','03','05','45']){
  const {s,source}=fixture(id);
  if(copied){source.id='bh05';source.counters.copiedEffectId=id;}
  const own=s.board[0][2][1],enemy=s.board[0][1][0];
  s.pendingPrompt={type:'BOARD_TARGET',playerIndex:0,sourceIid:source.iid,promptId:'audit',eligibleIids:[own.iid,enemy.iid],min:0,max:1,cancellable:id==='31'};
  const filtered=filterAiTargets(legalCommandTemplates(s,0),s,0);
  const wanted=['03','05'].includes(id)?own.iid:enemy.iid;
  assert(filtered.some(c=>c.payload.selectedIid===wanted));
  assert(filtered.every(c=>!c.payload.selectedIid || c.payload.selectedIid===wanted));
  if(id==='31'){
    s.pendingPrompt.eligibleIids=[own.iid];
    assert(filterAiTargets(legalCommandTemplates(s,0),s,0).every(c=>c.payload.cancel===true));
  }
}
const checked=[];
for(const id of multiplayerEligibleCardIds()){
  const rule=cardRule(id,{gameSettings:{pressureCardReworks:true}});
  if(!rule?.timings?.includes('ACTIVATE'))continue;
  const {s,source}=fixture(id);
  const legal=legalCommandTemplates(s,0),order=createCommandOrderer(s,0);
  for(const c of legal)assert(Number.isFinite(order(c)),id+' nonfinite priority');
  const activation=legal.find(c=>c.type==='ACTIVATE_EFFECT' && c.payload.sourceIid===source.iid)
    || legal.find(c=>c.type==='MOVE_CARD' && c.payload.cardIid===source.iid);
  assert(activation,id+' missing activation/movement');
  const result=reduceCommand(s,{type:activation.type,payload:{...activation.payload,...(activation.manualOnly?{userActivated:true}:{})},matchId:s.matchId,expectedRevision:s.revision,commandId:'activate:'+id},{playerId:'a'});
  assert(result.ok,id+': '+JSON.stringify(result.rejection));checked.push(id);
}
console.log('Activation generation/execution checked: '+checked.join(', '));
console.log('Friendly-fire and enemy-buff filters passed for originals and copies, including empty-enemy Oathbound.');

