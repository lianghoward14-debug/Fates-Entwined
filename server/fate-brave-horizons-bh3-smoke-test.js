#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');
const {canonicalStateHash, reduceServerAction} = require('./fate-authority-reducer');

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
const gameplay = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const authority = read('server/fate-authority-reducer.js');
const online = read('src/scripts/18-online-rooms.js');
const wsAuthority = read('server/fate-ws-authority.js');
const index = read('index.html');
assert.match(setup, /function transferAliIndomitableToOpponentHand[\s\S]*_bh03OpponentHand = true[\s\S]*immuneFlag = true[\s\S]*cantBeReduced = true[\s\S]*arrivalKind:'ali-transfer'/, 'BH3 transfer must mark the opponent-hand copy immune without recursively transferring it');
assert.match(setup, /function scheduleAliIndomitableHandTransfer[\s\S]*_bh03TransferPending = true[\s\S]*transferAliIndomitableToOpponentHand[\s\S]*5000/, 'every BH3 arrival must remain visible for five seconds before transferring');
assert.match(setup, /function addCardToHand[\s\S]*shouldRevealAliBeforeTransfer[\s\S]*G\.players\[targetPlayer\]\.hand\.push\(card\)[\s\S]*scheduleAliIndomitableHandTransfer\(targetPlayer, card, options\)/, 'the shared hand-add path must reveal BH3 in the receiving hand before scheduling its transfer');
assert.match(setup, /arrivalKind:'ali-pending-transfer'[\s\S]*deferAliTransfer:false/, 'normal draws must use the shared five-second transfer scheduler');
assert.match(setup, /playFateSfxOnce\('aliTransfer',[\s\S]*playSfx\('aliTransfer'\)/, 'BH3 must play its dedicated transfer cue when it changes hands');
assert.match(audio, /aliTransfer:\s*\{src:'soundeffects\/codex-redesign\/character_improvisor_future_drop\.wav', gain:1\.1\}/, 'BH3 transfer audio must use the prominent Improvisor impact sample');
assert.match(rendering, /Howard Dev Deck List[\s\S]*addCardToHand\(player, moved, \{arrivalKind:'dev-add'\}\)/, 'developer hand additions must use the shared arrival hook');
assert.match(authority, /function authorityResolveDrawnCardArrival[\s\S]*String\(card\.id \|\| ''\) === 'bh03'[\s\S]*state\.players\[recipient\]\.hand\.push\(card\)/, 'server-authoritative draw effects must transfer BH3 to the opponent');
assert.match(rendering, /ali_indomitable:\s*`<svg class="ali-indomitable-icon"[\s\S]*M18 29V18/, 'BH3 must use the approved gauntlet status-banner icon');
assert.match(rendering, /handBits\.push\(\['ali', holder, c\.iid \|\| '', c\._bh03TransferredFrom/, 'the top-bar cache signature must track Ali entering and leaving the opponent hand');
assert.match(rendering, /const aliCard = CARDS\.find\(c => c\.id === 'bh03'\)[\s\S]*_bh03OpponentHand === true[\s\S]*getStatusEffectIcon\('ali_indomitable'\)[\s\S]*statusInstanceKey:'ali-indomitable:'/, 'BH3 must expose a persistent status banner derived from synchronized opponent-hand state');
assert.match(setup, /G\._onlineRoomCode[\s\S]{0,500}G\._onlineAliTransfersReady !== true[\s\S]{0,500}localPlayer !== Number\(sourcePlayer\)/, 'online Ali timers must wait for both clients and run only on the source player browser');
assert.match(online, /function resumeOnlinePendingAliTransfers[\s\S]{0,500}_onlineAliTransfersReady !== true[\s\S]{0,1800}playerIndex !== localIndex/, 'online Ali recovery must not schedule the same transfer on both clients');
assert.match(gameplay, /function showAliIndomitableResolvingBanner[\s\S]*Ali is currently resolving its effect, wait less than five seconds[\s\S]*function selectHandCard[\s\S]*_bh03TransferPending === true[\s\S]*showAliIndomitableResolvingBanner\(\)[\s\S]*return;/, 'interacting with pending Ali must show the resolving banner without selecting him');
assert.doesNotMatch(gameplay, /function showAliIndomitableResolvingBanner[\s\S]{0,900}ali-indomitable-transfer-banner/, 'interacting with pending Ali must not create a second top transfer banner');
assert.match(online, /function applyOnlineAliTransferByIid[\s\S]*selectedHandCard = null[\s\S]*placing = false[\s\S]*transferAliIndomitableToOpponentHand/, 'Ali transfer must clear a stale local hand selection before publishing its post-state');
assert.match(online, /sendOptimisticAction\('ALI_INDOMITABLE_TRANSFER'/, 'Ali transfer must use an explicit serialized online action');
assert.match(online, /sendOptimisticAction\('HAND_LIMIT_DISCARD'/, 'forced hand-limit discard must use an explicit serialized online action');
assert.match(wsAuthority, /turnAgnosticEffectiveAction[\s\S]{0,180}HAND_LIMIT_DISCARD\|ALI_INDOMITABLE_TRANSFER/, 'the authority must accept validated Ali and forced discard actions from the affected off-turn player');
const setupVersion = Number((index.match(/04-game-setup\.js\?v=(\d+)/) || [])[1]);
const audioVersion = Number((index.match(/08-audio-and-meta-ui\.js\?v=(\d+)/) || [])[1]);
const renderingVersion = Number((index.match(/06-rendering-and-helpers\.js\?v=(\d+)/) || [])[1]);
assert.ok(setupVersion >= 1785032325 && audioVersion >= 1785032309 && renderingVersion >= 1785072425, 'BH3 gameplay, audio, and status-banner scripts must be cache-busted');

const opening = buildInitialAuthorityState({
  catalog:getCardCatalog(),
  seed:'bh3-opening-hand-transfer',
  mode:'freeplay',
  decks:{0:Array(40).fill('bh03'), 1:Array(40).fill('bh02')}
}).state;
assert.strictEqual(opening.players[0].hand.length, 6, 'opening-hand BH3 cards must wait with their owner until both clients are loaded');
assert.strictEqual(opening.players[1].hand.length, 6, 'the opponent opening hand must not receive BH3 before both clients are loaded');
opening.players[0].hand.filter(card=>String(card.id) === 'bh03').forEach(card=>{
  assert.strictEqual(card.owner, 0);
  assert.strictEqual(card._bh03TransferPending, true);
  assert.strictEqual(card.noConsolidate, true);
});

const aliBase = JSON.parse(JSON.stringify(opening));
aliBase.players[0].hand = [aliBase.players[0].hand[0]];
aliBase.players[1].hand = [];
aliBase.players[0].discard = [];
aliBase.players[1].discard = [];
aliBase.currentPlayer = 1;
const pendingAli = aliBase.players[0].hand[0];
const earlyAliPost = JSON.parse(JSON.stringify(aliBase));
const earlyTransferredAli = earlyAliPost.players[0].hand.shift();
delete earlyTransferredAli._bh03TransferPending;
delete earlyTransferredAli.noConsolidate;
earlyTransferredAli.owner = 1;
earlyTransferredAli._bh03OpponentHand = true;
earlyTransferredAli._bh03TransferredFrom = 0;
earlyTransferredAli.immuneFlag = true;
earlyTransferredAli.cantBeReduced = true;
earlyAliPost.players[1].hand.push(earlyTransferredAli);
const earlyAliBaseHash = canonicalStateHash(aliBase);
const earlyAliTransferResult = reduceServerAction(
  {canonicalState:aliBase, canonicalHash:earlyAliBaseHash},
  {type:'ACTION_RESULT', payload:{
    playerIndex:0,
    actionKind:'ALI_INDOMITABLE_TRANSFER',
    cardIid:String(pendingAli.iid),
    baseStateHash:earlyAliBaseHash,
    postState:earlyAliPost,
    stateHash:canonicalStateHash(earlyAliPost)
  }},
  {requireBaseHash:true}
);
assert.strictEqual(earlyAliTransferResult.ok, false, 'authority must reject Ali transfer before either player makes the first set');
aliBase.board[0][0][0] = {id:'01', iid:'first-set-card', owner:1, type:'Supporter', currentFate:1};
const aliPost = JSON.parse(JSON.stringify(aliBase));
const transferredAli = aliPost.players[0].hand.shift();
delete transferredAli._bh03TransferPending;
delete transferredAli.noConsolidate;
transferredAli.owner = 1;
transferredAli._bh03OpponentHand = true;
transferredAli._bh03TransferredFrom = 0;
transferredAli.immuneFlag = true;
transferredAli.cantBeReduced = true;
aliPost.players[1].hand.push(transferredAli);
const aliBaseHash = canonicalStateHash(aliBase);
const aliTransferResult = reduceServerAction(
  {canonicalState:aliBase, canonicalHash:aliBaseHash},
  {type:'ACTION_RESULT', payload:{
    playerIndex:0,
    actionKind:'ALI_INDOMITABLE_TRANSFER',
    cardIid:String(pendingAli.iid),
    baseStateHash:aliBaseHash,
    postState:aliPost,
    stateHash:canonicalStateHash(aliPost)
  }},
  {requireBaseHash:true}
);
assert.strictEqual(aliTransferResult.ok, true, 'the source player must be able to publish Ali transfer even while off turn');

const handLimitBase = JSON.parse(JSON.stringify(aliPost));
for(let i = 0; i < 6; i += 1){
  handLimitBase.players[1].hand.push({id:'ordinary-' + i, iid:'ordinary-' + i, owner:1, type:'Supporter', name:'Ordinary ' + i});
}
handLimitBase.players[1].discard = [];
handLimitBase.currentPlayer = 0;
const handLimitPost = JSON.parse(JSON.stringify(handLimitBase));
const discarded = handLimitPost.players[1].hand.pop();
handLimitPost.players[1].discard.push(discarded);
const handLimitBaseHash = canonicalStateHash(handLimitBase);
const handLimitResult = reduceServerAction(
  {canonicalState:handLimitBase, canonicalHash:handLimitBaseHash},
  {type:'ACTION_RESULT', payload:{
    playerIndex:1,
    actionKind:'HAND_LIMIT_DISCARD',
    discardedIids:[String(discarded.iid)],
    baseStateHash:handLimitBaseHash,
    postState:handLimitPost,
    stateHash:canonicalStateHash(handLimitPost)
  }},
  {requireBaseHash:true}
);
assert.strictEqual(handLimitResult.ok, true, 'the Ali recipient must be able to discard down to six while off turn');

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
    board:[[[null]], [[null]], [[null]]],
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
assert.strictEqual(scheduledTimers.length, 1, 'searched BH3 must keep waiting while no card has been set');
assert.strictEqual(scheduledTimers[0].delay, 100, 'the pre-match retry must not consume Ali\'s five-second reveal time');
sandbox.G.board[0][0][0] = {id:'01', iid:'first-set-card', owner:0};
scheduledTimers.shift().callback();
assert.strictEqual(scheduledTimers.length, 1, 'searched BH3 must schedule one transfer after the first set');
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
