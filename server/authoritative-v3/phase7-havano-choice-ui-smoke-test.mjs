import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js', import.meta.url), 'utf8');
const start = source.indexOf('  function phase7VisibleReactionChoices(');
const end = source.indexOf('  function phase7OpenBoardPromptPicker(', start);
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);
const command = (reactionIid, choice)=>({type:'ANSWER_PROMPT', payload:{promptId:'prompt1', reactionIid, choice}});
const havanoNegate = command('havano1', 'NEGATE');
const havanoSuppress = command('havano1', 'SUPPRESS');
const secondHavano = command('havano2', 'NEGATE');
const lydia = command('lydia', 'NEGATE');
const choices = [havanoNegate, havanoSuppress, secondHavano, command('havano2', 'SUPPRESS'), lydia, command('', 'DECLINE')];
const before = JSON.stringify(choices);
const options = [{reactionIid:'havano1',kind:'HAVANO'}, {reactionIid:'havano2',kind:'HAVANO'}, {reactionIid:'lydia',kind:'LYDIA'}];
const visible = context.phase7VisibleReactionChoices(choices, {phase:'ACTIVATION', options});
assert.deepEqual(Array.from(visible), [havanoNegate, secondHavano, lydia]);
assert.equal(visible[0], havanoNegate, 'submit the original legal command, unchanged');
for(const card of ['Marie', 'Jimmy (Post-Cynthia Hug)']){
  const result = context.phase7VisibleReactionChoices([havanoSuppress], {phase:'PASSIVE_TARGET', options});
  assert.equal(result.length, 1, `${card} offers one suppression response`);
  assert.equal(result[0], havanoSuppress);
}
assert.equal(context.phase7VisibleReactionChoices([havanoSuppress], {phase:'TARGET', options})[0], havanoSuppress);
assert.equal(JSON.stringify(choices), before, 'UI filtering must not mutate command mechanics');
assert.match(source, /kind === 'HAVANO' \? \(mode === 'SUPPRESS' \? 'Suppress' : 'Negate'\)/);
console.log('Havano choice UI: PASS (one response per card, negate/suppress wording, unchanged commands)');
