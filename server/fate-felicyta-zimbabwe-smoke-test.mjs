import assert from 'node:assert/strict';
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
