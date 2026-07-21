'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const data = read('src/scripts/01-data-and-state.js');
const helpers = read('src/scripts/00-structural-helpers.js');
const core = read('src/scripts/05-gameplay-core.js');
const renderer = read('src/scripts/06-rendering-and-helpers.js');
const handDrag = read('src/scripts/render-v2/09-hand-drag-bridge.js');
const vfxRecipes = read('src/scripts/render-v2/13-vfx-recipes.js');
const lastCss = read('src/styles/zz-codex-last.css');
const ai = read('src/scripts/07-ai.js');
const rooms = read('src/scripts/18-online-rooms.js');
const authority = read('server/fate-authority-reducer.js');
const bootstrap = read('server/fate-authority-bootstrap.js');
const {canonicalStateHash, validateProposedTransition, reduceServerAction} = require('./fate-authority-reducer');

assert.match(data, /id:'52'[\s\S]*When it leaves the field, discard one random card from your opponent\\'s hand\./, 'Vigilantes text must describe its departure trigger');
assert.match(data, /id:'61'[\s\S]*All copies of that card in their hand, deck, and on the field lose 6 Fate\./, 'Maria Song text must describe the copy-wide Fate loss');
assert.match(data, /id:'81',name:'Wojciech',ability:'Pierogi Barrage',type:'Initiator'[\s\S]*stay there for 3 of their turns\./, 'Wojciech must use the new Initiator rules text');
assert.match(data, /id:'86',name:'Boleslaw Kopewicz',ability:'A Bombastic Character',type:'Improvisor'[\s\S]*Whenever your opponent would search for a card, you can draw 1 card, and this card gains 3 Fate\./, 'Boleslaw must match the new Improvisor card art');
assert.match(data, /WOJCIECH_PIEROGI_COUNTER[\s\S]*id:'token1'[\s\S]*img:'token1\.png'/, 'the generated Pierogi Counter must use token1.png');

assert.match(helpers, /function isWojciechPierogiCounter[\s\S]*function isCardCharacterForRules\(card, owner\) \{[\s\S]*isWojciechPierogiCounter\(card\)\) return false;/, 'Pierogi Counters must not count as Characters');
assert.doesNotMatch(helpers, /if \(card\._markedForDeath\) return 0/, 'Vigilantes marks must not change Reinforcement');
assert.doesNotMatch(helpers, /card\.id === '86'[\s\S]{0,120}(?:return 3|value = 3|playerHasMoreCharactersThanSupportersInHand)/, 'Boleslaw must not retain the old free-set or three-Reinforcement rules');
assert.match(core, /function resolveVigilantesMarkedCardDeparture[\s\S]*deterministicOnlineRandomIndex[\s\S]*fatePushDiscard\(targetOwner, selected/, 'Vigilantes must resolve its random hand discard deterministically online');
assert.match(core, /case '52': \{[\s\S]*activateVigilantes\(inst, z, r, c, \{activationAlreadyCounted:true\}\)[\s\S]*async function activateVigilantes\(card, z, r, c, options\)[\s\S]*activationAlreadyCounted === true[\s\S]*beginManualSupporterEffectActivation/, 'Vigilantes must not count twice when Snow on the Carpathians has already counted its when-set activation');
assert.match(core, /function applyMariaSongPreciseShot[\s\S]*reduceStoredCardFateBy\(target, 6, sourceOwner\)[\s\S]*\['hand','deck'\][\s\S]*forEachBoardCard/, 'Maria Song must hit matching copies in all three locations');
assert.match(core, /function finishWojciechTurnState[\s\S]*_wojciechLastTurnPlacementCounts[\s\S]*_pierogiHandExpiresAfterTurn[\s\S]*_pierogiTurnsRemaining <= 0/, 'Wojciech must snapshot placements and expire hand and board counters');
assert.match(core, /function placeWojciechPierogiCounter[\s\S]*_pierogiTurnsRemaining = 3[\s\S]*G\.players\[creator\]\.hand =/, 'Pierogi placement must create a three-turn counter and remove it from hand');
assert.match(core, /function isWojciechPierogiPlacementSquare[\s\S]*r === 1\) return true[\s\S]*isPlayableSafeSquare\(z, r, c, host\)[\s\S]*getSquareRowOwner\(z, r\) === host/, 'client Pierogi placement must allow contested and exact opponent-owned generated squares');
assert.match(core, /function getValidPlacementOptionsForCard[\s\S]*if\(isPierogiCounter\)[\s\S]*isWojciechPierogiPlacementSquare\(z, r, c, cp\)/, 'Pierogi highlights and AI options must use the shared per-square placement rule');
assert.match(core, /INITIAL_SET_INITIATOR_IDS = new Set\([^\n]*'81'/, 'Wojciech must expose an initial Initiator activation');
assert.match(core, /function getReadyBoleslawSearchReactions[\s\S]*async function resolveBoleslawOpponentSearch[\s\S]*checkReactions\('targeting_effect'[\s\S]*sourceOwner:reaction\.owner[\s\S]*await drawCard\(reaction\.owner, 1[\s\S]*live\.currentFate = before \+ 3/, 'single-player Boleslaw must trigger automatically while still opening Lydia reaction timing');
assert.doesNotMatch(core, /chooseOptionalImprovisorActivation\(reaction\.owner, live[\s\S]{0,300}boleslaw/, 'Boleslaw must not show its own optional activation prompt');
assert.doesNotMatch(core, /t\.card\.id==='86'[\s\S]{0,80}bonusFate \+= 4|cell\.id==='86'/, 'core consolidation must not retain Boleslaw tribute bonuses');

assert.match(ai, /hand\.filter\(function\(card\)\{ return typeof isWojciechPierogiCounter[\s\S]*pierogiCounter:true/, 'AI must generate Pierogi placement moves');
assert.match(ai, /case '61'[\s\S]*applyMariaSongPreciseShot/, 'AI Maria Song must use the shared reworked effect');
assert.match(ai, /case '81'[\s\S]*grantWojciechPierogiCounters/, 'AI Wojciech must generate counters');
assert.match(ai, /case '06'[\s\S]*await resolveBoleslawOpponentSearch\(cp, \{sourceCardId:'06'\}\)[\s\S]*case '08'[\s\S]*await resolveBoleslawOpponentSearch\(cp, \{sourceCardId:'08'\}\)[\s\S]*case '13'[\s\S]*await resolveBoleslawOpponentSearch\(cp, \{sourceCardId:'13'\}\)/, 'AI searches must resolve the same automatic Boleslaw trigger');
assert.match(ai, /card\.id==='52'[\s\S]*markCardForVigilantes/, 'AI Vigilantes must use the shared mark behavior');

assert.match(rooms, /_wojciechTurnPlacementCounts:cloneOnlinePlain[\s\S]*_wojciechLastTurnPlacementCounts:cloneOnlinePlain/, 'multiplayer snapshots must carry Wojciech placement history');
assert.match(rooms, /function onlineCardIsCharacter[\s\S]*type !== 'Counter'/, 'multiplayer presentation must not treat Counters as Characters');
assert.match(authority, /function authorityPierogiPlacementSquareAllowed[\s\S]*extraRowOwners[\s\S]*markSafeSquares[\s\S]*String\(selected\.id \|\| target\.id \|\| ''\) === 'token1'[\s\S]*_pierogiTurnsRemaining\) !== 3/, 'authority must validate contested and opponent-owned Pierogi placement, including generated squares');
assert.match(authority, /function resolveAuthorityBoleslawSearch[\s\S]*opponentSearch !== true[\s\S]*applyBoleslawSearchAuthorityReaction\(resolvedState[\s\S]*kind:'lydia'[\s\S]*actionType:'boleslaw_trigger'[\s\S]*function applyBoleslawSearchAuthorityReaction[\s\S]*currentFate = before \+ 3[\s\S]*player\.deck\.shift\(\)/, 'multiplayer authority must trigger Boleslaw automatically and arm only Lydia against it');
assert.match(rooms, /opts && opts\.opponentSearch === true[\s\S]*pickPayload\.opponentSearch = true[\s\S]*searchSourceCardId/, 'multiplayer card searches must identify themselves to the authority');
assert.doesNotMatch(rooms, /data-server-reaction-boleslaw|Activate A Bombastic Character|finish\('activate'/, 'multiplayer must not render or submit a Boleslaw activation prompt');
assert.match(bootstrap, /_wojciechTurnPlacementCounts:\[0, 0\][\s\S]*_wojciechLastTurnPlacementCounts:\[0, 0\]/, 'authority bootstrap must initialize Wojciech history');
assert.doesNotMatch(renderer, /wojciechStatusesByOwner|statusInstanceKey:\s*'wojciech:'/, 'the old Wojciech discount status must be removed');
assert.match(renderer, /card\.id \|\| ''\) === '81'[\s\S]*_wojciechLastTurnPlacementCounts[\s\S]*Opponent Sets \/ Consolidations/, 'Wojciech information windows must show the opponent previous-turn placement count');
assert.match(renderer, /function refreshWojciechInformationBanners[\s\S]*_wojciechLastTurnPlacementCounts[\s\S]*cd-wojciech-turn-tracker/, 'an open Wojciech information window must refresh with turn-state updates');
assert.match(renderer, /const isDirectSetCard =[\s\S]*isWojciechPierogiCounter[\s\S]*place\.onclick=\(\)=>placeSelected/, 'card details must offer Pierogi Counters a direct Place action');
assert.match(renderer, /function shouldShowProtectionStatusIcon\(card\)[\s\S]*isWojciechPierogiCounter\(card\)\) return false/, 'Pierogi Counters must not draw the shield/protection status overlay');
assert.match(renderer, /pierogi_timer:[\s\S]*pierogi_fold:[\s\S]*pierogi_clock:[\s\S]*pierogi_hourglass:[\s\S]*pierogi_trio:/, 'five production-size Pierogi status icon designs must remain available');
assert.match(renderer, /function getTopBarEffectsSourceSignature[\s\S]*c\.id === 'token1'[\s\S]*c\._pierogiTurnsRemaining/, 'Pierogi lifetime changes must invalidate the status bar render signature');
assert.match(renderer, /pierogiLifetimeGroups[\s\S]*_pierogiCreator[\s\S]*pierogiLifetimeGroups\[creator\][\s\S]*label:'Pierogi Barrage'[\s\S]*other player\\'s field[\s\S]*owner:creator[\s\S]*statusInstanceKey:'pierogi:' \+ creator/, 'Pierogi Barrage must appear on its creator side with perspective-neutral count and lifetime hover details');
assert.match(renderer, /cardShowcaseWidth[\s\S]*'81' \? 'min\(28vw,300px\)' : 'min\(30vw,320px\)'[\s\S]*cardShowcaseHeight[\s\S]*'81' \? 'min\(49vh,435px\)' : 'min\(52vh,460px\)'/, 'character/consolidation cinematics must use a normalized card showcase size with a tighter Wojciech cap');
assert.match(renderer, /cc-card-id-[\s\S]{0,160}String\(card\.id \|\| ''\)/, 'character/consolidation cinematics must expose a card-id class for final CSS sizing overrides');
assert.match(lastCss, /cc-card-wrap-v2\.cc-card-id-81[\s\S]{0,120}width:min\(24vw,260px\)[\s\S]{0,120}height:min\(43vh,364px\)/, 'Wojciech must have a final CSS cap that beats the generic cinematic wrapper rule');
assert.match(vfxRecipes, /resultIsWojciech = String\(resultCard[\s\S]{0,120}=== '81'/, 'v2 consolidation result-card motion must detect Wojciech');
assert.match(vfxRecipes, /startScale:resultIsWojciech \? 1\.02/, 'v2 consolidation result-card motion must use a smaller Wojciech start scale');
assert.match(vfxRecipes, /textureScale:resultIsWojciech \? 1\.08/, 'v2 consolidation result-card motion must use a smaller Wojciech texture scale');
assert.match(handDrag, /function isDirectSetCard[\s\S]*isWojciechPierogiCounter[\s\S]*getValidPlacementOptionsForCard[\s\S]*finishSupporterDrop/, 'hand dragging must route Pierogi Counters through direct placement');

function emptyBoard(){
  return Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array.from({length:3}, ()=>null)));
}
function authorityState(){
  return {
    v:2,
    players:[{deck:[],hand:[],discard:[]},{deck:[],hand:[],discard:[]}],
    board:emptyBoard(),
    currentPlayer:0,
    turn:3,
    phase:'main',
    usMarinesUses:[0,0],
    _wojciechTurnPlacementCounts:[0,0],
    _wojciechLastTurnPlacementCounts:[0,2]
  };
}
const selectedCounter = {id:'token1',iid:701,type:'Counter',owner:0,pierogiCounter:true,immuneFlag:true,_pierogiCreator:0};
const preState = authorityState();
preState.players[0].hand.push(selectedCounter);
const postState = authorityState();
postState.board[0][0][1] = Object.assign({}, selectedCounter, {owner:1,_pierogiHost:1,_pierogiTurnsRemaining:3});
const room = {canonicalState:preState,canonicalHash:canonicalStateHash(preState)};
const validPlacement = validateProposedTransition(room, {type:'PLACE_CARD',payload:{playerIndex:0,z:0,r:0,c:1,selectedHand:selectedCounter,postState,baseStateHash:room.canonicalHash,stateHash:canonicalStateHash(postState)}}, {requireBaseHash:true});
assert.equal(validPlacement.ok, true, 'authority must accept a valid Pierogi placement on the opponent safe row');
const contestedPostState = authorityState();
contestedPostState.board[0][1][1] = Object.assign({}, selectedCounter, {owner:1,_pierogiHost:1,_pierogiTurnsRemaining:3});
const contestedPlacement = validateProposedTransition(room, {type:'PLACE_CARD',payload:{playerIndex:0,z:0,r:1,c:1,selectedHand:selectedCounter,postState:contestedPostState,baseStateHash:room.canonicalHash,stateHash:canonicalStateHash(contestedPostState)}}, {requireBaseHash:true});
assert.equal(contestedPlacement.ok, true, 'authority must accept a Pierogi placement in a contested square');
const invalidPostState = authorityState();
invalidPostState.board[0][2][1] = Object.assign({}, selectedCounter, {owner:1,_pierogiHost:1,_pierogiTurnsRemaining:3});
const invalidPlacement = validateProposedTransition(room, {type:'PLACE_CARD',payload:{playerIndex:0,z:0,r:2,c:1,selectedHand:selectedCounter,postState:invalidPostState,baseStateHash:room.canonicalHash,stateHash:canonicalStateHash(invalidPostState)}}, {requireBaseHash:true});
assert.match(invalidPlacement.reason || '', /contested or opponent-owned square/, 'authority must reject a Pierogi placement on the creator safe row');

function generatedSquareState(owner, markColumn){
  const state = authorityState();
  state.extraRows = [1,0,0];
  state.extraRowOwners = [[typeof owner === 'number' ? owner : null],[],[]];
  state.extraRowFullOwners = [typeof owner === 'number' ? owner : null,null,null];
  state.markSafeSquares = typeof markColumn === 'number' ? [{z:0,r:3,c:markColumn,owner:1,source:'mark'}] : [];
  state.board[0].push([null,null,null]);
  return state;
}
function validateGeneratedPlacement(pre, r, c){
  pre.players[0].hand.push(selectedCounter);
  const post = JSON.parse(JSON.stringify(pre));
  post.board[0][r][c] = Object.assign({}, selectedCounter, {owner:1,_pierogiHost:1,_pierogiTurnsRemaining:3});
  const generatedRoom = {canonicalState:pre,canonicalHash:canonicalStateHash(pre)};
  return validateProposedTransition(generatedRoom, {type:'PLACE_CARD',payload:{playerIndex:0,z:0,r,c,selectedHand:selectedCounter,postState:post,baseStateHash:generatedRoom.canonicalHash,stateHash:canonicalStateHash(post)}}, {requireBaseHash:true});
}
assert.equal(validateGeneratedPlacement(generatedSquareState(1), 3, 0).ok, true, 'authority must accept an opponent Anicka full extra-row square');
assert.equal(validateGeneratedPlacement(generatedSquareState(null, 2), 3, 2).ok, true, 'authority must accept the exact opponent Mark extra safe square');
assert.match(validateGeneratedPlacement(generatedSquareState(null, 2), 3, 1).reason || '', /contested or opponent-owned square/, 'authority must reject an unowned neighbor beside a Mark square');

const expandedPreState = authorityState();
expandedPreState.extraCells = [[{p1:0,p2:1},{p1:0,p2:0},{p1:0,p2:0}],[],[]];
expandedPreState.board[0][0].push(null);
assert.equal(validateGeneratedPlacement(expandedPreState, 0, 3).ok, true, 'authority must accept an opponent-added safe-row square');

const searchPre = authorityState();
const searchSource = {id:'06',iid:'jorge-search',name:'Jorge Alvarez',type:'Initiator',owner:0,currentFate:1,fate:1};
const boleslaw = {id:'86',iid:'boleslaw-reactor',name:'Boleslaw Kopewicz',type:'Improvisor',owner:1,currentFate:4,fate:4};
const searchedCard = {id:'05',iid:'searched-card',name:'17th British Infantry',type:'Supporter',owner:0,fate:1};
const reactionDraw = {id:'32',iid:'reaction-draw',name:'Temecula Resident',type:'Supporter',owner:1,fate:1};
searchPre.board[0][2][0] = searchSource;
searchPre.board[0][0][0] = boleslaw;
searchPre.players[0].deck = [searchedCard];
searchPre.players[1].deck = [reactionDraw];
const searchPost = JSON.parse(JSON.stringify(searchPre));
searchPost.players[0].deck = [];
searchPost.players[0].hand = [searchedCard];
const searchRoom = {canonicalState:searchPre, canonicalHash:canonicalStateHash(searchPre)};
const armedSearch = reduceServerAction(searchRoom, {type:'RESOLVE_CARD_PICK', payload:{
  playerIndex:0,
  opponentSearch:true,
  searchSourceCardId:'06',
  selectedCards:[{id:searchedCard.id,iid:searchedCard.iid}],
  postState:searchPost,
  baseStateHash:searchRoom.canonicalHash,
  stateHash:canonicalStateHash(searchPost)
}}, {requireBaseHash:true});
assert.equal(armedSearch.ok, true, 'authority must accept the searched card selection');
assert.equal(armedSearch.canonicalState._serverPendingReaction, undefined, 'Boleslaw must not create its own multiplayer reaction prompt');
assert.equal(armedSearch.canonicalState.players[1].hand[0].iid, reactionDraw.iid, 'automatic Boleslaw must draw the top card');
assert.equal(armedSearch.canonicalState.board[0][0][0].currentFate, 7, 'automatic Boleslaw must gain exactly 3 Fate');

const lydiaPre = JSON.parse(JSON.stringify(searchPre));
lydiaPre.board[1][2][0] = {id:'56',iid:'lydia-reactor',name:'Lydia',type:'Improvisor',owner:0,currentFate:7,fate:7,usesLeft:3};
const lydiaPost = JSON.parse(JSON.stringify(lydiaPre));
lydiaPost.players[0].deck = [];
lydiaPost.players[0].hand = [searchedCard];
const lydiaRoom = {canonicalState:lydiaPre, canonicalHash:canonicalStateHash(lydiaPre)};
const armedLydia = reduceServerAction(lydiaRoom, {type:'RESOLVE_CARD_PICK', payload:{
  playerIndex:0,
  opponentSearch:true,
  searchSourceCardId:'06',
  selectedCards:[{id:searchedCard.id,iid:searchedCard.iid}],
  postState:lydiaPost,
  baseStateHash:lydiaRoom.canonicalHash,
  stateHash:canonicalStateHash(lydiaPost)
}}, {requireBaseHash:true});
assert.equal(armedLydia.ok, true, 'authority must accept the search before Lydia responds');
assert.equal(armedLydia.canonicalState._serverPendingReaction.actionType, 'boleslaw_trigger', 'only Lydia may open a reaction window against automatic Boleslaw');
assert.equal(armedLydia.canonicalState._serverPendingReaction.options[0].kind, 'lydia', 'Boleslaw reaction window must offer Lydia rather than Boleslaw');
assert.equal(armedLydia.canonicalState.board[0][0][0].currentFate, 4, 'Boleslaw must wait for Lydia before resolving');
const pendingLydia = armedLydia.canonicalState._serverPendingReaction;
const allowedBoleslaw = reduceServerAction({canonicalState:armedLydia.canonicalState,canonicalHash:armedLydia.canonicalHash}, {type:'REACTION_CHOICE',payload:{
  playerIndex:0,promptId:pendingLydia.promptId,choice:'decline'
}}, {});
assert.equal(allowedBoleslaw.canonicalState.players[1].hand[0].iid, reactionDraw.iid, 'allowing the automatic trigger must draw for Boleslaw');
assert.equal(allowedBoleslaw.canonicalState.board[0][0][0].currentFate, 7, 'allowing the automatic trigger must give Boleslaw 3 Fate');
const suppressedBoleslaw = reduceServerAction({canonicalState:armedLydia.canonicalState,canonicalHash:armedLydia.canonicalHash}, {type:'REACTION_CHOICE',payload:{
  playerIndex:0,promptId:pendingLydia.promptId,choice:'negate',optionIndex:0
}}, {});
assert.equal(suppressedBoleslaw.ok, true, 'Lydia must be able to react to Boleslaw');
assert.equal(suppressedBoleslaw.canonicalState.players[1].hand.length, 0, 'Lydia suppression must stop Boleslaw from drawing');
assert.equal(suppressedBoleslaw.canonicalState.board[0][0][0].currentFate, 4, 'Lydia suppression must stop Boleslaw from gaining Fate');
assert.equal(suppressedBoleslaw.canonicalState.board[0][0][0]._lydiaSuppressed, true, 'Lydia must permanently suppress Boleslaw');
assert.equal(suppressedBoleslaw.canonicalState.board[1][2][0].usesLeft, 2, 'Lydia must spend one use');

for(const name of ['52','61','81','86','token1']) {
  const full = path.join(root, name + '.png');
  const thumb = path.join(root, 'optimized', 'card-thumbs', name + '.jpg');
  assert(fs.existsSync(full), name + '.png must exist');
  assert(fs.existsSync(thumb), name + ' optimized thumbnail must exist');
  assert(fs.statSync(thumb).mtimeMs >= fs.statSync(full).mtimeMs, name + ' optimized thumbnail must be current');
}

console.log('fate-card-reworks-smoke-test: ok');
