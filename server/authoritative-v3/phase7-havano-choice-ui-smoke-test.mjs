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
const secondHavano = command('havano2', 'SUPPRESS');
const lydia = command('lydia', 'NEGATE');
const choices = [havanoNegate, havanoSuppress, secondHavano, command('havano2', 'NEGATE'), lydia, command('', 'DECLINE')];
const before = JSON.stringify(choices);
const options = [{reactionIid:'havano1',kind:'HAVANO'}, {reactionIid:'havano2',kind:'HAVANO'}, {reactionIid:'lydia',kind:'LYDIA'}];
const visible = context.phase7VisibleReactionChoices(choices, {phase:'ACTIVATION', options});
assert.deepEqual(Array.from(visible), [havanoSuppress, secondHavano, lydia]);
assert.equal(visible[0], havanoSuppress, 'submit the original legal command, unchanged');
for(const card of ['Marie', 'Jimmy (Post-Cynthia Hug)']){
  const result = context.phase7VisibleReactionChoices([havanoSuppress], {phase:'PASSIVE_TARGET', options});
  assert.equal(result.length, 1, `${card} offers one suppression response`);
  assert.equal(result[0], havanoSuppress);
}
assert.equal(context.phase7VisibleReactionChoices([havanoSuppress], {phase:'TARGET', options})[0], havanoSuppress);
assert.equal(JSON.stringify(choices), before, 'UI filtering must not mutate command mechanics');
assert.match(source, /kind === 'HAVANO' \? 'Permanently suppress source'/);
assert.equal(context.phase7VisibleReactionChoices([havanoNegate], {phase:'ACTIVATION', options})[0], havanoNegate);
console.log('Havano choice UI: PASS (one response per card, permanent suppression wording, unchanged commands)');

// The authoritative card status must survive conversion into the shipping icon renderer.
const render = fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
const conversionStart = source.indexOf('  function phase7CardToLegacy(');
const conversionEnd = source.indexOf('  function phase7PresentationCard(', conversionStart);
const iconStart = render.indexOf('function isCardVisuallySuppressed(');
const iconEnd = render.indexOf('\n}', iconStart) + 2;
context.cloneOnlinePlain = value=>JSON.parse(JSON.stringify(value));
context.window = context;
context.isCardEffectSuppressed = card=>card.statuses?.includes('EFFECTS_SUPPRESSED') === true;
vm.runInContext(source.slice(conversionStart, conversionEnd)+'\n'+render.slice(iconStart,iconEnd),context);
const card={id:'93',iid:'suppressed-source',type:'Supporter',owner:0,controller:0,statuses:['EFFECTS_SUPPRESSED'],counters:{},baseFate:1,currentFate:1};
const projected=context.phase7CardToLegacy(card,{statuses:[],board:[[[card]]]});
assert.equal(context.isCardVisuallySuppressed(projected,0,0,0),true,'Havano suppression reaches the board icon');
console.log('Havano projected suppression icon: PASS');
