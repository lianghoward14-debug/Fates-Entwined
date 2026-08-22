import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const gameplay = fs.readFileSync(new URL('../src/scripts/05-gameplay-core.js', import.meta.url), 'utf8');
const rendering = fs.readFileSync(new URL('../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
const online = fs.readFileSync(new URL('../src/scripts/18-online-rooms.js', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const signatureEnd = source.indexOf(') {', start);
  assert.notEqual(signatureEnd, -1, `${name} must use a conventional function signature`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for(let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if(quote) {
      if(escaped) escaped = false;
      else if(char === '\\') escaped = true;
      else if(char === quote) quote = '';
      continue;
    }
    if(char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if(char === '{') depth += 1;
    if(char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`${name} must have a complete body`);
}

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
  /function beginLocalSetFromDeckCard[\s\S]{0,1400}beginImmediateFreePlacement\(cp, card, config\.placementMessage, Object\.assign\(\{\}, config\.effectInfo, \{[\s\S]{0,100}destinationUi:'highlighted-board'/,
  'single-player direct deck sets must continue from the card picker into live-board destination highlighting'
);
assert.match(online, /function phase7BeginSetFromDeck[\s\S]{0,5200}phase7BeginDestinationChoice\(/,
  'multiplayer direct deck sets must continue from card choice into its live-board destination flow');
assert.match(online, /function phase7BeginDestinationChoice[\s\S]{0,1500}closeModal[\s\S]{0,900}phase7HighlightDestinations\(choices\)/,
  'the multiplayer destination flow must close the picker and highlight legal live-board squares');

assert.match(
  gameplay,
  /function openImmediateFreePlacementDestinationPicker[\s\S]{0,2600}showBoardTargetPicker\([\s\S]{0,900}visibleZones:\[0,1,2\][\s\S]{0,500}allowSquareTargets:true[\s\S]{0,1800}clickCell\(/,
  'single-player effect-created free sets must use the multiplayer-style board-destination window'
);
assert.match(
  gameplay,
  /function beginImmediateFreePlacement[\s\S]{0,2400}info\.destinationUi !== 'highlighted-board'[\s\S]{0,240}openImmediateFreePlacementDestinationPicker[\s\S]{0,300}highlightValidCells\(card, 'free-placement-choice'\)/,
  'single-player must reserve live-board highlighting for the direct-deck-set parity route'
);
assert.match(gameplay, /case '08':[\s\S]{0,700}beginImmediateFreePlacement\(cp, found,[\s\S]{0,300}key:'lina-free-set'/);

// Behavioral guard: the direct-deck-set parity option must close the modal and
// arm live-board destinations, exactly like phase7BeginDestinationChoice.
const deckSetCard = {id:'28', iid:'single-player-deck-set', name:'2nd Polish-Lithuanian Army', owner:0};
const pickerContext = {
  G:{currentPlayer:0, players:[{hand:[deckSetCard]}, {hand:[]}], _onlineRoomCode:''},
  renderGame(){},
  clearPlaceHighlights(){},
  getValidPlacementOptionsForCard(){ return [{z:0,r:2,c:0}, {z:2,r:2,c:1}]; },
  setHint(){},
  toast(){},
  pickerOptions:null,
  pickerConfirm:null,
  clickedDestination:null,
  directBoardPlacementCalls:0
};
pickerContext.showBoardTargetPicker = function(options, confirm){ pickerContext.pickerOptions = options; pickerContext.pickerConfirm = confirm; };
pickerContext.clickCell = function(z, r, c){ pickerContext.clickedDestination = {z,r,c}; };
pickerContext.highlightValidCells = function(){ pickerContext.directBoardPlacementCalls += 1; return true; };
vm.runInNewContext([
  functionSource(gameplay, 'resolveImmediateFreePlacementHandCard'),
  functionSource(gameplay, 'openImmediateFreePlacementDestinationPicker'),
  functionSource(gameplay, 'beginImmediateFreePlacement'),
  `beginImmediateFreePlacement(0, G.players[0].hand[0], 'Choose a destination.', {name:'2nd Polish-Lithuanian Army', destinationUi:'highlighted-board'});`
].join('\n'), pickerContext);
assert.equal(pickerContext.pickerOptions, null,
  'single-player Polish/Maja must not open a second destination modal');
assert.equal(pickerContext.directBoardPlacementCalls, 1,
  'single-player Polish/Maja must highlight legal destinations on the live board');
assert.equal(pickerContext.G.placing, true);

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
