#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');
const {canonicalStateHash, reduceServerAction} = require('./fate-authority-reducer');

const root = path.resolve(__dirname, '..');
const read = file=>fs.readFileSync(path.join(root, file), 'utf8');
const data = read('src/scripts/01-data-and-state.js');
const structural = read('src/scripts/00-structural-helpers.js');
const setup = read('src/scripts/04-game-setup.js');
const core = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const online = read('src/scripts/18-online-rooms.js');
const reducer = read('server/fate-authority-reducer.js');

for(const asset of ['ingamebackgrouds/igb19.png', 'setvoicelines/board19.mp3']){
  const full = path.join(root, asset);
  assert(fs.existsSync(full), `${asset} must exist`);
  assert(fs.statSync(full).size > 1000, `${asset} must contain supplied media`);
}

assert.match(data, /igb19:\s*\{[\s\S]{0,260}Californique: Lost Civilization of the Old Age[\s\S]{0,260}3 of that player\\'s turns/);
assert.doesNotMatch(data, /igb19:\s*\{[\s\S]{0,360}first player to reach 20, 35, and 50 total Fate/);
assert.match(structural, /CALIFORNIQUE_HAND_TURN_LIMIT = 3/);
assert.match(structural, /function getCaliforniqueHandTurnsRemaining[\s\S]{0,1400}_igb19HandTurnsRemaining/);
assert.match(structural, /key:'igb19-hand-expiry'[\s\S]{0,260}turn[\s\S]{0,260}before this Character is discarded/);
assert.match(setup, /function addCardToHand[\s\S]{0,320}resetCaliforniqueHandTenure\(card, targetPlayer\)/);
assert.match(core, /function resolveCaliforniqueHandExpiryForPlayer[\s\S]{0,2200}remaining - 1[\s\S]{0,900}fatePushDiscard\(player, card/);
assert.match(core, /async function nextPlayerTurn\(\)[\s\S]{0,180}resolveCaliforniqueHandExpiryForPlayer\(endingPlayer\)/);
assert.match(audio, /GAME_SONGS = Array\.from\(\{length:20\}/);
assert.match(audio, /n === 19\) path = 'ingamebackgrouds\/igb19\.png'/);
assert.match(rendering, /Math\.min\(20, parseInt\(id\.replace\('igb',''\)/);
assert.doesNotMatch(rendering, /getActiveLandscapeFateDiscardConfig[\s\S]{0,520}id:'igb19'[\s\S]{0,220}thresholds:/);
assert.match(online, /function pickSongForSeed[\s\S]{0,180}Math\.floor\(rng\(\) \* 20\) \+ 1/);
assert.match(reducer, /function validateCaliforniqueEndTurnTransition[\s\S]{0,2800}expired Character did not reach discard/);

const catalog = getCardCatalog();
const deck = catalog.cards.filter(card=>card && !card.retired && !card.temporarilyDisabled).slice(0, 40).map(card=>card.id);
const boot = buildInitialAuthorityState({catalog, seed:'igb19-smoke', song:'board19', decks:{0:deck, 1:deck}});
assert.strictEqual(boot.state.landscapeId, 'igb19');
assert.strictEqual(boot.state.landscapeBgNum, 19);
boot.state.players.forEach((player, playerIndex)=>{
  player.hand.forEach(card=>{
    const type = String(card.type || '');
    if(!type || type === 'Supporter' || type === 'Counter' || String(card.id || '') === 'token1') return;
    assert.strictEqual(card._igb19HandTurnsRemaining, 3);
    assert.strictEqual(card._igb19HandOwner, playerIndex);
    assert.strictEqual(card._igb19LastCountedHandTurn, 0);
  });
});

const clone = value=>JSON.parse(JSON.stringify(value));
const emptyBoard = ()=>Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array.from({length:3}, ()=>null)));
const character = (iid, remaining)=>({
  id:'03', iid, owner:0, type:'Initiator', name:`Character ${iid}`,
  fate:1, currentFate:1, _igb19HandTurnsRemaining:remaining, _igb19HandOwner:0,
  _igb19LastCountedHandTurn:0
});
const supporter = iid=>({id:'05', iid, owner:0, type:'Supporter', name:`Supporter ${iid}`, fate:1, currentFate:1});
const base = {
  v:2, landscapeId:'igb19', landscapeBgNum:19,
  _landscapeState:{id:'igb19', handTurnCounts:[0,0], handLastResolvedGameTurns:[null,null]},
  phase:'main', turn:5, currentPlayer:0, board:emptyBoard(),
  players:[
    {hand:[character('expires', 1), character('stays', 2), supporter('support')], deck:[], discard:[]},
    {hand:[], deck:[], discard:[]}
  ]
};
function reduceEndTurn(before, after){
  const baseStateHash = canonicalStateHash(before);
  return reduceServerAction({canonicalState:before, canonicalHash:baseStateHash}, {
    type:'ACTION_RESULT',
    payload:{
      actionKind:'END_TURN', playerIndex:0, turn:before.turn, baseStateHash,
      postState:after, stateHash:canonicalStateHash(after)
    }
  }, {mode:'client-resolved', requireBaseHash:true});
}

const valid = clone(base);
const expired = valid.players[0].hand.shift();
valid.players[0].hand[0]._igb19HandTurnsRemaining = 1;
valid.players[0].hand[0]._igb19LastCountedHandTurn = 1;
valid.players[0].discard.push(expired);
valid._landscapeState.handTurnCounts[0] = 1;
valid._landscapeState.handLastResolvedGameTurns[0] = 5;
valid.currentPlayer = 1;
valid.turn = 6;
const accepted = reduceEndTurn(base, valid);
assert.strictEqual(accepted.ok, true, accepted.reason);

const wineBase = clone(base);
wineBase.players[0].hand = [{
  id:'70', iid:'wine-country', owner:0, type:'Dauntless', name:'Wine Country Guerilla',
  fate:1, currentFate:1, _igb19HandTurnsRemaining:1, _igb19HandOwner:0
}];
const wineTransfer = clone(wineBase);
const transferred = wineTransfer.players[0].hand.shift();
transferred.guerilla_transferred = true;
transferred.guerilla_owner = 0;
transferred.guerilla_turnsLeft = 5;
transferred._igb19HandTurnsRemaining = 3;
transferred._igb19HandOwner = 1;
transferred._igb19LastCountedHandTurn = 0;
wineTransfer.players[1].hand.push(transferred);
wineTransfer._landscapeState.handTurnCounts[0] = 1;
wineTransfer._landscapeState.handLastResolvedGameTurns[0] = 5;
wineTransfer.currentPlayer = 1;
wineTransfer.turn = 6;
const acceptedWineTransfer = reduceEndTurn(wineBase, wineTransfer);
assert.strictEqual(acceptedWineTransfer.ok, true, acceptedWineTransfer.reason);

const retainedExpired = clone(valid);
retainedExpired.players[0].discard = [];
retainedExpired.players[0].hand.unshift(character('expires', 1));
const rejectedRetained = reduceEndTurn(base, retainedExpired);
assert.strictEqual(rejectedRetained.ok, false);
assert.match(rejectedRetained.reason, /expired Character remained in hand/);

const premature = clone(valid);
premature.players[0].hand = premature.players[0].hand.filter(card=>card.iid !== 'stays');
const rejectedPremature = reduceEndTurn(base, premature);
assert.strictEqual(rejectedPremature.ok, false);
assert.match(rejectedPremature.reason, /left hand before its countdown expired/);

const countedOpponentTurn = clone(valid);
countedOpponentTurn._landscapeState.handTurnCounts = [1, 1];
const rejectedOpponentCount = reduceEndTurn(base, countedOpponentTurn);
assert.strictEqual(rejectedOpponentCount.ok, false);
assert.match(rejectedOpponentCount.reason, /counted the wrong player turn/);

console.log('Landscape 19 Californique smoke passed.');
