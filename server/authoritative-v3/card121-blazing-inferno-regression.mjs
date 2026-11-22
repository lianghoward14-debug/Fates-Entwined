import assert from 'node:assert/strict';
import {createMoralePressureState,modifyMorale} from '../../shared/engine/morale-pressure.mjs';
import {projectEvents} from '../../shared/engine/projections.mjs';

for(const attacker of [0,1]){
  const victim = 1 - attacker;
  const source = {id:'121',iid:'magician',owner:attacker,controller:attacker,type:'Improvisor',statuses:[]};
  const top = {id:'01',iid:'top',name:'Top card',owner:victim};
  const bottom = {id:'02',iid:'bottom',name:'Bottom card',owner:victim};
  const players = [{deck:[],discard:[]},{deck:[],discard:[]}];
  players[victim].deck = [top,bottom];
  const state = {turn:1,gameSettings:{healthPressureSeals:true},board:[[[source]]],players,statuses:[],moralePressure:createMoralePressureState()};
  const ctx = {state,events:[]};
  modifyMorale(ctx,{playerIndex:victim,amount:-3,sourceController:attacker});
  assert.deepEqual(players[victim].discard.map(card=>card.iid),[]);
  assert.deepEqual(players[victim].deck.map(card=>card.iid),['top','bottom']);
  assert.equal(source.counters.infernoCounters,1);
  for(const seat of [0,1]) assert(projectEvents(ctx.events,seat).some(event=>
    event.type==='CARD_COUNTER_SET' && event.counterKey==='infernoCounters'
      && event.value===1 && event.sourceIid==='magician'));
  modifyMorale(ctx,{playerIndex:victim,amount:-2,sourceController:attacker,reason:'ABILITY_COST'});
  assert.equal(source.counters.infernoCounters,1,'paying a cost does not add a counter');
  source.statuses.push('EFFECTS_SUPPRESSED');
  modifyMorale(ctx,{playerIndex:victim,amount:-2,sourceController:attacker});
  assert.equal(source.counters.infernoCounters,1,'suppression stops the effect');
  source.statuses.length=0;
  players[victim].deck.unshift({id:'03',iid:'effect-top',name:'Effect damage card',owner:victim});
  modifyMorale(ctx,{playerIndex:victim,amount:-2,sourceIid:source.iid});
  assert.equal(source.counters.infernoCounters,2,'source-card effect damage triggers without sourceController');
}
console.log('PASS card 121 gains a counter from Morale Damage for both seats');
