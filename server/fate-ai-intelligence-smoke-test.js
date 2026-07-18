'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AI = require('../src/scripts/07-ai-intelligence.js');

const perfectNames = [
  'Mastermind Duncan Heyward',
  'Field Marshall Achille Laurent',
  'Commander Maja Kaminska'
];

for(const name of perfectNames){
  assert.strictEqual(AI.hasPerfectHandKnowledge({name,handKnowledge:'perfect'}), true, `${name} should know the opposing hand`);
}
assert.strictEqual(AI.hasPerfectHandKnowledge({name:'Generated Champion',rank:'High Marshall',handKnowledge:'perfect'}), false, 'generated High Marshalls must not inherit perfect hand knowledge');
assert.strictEqual(AI.hasPerfectHandKnowledge({name:'Commander Maja Kaminska'}), false, 'perfect knowledge must be explicitly enabled in opponent data');

const catalogue = [
  {id:'01',name:'Planner',type:'Coordinator',aff:'eventide',fate:5,cost:2,effect:'All cards you control gain 2 Fate.'},
  {id:'16',name:'Disruptor',type:'Supporter',aff:'expanded_worlds',fate:1,cost:0,effect:"Discard an opponent's Supporter."},
  {id:'32',name:'Drawer',type:'Supporter',aff:'reality',fate:1,cost:0,effect:'When set, draw 1 card.'}
];
const publicCards = [{id:'01',aff:'eventide',type:'Coordinator',fate:5}];
const beliefA = AI.buildHandModel({
  ai:{name:'High Envoy Chloe Kirk'},
  allowPerfect:false,
  hiddenCards:[{id:'secret-a',fate:99}],
  handSize:4,
  observedCards:publicCards,
  catalogue,
  seed:'same'
});
const beliefB = AI.buildHandModel({
  ai:{name:'High Envoy Chloe Kirk'},
  allowPerfect:false,
  hiddenCards:[{id:'secret-b',fate:1}],
  handSize:4,
  observedCards:publicCards,
  catalogue,
  seed:'same'
});
assert.strictEqual(beliefA.mode, 'belief');
assert.deepStrictEqual(beliefA.cards, beliefB.cards, 'belief models must not change when hidden cards change');

const perfectModel = AI.buildHandModel({
  ai:{name:'Commander Maja Kaminska',handKnowledge:'perfect'},
  allowPerfect:true,
  hiddenCards:[{id:'07',name:'Maja Kaminska',type:'Initiator',aff:'third_great_war',fate:3,cost:1}],
  handSize:1,
  observedCards:[],
  catalogue
});
assert.strictEqual(perfectModel.mode, 'perfect');
assert.deepStrictEqual(perfectModel.cards.map(card=>card.id), ['07']);

let memory = AI.createOpponentMemory();
memory = AI.updateOpponentMemory(memory, {turn:2,zoneCounts:[3,0,0],contestedCount:3,handSize:4,discardCount:1});
assert(memory.contestedPreference > 0.5, 'memory should learn contested-row preference');
assert(memory.zonePreference[0] > memory.zonePreference[1], 'memory should learn preferred zones');

const plan = AI.makeTurnPlan({myScores:[8,2,12],oppScores:[7,9,3],memory,style:'adaptive',turn:4,handModelMode:'belief'});
assert.strictEqual(plan.focusZones.length, 2);
assert(!plan.focusZones.includes(plan.abandonZone), 'turn plan should focus on two zones and abandon the third');

const action = AI.chooseProjectedAction({
  cards:[AI.profileCard({id:'16',name:'Disruptor',type:'Supporter',fate:1,cost:0,effect:"Discard an opponent's Supporter."})],
  ownScores:[3,8,1],
  enemyScores:[5,9,12],
  memory,
  mode:'perfect',
  rng:()=>0
});
assert(Number.isInteger(action.zone) && action.zone >= 0 && action.zone <= 2);
assert(action.reduceEnemy > 0, 'disruptive responses should reduce projected enemy strength');

const picked = AI.selectCandidate([
  {move:{id:'weak'},finalScore:2},
  {move:{id:'best'},finalScore:10}
], {perfect:true,rng:()=>0.99});
assert.strictEqual(picked.move.id, 'best', 'perfect opponents should choose the strongest searched line');

const root = path.resolve(__dirname, '..');
const setupSource = fs.readFileSync(path.join(root, 'src/scripts/04-game-setup.js'), 'utf8');
for(const name of perfectNames){
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert(new RegExp(`name:'${escaped}'[^\\n]+handKnowledge:'perfect'`).test(setupSource), `${name} must be explicitly configured for perfect knowledge`);
}
assert(/'Indigo Falcon':\s*\{\s*elo:1100,\s*trueElo:1100\s*\}/.test(setupSource), 'Indigo Falcon must stay balanced as a 1100 Elo Lieutenant at Arms AI');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(indexSource.indexOf('07-ai-intelligence.js') < indexSource.indexOf('07-ai.js'), 'AI intelligence module must load before the turn controller');
const activeAiScripts = Array.from(indexSource.matchAll(/<script[^>]+src="([^"]*07-ai(?:-intelligence)?\.js)[^"]*"/g), match=>path.basename(match[1]));
assert.deepStrictEqual(activeAiScripts, ['07-ai-intelligence.js','07-ai.js'], 'exactly one intelligence module and one AI turn controller should be active');

const aiControllerSource = fs.readFileSync(path.join(root, 'src/scripts/07-ai.js'), 'utf8');
const gameplaySource = fs.readFileSync(path.join(root, 'src/scripts/05-gameplay-core.js'), 'utf8');
assert.strictEqual((aiControllerSource.match(/function\s+runAITurn\s*\(/g) || []).length, 1, 'only one active AI turn controller should exist');
assert(!aiControllerSource.includes('function aiEvalBoard('), 'obsolete board evaluator should not remain as a dormant legacy path');
assert(!aiControllerSource.includes('function aiMCTSHandFates('), 'obsolete hand-fate rollout path should not remain');
assert(!/G\.players\[opp\]\.deck/.test(aiControllerSource), 'AI decision code must not read the opponent deck directly');
assert(/hiddenCards:perfect\s*\?\s*G\.players\[opp\]\.hand\s*:\s*undefined/.test(aiControllerSource), 'hidden hand identities must remain behind the perfect-knowledge gate');
assert(aiControllerSource.includes('function aiOpponentCardDecisionFate('), 'face-down targets need an information-safe decision value');
assert((aiControllerSource.match(/aiOpponentCardDecisionFate\(/g) || []).length >= 7, 'opponent target selectors should use information-safe Fate values');
assert(gameplaySource.includes("typeof aiChooseReaction === 'function'"), 'AI reactions must route through the unified AI policy');
assert(setupSource.includes("typeof aiShouldActivateOptionalDrawEffect === 'function'"), 'AI optional draw effects must route through the unified AI policy');

console.log('AI intelligence smoke test passed.');
