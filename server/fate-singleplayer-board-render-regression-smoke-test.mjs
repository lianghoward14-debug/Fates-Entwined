import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const gameplay = fs.readFileSync(new URL('../src/scripts/05-gameplay-core.js', import.meta.url), 'utf8');
const data = fs.readFileSync(new URL('../src/scripts/01-data-and-state.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const manualButton = gameplay.match(/function shouldShowManualCharacterEffectButton\(card\)[\s\S]*?\n}/)?.[0] || '';
assert.ok(manualButton, 'manual board-effect visibility guard must exist');
assert.doesNotMatch(
  manualButton,
  /\bPLAYER_TIMED_MANUAL_EFFECT_CARD_IDS\b/,
  'board snapshot rendering must not reference an undeclared manual-effect list'
);
assert.match(
  manualButton,
  /window\.fateEffectRequiresManualActivationId\?\.\(card\)/,
  'board rendering must use the shared manual-effect identity guard'
);
assert.match(
  data,
  /window\.fateEffectRequiresManualActivationId = function\(cardOrId\)/,
  'the shared manual-effect identity guard must load before gameplay rendering'
);

const context = {
  G:{_phase7CurrentMultiplayer:false},
  window:{fateEffectRequiresManualActivationId:()=>false},
  automaticBoardEffectsEnabled:()=>true,
  canUseManualCharacterEffect:()=>true,
  rendered:null
};
vm.runInNewContext(`${manualButton}; rendered = shouldShowManualCharacterEffectButton({id:'60', iid:'single-player-card'});`, context);
assert.equal(context.rendered, false, 'ordinary single-player board snapshots must evaluate without throwing');
assert.match(index, /05-gameplay-core\.js\?v=1787317003/, 'the fixed gameplay renderer guard must be cache-busted');

console.log('single-player board render regression smoke passed');
