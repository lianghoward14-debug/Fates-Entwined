import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  legalCommandTemplates,
  projectStateForPlayer,
  stableStringify
} from '../../shared/engine/index.mjs';
import {
  chooseStrategicV3AiCommand
} from '../../src/scripts/authoritative-v3-ai-policy.mjs';
import {translateLegacyRecorderAction} from '../../tools/authority-v3-legacy-normalization.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpusPath = path.join(
  root,
  'docs',
  'fixtures',
  'AUTHORITY_V3_PHASE5_REAL_LEGACY_SELF_PLAY_CORPUS.json'
);
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

const metrics = {
  comparable:0,
  actionTypeMatches:0,
  cardMatches:0,
  exactDestinationMatches:0,
  byRecordedType:{}
};

for(const action of corpus.actions){
  const translated = translateLegacyRecorderAction(action, corpus);
  // The corpus driver ends turns after its external max-actions-per-turn
  // scheduler fires. That scheduler history is intentionally absent from a
  // player projection, so END_TURN is not a strategic ranking comparison.
  if(translated.command.type === 'END_TURN') continue;
  const legal = legalCommandTemplates(translated.state, translated.actor.playerIndex);
  const projection = projectStateForPlayer(translated.state, translated.actor.playerIndex);
  assert.equal(
    projection.players[translated.actor.playerIndex === 0 ? 1 : 0].hand,
    undefined,
    'calibration must not expose the opponent hand'
  );
  const context = {playerIndex:translated.actor.playerIndex};
  const selected = chooseStrategicV3AiCommand(legal, projection, context);
  const repeated = chooseStrategicV3AiCommand(legal, projection, context);
  assert(selected, `action ${action.index} must have a v3 AI choice`);
  assert(legal.includes(selected), `action ${action.index} must return an exact legal template`);
  assert.equal(stableStringify(repeated), stableStringify(selected), 'v3 AI calibration must be deterministic');

  const recorded = translated.command;
  const bucket = metrics.byRecordedType[recorded.type] ||= {
    comparable:0,
    actionTypeMatches:0,
    cardMatches:0,
    exactDestinationMatches:0
  };
  metrics.comparable += 1;
  bucket.comparable += 1;
  const typeMatches = selected.type === recorded.type;
  if(typeMatches){
    metrics.actionTypeMatches += 1;
    bucket.actionTypeMatches += 1;
  }
  const selectedCard = String(selected.payload?.cardIid || selected.payload?.sourceIid || '');
  const recordedCard = String(recorded.payload?.cardIid || recorded.payload?.sourceIid || '');
  const cardMatches = typeMatches && selectedCard === recordedCard;
  if(cardMatches){
    metrics.cardMatches += 1;
    bucket.cardMatches += 1;
  }
  const selectedDestination = selected.payload?.destination;
  const recordedDestination = recorded.payload?.destination;
  const destinationMatches = cardMatches && (
    !recordedDestination
    || (
      Number(selectedDestination?.z) === Number(recordedDestination.z)
      && Number(selectedDestination?.r) === Number(recordedDestination.r)
      && Number(selectedDestination?.c) === Number(recordedDestination.c)
    )
  );
  if(destinationMatches){
    metrics.exactDestinationMatches += 1;
    bucket.exactDestinationMatches += 1;
  }
}

assert.equal(metrics.comparable, 120);
assert(metrics.actionTypeMatches >= 105, 'v3 AI action-family calibration regressed');
assert(metrics.cardMatches >= 73, 'v3 AI card-choice calibration regressed');
assert(metrics.exactDestinationMatches >= 58, 'v3 AI destination calibration regressed');
assert(metrics.byRecordedType.SET_CARD.actionTypeMatches >= 72);
assert(metrics.byRecordedType.CONSOLIDATE_CARD.actionTypeMatches >= 29);

console.log(
  `authoritative v3 Phase 5 AI calibration passed `
  + `(${metrics.actionTypeMatches}/${metrics.comparable} action family; `
  + `${metrics.cardMatches} card; ${metrics.exactDestinationMatches} exact destination)`
);
