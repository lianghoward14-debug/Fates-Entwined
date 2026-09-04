import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  legalCommandTemplates,
  projectStateForPlayer,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {
  chooseStrategicV3AiCommand,
  planStrategicV3AiTurn
} from '../../src/scripts/authoritative-v3-ai-policy.mjs';
import {translateLegacyRecorderAction} from '../../tools/authority-v3-legacy-normalization.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpus = JSON.parse(fs.readFileSync(path.join(
  root,
  'docs',
  'fixtures',
  'AUTHORITY_V3_PHASE5_REAL_LEGACY_SELF_PLAY_CORPUS.json'
), 'utf8'));
const translated = translateLegacyRecorderAction(corpus.actions[0], corpus);
const state = translated.state;
const playerIndex = translated.actor.playerIndex;
const playerId = state.players[playerIndex].id;
const projection = projectStateForPlayer(state, playerIndex);
const legal = legalCommandTemplates(state, playerIndex);
const initialSnapshot = stableStringify(state);
const context = {playerId, playerIndex, difficulty:'hard', canonicalState:state};

const plan = planStrategicV3AiTurn(legal, projection, context);
const repeated = planStrategicV3AiTurn(legal, projection, context);
assert(plan, 'rules-aware planner must produce a plan');
assert(legal.includes(plan.command), 'planner must return an exact root legal-command template');
assert(plan.actions >= 2 && plan.actions <= 4, 'turn plan must contain two to four strategic actions');
assert.equal(plan.depth, 4, 'hard AI must search a four-action horizon');
assert.equal(
  stableStringify(plan.sequence),
  stableStringify(repeated.sequence),
  'turn planning must be deterministic'
);
assert.equal(stableStringify(state), initialSnapshot, 'planning must not mutate canonical match state');

let simulated = state;
for(let index = 0; index < plan.sequence.length; index += 1){
  const command = plan.sequence[index];
  const exactLegal = legalCommandTemplates(simulated, playerIndex).some(candidate=>
    stableStringify(candidate) === stableStringify(command)
  );
  assert(exactLegal, `planned command ${index + 1} must remain legal after prior simulated actions`);
  const result = reduceCommand(simulated, {
    ...command,
    commandId:`turn-planner-smoke:${index + 1}`,
    matchId:simulated.matchId,
    expectedRevision:simulated.revision,
    payload:command.payload || {}
  }, {playerId});
  assert(result.ok, `planned command ${index + 1} must be accepted by the real reducer`);
  simulated = result.state;
}
assert(
  simulated.outcome || simulated.activePlayer !== playerIndex || simulated.pendingPrompt,
  'a completed plan must reach turn handoff, match end, or an opponent decision'
);

const firstResult = reduceCommand(state, {
  ...plan.sequence[0],
  commandId:'turn-planner-cache:1',
  matchId:state.matchId,
  expectedRevision:state.revision,
  payload:plan.sequence[0].payload || {}
}, {playerId});
assert(firstResult.ok);
const cache = {sequence:plan.sequence.slice(1)};
const secondLegal = legalCommandTemplates(firstResult.state, playerIndex);
const cachedChoice = chooseStrategicV3AiCommand(
  secondLegal,
  projectStateForPlayer(firstResult.state, playerIndex),
  {playerId, playerIndex, difficulty:'hard', canonicalState:firstResult.state, planCache:cache}
);
assert.equal(
  stableStringify(cachedChoice),
  stableStringify(plan.sequence[1]),
  'adapter plan cache must reuse the next still-legal planned action'
);

const easy = planStrategicV3AiTurn(legal, projection, {
  playerId,
  playerIndex,
  difficulty:'easy',
  canonicalState:state
});
assert.equal(easy.depth, 2, 'easy AI must search a two-action horizon');
assert(easy.actions >= 2 && easy.actions <= 4);

console.log(
  `authoritative v3 rules-aware turn planner smoke test passed `
  + `(hard ${plan.actions} actions/${plan.sequence.length} reducer commands; easy ${easy.actions} actions)`
);
