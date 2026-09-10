import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/scripts/27-morale-pressure-ui.js','utf8');
const start = source.indexOf('  function resolveLegacyMoralePressureTurnEnd(');
const code = source.slice(start,source.indexOf('  function resolveLegacyMoraleLowHandDiscard(',start));
for(const seat of [0,1]) for(const turn of [2,3,4,6]) for(const pacifica of [false,true]){
  const state={turn,landscapeId:pacifica?'igb1':'',_moralePressure:{morale:[200,200],cycle:0}};
  let events=[];
  const context=vm.createContext({window:{},legacyGameState:()=>state,legacyRulesEnabled:()=>true,
    resolveLegacyMoraleSupporterExpiry:()=>[],resolveLegacyMoraleLowHandDiscard:()=>null,
    legacyBoardEntries:()=>[],getZoneScore:(z,p)=>p===seat?[3,10,3][z]:0,
    queueLegacyPresentation:value=>{events=value;}});
  vm.runInContext(code,context);
  context.resolveLegacyMoralePressureTurnEnd(seat);
  const expected=turn>=4&&!pacifica?3:0;
  assert.equal(state._moralePressure.morale[1-seat],200-expected,
    `seat ${seat}, turn ${turn}, Pacifica ${pacifica}: round 33% down separately in each zone`);
  assert.equal(state._moralePressure.morale[seat],200);
  if(turn>=4) assert.equal(events.find(e=>e.type==='MORALE_CYCLE_RESOLVED').damage[1-seat],expected);
}
console.log('Singleplayer 33% Morale damage: both seats, per-zone rounding, turn cadence and Pacifica passed');
