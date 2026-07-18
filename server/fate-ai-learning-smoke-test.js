#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Learning = require('../src/scripts/07-ai-learning.js');

const base = Learning.createBasePolicies();
assert.deepStrictEqual(Object.keys(base).sort(), Learning.POLICY_NAMES.slice().sort(), 'the shared policy and all specialist policies should be initialized');
assert(base[Learning.GLOBAL_POLICY_NAME], 'every AI needs a shared learned-policy fallback');
assert.strictEqual(Learning.policyForAI(base, {name:'High Envoy Chloe Kirk'}), base[Learning.GLOBAL_POLICY_NAME], 'ordinary named AI opponents should receive the shared learned policy');
assert.strictEqual(Learning.policyForAI(base, {name:'Generated Monthly Rival'}), base[Learning.GLOBAL_POLICY_NAME], 'future generated opponents should inherit learning automatically');
assert.strictEqual(Learning.policyForAI(base, {name:'Commander Maja Kaminska'}), base['commander maja kaminska'], 'named High Marshalls should retain their specialist policies');
assert.strictEqual(base[Learning.GLOBAL_POLICY_NAME].selfPlayEpisodes, 1000, 'the requested universal self-play bootstrap should be retained');
assert.strictEqual(base[Learning.GLOBAL_POLICY_NAME].fullGameEpisodes, 125250, 'the promoted offline full-game league should be retained');
assert.strictEqual(base['commander maja kaminska'].selfPlayEpisodes, 1531, 'specialist bootstrap should include prior Fly training plus the requested batch');
const migratedV1 = Learning.sanitizePolicySet({
  'commander maja kaminska':{version:1,samples:133,selfPlayEpisodes:531,updatedAt:1,weights:{contested:-1.5}}
});
assert.strictEqual(migratedV1['commander maja kaminska'].version, Learning.POLICY_VERSION, 'version-1 Fly policies should migrate to the universal-policy schema');
assert.strictEqual(migratedV1['commander maja kaminska'].selfPlayEpisodes, 1531, 'migration should retain the newly completed self-play accounting');
assert.strictEqual(migratedV1['commander maja kaminska'].weights.contested, Learning.BASE_WEIGHTS['commander maja kaminska'].contested, 'migration should use the newly trained bootstrap rather than stale version-1 weights');

const winningMajaLike = Learning.createDecision({
  action:'p',
  card:{id:'25',type:'Supporter',fate:6},
  zone:0,
  row:1,
  turn:2,
  handSize:4,
  margin:-3,
  ownCount:3,
  oppCount:2,
  contested:true,
  scaling:true,
  result:1
});
assert(winningMajaLike, 'valid compact decisions should be accepted');
assert.strictEqual(winningMajaLike.length, 15, 'decision records should remain compact tuples');
assert(!JSON.stringify(winningMajaLike).match(/uid|name|email|matchId/i), 'decision tuples must not contain identity fields');
assert.strictEqual(Learning.sanitizeDecision([99,'p']), null, 'unknown schemas should be rejected');

const decisions = Array.from({length:80}, ()=>winningMajaLike.slice());
const imitated = Learning.trainImitation(base, decisions, {updatedAt:1234});
for(const name of Learning.POLICY_NAMES){
  assert.strictEqual(imitated[name].samples, 80, `${name} should report its imitation sample count`);
  assert.strictEqual(imitated[name].updatedAt, 1234, `${name} should report the policy update time`);
}
assert.notStrictEqual(imitated['commander maja kaminska'].weights.contested, base['commander maja kaminska'].weights.contested, 'imitation should influence Maja without replacing her archetype');

const selfPlay = Learning.runSelfPlay(imitated, {episodes:48,maxMs:100,seed:'smoke',updatedAt:5678});
assert(selfPlay.episodes > 0 && selfPlay.episodes <= 48, 'self-play should obey the episode budget');
assert(selfPlay.elapsedMs <= 180, 'self-play should remain inside a small CPU budget');
for(const name of Learning.POLICY_NAMES){
  assert(selfPlay.policies[name].selfPlayEpisodes >= selfPlay.episodes, `${name} should retain self-play accounting`);
}

const majaPolicy = selfPlay.policies['commander maja kaminska'];
const learnedScore = Learning.scoreMove(majaPolicy, {
  type:'place',contested:true,tempo:0.9,disruption:false,scaling:true,margin:-2,ownCount:3,fate:6,tributeCount:0
});
assert(Number.isFinite(learnedScore) && learnedScore <= 4.5 && learnedScore >= -4.5, 'learned move bonuses should be bounded');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/scripts/07-ai.js'), 'utf8');
const gameplay = fs.readFileSync(path.join(root, 'src/scripts/05-gameplay-core.js'), 'utf8');
const authority = fs.readFileSync(path.join(root, 'server/fate-ws-authority.js'), 'utf8');
const fly = fs.readFileSync(path.join(root, 'fly.toml'), 'utf8');

assert(index.indexOf('07-ai-intelligence.js') < index.indexOf('07-ai-learning.js'), 'intelligence must load before the learning policy');
assert(index.indexOf('07-ai-learning.js') < index.indexOf('07-ai.js'), 'learning policy must load before the sole turn controller');
assert.strictEqual((controller.match(/function\s+runAITurn\s*\(/g) || []).length, 1, 'learning must not introduce a second AI turn controller');
assert.strictEqual((index.match(/07-ai-learning\.js/g) || []).length, 1, 'exactly one learning module should be active');
assert(controller.includes('score += aiLearnedMoveBonus(move);'), 'the learned policy must feed the unified move evaluator');
assert(!controller.includes('learning.isLearningAI(G._selectedAI)'), 'the move evaluator must not restrict learned bonuses to the original High Marshalls');
assert(gameplay.includes("action:'p'") && gameplay.includes("action:'c'") && gameplay.includes("action:'e'"), 'human placements, consolidations, and turn endings should be sampled');
assert(authority.includes("Authentication prevents anonymous spam; user identity is deliberately not retained."), 'the ingestion route should document its identity boundary');
assert(authority.includes('AI_LEARNING_MAX_SAMPLES'), 'server learning storage must have a hard sample cap');
assert(authority.includes("skipped:'live-match-active'"), 'scheduled training must yield to live matches');
assert(fly.includes("FATE_AI_TRAIN_MAX_MS = '30'"), 'Fly training must have a small time budget');
assert(fly.includes("FATE_AI_TRAIN_MAX_SAMPLES = '12000'"), 'Fly learning storage must remain bounded');

console.log('AI learning smoke test passed.');
