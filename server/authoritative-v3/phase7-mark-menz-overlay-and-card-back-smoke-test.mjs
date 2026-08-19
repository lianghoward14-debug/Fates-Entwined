import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {applyOperation, createInitialState} from '../../shared/engine/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const helpers = read('src/scripts/06-rendering-and-helpers.js');
const online = read('src/scripts/18-online-rooms.js');
const director = read('src/scripts/render-v2/11-vfx-director.js');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const css = read('src/styles/zz-codex-last.css');
const index = read('index.html');

const affiliations = [
  ['reality', 'Reality'],
  ['third_great_war', 'Third Great War'],
  ['expanded_worlds', 'Expanded Worlds'],
  ['eventide', 'Eventide']
];

for(const [affiliation, label] of affiliations){
  const kind = `mark_menz_${affiliation}`;
  assert.match(helpers, new RegExp(`${affiliation}:\\{kind:'${kind}', label:'${label}'\\}`));
  assert.match(adapter, new RegExp(`${kind}:\\{color:`));
  assert.match(adapter, new RegExp(`kind === '${kind}'`));
  assert.match(css, new RegExp(`html body #s-game \\.bc\\.effect-flash-${kind}\\{`));
}

assert.match(
  helpers,
  /sq\.onclick\s*=\s*\(\)\s*=>\s*\{\s*closeModal\(\);[\s\S]*?callback\(sq\.dataset\.aff\);/,
  'the shipping affiliation picker must close before resolving its choice'
);
assert.match(
  read('src/scripts/05-gameplay-core.js'),
  /String\(id \|\| ''\) !== '66'[\s\S]*?G\.board\[z\]\.forEach[\s\S]*?showMarkMenzAffiliationOverlay\(cell, aff/,
  'single-player Mark Menz must skip the early card pop and present the affiliation on every changed card after its picker'
);
assert.match(
  online,
  /action:function\(\)\{\s*if\(typeof window\.closeModal === 'function'\) closeModal\(\);\s*return phase7SubmitCommand\(command\);/,
  'authoritative option prompts must close before command submission'
);
assert.match(
  online,
  /type === 'AFFILIATION_DECLARED'[\s\S]{0,360}AFFILIATION_CHANGED events below own those overlays[\s\S]{0,120}return;/,
  'authoritative Mark Menz declaration must not replace changed-card overlays with one source-card flash'
);
assert.match(
  online,
  /type === 'AFFILIATION_CHANGED'[\s\S]{0,550}sourceCardId === '66'[\s\S]{0,300}showMarkMenzAffiliationOverlay\(target, affiliation/,
  'authoritative Mark Menz must use a targeted affiliation overlay for every changed card event'
);
assert.match(online, /eventType === 'EFFECT_ACTIVATED' && String\(source\.id \|\| ''\) === '66'\) continue/);
assert.doesNotMatch(
  online.match(/const bySourceId = \{[\s\S]*?\n\s*\};/)?.[0] || '',
  /'66':/,
  'Mark Menz must not also emit a generic activation overlay'
);

assert.match(online, /faceDown\s*=\s*owner !== Number\(view\.playerIndex\)/);
assert.match(online, /img:'back\.png',[\s\S]*?runtimeImg:'back\.png'/);
assert.match(online, /for\(let drawIndex = 0; drawIndex < drawEvents\.length; drawIndex \+= 1\)[\s\S]*?drawFromPile\(0, owner, \{[\s\S]*?card, faceDown, drawIndex:0, drawCount:1[\s\S]*?await phase7WaitForPresentationIdle/);
assert.match(director, /function primeMotionCardBackImage\(\)/);
assert.match(director, /motionCardBackImage\.src = 'back\.png'/);
assert.match(director, /primeMotionCardBackImage\(\);[\s\S]*?function keepTransformedRectInFrame/);
assert.match(director, /ctx\.drawImage\(motionCardBackImage, r\.x, r\.y, r\.w, r\.h\)/);
assert(fs.statSync(path.join(root, 'back.png')).size > 0, 'the shipping back.png asset must exist');

for(const asset of [
  'src/styles/zz-codex-last.css',
  'src/scripts/06-rendering-and-helpers.js',
  'src/scripts/render-v2/11-vfx-director.js',
  'src/scripts/render-v2/04-match-renderer-adapter.js',
  'src/scripts/18-online-rooms.js'
]){
  const escapedAsset = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(index, new RegExp(`${escapedAsset}\\?v=\\d+`), `${asset} must be cache-busted in index.html`);
}

// Execute the real overlay dispatcher in isolation. This proves every picker
// value maps to the intended production kind and that a multi-card declaration
// shares one sound key rather than playing four overlapping sounds.
const helperBlock = helpers.match(/const MARK_MENZ_AFFILIATION_OVERLAYS[\s\S]*?window\.showMarkMenzAffiliationOverlay = showMarkMenzAffiliationOverlay;/)?.[0];
assert(helperBlock, 'Mark Menz overlay dispatcher block must be extractable');
const flashCalls = [];
const sandbox = {
  window:{},
  G:{turn:7},
  flashCardEffect(card, kind, options){
    flashCalls.push({card, kind, options});
    return true;
  }
};
vm.runInNewContext(helperBlock, sandbox, {filename:'mark-menz-overlay-dispatcher.js'});
for(const [affiliation, label] of affiliations){
  const card = {iid:`target-${affiliation}`, _lastAffEffectSource:'mark-source'};
  assert.equal(sandbox.window.showMarkMenzAffiliationOverlay(card, affiliation), true);
  const call = flashCalls.at(-1);
  assert.equal(call.kind, `mark_menz_${affiliation}`);
  assert.equal(call.options.label, label);
  assert.equal(call.options.soundKey, `mark-menz:mark-source:${affiliation}:7`);
}
assert.equal(sandbox.window.showMarkMenzAffiliationOverlay({iid:'bad'}, 'invalid'), false);

// Exercise all four authoritative declarations against the real reducer
// operation. This verifies that the presentation routes above receive exactly
// the affiliation values produced by game rules and only changed cards emit.
const definitions = [
  {id:'66', name:'Mark Menz', type:'Initiator', aff:'reality', fate:3, cost:1, rarity:'triangle'},
  {id:'target', name:'Target', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'triangle'}
];
for(const [indexValue, [affiliation]] of affiliations.entries()){
  const state = createInitialState({
    matchId:`MARKOVERLAY${indexValue}`,
    seed:`mark-overlay-${indexValue}`,
    handSize:2,
    maxTurns:20,
    cardDefinitions:definitions,
    players:[{id:'p0', deckIds:['66', 'target']}, {id:'p1', deckIds:[]}]
  });
  const mark = state.players[0].hand.find(card=>card.id === '66');
  const target = state.players[0].hand.find(card=>card.id === 'target');
  state.players[0].hand = [];
  mark.controller = 0;
  target.controller = 0;
  state.board[0][2][0] = mark;
  state.board[0][2][1] = target;
  const ctx = {state, events:[], ruleEvents:[]};
  applyOperation(ctx, {
    type:'CHANGE_ZONE_AFFILIATION',
    sourceIid:mark.iid,
    sourceController:0,
    playerIndex:0,
    affiliation,
    reason:'MARK_MENZ_BEYOND_DRAWINGS'
  });
  const changed = ctx.events.filter(event=>event.type === 'AFFILIATION_CHANGED');
  const declarations = ctx.events.filter(event=>event.type === 'AFFILIATION_DECLARED');
  const expectedChanges = affiliation === 'reality' ? 0 : 2;
  assert.equal(changed.length, expectedChanges);
  assert(changed.every(event=>event.affiliation === affiliation));
  assert.equal(declarations.length, 1);
  assert.equal(declarations[0].sourceIid, mark.iid);
  assert.equal(declarations[0].affiliation, affiliation);
  assert.deepEqual(declarations[0].changedIids, changed.map(event=>event.cardIid));
  assert.equal(mark.currentFate, 3 + expectedChanges);
}

console.log('Phase 7 Mark Menz overlay and opponent card-back smoke test passed');
