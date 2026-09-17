import assert from 'node:assert/strict';
import {createInitialState, reduceCommand, cardRule, isImmuneToOpponentEffects} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const definitions=[
  {id:'101',name:'Jorge Alvarez (El Hombre Piña)',ability:'El Viaje Del Hombre Piña',type:'Coordinator',aff:'eventide',fate:10,cost:2,rarity:'star'},
  {id:'05',name:'Friendly Card',type:'Supporter',aff:'third_great_war',fate:1,cost:0}
];
const state=createInitialState({matchId:'card-101',seed:'card-101',handSize:0,activePlayer:0,
  players:[{id:'p0',deckIds:[]},{id:'p1',deckIds:[]}],cardDefinitions:definitions,
  gameSettings:{healthPressureSeals:true,pressureCardReworks:true,zoneControlRework:true}});
function place(definition,owner,z,r,c,suffix){
  const card={...definition,iid:`card-101:${suffix}`,owner,controller:owner,baseFate:definition.fate,currentFate:definition.fate,faceDown:false,statuses:[],counters:{}};
  state.board[z][r][c]=card;
  return card;
}
place(definitions[0],0,0,0,0,'jorge');
const adjacent=place(definitions[1],0,0,1,1,'adjacent');
const distant=place(definitions[1],0,0,2,2,'distant');

assert.deepEqual(cardRule('101').timings,['PASSIVE','TURN_BOUNDARY']);
assert(cardRule('101').effectLabels.includes('ADJACENT_DIAGONAL_OPPONENT_EFFECT_IMMUNITY'));
assert.equal(isImmuneToOpponentEffects(adjacent,state),true,'diagonal friendly card is protected');
assert.equal(isImmuneToOpponentEffects(distant,state),false,'distant friendly card is not protected');

const result=reduceCommand(state,command(state,'p0',1,'END_TURN',{}),{playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.state.board[0][1][1].currentFate,2,'adjacent and diagonal card gains 1 Fate every turn');
assert.equal(result.state.board[0][2][2].currentFate,1,'non-adjacent card gains no Fate');
assert.equal(result.state.board[0][0][0].currentFate,10,'Jorge does not grant the bonus to himself');
assert(result.events.some(event=>event.type==='FATE_CHANGED'&&event.semanticSourceCardId==='101'));

console.log('card 101 El Viaje Del Hombre Piña smoke test passed');
