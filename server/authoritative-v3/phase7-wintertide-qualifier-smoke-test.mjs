import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, effectiveFate} from '../../shared/engine/index.mjs';

const definitions = [
  {id:'01', name:'Felicyta Janowicz', type:'Coordinator', aff:'third_great_war', fate:6, cost:3, rarity:'square'},
  {id:'87', name:'Květka Svoboda (Ukulele)', type:'Initiator', aff:'expanded_worlds', fate:3, cost:2, rarity:'triangle'},
  {id:'100', name:'Felicyta and Květka (Youth)', type:'Dauntless', aff:'expanded_worlds', fate:12, cost:3, rarity:'square'}
];

function createState(){
  return createInitialState({
    matchId:'PHASE7WINTERTIDEQUALIFIER',
    seed:'phase7-wintertide-qualifier',
    handSize:99,
    maxTurns:20,
    landscapeId:'',
    cardDefinitions:definitions,
    players:[
      {id:'p0', deckIds:['100', '01', '87']},
      {id:'p1', deckIds:[]}
    ]
  });
}

function moveToBoard(state, cardId, destination){
  const index = state.players[0].hand.findIndex(card=>String(card.id) === String(cardId));
  assert.notEqual(index, -1, `missing ${cardId} from test hand`);
  const [card] = state.players[0].hand.splice(index, 1);
  card.controller = 0;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

const state = createState();
const wintertide = moveToBoard(state, '100', {z:0, r:2, c:0});
assert.equal(
  effectiveFate(state, wintertide),
  12,
  'authoritative Wintertide must not count its own instance as the separate Felicyta/Květka requirement'
);
moveToBoard(state, '01', {z:1, r:2, c:0});
assert.equal(
  effectiveFate(state, wintertide),
  15,
  'authoritative Wintertide must gain +3 when a distinct qualifying card is controlled'
);

const ukuleleState = createState();
const ukuleleWintertide = moveToBoard(ukuleleState, '100', {z:0, r:2, c:0});
moveToBoard(ukuleleState, '87', {z:2, r:2, c:0});
assert.equal(
  effectiveFate(ukuleleState, ukuleleWintertide),
  15,
  'authoritative Wintertide must recognize Květka (Ukulele) as a distinct qualifying card'
);

const helperPath = new URL('../../src/scripts/00-structural-helpers.js', import.meta.url);
const corePath = new URL('../../src/scripts/05-gameplay-core.js', import.meta.url);
const helperText = fs.readFileSync(helperPath, 'utf8');
const coreText = fs.readFileSync(corePath, 'utf8');
const helperStart = helperText.indexOf('function cardNameMatchesAny');
const helperEnd = helperText.indexOf('function getPlayerForHandCard', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'singleplayer named-card helpers must remain discoverable');

const singleplayerCards = [];
const sandbox = {
  isFaceDownCard:card=>card?.faceDown === true,
  forEachBoardCard:callback=>singleplayerCards.forEach(callback)
};
vm.createContext(sandbox);
vm.runInContext(helperText.slice(helperStart, helperEnd), sandbox);

const singleplayerWintertide = {id:'100', iid:'wintertide-self', owner:0, name:'Felicyta and Květka (Youth)'};
singleplayerCards.push(singleplayerWintertide);
assert.equal(
  sandbox.controlsNamedCard(0, ['Felicyta', 'Kvetka', 'Květka'], {excludeIid:singleplayerWintertide.iid}),
  false,
  'singleplayer named-card scan must exclude Wintertide itself'
);
singleplayerCards.push({id:'01', iid:'distinct-felicyta', owner:0, name:'Felicyta Janowicz'});
assert.equal(
  sandbox.controlsNamedCard(0, ['Felicyta', 'Kvetka', 'Květka'], {excludeIid:singleplayerWintertide.iid}),
  true,
  'singleplayer named-card scan must find a distinct qualifying card'
);
assert.match(
  coreText,
  /controlsNamedCard\(card\.owner, \['Felicyta', 'Kvetka', 'Květka'\], \{excludeIid:card\.iid\}\)/,
  'singleplayer Wintertide Fate calculation must exclude the evaluated instance'
);

console.log('phase7 Wintertide separate-card qualifier smoke passed');
