import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ai = fs.readFileSync(path.join(root, 'src/scripts/07-ai.js'), 'utf8');
const gameplay = fs.readFileSync(path.join(root, 'src/scripts/05-gameplay-core.js'), 'utf8');
const driverPath = path.join(root, 'src/scripts/authoritative-v3-legacy-self-play.mjs');
const driver = fs.readFileSync(driverPath, 'utf8');
const recorder = fs.readFileSync(path.join(root, 'src/scripts/authoritative-v3-recorder-bridge.mjs'), 'utf8');

assert.match(index, /params\.get\('fateV3Recorder'\) !== '1'[\s\S]*authoritative-v3-recorder-bridge\.mjs/);
assert.match(index, /params\.get\('fateV3LegacyCorpus'\) !== '1'[\s\S]*params\.get\('fateV3SinglePlayer'\) === '1'[\s\S]*authoritative-v3-legacy-self-play\.mjs/);
assert.match(driver, /RECORDER_QUERY_FLAG[\s\S]*CORPUS_QUERY_FLAG[\s\S]*SINGLE_PLAYER_QUERY_FLAG/);
assert.match(driver, /mode:'actual-legacy-ai-self-play-corpus'/);
assert.match(driver, /authorityRoutingChanged:false/);
for(const legacyFunction of [
  'aiGenerateAllMoves',
  'aiChooseMoveWithMCTS',
  'aiDoPlace',
  'aiDoConsolidate'
]){
  assert(driver.includes(legacyFunction), `corpus driver must use the real legacy ${legacyFunction} path`);
}
assert.match(driver, /beginAIAction[\s\S]*finishAction[\s\S]*beginNamedAction\('LEGACY_END_TURN'\)/);
assert.match(driver, /initLandscapeForSong[\s\S]*matchIndex % 20/);
assert.match(driver, /fateV3LegacyCorpusAuto[\s\S]*__fateAuthorityV3LegacyCorpusResult/);
assert.doesNotMatch(driver, /shared\/engine|authoritative-v3-single-player|authoritative-v3-client/);
assert.match(recorder, /configureDeterministicRandom[\s\S]*corpusDriverEnabled/);
assert.match(ai, /fateV3LegacyCorpus[\s\S]*fateV3Recorder[\s\S]*Promise\.resolve/);
assert.match(gameplay, /fateV3LegacyCorpus[\s\S]*_legacyCorpusTurnTransitionPromise/);
assert.match(driver, /_legacyCorpusTurnTransitionPromise[\s\S]*await transition/);
assert.match(ai, /case '71':[\s\S]{0,400}sourceIid:inst\.iid\|\|null/, 'Fort Calvin AI capture must reference the placed instance');
assert.doesNotMatch(ai, /case '71':[\s\S]{0,400}sourceIid:card\.iid/, 'Fort Calvin must not throw on an undefined card binding');
assert.match(ai, /oathbound-ai:' \+ String\(inst && \(inst\.iid \|\| inst\.id\)/, 'Hemorrhaging Wound VFX must reference the placed instance');
assert.doesNotMatch(ai, /oathbound-ai:' \+ String\(card && \(card\.iid \|\| card\.id\)/, 'Hemorrhaging Wound must not throw on an undefined card binding');

globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}){
    this.type = type;
    this.detail = options.detail;
  }
};
globalThis.window = {
  location:{search:'?fateV3Recorder=1&fateV3LegacyCorpus=1&fateV3SinglePlayer=1'},
  dispatchEvent:()=>true
};
const rejected = await import(`${new URL(`file:///${driverPath.replace(/\\/g, '/')}`).href}?exclusive=1`);
assert.equal(rejected.installLegacySelfPlayCorpusDriver(), null, 'corpus driver must reject the Phase 5 authority flag');

console.log('authoritative v3 Phase 5 legacy self-play corpus smoke test passed');
