const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const structural = read('src/scripts/00-structural-helpers.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const gameplay = read('src/scripts/05-gameplay-core.js');
const sync = read('src/scripts/render-v2/15-vfx-audio-sync.js');

assert.match(structural, /Math\.max\(180, Number\(opts\.minGapMs\) \|\| 240\)/,
  'discard playback must globally suppress rapid duplicate transients');
assert.match(structural, /playDiscardSfx\(\{count:discarded\.length\}\)/,
  'array discards must announce one grouped discard gesture');
assert.match(rendering, /fatePushDiscard\(player, card, \{sound:false\}\);\s*discardedCards\.push\(card\)/,
  'the hand-limit panel must move selected cards silently before one batch cue');
assert.match(rendering, /playDiscardSfx\(\{count:discardedCards\.length\}\)/,
  'the hand-limit panel must emit exactly one grouped cue');

for (const [event, cue] of Object.entries({
  destroy_card: 'zoneLost',
  consolidate_impact: 'consolidate',
  zone_control_shift: 'zoneFlip',
  zone_control_lock: 'zoneCaptured',
  return_to_hand: 'cardPreview',
  discard_to_hand: 'starlightEarn'
})) {
  assert.match(sync, new RegExp(`${event}:'${cue}'`), `${event} must use its more specific sound identity`);
}

assert.match(gameplay, /result\.eloChange\) > 0 \? 'eloUp' : 'eloDown'/,
  'result sequence must distinguish ELO gains from losses');
for (const cue of ['xpGain', 'starlightEarn', 'levelUp']) {
  assert.ok(gameplay.includes(`playSfx('${cue}')`), `result sequence must include ${cue}`);
}

console.log('Match audio diversity smoke test passed.');
