#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');
const {canonicalStateHash, validateProposedTransition} = require('./fate-authority-reducer');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

const bh1 = getCardCatalog().byId.get('bh01');
assert.ok(bh1, 'BH1 must be present in the authoritative card catalog');
assert.strictEqual(bh1.name, 'Ani\u010dka Konvi\u010dka (Voyager)');
assert.strictEqual(bh1.ability, 'Brave Horizons');
assert.strictEqual(bh1.type, 'Dauntless');
assert.strictEqual(bh1.fate, 12);
assert.strictEqual(bh1.cost, 3);
assert.strictEqual(bh1.rarity, 'star');
assert.strictEqual(bh1.img, 'bh1.png');
assert.notStrictEqual(bh1.retired, true, 'BH1 must be available to deck builders and game setup');
assert.match(bh1.effect, /Once a turn[\s\S]*any open square in any zone[\s\S]*draw 1 card[\s\S]*immune to all effects/i);

for(const relative of ['bh1.png', 'optimized/card-thumbs/bh1.jpg', 'setvoicelines/bh1.mp3']){
  assert.ok(fs.existsSync(path.join(ROOT, relative)), `${relative} must be packaged`);
  assert.ok(fs.statSync(path.join(ROOT, relative)).size > 1000, `${relative} must not be empty`);
}

const structural = read('src/scripts/00-structural-helpers.js');
const gameplay = read('src/scripts/05-gameplay-core.js');
const ai = read('src/scripts/07-ai.js');
const online = read('src/scripts/18-online-rooms.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const renderer = read('src/scripts/06-rendering-and-helpers.js');
const renderAdapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const finalCss = read('src/styles/zz-codex-last.css');
assert.match(structural, /function isAnickaVoyagerCard[\s\S]*function isInnatelyFullyEffectImmuneCard/);
assert.match(structural, /innatelyImmune[\s\S]*card\.immuneFlag = true/);
assert.match(gameplay, /function beginAnickaVoyagerMove[\s\S]*function resolveAnickaVoyagerMove/);
assert.doesNotMatch(gameplay, /function chooseAnickaVoyagerDraw|Skip Draw/, 'Brave Horizons must draw automatically without a prompt');
assert.match(gameplay, /const drewCard =[\s\S]*await drawCard\(G\.currentPlayer, 1\)/);
assert.match(ai, /case 'bh01'[\s\S]*beginAnickaVoyagerMove[\s\S]*resolveAnickaVoyagerMove/);
assert.match(online, /anickaVoyagerMove[\s\S]*SELECT_PENDING_MOVE_CELL/);
assert.match(audio, /'bh01': 'bh1'/);
assert.match(renderer, /"bh01": "In another time, in another place, these seas were once called Pacifique"/);
assert.match(renderer, /textContent=String\(bc\.id \|\| ''\) === 'bh01' \? 'Brave Horizons' : 'Activate Effect'/);
assert.match(renderer, /function highlightAnickaVoyagerMoveCells[\s\S]*brave-horizons-target/);
assert.match(renderAdapter, /brave-horizons-move[\s\S]*rgba\(116,207,237,\.62\)/);
assert.match(finalCss, /\.cell\.placeable\.brave-horizons-target[\s\S]*outline:1px solid rgba\(116,207,237,\.62\)[\s\S]*animation:none/);

const boot = buildInitialAuthorityState({
  catalog:getCardCatalog(),
  seed:'brave-horizons-bootstrap',
  mode:'freeplay',
  decks:{0:Array(40).fill('bh01'), 1:Array(40).fill('bh01')}
});
boot.state.players.forEach(player=>player.hand.concat(player.deck).forEach(card=>{
  assert.strictEqual(card.immuneFlag, true, 'multiplayer BH1 instances must carry intrinsic effect immunity');
  assert.strictEqual(card.cantBeReduced, true, 'multiplayer BH1 Fate cannot be reduced by effects');
}));

function card(id, owner, iid, type = 'Supporter'){
  return {id, owner, iid, type, name:id, fate:1, currentFate:1, immuneFlag:false, cantBeReduced:false};
}

function emptyBoard(){
  return Array.from({length:3}, () => Array.from({length:3}, () => Array.from({length:3}, () => null)));
}

function moveOptions(state){
  const options = [];
  state.board.forEach((zone, z)=>zone.forEach((row, r)=>row.forEach((entry, c)=>{
    if(entry === null) options.push({z, r, c});
  })));
  return options;
}

function baseState(){
  const state = {
    v:2,
    phase:'main',
    turn:7,
    currentPlayer:0,
    players:[
      {hand:[], deck:[card('draw-1', 0, 'draw-1')], discard:[]},
      {hand:[], deck:[], discard:[]}
    ],
    board:emptyBoard(),
    selectedHandCard:null,
    selectedBoardCard:null,
    placing:false,
    blockingCell:false,
    pendingEffect:null,
    pendingInteraction:null
  };
  state.board[0][2][0] = Object.assign(card('bh01', 0, 'bh01-1', 'Dauntless'), {
    name:'Ani\u010dka Konvi\u010dka (Voyager)',
    fate:12,
    currentFate:12,
    immuneFlag:true,
    cantBeReduced:true
  });
  return state;
}

function validate(preState, payload, postState){
  const baseStateHash = canonicalStateHash(preState);
  return validateProposedTransition({canonicalState:preState, canonicalHash:baseStateHash}, {
    type:'ACTION_RESULT',
    payload:Object.assign({}, payload, {
      postState,
      stateHash:canonicalStateHash(postState),
      baseStateHash
    })
  }, {requireBaseHash:true});
}

const activationPre = baseState();
const activationPost = clone(activationPre);
activationPost.placing = true;
activationPost._bh01Moving = {
  kind:'anickaVoyagerMove',
  sourceIid:'bh01-1',
  cardId:'bh01',
  playerIndex:0,
  fromZ:0,
  fromR:2,
  fromC:0,
  options:moveOptions(activationPre)
};
const activated = validate(activationPre, {
  actionKind:'BOARD_ACTION',
  playerIndex:0,
  turn:7,
  fn:'triggerCharacterEffect',
  source:{z:0, r:2, c:0, iid:'bh01-1', id:'bh01'}
}, activationPost);
assert.strictEqual(activated.ok, true, activated.reason);

const movePre = activationPost;
const movedCard = clone(movePre.board[0][2][0]);
const movePost = clone(movePre);
movePost.board[0][2][0] = null;
movePost.board[2][0][1] = movedCard;
movePost.board[2][0][1].bh01MovedThisTurn = true;
movePost.board[2][0][1]._braveHorizonsLastMoveTurn = 7;
movePost._bh01Moving = null;
movePost.placing = false;
movePost.players[0].deck = [];
movePost.players[0].hand = [movePre.players[0].deck[0]];
const moved = validate(movePre, {
  actionKind:'SELECT_PENDING_MOVE_CELL',
  playerIndex:0,
  turn:7,
  z:2,
  r:0,
  c:1,
  pendingMove:true,
  moveKind:'anickaVoyagerMove'
}, movePost);
assert.strictEqual(moved.ok, true, moved.reason);

const illegalDraw = clone(movePost);
illegalDraw.players[0].hand.push(card('draw-2', 0, 'draw-2'));
const rejectedDraw = validate(movePre, {
  actionKind:'SELECT_PENDING_MOVE_CELL', playerIndex:0, turn:7, z:2, r:0, c:1, pendingMove:true
}, illegalDraw);
assert.strictEqual(rejectedDraw.ok, false);
assert.match(rejectedDraw.reason, /automatically draw exactly the top card/i);

const skippedDraw = clone(movePost);
skippedDraw.players[0].deck = clone(movePre.players[0].deck);
skippedDraw.players[0].hand = clone(movePre.players[0].hand);
const rejectedSkip = validate(movePre, {
  actionKind:'SELECT_PENDING_MOVE_CELL', playerIndex:0, turn:7, z:2, r:0, c:1, pendingMove:true
}, skippedDraw);
assert.strictEqual(rejectedSkip.ok, false);
assert.match(rejectedSkip.reason, /automatically draw exactly the top card/i);

const illegalDestination = clone(movePost);
illegalDestination.board[2][0][1] = null;
illegalDestination.board[0][2][0] = null;
const rejectedDestination = validate(movePre, {
  actionKind:'SELECT_PENDING_MOVE_CELL', playerIndex:0, turn:7, z:9, r:9, c:9, pendingMove:true
}, illegalDestination);
assert.strictEqual(rejectedDestination.ok, false);
assert.match(rejectedDestination.reason, /open square|coordinates/i);

console.log('Brave Horizons BH1 smoke test passed.');
