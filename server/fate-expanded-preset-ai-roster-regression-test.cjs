'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {extractArrayLiteral} = require('./fate-deck-catalog.js');

const root = path.resolve(__dirname, '..');
const setup = fs.readFileSync(path.join(root, 'src/scripts/04-game-setup.js'), 'utf8');
const aiSource = fs.readFileSync(path.join(root, 'src/scripts/07-ai.js'), 'utf8');
const dialogue = fs.readFileSync(path.join(root, 'src/scripts/12-ai-dialogue.js'), 'utf8');
const challenger = fs.readFileSync(path.join(root, 'src/scripts/09-challenger-mode.js'), 'utf8');
const finalCss = fs.readFileSync(path.join(root, 'src/styles/zz-codex-last.css'), 'utf8');
const opponents = vm.runInNewContext(`(${extractArrayLiteral(setup, 'AI_OPPONENTS')})`, Object.create(null), {timeout:1000});
const starterDecks = vm.runInNewContext(`(${extractArrayLiteral(challenger, 'STARTER_DECKS')})`, Object.create(null), {timeout:1000});
const advancedDecks = vm.runInNewContext(`(${extractArrayLiteral(challenger, 'AI_ONLY_RANDOM_DECKS')})`, Object.create(null), {timeout:1000});

const expected = [
  ['Housekeeper Wojciech', 'Footman', 650, 'starter_maelstrom', 'wojciech', 'pfp/pfp81.png'],
  ['Monarch Louis LeJuene', 'Footman', 775, 'starter_assault', 'louis', 'pfp/pfp112.png'],
  ['Great Oak Teacher Mr. Secules', 'Captain-Officer', 825, 'ai_university_counterbattery', 'secules', 'pfp/pfp67.png'],
  ['Poli Sci Major Lydia', 'Captain-Officer', 925, 'ai_hand_quarantine', 'lydia', 'pfp/pfp56.png'],
  ['Twin Monarch Zsofia Szocs', 'Lieutenant at Arms', 1125, 'ai_hungarian_war_dance', 'zsofia', 'pfp/pfp15.png'],
  ['Swordsmaster Li Hua', 'Lieutenant at Arms', 1175, 'ai_eventide_blockade', 'lihua', 'pfp/pfp116.png'],
  ['General Hseih Ling', 'Sergeant of the Guard', 1275, 'ai_high_t_draw_mill', 'hseih', 'pfp/pfp115.png'],
  ['Bookworm Kazumi', 'Sergeant of the Guard', 1375, 'ai_hand_quarantine', 'kazumi', 'pfp/pfp27.png'],
  ['Master of Disguises Taylor', 'Commander-General', 1425, 'ai_snowball_fight_club', 'taylor', 'pfp/pfp105.png'],
  ['ALPINE Scientist Isaac Perez', 'Commander-General', 1525, 'ai_alpine_furnace', 'isaac', 'pfp/pfp22.png'],
  ['Comintern Leader Henry Dong', 'High Marshall', 1675, 'ai_reinforcement_exchange', 'henry', 'pfp/pfp21.png'],
  ['King Alexander the Magnificient', 'High Marshall', 1725, 'ai_hellenic_heartbreaker', 'alexander', 'pfp/pfp35.png']
];

const decks = new Map([...starterDecks, ...advancedDecks].map(deck=>[deck.id, deck]));
for(const [name, rank, elo, deckRef,, portrait] of expected){
  const ai = opponents.find(entry=>entry.name === name);
  assert(ai, `${name} must be in the shared preset roster`);
  assert.equal(ai.rank, rank, `${name} must be assigned to ${rank}`);
  assert.equal(ai.elo, elo, `${name} must retain its seeded ELO`);
  assert.equal(ai.deckRef, deckRef, `${name} must use its personality deck`);
  const deck = decks.get(deckRef);
  assert(deck, `${name} must reference a defined shared deck`);
  assert.equal(deck.ids.length, 40, `${name}'s shared deck must contain 40 cards`);
  assert.equal(ai.img, portrait, `${name} must use the matching profile-picture asset`);
  assert(fs.existsSync(path.join(root, ai.img)), `${name} must have an existing portrait asset`);
}

for(const rank of ['Footman','Captain-Officer','Lieutenant at Arms','Sergeant of the Guard','Commander-General','High Marshall']){
  assert.equal(opponents.filter(ai=>ai.rank === rank).length, 5, `${rank} must expose five preset opponents`);
}
for(const ai of opponents){
  assert(decks.has(ai.deckRef), `${ai.name} must use a deck from the current shared deck pool`);
}
assert.equal(opponents.filter(ai=>/Anne Stone/.test(ai.name)).length, 1, 'Anne Stone must not be duplicated');
const achille = opponents.find(ai=>/Achille Laurent/.test(ai.name));
const maja = opponents.find(ai=>/Maja Kaminska/.test(ai.name));
for(const name of ['Comintern Leader Henry Dong','King Alexander the Magnificient']){
  const ai = opponents.find(entry=>entry.name === name);
  assert(ai.elo < achille.elo && ai.elo < maja.elo, `${name} must remain below Achille and Maja`);
}

const dialogueStart = dialogue.indexOf('function buildPresetCharacterDialogue');
const dialogueEnd = dialogue.indexOf('function getPresetAIDialogueKey');
const dialogueContext = Object.create(null);
vm.createContext(dialogueContext);
vm.runInContext(dialogue.slice(dialogueStart, dialogueEnd) + ';globalThis.dialogueBank=AI_PRESET_DIALOGUE_BANK;', dialogueContext, {timeout:1000});
for(const [name,,,, key] of expected){
  assert.equal(dialogueContext.dialogueBank[key]?.length, 50, `${name} must have exactly 50 dialogue lines`);
}
for(const [key, lines] of Object.entries(dialogueContext.dialogueBank)){
  assert.equal(lines.length, 50, `${key} must have exactly 50 dialogue lines`);
}

assert.match(dialogue, /includes\('zsofia'\)\) return 'zsofia'/, 'Zsofia must resolve to her dialogue personality');
assert.match(setup, /AI_OPPONENTS\.forEach\(ai =>/, 'leaderboard and shared roster consumers must retain the common opponent collection');
assert.match(aiSource, /class="ai-opponent-list"/, 'the opponent picker must use its fitted list layout');
assert.doesNotMatch(aiSource, /max-height:68vh;overflow-y:auto;padding-right:\.3rem/, 'the opponent picker must not retain its old scrolling list');
assert.match(finalCss, /grid-template-rows:repeat\(5,minmax\(0,1fr\)\)/, 'all five opponents must share the available page height');
assert.match(finalCss, /#difficulty-panel\{[\s\S]{0,300}overflow:hidden!important/, 'the opponent window must not scroll');

console.log('Expanded preset AI roster, ranks, portraits, decks, titles, and 50-line dialogue parity passed.');
