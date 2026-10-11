import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('src/scripts/27-morale-pressure-ui.js','utf8');const a=source.indexOf('  function recordLegacyMoralePressureCardSet('),b=source.indexOf('\n  function ',a+10);let events=[];const state={_moralePressure:{maxMorale:200,morale:[200,200]}};
const ctx=vm.createContext({window:{},legacyGameState:()=>state,legacyRulesEnabled:()=>true,refreshLegacyMoralePressure:opts=>events.push(...(opts.events||[]))});vm.runInContext(source.slice(a,b),ctx);
for(const owner of [0,1]){ctx.recordLegacyMoralePressureCardSet({id:'33',iid:'heal'+owner,owner});ctx.recordLegacyMoralePressureCardSet({id:'33',iid:'heal'+owner,owner});assert.equal(state._moralePressure.morale[owner],232);}
assert(events.every(e=>e.amount===16));console.log('Legacy singleplayer overheal above 200, repeated healing and full heal events passed');
