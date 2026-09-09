import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
const context = vm.createContext({G:{turn:13}, isLandscapeActive:()=>true, isCardSupporterForRules:c=>c.type === 'Supporter'});
for (const name of ['getMoscowSupporterTenureState', 'buildMoscowSupporterTenureHTML']) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
}
const supporter = {owner:0, type:'Supporter', _setTurn:7};
for (const protection of [{}, {immuneFlag:true}, {_immuneByMakenna:true, immuneFlag:true}, {opponentEffectImmune:true}, {_igb24OpponentEffectImmune:true}]) {
  const card = {...supporter, ...protection};
  assert.equal(context.getMoscowSupporterTenureState(card).turnsOnField, 6);
  assert.match(context.buildMoscowSupporterTenureHTML(card), /cd-moscow-symbol/);
}
assert.equal(context.buildMoscowSupporterTenureHTML({...supporter, _igb24DawnFateGranted:true}), '');
assert.equal(context.buildMoscowSupporterTenureHTML({...supporter, counters:{igb24DawnFateGranted:true}}), '');
assert.equal(context.buildMoscowSupporterTenureHTML({...supporter, type:'Character'}), '');
context.G.turn = 20;
assert.equal(context.buildMoscowSupporterTenureHTML(supporter), '');
console.log('Moscow immunity display regression passed');
