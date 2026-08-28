import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  FateAuthoritativeV3SinglePlayerScreen,
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
const renderingSource = read('src/scripts/06-rendering-and-helpers.js');
const onlineSource = read('src/scripts/18-online-rooms.js');

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

const maja = {iid:'maja', id:'07', name:'Maja Kaminska', owner:0, controller:0, type:'Initiator', currentFate:3, counters:{}, statuses:[]};
const supporters = [
  {iid:'supporter-a', id:'05', name:'17th British Regiment', owner:0, type:'Supporter', currentFate:1},
  {iid:'supporter-b', id:'31', name:'Oathbound Noble Fighter', owner:0, type:'Supporter', currentFate:1},
  {iid:'supporter-c', id:'32', name:'Temecula Resident', owner:0, type:'Supporter', currentFate:1}
];
const promptCommand = {
  type:'ANSWER_PROMPT',
  payload:{promptId:'maja-prompt', selectedIids:supporters.map(card=>card.iid)}
};
const modal = {
  classList:{contains:()=>false},
  dataset:{},
  querySelector:()=>null
};
const submitted = [];
const visualCalls = [];
const screen = new FateAuthoritativeV3SinglePlayerScreen({
  windowRef:{
    location:{search:''},
    document:{getElementById:()=>modal},
    setTimeout:()=>1,
    clearTimeout(){},
    pickCardsVisual(cards, options, confirm){
      visualCalls.push({cards, options});
      confirm(cards);
    }
  },
  adapter:{view:()=>null},
  cardDefinitions:[
    {id:'07', name:'Maja Kaminska', ability:'Oblique Order', type:'Initiator'},
    {id:'05', name:'17th British Regiment', ability:'Liberators of Rwanda', type:'Supporter'},
    {id:'31', name:'Oathbound Noble Fighter', ability:'Hemorrhaging Wound', type:'Supporter'},
    {id:'32', name:'Temecula Resident', ability:'Wine Country Fanaticism', type:'Supporter'},
    {id:'64', name:'Cook Islands Duelist', ability:'Blade Dance', effect:'Reduce an adjacent card by 2 Fate.'}
  ]
});
screen.view = {
  playerIndex:0,
  legalCommands:[promptCommand],
  state:{
    board:[[[null, null, null],[null, null, null],[maja, null, null]]],
    players:[{hand:[], discard:[]},{hand:[], discard:[]}],
    pendingPrompt:{
      promptId:'maja-prompt',
      playerIndex:0,
      sourceIid:'maja',
      type:'CARD_SELECTION',
      eligibleIids:supporters.map(card=>card.iid),
      eligibleCards:supporters,
      min:3,
      max:3
    }
  }
};
screen.submit = command=>submitted.push(command);
assert.equal(screen.syncVisualCardPrompt(screen.view), true, 'the authoritative single-player screen must open Maja through the production visual picker');
assert.equal(visualCalls.length, 1);
assert.equal(visualCalls[0].options.title, 'Resolve Maja Kaminska');
assert.equal(visualCalls[0].options.minCount, 3);
assert.equal(visualCalls[0].options.maxCount, 3);
assert.deepEqual(submitted, [promptCommand], 'Maja picker confirmation must submit the exact reducer-authorized command');
assert.equal(
  screen.statusPresentation({type:'MAJA_EXTRA_SUPPORTERS', playerIndex:0, remainingOwnerTurns:1, extraSupports:2})?.ability,
  'Oblique Order',
  'the same screen must render Maja canonical status as Oblique Order'
);
assert.equal(
  screen.presentationCard({iid:'taylor', id:'bh05', owner:0, counters:{copiedEffectId:'64'}})._bh05CopiedAbility,
  'Blade Dance',
  'authoritative single-player Taylor must expose her copied-effect tracker presentation'
);

assert.match(screenSource, /geometry\?\.rowOwners/);
assert.match(screenSource, /geometry\?\.playableExtraSquares/);
assert.match(screenSource, /const rowCount = Math\.max\(/);
assert.match(screenSource, /SET_CARD_FROM_DECK/);
assert.match(screenSource, /SET_ADAPTIVE_TOKEN/);
assert.match(screenSource, /ACTIVATE_LANDSCAPE/);
assert.match(screenSource, /selectedPromptIids/);
assert.match(screenSource, /selectedPromptDestinations/);
assert.match(screenSource, /pickCardsVisual\(cards/);
assert.match(screenSource, /guardVisualCardPrompt\(key\)/);
assert.match(screenSource, /renderStatusRails\(view\)/);
assert.match(screenSource, /presentEvents\(events = \[\], metadata = \{\}\)/);
assert.match(screenSource, /MAJA_EXTRA_SUPPORTERS/);
assert.match(screenSource, /WINE_COUNTRY_GUERILLA_INFILTRATION/);
assert.match(screenSource, /copiedEffectId/);
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
assert.match(adapterSource, /activeScreen\?\.presentEvents\?\.\(events, metadata\)/);
assert.match(adapterSource, /chooseStrategicV3AiCommand/);
assert.match(renderingSource, /window\.getAuthoritativeEffectOverlayDescriptor = getAuthoritativeEffectOverlayDescriptor/);
assert.match(onlineSource, /window\.getAuthoritativeEffectOverlayDescriptor\(event, source, target\)/);
assert.doesNotMatch(adapterSource, /\bWebSocket\b|\/v3\/socket|FATE_SERVER_AUTHORITATIVE_V3_ENABLED/);

console.log('authoritative v3 Phase 5 advanced screen coverage smoke test passed');
