import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand} from '../shared/engine/index.mjs';
import {command} from './authoritative-v3/test-helpers.mjs';
const render=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const gameplay=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
for(const remaining of [11,13]){
  let finishEffect,opened=0;
  const c={G:{players:[{hand:Array(14).fill({})},{hand:[]}]},
    getActiveHandLimit:()=>12,getHandLimitCount:p=>c.G.players[p].hand.length,
    getPerspectivePlayerIndex:()=>0,openHandLimitDiscardModal:()=>opened++,
    document:{body:{classList:{contains:()=>false}}},
    resolveWhenSetEffect:()=>{c.enforceHandLimit(0);return new Promise(r=>finishEffect=r);}};
  vm.runInNewContext(render.slice(render.indexOf('function enforceHandLimit('),render.indexOf('function openHandLimitDiscardModal(')),c);
  vm.runInNewContext(gameplay.slice(gameplay.indexOf('async function triggerWhenSet('),gameplay.indexOf('async function resolveWhenSetEffect(')),c);
  const pending=c.triggerWhenSet({id:'42'},0,0,0);
  assert.equal(opened,0,'no hand-limit picker during West German resolution');
  c.G.players[0].hand.length=remaining;finishEffect();await pending;
  assert.equal(opened,remaining>12?1:0,'recompute hand limit only after mandatory discards');
}
let state=createInitialState({matchId:'west-german-hand-limit',seed:'test',handSize:0,
 cardDefinitions:[{id:'42',name:'West German Soldier',type:'Supporter',fate:1,cost:0},{id:'32',name:'Resident',type:'Supporter',fate:1,cost:0}],
 players:[{id:'p0',deckIds:['42',...Array(14).fill('32')]},{id:'p1',deckIds:['32']}]});
const deck=state.players[0].deck;
const soldier=deck.splice(deck.findIndex(c=>c.id==='42'),1)[0];
state.players[0].hand.push(soldier,...deck.splice(0,11));
let result=reduceCommand(state,command(state,'p0',1,'SET_CARD',{cardIid:soldier.iid,destination:{z:0,r:2,c:0}}),{playerId:'p0'});
assert.equal(result.ok,true);assert.equal(result.state.players[0].hand.length,14);
assert.equal(result.prompt.min,3);assert.equal(result.state.pendingHandLimit,null,'authority prioritizes West German discard while over 12');
state=result.state;
result=reduceCommand(state,command(state,'p0',2,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIids:state.pendingPrompt.eligibleIids.slice(0,3)}),{playerId:'p0'});
assert.equal(result.ok,true);assert.equal(result.state.players[0].hand.length,11);assert.equal(result.state.pendingHandLimit,null);
console.log('West German precedes hand-limit discard in local and authoritative flows');
