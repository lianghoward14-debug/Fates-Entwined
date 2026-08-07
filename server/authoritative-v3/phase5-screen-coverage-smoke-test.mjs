import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  fateV3CommandsForCard,
  fateV3ScreenCommandLabel
} from '../../src/scripts/authoritative-v3-single-player-screen.mjs';
import {
  chooseStrategicV3AiCommand,
  scoreStrategicV3AiCommand
} from '../../src/scripts/authoritative-v3-ai-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative=>fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
const screenSource = read('src/scripts/authoritative-v3-single-player-screen.mjs');
const adapterSource = read('src/scripts/authoritative-v3-single-player-adapter.mjs');

const destination = {z:1, r:3, c:2};
const commands = [
  {
    type:'SET_ADAPTIVE_TOKEN',
    payload:{
      cardIid:'adaptive',
      destination,
      declaredType:'Coordinator',
      declaredAffiliation:'eventide',
      declaredRarity:'star',
      placementType:'CONSOLIDATED'
    }
  },
  {
    type:'ACTIVATE_LANDSCAPE',
    payload:{sourceIid:'source', discardIids:['discard-a', 'discard-b'], targetIid:'target'}
  },
  {
    type:'CONSOLIDATE_CARD',
    payload:{cardIid:'character', tributeIids:['tribute-a', 'tribute-b'], destination}
  },
  {type:'CONCEDE', payload:{}}
];

assert.match(fateV3ScreenCommandLabel(commands[0]), /star eventide Coordinator/);
assert.match(fateV3ScreenCommandLabel(commands[0]), /Zone 2, Row 4, Square 3/);
assert.match(fateV3ScreenCommandLabel(commands[1]), /discarding 2 card/);
assert.equal(fateV3ScreenCommandLabel(commands[3]), 'Concede match');
assert.deepEqual(fateV3CommandsForCard(commands, 'source'), [commands[1]]);
assert.deepEqual(fateV3CommandsForCard(commands, 'discard-a'), [commands[1]]);
assert.deepEqual(fateV3CommandsForCard(commands, 'tribute-b'), [commands[2]]);

const aiProjection = {
  activePlayer:1,
  board:[
    [[null, null, null], [null, null, null], [null, null, null]],
    [[null, null, null], [null, null, null], [null, null, null]],
    [[null, null, null], [null, null, null], [null, null, null]]
  ],
  players:[
    {id:'human', discard:[]},
    {
      id:'ai',
      hand:[
        {iid:'ai-low', owner:1, currentFate:1},
        {iid:'ai-high', owner:1, currentFate:5}
      ],
      discard:[]
    }
  ]
};
const aiLegal = [
  {type:'END_TURN', payload:{}},
  {type:'SET_CARD', payload:{cardIid:'ai-low', destination:{z:0, r:0, c:0}}},
  {type:'SET_CARD', payload:{cardIid:'ai-high', destination:{z:1, r:0, c:0}}},
  {type:'CONCEDE', payload:{}}
];
assert(
  scoreStrategicV3AiCommand(aiLegal[2], aiProjection, {playerIndex:1})
    > scoreStrategicV3AiCommand(aiLegal[1], aiProjection, {playerIndex:1})
);
assert.deepEqual(
  chooseStrategicV3AiCommand(aiLegal, aiProjection, {playerIndex:1}),
  aiLegal[2],
  'v3 strategy must prefer the stronger legal play and never concede'
);
assert.equal(
  chooseStrategicV3AiCommand([{type:'END_TURN', payload:{}}], aiProjection, {playerIndex:1}).type,
  'END_TURN'
);

assert.match(screenSource, /geometry\?\.rowOwners/);
assert.match(screenSource, /geometry\?\.playableExtraSquares/);
assert.match(screenSource, /const rowCount = Math\.max\(/);
assert.match(screenSource, /SET_CARD_FROM_DECK/);
assert.match(screenSource, /SET_ADAPTIVE_TOKEN/);
assert.match(screenSource, /ACTIVATE_LANDSCAPE/);
assert.match(screenSource, /selectedPromptIids/);
assert.match(screenSource, /selectedPromptDestinations/);
assert.match(screenSource, /pendingPrompt\?\.type === 'BOARD_DESTINATION'[\s\S]{0,120}pendingPrompt\.multi === true/);
assert.match(screenSource, /sameStringSet\(payload\.selectedIids, iids\)/);
assert.match(screenSource, /sameDestinationSet\(payload\.destinations, destinations\)/);
assert.match(screenSource, /renderOutcome\(actions, hint\)/);
assert.match(screenSource, /destroy\(\)/);
assert.match(screenSource, /#s-game #actbar\{left:0!important\}/);
assert.match(screenSource, /#s-game \.hand-strip\{position:relative!important;z-index:60!important\}/);
assert.match(screenSource, /promptType !== 'BOARD_DESTINATION'/);
assert.doesNotMatch(screenSource, /\.slice\(0,\s*96\)/);
assert.doesNotMatch(screenSource, /\bG\b|selectHandCard\(|clickCell\(|\bendTurn\(/);

assert.match(adapterSource, /static recover\(\{/);
assert.match(adapterSource, /FateAuthoritativeV3LocalSession\.recover\(/);
assert.match(adapterSource, /resumeOnGameScreen\(input, callbacks = \{\}\)/);
assert.match(adapterSource, /stopMatch\(options\)/);
assert.match(adapterSource, /activeScreen\?\.destroy\(\)/);
assert.match(adapterSource, /chooseStrategicV3AiCommand/);
assert.doesNotMatch(adapterSource, /\bWebSocket\b|\/v3\/socket|FATE_SERVER_AUTHORITATIVE_V3_ENABLED/);

console.log('authoritative v3 Phase 5 advanced screen coverage smoke test passed');
