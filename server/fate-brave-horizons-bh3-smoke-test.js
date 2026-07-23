#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const bh3 = getCardCatalog().byId.get('bh03');
assert.ok(bh3, 'BH3 must be present in the authoritative card catalog');
assert.strictEqual(bh3.name, 'Ali, The Indomitable');
assert.strictEqual(bh3.ability, 'He, Who is Unyielding');
assert.strictEqual(bh3.type, 'Improvisor');
assert.strictEqual(bh3.fate, 2);
assert.strictEqual(bh3.cost, 3);
assert.strictEqual(bh3.rarity, 'triangle');
assert.strictEqual(bh3.img, 'bh3.png?v=bh3-20260723');
assert.match(bh3.effect, /^When this card appears in your hand,[\s\S]*transfers to your opponent's hand[\s\S]*immune to all effects[\s\S]*exceeding 6 cards[\s\S]*loses its immunity when set\.$/i);
assert.doesNotMatch(bh3.effect, /when you would draw/i, 'BH3 must trigger on every hand arrival, not only draws');

const art = path.join(ROOT, 'bh3.png');
const thumb = path.join(ROOT, 'optimized', 'card-thumbs', 'bh3.jpg');
assert.ok(fs.existsSync(art), 'BH3 full card art must exist');
assert.ok(fs.existsSync(thumb), 'BH3 optimized thumbnail must exist');
assert.ok(fs.statSync(art).size > 1000, 'BH3 full card art must not be empty');
assert.ok(fs.statSync(thumb).size > 1000, 'BH3 optimized thumbnail must not be empty');
assert.ok(fs.statSync(thumb).mtimeMs >= fs.statSync(art).mtimeMs, 'BH3 thumbnail must be regenerated from the current PNG');

const setup = read('src/scripts/04-game-setup.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const authority = read('server/fate-authority-reducer.js');
const index = read('index.html');
assert.match(setup, /function transferAliIndomitableToOpponentHand[\s\S]*_bh03OpponentHand = true[\s\S]*immuneFlag = true[\s\S]*cantBeReduced = true[\s\S]*arrivalKind:'ali-transfer'/, 'BH3 transfer must mark the opponent-hand copy immune without recursively transferring it');
assert.match(setup, /function scheduleAliIndomitableHandTransfer[\s\S]*_bh03TransferPending = true[\s\S]*transferAliIndomitableToOpponentHand[\s\S]*5000/, 'every BH3 arrival must remain visible for five seconds before transferring');
assert.match(setup, /function addCardToHand[\s\S]*shouldRevealAliBeforeTransfer[\s\S]*G\.players\[targetPlayer\]\.hand\.push\(card\)[\s\S]*scheduleAliIndomitableHandTransfer\(targetPlayer, card, options\)/, 'the shared hand-add path must reveal BH3 in the receiving hand before scheduling its transfer');
assert.match(setup, /arrivalKind:'ali-pending-transfer'[\s\S]*deferAliTransfer:false/, 'normal draws must use the shared five-second transfer scheduler');
assert.match(setup, /playFateSfxOnce\('aliTransfer',[\s\S]*playSfx\('aliTransfer'\)/, 'BH3 must play its dedicated transfer cue when it changes hands');
assert.match(audio, /aliTransfer:\s*\{src:'soundeffects\/codex-redesign\/character_improvisor_future_drop\.wav', gain:1\.1\}/, 'BH3 transfer audio must use the prominent Improvisor impact sample');
assert.match(rendering, /Howard Dev Deck List[\s\S]*addCardToHand\(player, moved, \{arrivalKind:'dev-add'\}\)/, 'developer hand additions must use the shared arrival hook');
assert.match(authority, /String\(drawn\.id \|\| ''\) === 'bh03'[\s\S]*state\.players\[recipient\]\.hand\.push\(drawn\)/, 'server-authoritative draw effects must transfer BH3 to the opponent');
const setupVersion = Number((index.match(/04-game-setup\.js\?v=(\d+)/) || [])[1]);
const audioVersion = Number((index.match(/08-audio-and-meta-ui\.js\?v=(\d+)/) || [])[1]);
assert.ok(setupVersion >= 1785032325 && audioVersion >= 1785032309, 'BH3 gameplay and audio scripts must be cache-busted');

const opening = buildInitialAuthorityState({
  catalog:getCardCatalog(),
  seed:'bh3-opening-hand-transfer',
  mode:'freeplay',
  decks:{0:Array(40).fill('bh03'), 1:Array(40).fill('bh02')}
}).state;
assert.strictEqual(opening.players[0].hand.length, 0, 'BH3 cards must leave their owner\'s multiplayer opening hand');
assert.strictEqual(opening.players[1].hand.length, 12, 'opening-hand BH3 cards must appear in the opponent\'s hand');
opening.players[1].hand.filter(card=>String(card.id) === 'bh03').forEach(card=>{
  assert.strictEqual(card.owner, 1);
  assert.strictEqual(card._bh03OpponentHand, true);
  assert.strictEqual(card._bh03TransferredFrom, 0);
  assert.strictEqual(card.immuneFlag, true);
  assert.strictEqual(card.cantBeReduced, true);
});

const codeStart = setup.indexOf('function transferAliIndomitableToOpponentHand');
const codeEnd = setup.indexOf('\nfunction triggerSelvaIslandsPirateHandArrival', codeStart);
assert.ok(codeStart >= 0 && codeEnd > codeStart, 'BH3 hand-arrival functions must be extractable for behavioral validation');
const events = [];
const scheduledTimers = [];
const sandbox = {
  G:{
    players:[
      {name:'Player 1', hand:[], deck:[]},
      {name:'Player 2', hand:[], deck:[]}
    ],
    _forceHandEnterIids:new Set()
  },
  window:{playFateSfxOnce:(type, key)=>events.push(['sfx', type, key])},
  document:{
    getElementById:id=>id === 's-game' ? {classList:{contains:name=>name === 'active'}} : null
  },
  toast:message=>events.push(['toast', message]),
  log:(side, message)=>events.push(['log', side, message]),
  enforceHandLimit:player=>events.push(['limit', player]),
  requestAnimationFrame:callback=>callback(),
  setTimeout:(callback, delay)=>{
    scheduledTimers.push({callback, delay:Number(delay) || 0});
    return scheduledTimers.length;
  },
  clearTimeout:()=>{}
};
vm.runInNewContext(setup.slice(codeStart, codeEnd) + '\nthis.addCardToHand = addCardToHand; this.transferAli = transferAliIndomitableToOpponentHand;', sandbox);
sandbox.showAliIndomitableTransferBanner = (source, recipient)=>events.push(['banner', source, recipient]);

const searchedAli = {id:'bh03', iid:'ali-search', owner:0, type:'Improvisor', name:'Ali, The Indomitable'};
assert.strictEqual(sandbox.addCardToHand(0, searchedAli, {arrivalKind:'search'}), true);
assert.strictEqual(sandbox.G.players[0].hand[0], searchedAli, 'searched BH3 must be revealed in the searching player\'s hand');
assert.strictEqual(sandbox.G.players[1].hand.length, 0, 'searched BH3 must not transfer before its reveal delay');
assert.strictEqual(searchedAli._bh03TransferPending, true);
assert.strictEqual(scheduledTimers.length, 1, 'searched BH3 must schedule its visible-countdown start');
scheduledTimers.shift().callback();
assert.strictEqual(sandbox.G.players[0].hand[0], searchedAli, 'searched BH3 must remain visible while its transfer delay runs');
assert.strictEqual(scheduledTimers.length, 1, 'searched BH3 must schedule one transfer after becoming visible');
assert.strictEqual(scheduledTimers[0].delay, 5000, 'searched BH3 must remain in hand for five seconds');
scheduledTimers.shift().callback();
assert.deepStrictEqual(Array.from(sandbox.G.players[0].hand), [], 'searched BH3 must leave the searching player\'s hand after the delay');
assert.strictEqual(sandbox.G.players[1].hand[0], searchedAli, 'searched BH3 must transfer to the opponent');
assert.strictEqual(searchedAli.owner, 1);
assert.strictEqual(searchedAli._bh03OpponentHand, true);
assert.strictEqual(searchedAli._bh03TransferredFrom, 0);
assert.strictEqual(searchedAli.immuneFlag, true);
assert.strictEqual(searchedAli.cantBeReduced, true);
assert.ok(events.some(event=>event[0] === 'sfx' && event[1] === 'aliTransfer'), 'BH3 must play the dedicated transfer sound at transfer time');
assert.ok(events.some(event=>event[0] === 'limit' && event[1] === 1), 'the opponent hand limit must be enforced after BH3 transfers');

const normalCard = {id:'ordinary', iid:'ordinary-1', owner:0, type:'Dauntless', name:'Ordinary Card'};
assert.strictEqual(sandbox.addCardToHand(0, normalCard, {arrivalKind:'search'}), true);
assert.strictEqual(sandbox.G.players[0].hand[0], normalCard, 'ordinary hand additions must remain unchanged');

console.log('Brave Horizons BH3 smoke test passed.');
