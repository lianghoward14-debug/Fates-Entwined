import assert from 'node:assert/strict';
import fs from 'node:fs';

const gameplay = fs.readFileSync(new URL('../src/scripts/05-gameplay-core.js', import.meta.url), 'utf8');
const rendering = fs.readFileSync(new URL('../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
const online = fs.readFileSync(new URL('../src/scripts/18-online-rooms.js', import.meta.url), 'utf8');

assert.match(
  rendering,
  /function beginLocalSetFromDeckCard[\s\S]{0,4200}pickCardsVisual\(matches,[\s\S]{0,500}title:'Set an Eligible Card From Deck'[\s\S]{0,500}confirmLabel:'Choose Destination'/,
  'single-player direct deck sets must use the same visual card-choice contract as current multiplayer'
);
assert.match(
  online,
  /function phase7BeginSetFromDeck[\s\S]{0,5200}pickCardsVisual\(cards,[\s\S]{0,500}title:'Set an Eligible Card From Deck'[\s\S]{0,500}confirmLabel:'Choose Destination'/,
  'current multiplayer deck-set picker contract must remain present'
);
assert.match(rendering, /window\.setPolishFromDeck = function\(\)[\s\S]{0,800}beginLocalSetFromDeckCard\('28'/);
assert.match(rendering, /window\.setMajaFromDeck = function\(\)[\s\S]{0,300}beginLocalSetFromDeckCard\('07'/);
assert.match(
  rendering,
  /beginImmediateFreePlacement\(cp, card,[\s\S]{0,420}destinationUi:'highlighted-board'/,
  'direct deck sets must match multiplayer highlighted-board destination selection after the card picker'
);

assert.match(
  gameplay,
  /function openImmediateFreePlacementDestinationPicker[\s\S]{0,2600}showBoardTargetPicker\([\s\S]{0,900}visibleZones:\[0,1,2\][\s\S]{0,500}allowSquareTargets:true[\s\S]{0,1800}clickCell\(/,
  'single-player effect-created free sets must use the multiplayer-style board-destination window'
);
assert.match(
  gameplay,
  /function beginImmediateFreePlacement[\s\S]{0,2400}info\.destinationUi !== 'highlighted-board'[\s\S]{0,500}openImmediateFreePlacementDestinationPicker/,
  'the shared single-player free-placement path must default to the destination picker'
);
assert.match(gameplay, /case '08':[\s\S]{0,700}beginImmediateFreePlacement\(cp, found,[\s\S]{0,300}key:'lina-free-set'/);

assert.match(
  rendering,
  /function showZonePicker[\s\S]{0,1200}showBoardTargetPicker\(/,
  'ordinary single-player board targets must continue using the shared production board picker'
);
assert.match(rendering, /function showZonePicker[\s\S]{0,1500}title: getMultiplayerBoardPromptTitle\(sourceCard\)[\s\S]{0,500}visibleZones:\[0,1,2\][\s\S]{0,300}showZoneTitles:true/);
assert.match(gameplay, /case '50':[\s\S]{0,600}showZonePickerVisual\([\s\S]{0,400}title:'Artillery Distance'/);
assert.match(online, /function phase7EffectPromptTitle[\s\S]{0,300}window\.getMultiplayerBoardPromptTitle/);
assert.match(online, /phase7OpenCardPicker\([\s\S]{0,500}window\.getMultiplayerCardSelectionTitle\(source\)/);
assert.match(rendering, /function showAffiliationPickerVisual\(/);
assert.match(rendering, /function showZonePickerVisual\(/);
assert.match(rendering, /function showLandscapeChoiceModal\(/);

console.log('single-player/current-multiplayer UI parity smoke passed');
