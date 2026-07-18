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
assert.strictEqual(catalog.byId.get('87').effect, 'Starting your next turn, if you would consolidate at least once and not set a Supporter, all of your consolidations that turn gain 4 Fate permanently at the end of the turn. This effect ends when you set a Supporter.');
assert.strictEqual(catalog.byId.get('85').effect, 'This card gains 1 Fate for the total amount of times your opponent set a Supporter this game.');
assert.strictEqual(catalog.byId.get('89').fate, 7);
assert.strictEqual(catalog.byId.get('89').effect, 'As long as you activate less than 10 Supporter effects this game, this card gains 7 Fate.');
assert.strictEqual(catalog.byId.get('90').effect, 'Declare any affiliation. Two random cards with that affiliation are added to your hand from the deck, and they both gain 3 Fate.');
assert.strictEqual(catalog.byId.get('92').effect, 'While this card is on the field, any other Supporter you set in this zone has its effect negated or suppressed, but gains 1 Reinforcement.');
assert.strictEqual(catalog.byId.get('96').effect, 'Return four random cards in your discard pile to your deck.');
assert.strictEqual(catalog.byId.get('97').effect, "Your opponent's next two consolidations cost 1 extra Reinforcement.");
assert.strictEqual(catalog.byId.get('98').effect, 'This card will always appear in your opening hand as an additional card.');
assert.match(catalog.byId.get('99').effect, /Supporters are classified as Characters/);
assert.match(catalog.byId.get('100').effect, /gains 2 Fate[\s\S]*Snow on the Carpathians/);

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

const core = read('src/scripts/05-gameplay-core.js');
const helpers = read('src/scripts/00-structural-helpers.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const rooms = read('src/scripts/18-online-rooms.js');
const renderSnapshot = read('src/scripts/render-v2/01-render-snapshot.js');
const matchRenderer = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const lastCss = read('src/styles/zz-codex-last.css');
const data = read('src/scripts/01-data-and-state.js');
const shovelerThumb = path.join(root, 'optimized/card-thumbs/96.jpg');
const kvetkaThumb = path.join(root, 'optimized/card-thumbs/87.jpg');
const wojciechFishermanThumb = path.join(root, 'optimized/card-thumbs/90.jpg');
assert(fs.existsSync(shovelerThumb), 'Wodny Potok Snow Shoveler optimized thumbnail must exist');
assert(fs.statSync(shovelerThumb).mtimeMs >= fs.statSync(path.join(root, '96.png')).mtimeMs, 'Wodny Potok Snow Shoveler thumbnail must be regenerated from the current card art');
assert(fs.existsSync(kvetkaThumb), 'Kvetka Ukulele optimized thumbnail must exist');
assert(fs.statSync(kvetkaThumb).mtimeMs >= fs.statSync(path.join(root, '87.png')).mtimeMs, 'Kvetka Ukulele thumbnail must be regenerated from the current card art');
assert(fs.existsSync(wojciechFishermanThumb), 'Wojciech Fisherman optimized thumbnail must exist');
assert(fs.statSync(wojciechFishermanThumb).mtimeMs >= fs.statSync(path.join(root, '90.png')).mtimeMs, 'Wojciech Fisherman thumbnail must be regenerated from the current card art');
assert.match(data, /const TEMP_DISABLED_CARD_IDS = new Set\(\);/, 'the temporary card hold must be empty');
assert.match(core, /WINDOWED_WHEN_SET_EFFECT_IDS[\s\S]*'96','97'/, 'Snow Shoveler and Visegrad Politician must expose deferred Activate Effect actions');
assert.match(core, /case '96'[\s\S]*showSnowShovelerReturnedCards/, 'Snow Shoveler must show its random return result window');
assert.match(core, /function markSnowballFightHit[\s\S]*_snowballFightHitAt = Date\.now\(\)[\s\S]*markSnowballFightHit\(tgt\)/, 'Snowball Fight must stamp the affected target');
assert.match(rendering, /Shovel - Cards Returned to the Deck|showCanvasCardGalleryModal/, 'random returned cards must use the standard card gallery window');
assert.match(rendering, /SNOWBALL_FIGHT_STATUS_MS = 3000[\s\S]*isSnowballFightHitActive[\s\S]*fate-snowball-hit/, 'the snowflake status must expire after three seconds');
assert.match(renderSnapshot, /snowballHit[\s\S]*isSnowballFightHitActive/, 'render-v2 snapshots must carry the transient snowball marker');
assert.match(matchRenderer, /drawSnowballFightCardOverlay[\s\S]*drawSnowballFightIcon/, 'the canvas renderer must draw the snowflake overlay');
assert.match(lastCss, /fate-snowball-hit[\s\S]*fate-snowball-status-flash/, 'the DOM renderer must use the matching snowflake overlay size and animation');
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
assert.match(core, /function resolveBalladEndOfTurn[\s\S]*card\.currentFate = before \+ 4[\s\S]*gain 4 Fate/, 'Kvetka ballad must grant 4 Fate');
assert.match(core, /case '90'[\s\S]*found\.currentFate = beforeFate \+ 3[\s\S]*recordHandCardEffectModifier[\s\S]*Catch of the Day/, 'Wojciech Fisherman must give caught cards +3 Fate and record it');
assert.match(ai, /case '90'[\s\S]*found\.currentFate = beforeFate \+ 3[\s\S]*recordHandCardEffectModifier[\s\S]*Catch of the Day/, 'AI Wojciech Fisherman must give caught cards +3 Fate');
assert.match(rendering, /card\.id === '15'[\s\S]*value = 'Bonus Active'/, 'Zsofia card detail tracker must say Bonus Active');
assert.match(rendering, /card\.id === '85'[\s\S]*sub = '\+1 Fate Each'/, 'Felicyta Specters card detail tracker must say +1 Fate Each');
assert.match(rendering, /card\.id === '97'[\s\S]*Administrative Bloat[\s\S]*card\.id === '99'[\s\S]*The Blame Game/, 'Visegrad Politician and Rozsi and Zsofia Youth must expose detail status banners');
assert.match(rendering, /G\._landscapeChangeLocks[\s\S]*A Snowy Village[\s\S]*Wodny Potok Villager/, 'Wodny Potok Villager must expose an active topbar status banner while landscape changes are locked');
assert.match(helpers, /function isCardSupporterForRules[\s\S]*isBlameGameActive/, 'Blame Game must have a shared inverse Supporter classifier');
assert.match(ai, /case '96'[\s\S]*case '97'/, 'AI must implement cards 96 and 97');
assert.match(rooms, /_administrativeBloatEffects/, 'Administrative Bloat must synchronize in multiplayer state');
assert.match(rooms, /_serverRngCounter/, 'deterministic random effect state must synchronize in multiplayer');

console.log('fate expanded worlds cards 80-100 smoke passed');
