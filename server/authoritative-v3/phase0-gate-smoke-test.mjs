import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPhase0Inventory} from '../../tools/generate-authority-v3-card-inventory.mjs';
import {
  captureLegacyCanonicalState,
  legacyCommandFromAIMove
} from '../../src/scripts/authoritative-v3-legacy-capture.mjs';
import {FateLegacyActionRecorderV3} from '../../src/scripts/authoritative-v3-legacy-recorder.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = relative=>fs.readFileSync(path.join(root, relative), 'utf8');

const generated = buildPhase0Inventory();
const committed = JSON.parse(read('docs/AUTHORITY_V3_PHASE0_RULE_INVENTORY.json'));
assert.deepStrictEqual(committed, generated, 'committed Phase 0 inventory must match the live card and landscape catalogs');
assert.equal(generated.summary.playableCards, 120);
assert.equal(generated.summary.landscapes, 20);
assert.equal(new Set(generated.cards.map(item=>item.cardId)).size, generated.cards.length, 'card IDs must be unique');
assert.equal(new Set(generated.landscapes.map(item=>item.landscapeId)).size, generated.landscapes.length, 'landscape IDs must be unique');

for(const item of [...generated.cards, ...generated.landscapes]){
  assert.equal(item.coverageDeclaration, 'phase-0-classified');
  assert(item.customHandler.startsWith('legacy-'), 'every playable definition needs an explicit custom-handler assignment');
  for(const field of ['abilityTiming', 'effectFamilies', 'operations', 'promptTypes', 'triggerSubscriptions', 'modifiers', 'parityFixtures', 'ambiguityFlags']){
    assert(Array.isArray(item[field]), `${item.cardId || item.landscapeId} ${field} must be an array`);
  }
  assert(item.abilityTiming.length > 0, `${item.cardId || item.landscapeId} must have a timing classification`);
  assert(item.effectFamilies.length > 0, `${item.cardId || item.landscapeId} must have an effect-family classification`);
  assert.notEqual(item.multiplayerEligibility, '', 'eligibility must be explicit');
}

const mockLegacyState = {
  players:[
    {name:'P1', hand:[{id:'05', iid:'p1-05'}], deck:[], discard:[]},
    {name:'P2', hand:[], deck:[], discard:[]}
  ],
  board:Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array(3).fill(null))),
  currentPlayer:0,
  turn:1,
  phase:'main',
  _serverRngCounter:4,
  _continuousDamageSources:new Set(['p1-05']),
  gameLog:['presentation-only']
};
const captured = captureLegacyCanonicalState(mockLegacyState);
assert.deepStrictEqual(captured.state._continuousDamageSources, ['p1-05']);
assert.equal(Object.hasOwn(captured.state, 'gameLog'), false, 'presentation log must not enter canonical recorder state');

const recorder = new FateLegacyActionRecorderV3({
  engineVersion:'test-engine',
  rulesetVersion:'test-rules',
  seed:'seed-1'
});
const command = legacyCommandFromAIMove({
  type:'place',
  card:mockLegacyState.players[0].hand[0],
  z:0,
  r:2,
  c:1
});
const recorded = recorder.record({
  preState:captured,
  playerId:'P1',
  playerIndex:0,
  command,
  choices:[],
  rng:{seed:'seed-1', counterBefore:4, counterAfter:4, mathRandomSamples:[0.25]},
  expectedPostState:captured,
  visibleOutcomes:{turn:1}
});
assert.equal(recorded.rng.mathRandomSamples[0], 0.25);
assert.equal(recorder.export().format, 'fates-legacy-action-corpus-v2');

const index = read('index.html');
const ai = read('src/scripts/07-ai.js');
const bridge = read('src/scripts/authoritative-v3-recorder-bridge.mjs');
const v3Server = read('server/authoritative-v3/server.mjs');
assert.match(index, /params\.get\('fateV3Recorder'\) !== '1'[\s\S]*import\('\.\/src\/scripts\/authoritative-v3-recorder-bridge\.mjs'\)/);
assert.doesNotMatch(index, /<script[^>]+src=["'][^"']*authoritative-v3/i, 'v3 must never be loaded as an unconditional script');
assert.match(index, /FATE_GAMEPLAY_AUTHORITY = window\.FATE_GAMEPLAY_AUTHORITY \|\| 'client-resolved'/);
assert.match(ai, /FateAuthorityV3LegacyRecorderBridge[\s\S]*beginAIAction[\s\S]*finishAction/);
assert.match(bridge, /mode:'observe-only'/);
assert.match(bridge, /authorityRoutingChanged:false/);
assert.match(bridge, /!game\._onlineRoomCode[\s\S]*!game\._onlineMatchId/);
assert.match(v3Server, /FATE_SERVER_AUTHORITATIVE_V3_ENABLED/);

console.log('authoritative-v3 Phase 0 gate smoke test passed');
