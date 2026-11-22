import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState} from '../../shared/engine/index.mjs';
import {canTarget,isImmuneToOpponentEffects,isEffectImmutable} from '../../shared/engine/modifiers.mjs';
import {takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
assert(definitions.some(card=>card.id==='124' && card.fate===12 && card.cost===2 && card.aff==='reality'));
const state=createInitialState({matchId:'CARD124',seed:'card124',handSize:99,activePlayer:0,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['124','32']},{id:'p1',deckIds:['40','32']}]});
const pony=takeFromHandToBoard(state,0,'124',{z:0,r:2,c:0});
const opponent=takeFromHandToBoard(state,1,'40',{z:0,r:0,c:0});
assert(isImmuneToOpponentEffects(pony,state));
assert(!isEffectImmutable(pony),'own effects may still affect the card');
assert.equal(canTarget(state,opponent,pony,{type:'MODIFY_FATE',sourceController:1,sourceIid:opponent.iid,targetIid:pony.iid}).ok,false);
assert.equal(canTarget(state,pony,pony,{type:'MODIFY_FATE',sourceController:0,sourceIid:pony.iid,targetIid:pony.iid}).ok,true);
console.log('PASS card 124 blocks opponent effects and permits own effects');
