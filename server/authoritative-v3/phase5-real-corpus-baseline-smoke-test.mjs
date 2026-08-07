import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runDifferentialCorpus} from '../../tools/authority-v3-differential-replay.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpusPath = path.join(
  root,
  'docs',
  'fixtures',
  'AUTHORITY_V3_PHASE5_REAL_LEGACY_SELF_PLAY_CORPUS.json'
);
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

assert.equal(corpus.format, 'fates-legacy-action-corpus-v2');
assert.equal(corpus.capture?.kind, 'actual-legacy-ai-self-play');
assert.equal(corpus.capture?.matches?.length, 20);
assert.equal(corpus.actions.length, 180);
assert.equal(corpus.capture?.coverage?.scenarioLandscapeIds?.length, 20);
assert(corpus.capture?.coverage?.cardIds?.length >= 67);
assert(corpus.actions.every(action=>
  action.context?.captureMode === 'actual-legacy-ai-self-play'
  && Number.isInteger(action.context?.matchIndex)
));

const report = runDifferentialCorpus(corpus, corpusPath);
assert.equal(report.compared, 180);
assert.equal(report.matched, 178);
assert.equal(report.translationFailures.length, 0);
assert.equal(report.classifiedMismatches.length, 2);
assert.deepEqual(report.classifiedMismatches.map(mismatch=>mismatch.index), [43, 150]);
assert(report.classifiedMismatches.every(mismatch=>
  mismatch.classification === 'existing-single-player-defect'
  && mismatch.rationale.length > 40
));
assert.equal(report.unexpectedMismatches.length, 0);
assert.equal(report.ok, true);

console.log('authoritative v3 Phase 5 real legacy corpus gate passed (178/180 exact; 2 reviewed legacy defects; 0 open)');
