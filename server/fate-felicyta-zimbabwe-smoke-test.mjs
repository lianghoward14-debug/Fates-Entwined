import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, effectiveFate} from '../shared/engine/index.mjs';

const definitions = [
  {id:'01',name:'Felicyta Janowicz',type:'Coordinator',aff:'third_great_war',fate:6,cost:3},
  {id:'25',name:'Zimbabwean Honor Guard',type:'Supporter',aff:'third_great_war',fate:1,cost:0},
  {id:'32',name:'Temecula Resident',type:'Supporter',aff:'reality',fate:1,cost:0},
  {id:'bh11',name:'Felicyta Janowicz (University)',type:'Coordinator',aff:'reality',fate:5,cost:3}
];
const state = createInitialState({
  matchId:'FELICYTA-ZIMBABWE',seed:'felicyta-zimbabwe',handSize:99,
  cardDefinitions:definitions,
  gameSettings:{pressureCardReworks:true},
  players:[{id:'p0',deckIds:['bh11','01','25','32','32','32']},{id:'p1',deckIds:[]}]
});
const take = id => {
  const index = state.players[0].hand.findIndex(card=>card.id===id);
  assert(index>=0,`missing ${id}`);
  const card = state.players[0].hand.splice(index,1)[0];
  card.controller=0;
  return card;
};
state.board[0][2][0]=take('bh11');
state.board[0][2][1]=take('01');
const adjacencyTarget=take('32');state.board[0][2][2]=adjacencyTarget;
assert.equal(effectiveFate(state,adjacencyTarget),9,'University Felicyta must double the adjacent +4 bonus to +8 in her zone');
const otherZone=take('32');state.board[1][2][0]=otherZone;
assert.equal(effectiveFate(state,otherZone),1,'University Felicyta must not affect another zone');

const guard=take('25');state.board[2][2][0]=guard;
const sameAffiliationPeer=take('32');state.board[1][2][1]=sameAffiliationPeer;
assert.equal(effectiveFate(state,otherZone),2,'Zimbabwean Honor Guard must add exactly +1 Fate for same-affiliation adjacency');
assert.equal(effectiveFate(state,sameAffiliationPeer),2,'Zimbabwean Honor Guard must cap each qualifying card at +1 Fate');
assert.equal(effectiveFate(state,guard),1,'a non-adjacent Honor Guard must not qualify itself');

console.log('Felicyta University adjacency multiplier and Zimbabwe +1 aura smoke test passed');

const gameplay=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const helper=gameplay.slice(gameplay.indexOf('function getSuperiorMarksMultiplier('),gameplay.indexOf('window.getSuperiorMarksMultiplier'));
for(const owner of [0,1]) for(const copies of [0,1,2,3]){
 const fixture=createInitialState({matchId:'ADDITIVE',seed:'additive',handSize:99,cardDefinitions:definitions,players:[{id:'p0',deckIds:['01','32','bh11','bh11','bh11']},{id:'p1',deckIds:['01','32','bh11','bh11','bh11']}]});
 const hand=fixture.players[owner].hand;
 const take=id=>{const i=hand.findIndex(c=>c.id===id);const c=hand.splice(i,1)[0];c.controller=owner;return c;};
 fixture.board[0][2][0]=take('01');
 const target=take('32');fixture.board[0][2][1]=target;
 for(let i=0;i<copies;i++)fixture.board[0][0][i]=take('bh11');
 assert.equal(effectiveFate(fixture,target),1+4*(1+copies),'authority additive bonus for '+copies+' Felicytas');
 const local={board:fixture.board.map(zone=>zone.map(row=>row.map(c=>c?{...c,owner:c.controller}:null)))};
 const sandbox=vm.createContext({G:local,cardActsAsPassive:(card,id)=>card.id===id,isFaceDownCard:card=>card.faceDown===true,isCardEffectSuppressed:card=>card.suppressed===true});
 vm.runInContext(helper,sandbox);
 assert.equal(3*sandbox.getSuperiorMarksMultiplier(0,owner),3*(1+copies),'singleplayer +3 bonus stacks additively');
 assert.equal(sandbox.getSuperiorMarksMultiplier(1,owner),1,'other zones unaffected');
 assert.equal(sandbox.getSuperiorMarksMultiplier(0,1-owner),1,'opponent bonuses unaffected');
 if(copies){
  local.board[0][0][0].suppressed=true;
  assert.equal(sandbox.getSuperiorMarksMultiplier(0,owner),copies,'suppressed source stops adding a bonus');
  fixture.board[0][0][0].statuses=['EFFECTS_SUPPRESSED'];
  assert.equal(effectiveFate(fixture,target),1+4*copies,'authority suppression removes one source');
 }
}
console.log('Felicyta 0–3 copies stack additively for both players in both engines.');
