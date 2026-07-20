#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {getCardCatalog} = require('./fate-card-catalog');
const {buildInitialAuthorityState} = require('./fate-authority-bootstrap');
const {canonicalStateHash, validateProposedTransition} = require('./fate-authority-reducer');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const catalog = getCardCatalog();

const expanded = [];
for(let id = 80; id <= 100; id += 1){
  const card = catalog.byId.get(String(id));
  assert(card, `card ${id} must exist in the catalog`);
  assert.strictEqual(card.img, `${id}.png`, `card ${id} must use the matching card image`);
  assert.strictEqual(card.temporarilyDisabled, undefined, `card ${id} must be released into normal card pools`);
  assert.strictEqual(card.retired, undefined, `card ${id} must not be retired`);
  expanded.push(card);
}
assert.strictEqual(expanded.length, 21);
assert.strictEqual(catalog.byId.get('84').name, 'Květka Svoboda');
assert.strictEqual(catalog.byId.get('87').fate, 3, 'Kvetka Ukulele must match the new 3-Fate card art');
assert.strictEqual(catalog.byId.get('87').effect, 'Starting now, when you would consolidate a card, it gains 3 Fate, and this bonus continues until you set a Supporter.');
assert.strictEqual(catalog.byId.get('85').effect, 'This card gains 1 Fate for the total amount of times your opponent set a Supporter this game.');
assert.strictEqual(catalog.byId.get('89').fate, 7);
assert.strictEqual(catalog.byId.get('89').effect, 'As long as you activate less than 10 Supporter effects this game, this card gains 7 Fate.');
assert.strictEqual(catalog.byId.get('90').effect, 'Declare any affiliation. Two random cards with that affiliation are added to your hand from the deck, and they both gain 3 Fate.');
assert.strictEqual(catalog.byId.get('92').effect, 'While this card is on the field, any Supporter you set in this zone has their effect negated or suppressed, but gains 1 Reinforcement');
assert.strictEqual(catalog.byId.get('96').effect, 'Return four random cards in your discard pile to your deck.');
assert.strictEqual(catalog.byId.get('97').effect, "Your opponent's next two consolidations cost 1 extra Reinforcement.");
assert.strictEqual(catalog.byId.get('98').effect, 'This card will always appear in your opening hand as an additional card.');
assert.match(catalog.byId.get('99').effect, /Supporters are classified as Characters/);
assert.match(catalog.byId.get('100').effect, /gains 2 Fate[\s\S]*Snow on the Carpathians/);
assert.match(catalog.byId.get('71').effect, /expires after the third eligible draw/i, 'All Eyes on the I-15 must state exactly when its reveal window expires');

const filler = catalog.cards.find(card=>card && !card.retired && !card.temporarilyDisabled && String(card.id) !== '98');
assert(filler, 'a filler card must exist');
const avalancheDeck = ['98'].concat(Array.from({length:39}, ()=>String(filler.id)));
const boot = buildInitialAuthorityState({
  catalog,
  seed:'expanded-worlds-avalanche-escape',
  mode:'freeplay',
  song:'board1',
  decks:{0:avalancheDeck, 1:avalancheDeck}
});
boot.state.players.forEach((player, index)=>{
  assert.strictEqual(player.hand.length, 7, `player ${index + 1} must receive six normal cards plus Avalanche Escape`);
  assert(player.hand.some(card=>String(card.id) === '98'), `player ${index + 1} opening hand must contain card 98`);
  assert.strictEqual(player.deck.length, 33);
});
assert.deepStrictEqual(boot.state._administrativeBloatEffects, []);
assert.strictEqual(boot.state._serverRngCounter, 0);

function validateLandscapeChange(preState, targetId){
  const postState = clone(preState);
  postState.landscapeId = targetId;
  postState.landscapeBgNum = Number(targetId.replace('igb',''));
  postState._landscapeState = Object.assign({}, postState._landscapeState, {id:targetId});
  const room = {canonicalState:preState, canonicalHash:canonicalStateHash(preState)};
  return validateProposedTransition(room, {type:'ACTION_RESULT', payload:{postState}}, {});
}

const alpineLocked = clone(boot.state);
alpineLocked.landscapeId = 'igb2';
alpineLocked.landscapeBgNum = 2;
alpineLocked.turn = 10;
alpineLocked._landscapeState = Object.assign({}, alpineLocked._landscapeState, {id:'igb2', resolvedTurns:{}});
assert.match(validateLandscapeChange(alpineLocked, 'igb1').reason || '', /final four turns/);

const alpineEarly = clone(alpineLocked);
alpineEarly.turn = 9;
assert.strictEqual(validateLandscapeChange(alpineEarly, 'igb1').ok, true, 'ALPINE may be changed away from before turn 10');

const qingdaoEntryLocked = clone(boot.state);
qingdaoEntryLocked.turn = 6;
assert.match(validateLandscapeChange(qingdaoEntryLocked, 'igb8').reason || '', /final four turns/);

const alpineResolved = clone(alpineLocked);
alpineResolved.turn = 14;
alpineResolved._landscapeState.resolvedTurns.igb2 = true;
assert.strictEqual(validateLandscapeChange(alpineResolved, 'igb1').ok, true, 'resolved ALPINE may be changed away from');

function validateCharacterTributeConsolidation(resultId, tributeType, blameGameActive){
  const preState = clone(boot.state);
  preState.currentPlayer = 0;
  preState.board.forEach(zone=>zone.forEach(row=>row.fill(null)));
  preState.players[0].discard = [];
  const resultCard = Object.assign({}, catalog.byId.get(String(resultId)), {iid:`result-${resultId}`, owner:0});
  const tribute = {id:tributeType === 'Supporter' ? '18' : '15', iid:`tribute-${resultId}-${tributeType}`, owner:0, type:tributeType, name:`${tributeType} Tribute`, fate:1, currentFate:1};
  preState.players[0].hand = [resultCard];
  preState.board[0][2][0] = tribute;
  preState._blameGameEffects = blameGameActive ? [{active:true, turnsLeft:3}, null] : [null, null];
  const postState = clone(preState);
  postState.players[0].hand = [];
  postState.players[0].discard = [tribute];
  postState.board[0][2][0] = resultCard;
  const baseStateHash = canonicalStateHash(preState);
  return validateProposedTransition({canonicalState:preState, canonicalHash:baseStateHash}, {
    type:'ACTION_RESULT',
    payload:{
      actionKind:'SELECT_CONSOLIDATION_TRIBUTE',
      playerIndex:0,
      selectedHand:{iid:resultCard.iid, id:resultCard.id, card:resultCard},
      chosenTributes:[{iid:tribute.iid, id:tribute.id, z:0, r:2, c:0, card:tribute}],
      consolidationPresentation:{target:{z:0,r:2,c:0}, resultCard, tributes:[{iid:tribute.iid, id:tribute.id, z:0, r:2, c:0, card:tribute}]},
      postState,
      baseStateHash,
      stateHash:canonicalStateHash(postState)
    }
  }, {});
}

assert.strictEqual(validateCharacterTributeConsolidation('99', 'Coordinator', false).ok, true, 'multiplayer authority must accept a printed Character tribute for card 99');
assert.match(validateCharacterTributeConsolidation('99', 'Supporter', false).reason || '', /only consume Character tributes/, 'multiplayer authority must reject a Supporter tribute for card 99 before Blame Game is active');
assert.strictEqual(validateCharacterTributeConsolidation('100', 'Supporter', true).ok, true, 'multiplayer authority must accept a Blame Game Supporter as a Character tribute for card 100');

function validateZoeBlockedConsolidation(blockedSquare, blockedPlayer = 0){
  const preState = clone(boot.state);
  preState.currentPlayer = 0;
  preState.board.forEach(zone=>zone.forEach(row=>row.fill(null)));
  preState.players[0].discard = [];
  const resultCard = Object.assign({}, catalog.byId.get('15'), {iid:'zoe-result', owner:0});
  const sourceTribute = {id:'18', iid:'zoe-source', owner:0, type:'Supporter', name:'Source Tribute', fate:1, currentFate:1};
  const targetTribute = {id:'18', iid:'zoe-target', owner:0, type:'Supporter', name:'Target Tribute', fate:1, currentFate:1};
  preState.players[0].hand = [resultCard];
  preState.board[0][2][0] = sourceTribute;
  preState.board[0][2][1] = targetTribute;
  preState.blockedCells = blockedSquare ? [{z:0,r:2,c:blockedSquare === 'source' ? 0 : 1,type:'zoe',owner:1-blockedPlayer,blockedPlayer}] : [];
  const postState = clone(preState);
  postState.players[0].hand = [];
  postState.players[0].discard = [sourceTribute, targetTribute];
  postState.board[0][2][0] = null;
  postState.board[0][2][1] = resultCard;
  const tributes = [
    {iid:sourceTribute.iid,id:sourceTribute.id,z:0,r:2,c:0,card:sourceTribute},
    {iid:targetTribute.iid,id:targetTribute.id,z:0,r:2,c:1,card:targetTribute}
  ];
  const baseStateHash = canonicalStateHash(preState);
  return validateProposedTransition({canonicalState:preState, canonicalHash:baseStateHash}, {
    type:'ACTION_RESULT',
    payload:{
      actionKind:'SELECT_CONSOLIDATION_TRIBUTE',
      playerIndex:0,
      selectedHand:{iid:resultCard.iid,id:resultCard.id,card:resultCard},
      chosenTributes:tributes,
      consolidationPresentation:{target:{z:0,r:2,c:1},resultCard,tributes},
      postState,
      baseStateHash,
      stateHash:canonicalStateHash(postState)
    }
  }, {});
}

assert.strictEqual(validateZoeBlockedConsolidation(null).ok, true, 'multiplayer authority must accept the same consolidation when Zoe has not blocked either square');
assert.match(validateZoeBlockedConsolidation('target').reason || '', /cannot be placed onto a square blocked by Zoe/, 'multiplayer authority must reject consolidating onto Zoe\'s square');
assert.match(validateZoeBlockedConsolidation('source').reason || '', /cannot use a card from a square blocked by Zoe/, 'multiplayer authority must reject consolidating from Zoe\'s square');
assert.strictEqual(validateZoeBlockedConsolidation('source', 1).ok, true, 'Zoe must restrict only her opponent, not her controller');

const core = read('src/scripts/05-gameplay-core.js');
const helpers = read('src/scripts/00-structural-helpers.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const rooms = read('src/scripts/18-online-rooms.js');
const css = read('src/styles/zz-codex-last.css');
const renderSnapshot = read('src/scripts/render-v2/01-render-snapshot.js');
const matchRenderer = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const handDragBridge = read('src/scripts/render-v2/09-hand-drag-bridge.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const lastCss = read('src/styles/zz-codex-last.css');
const data = read('src/scripts/01-data-and-state.js');
const authority = read('server/fate-authority-reducer.js');
const shovelerThumb = path.join(root, 'optimized/card-thumbs/96.jpg');
const kvetkaThumb = path.join(root, 'optimized/card-thumbs/87.jpg');
const wojciechFishermanThumb = path.join(root, 'optimized/card-thumbs/90.jpg');
const zoeThumb = path.join(root, 'optimized/card-thumbs/4.jpg');
assert(fs.existsSync(shovelerThumb), 'Wodny Potok Snow Shoveler optimized thumbnail must exist');
assert(fs.statSync(shovelerThumb).mtimeMs >= fs.statSync(path.join(root, '96.png')).mtimeMs, 'Wodny Potok Snow Shoveler thumbnail must be regenerated from the current card art');
assert(fs.existsSync(kvetkaThumb), 'Kvetka Ukulele optimized thumbnail must exist');
assert(fs.statSync(kvetkaThumb).mtimeMs >= fs.statSync(path.join(root, '87.png')).mtimeMs, 'Kvetka Ukulele thumbnail must be regenerated from the current card art');
assert(fs.existsSync(wojciechFishermanThumb), 'Wojciech Fisherman optimized thumbnail must exist');
assert(fs.statSync(wojciechFishermanThumb).mtimeMs >= fs.statSync(path.join(root, '90.png')).mtimeMs, 'Wojciech Fisherman thumbnail must be regenerated from the current card art');
assert(fs.existsSync(zoeThumb), 'Zoe optimized thumbnail must exist');
assert(fs.statSync(zoeThumb).mtimeMs >= fs.statSync(path.join(root, '4.png')).mtimeMs, 'Zoe thumbnail must be regenerated from the updated card art');
assert.match(data, /const TEMP_DISABLED_CARD_IDS = new Set\(\);/, 'the temporary card hold must be empty');
assert.match(data, /Select one square in this card\\'s zone; your opponent can no longer Consolidate on or from that square\./, 'Zoe catalog text must match the updated card art');
assert.match(helpers, /function isZoeBlockTargetAllowed[\s\S]*getBoardRowCapacity\(z, r\)/, 'Zoe must be allowed to select any valid square in her zone');
assert.match(core, /function isZoeConsolidationBlockedAt[\s\S]*function canUseAsConsolidationTribute\(card, owner, z, r, c\)[\s\S]*isZoeConsolidationBlockedAt\(z, r, c, owner\)/, 'single-player consolidation must reject tributes from Zoe-blocked squares');
assert.match(handDragBridge, /canUseAsConsolidationTribute\(cell, cp, z, r, c\)[\s\S]*canUseAsConsolidationTribute\(boardCard, G\.currentPlayer, Number\(hit\.z\), Number\(hit\.r\), Number\(hit\.c\)\)/, 'drag consolidation must reject Zoe-blocked source squares');
assert.match(ai, /case '04'[\s\S]*const occupant = G\.board\[z\]\[rr\]\[cc\][\s\S]*sourceIid:card\.iid/, 'AI Zoe must consider occupied squares and preserve the source identity');
assert.match(authority, /function authorityConsolidationBlockedAt[\s\S]*cannot be placed onto a square blocked by Zoe or Carolyn[\s\S]*cannot use a card from a square blocked by Zoe or Carolyn/, 'multiplayer authority must enforce both halves of Zoe\'s effect');
const windowedWhenSet = (core.match(/const WINDOWED_WHEN_SET_EFFECT_IDS = new Set\(\[([\s\S]*?)\]\);/) || [,''])[1];
assert.match(windowedWhenSet, /'26'/, 'UCPD must expose its deferred Activate Effect action instead of revealing automatically on placement');
assert.match(windowedWhenSet, /'96'/, 'Snow Shoveler must expose its deferred Activate Effect action');
assert.doesNotMatch(windowedWhenSet, /'97'/, 'Visegrad Politician must resolve automatically without an Activate Effect action');
assert.match(data, /id:'26'[\s\S]*effect:'Activate Effect: Reveal your opponent\\'s hand\.'/, 'UCPD catalog text must describe its manual activation');
assert.match(core, /case '97'[\s\S]*activateAdministrativeBloat\(cp, inst\)/, 'Visegrad Politician must automatically apply Administrative Bloat when set');
assert.match(core, /case '96'[\s\S]*showSnowShovelerReturnedCards/, 'Snow Shoveler must show its random return result window');
assert.match(core, /function markSnowballFightHit[\s\S]*_snowballFightHitAt = Date\.now\(\)[\s\S]*markSnowballFightHit\(tgt\)/, 'Snowball Fight must stamp the affected target');
assert.match(rendering, /Shovel - Cards Returned to the Deck|showCanvasCardGalleryModal/, 'random returned cards must use the standard card gallery window');
assert.match(rendering, /TEMPORARY_CARD_OVERLAY_MS = 3500[\s\S]*persistentForTurn:true[\s\S]*isSnowballFightHitActive/, 'Snowball Fight must use the general 3.5-second lifetime while Kvetka remains for its current turn');
assert.match(renderSnapshot, /snowballHit[\s\S]*isSnowballFightHitActive/, 'render-v2 snapshots must carry the transient snowball marker');
assert.match(matchRenderer, /drawSnowballFightCardOverlay[\s\S]*drawSnowballFightIcon/, 'the canvas renderer must draw the snowflake overlay');
assert.match(lastCss, /fate-snowball-hit[\s\S]*animation:fate-snowball-status-flash 3\.5s ease-out both/, 'the DOM renderer must use the matching 3.5-second snowflake animation');
assert.match(lastCss, /Final functional overlay exception[\s\S]*#board \.bc\.fate-snowball-hit::before[\s\S]*content:''!important;[\s\S]*display:block!important;/, 'performance cleanup must not hide the Snowball Fight snowflake');
assert.match(audio, /type==='snowballFight'[\s\S]*Powdery impact[\s\S]*crystal/, 'Snowball Fight must have a dedicated impact sound');
assert.match(ai, /markSnowballFightHit\(target\)/, 'AI Snowball Fight must show the same target presentation');
assert.match(core, /markSnowballFightHit\(tgt\)[\s\S]*playSfx\('snowballFight'\)/, 'copied Snowball Fight effects must use the same snowflake stamp and sound path');
assert.match(core, /function setCardFateValue\(card, newValue, sourceOwner\)[\s\S]*card\.currentFate = Math\.max\(0, Math\.min\(baseBefore, targetValue\)\);[\s\S]*function reduceStoredCardFateBy/, 'shared Fate setter must subtract only once');
assert.doesNotMatch(core, /function setCardFateValue\(card, newValue, sourceOwner\)[\s\S]*?_staticFatePenalty[\s\S]*?function reduceStoredCardFateBy/, 'shared Fate setter must not add a second static penalty');
assert.match(core, /function applyWodnyPotokLumberjackSuppression[\s\S]*inst\._lumberjackSuppressed = true;[\s\S]*delete inst\._pendingWhenSetEffect[\s\S]*inst\._lumberjackReinforcementGranted/, 'Lumberjack must immediately suppress same-zone Supporters and prevent repeated +1 Reinforcement stacking');
assert.match(ai, /case '31'[\s\S]*reduceStoredCardFateBy\(target, 3, cp\)/, 'AI Oathbound Noble Fighter must reduce 3 Fate once instead of using the old setter path');
assert.match(core, /const INITIAL_SET_INITIATOR_IDS = new Set\(\[[\s\S]*'99'[\s\S]*\]\);/, 'Rozsi and Zsofia Youth must trigger The Blame Game as an initial set effect');
assert.match(core, /case '99'[\s\S]*activateBlameGameEffect\(cp, card\)/, 'Rozsi and Zsofia Youth must activate The Blame Game');
assert.match(data, /Starting now, when you would consolidate a card, it gains 3 Fate, and this bonus continues until you set a Supporter\./, 'Kvetka Ukulele catalog text must match the new card art');
assert.doesNotMatch(data, /Starting your next turn[\s\S]{0,220}gain 4 Fate permanently/, 'Kvetka Ukulele must not retain the old delayed Ballad text');
assert.match(core, /function ensureBalladState[\s\S]*G\._balladEffects\[player\] = current \? \[current\] : \[\][\s\S]*function noteBalladConsolidation[\s\S]*card\.currentFate = before \+ 3[\s\S]*flashCardEffect\(card, 'kvetka_ballad'/, 'Kvetka Ballad must immediately grant 3 Fate for every active copy');
assert.doesNotMatch(core, /function resolveBalladEndOfTurn/, 'Kvetka Ballad must no longer wait for end of turn');
assert.match(core, /case '87'[\s\S]*effects\[cp\]\.push\([\s\S]*activatedTurn:G\.turn[\s\S]*consolidations gain 3 Fate until you set a Supporter/, 'Kvetka Ballad must become active immediately and stack by source');
assert.match(ai, /case '87'[\s\S]*ensureBalladState\(\)\[cp\]\.push\([\s\S]*activatedTurn:G\.turn/, 'AI Kvetka must use the same immediate stackable Ballad state');
assert.match(rendering, /G\._balladEffects\.forEach[\s\S]*statusInstanceKey: 'ballad:'[\s\S]*sourceIid: fx\.sourceIid|G\._balladEffects\.forEach[\s\S]*sourceIid: fx\.sourceIid[\s\S]*statusInstanceKey: 'ballad:'/, 'each active Kvetka Ballad must retain its own status banner identity');
assert.match(core, /case '90'[\s\S]*found\.currentFate = beforeFate \+ 3[\s\S]*recordHandCardEffectModifier[\s\S]*Catch of the Day/, 'Wojciech Fisherman must give caught cards +3 Fate and record it');
assert.match(ai, /case '90'[\s\S]*found\.currentFate = beforeFate \+ 3[\s\S]*recordHandCardEffectModifier[\s\S]*Catch of the Day/, 'AI Wojciech Fisherman must give caught cards +3 Fate');
assert.doesNotMatch(rendering, /if\(card\.id === '15'\)[\s\S]{0,500}value = 'Bonus Active'/, 'Zsofia card 15 must not expose a match tracker');
assert.match(rendering, /card\.id === '85'[\s\S]*sub = '\+1 Fate Each'/, 'Felicyta Specters card detail tracker must say +1 Fate Each');
assert.match(rendering, /Administrative Bloat'[\s\S]*cardEffect:remaining === 1[\s\S]*next consolidation costs 1 extra Reinforcement/, 'Administrative Bloat must expose a persistent, count-aware status banner with proper singular grammar');
assert.match(rendering, /administrative_bloat:[\s\S]*administrative-bloat-icon[\s\S]*getStatusEffectIcon\('administrative_bloat'\)/, 'Visegrad Politician must use its dedicated administrative status icon');
assert.match(rendering, /administrative_bloat:[\s\S]{0,700}M19 11h20[\s\S]{0,700}M25 29h17M25 36h17M25 43h12/, 'Administrative Bloat must use a clean inset sheet-of-paper icon with writing');
assert.match(rendering, /blame_game:[\s\S]*blame-game-icon[\s\S]*circle cx="32" cy="32" r="22"[\s\S]*getStatusEffectIcon\('blame_game'\)/, 'The Blame Game must use its dedicated target/scapegoat status icon');
assert.doesNotMatch(rendering, /card\.id === '97'[\s\S]{0,900}liveStatusTracker/, 'Visegrad Politician must not duplicate its status inside card details');
assert.match(rendering, /card\.id === '99'[\s\S]*The Blame Game/, 'The Blame Game must retain its card-detail status tracker');
assert.match(core, /tickWintertideForCurrentPlayer[\s\S]*_wintertideTriggerCount = \(Number\(card\._wintertideTriggerCount\) \|\| 0\) \+ 1/, 'Wintertide must record every Snow on the Carpathians trigger on the combined card instance');
assert.match(rendering, /card\.id === '100'[\s\S]*_wintertideTriggerCount[\s\S]*label = 'Snow on the Carpathians:'[\s\S]*Fate gained this match/, 'Felicyta and Kvetka must expose a colon-separated match tracker for Snow on the Carpathians triggers');
assert.match(rendering, /G\._landscapeChangeLocks[\s\S]*A Snowy Village[\s\S]*Wodny Potok Villager/, 'Wodny Potok Villager must expose an active topbar status banner while landscape changes are locked');
assert.match(rendering, /"99": "He's the one that started it first!\\nWell Zsofia shouldn't have been putting her feet on my sword!"/, 'Rozsi and Zsofia combined card must use the requested two-line subtitle');
assert.match(rendering, /"100": "Step aside! The Winter queen, Felicyta Janowicz, has arrived"/, 'Felicyta and Kvetka combined card must use the requested subtitle');
assert.match(helpers, /function isCardSupporterForRules[\s\S]*isBlameGameActive/, 'Blame Game must have a shared inverse Supporter classifier');
assert.match(handDragBridge, /cardUsesCharacterConsolidationTributes[\s\S]*isCardCharacterForRules[\s\S]*Drop on one of your '[\s\S]*'Characters'/, '99 and 100 drag consolidation must accept Character targets and explain invalid drops correctly');
assert.match(authority, /resultUsesCharacterTributes[\s\S]*authorityCardIsCharacterForRules/, 'multiplayer authority must validate 99 and 100 Character tributes with the same rules classification');
assert.match(core, /actualCost <= 0[\s\S]*if\(card\.type !== 'Supporter'\)[\s\S]*_freePlacementCinematicKind = card\._freePlacementCinematicKind \|\| 'costReducedFreeSet'/, 'free Rozsi and Zsofia combined-card placements must retain the Character consolidation cinematic marker');
assert.match(rooms, /freePlacementKind = String\(card\._freePlacementCinematicKind \|\| card\._serverFreePlacementConsumed/, 'multiplayer placement snapshots must preserve free Character consolidation cinematic markers');
assert.match(core, /shouldPlayCharacterSetCinematic = card\.type !== 'Supporter'[\s\S]*requestCharacterSetCinematic\(inst/, 'every normal Character set must request the shared cinematic, regardless of cost');
assert.match(ai, /characterSetCinematic = card\.type !== 'Supporter'[\s\S]*requestCharacterSetCinematic\(inst/, 'AI Character sets must use the same shared cinematic');
assert.match(rooms, /maybePlayOnlineNewCharacterCinematic[\s\S]*onlineCardType\(entry\.card\) !== 'Supporter'[\s\S]*requestCharacterSetCinematic/, 'multiplayer Character sets must use the same shared cinematic');
assert.match(ai, /case '37'[\s\S]{0,700}delete inst\.immuneFlag[\s\S]{0,700}chooseFrenchFusiliersPassive\(inst,\s*z,\s*\{autoPick:true\}\)/, 'French Fusilier AI must select a copied passive without restoring obsolete permanent protection');
assert.doesNotMatch(ai, /case '37': inst\.opponentEffectImmune = true/, 'French Fusilier must not receive the obsolete permanent protected state');
assert.match(core, /String\(card\.id \|\| ''\) === '37'[\s\S]*!card\._immuneByMakenna[\s\S]*delete card\.opponentEffectImmune/, 'continuous effects must clean stale French Fusilier protection while preserving real copied or Makenna protection');
assert.match(css, /#tp-status-left,[\s\S]*#tp-status-right[\s\S]*flex-wrap:nowrap!important[\s\S]*effect-pill-icon[\s\S]*width:30px!important/, 'status banners must remain one row with larger icons');
assert.match(rendering, /catalogCard[\s\S]*cinematicImage[\s\S]*triggerEntrance[\s\S]*setProperty\('opacity', '1', 'important'\)/, 'Character set cinematics must hydrate card art and force the visual overlay visible along with subtitles');
assert.match(css, /#opp-hand\.opp-hand-compact[\s\S]*--opp-hand-card-w:44px!important[\s\S]*--opp-hand-card-h:62px!important[\s\S]*grid-template-columns:repeat\(4,var\(--opp-hand-card-w\)\)!important[\s\S]*grid-template-rows:repeat\(3,var\(--opp-hand-card-h\)\)!important[\s\S]*row-gap:4px!important/, '9+ opponent cards must use a non-overlapping four-column proxy grid');
assert.match(ai, /case '96'[\s\S]*case '97'/, 'AI must implement cards 96 and 97');
assert.match(rooms, /_administrativeBloatEffects/, 'Administrative Bloat must synchronize in multiplayer state');
assert.match(rooms, /_serverRngCounter/, 'deterministic random effect state must synchronize in multiplayer');

console.log('fate expanded worlds cards 80-100 smoke passed');
