import assert from 'node:assert/strict';
import {
  applyOperation,
  assertInvariants,
  createInitialState,
  effectiveFate,
  legalCommandTemplates,
  multiplayerEligibleCardIds,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';

const DEFINITIONS = [
  {id:'01', name:'Felicyta Janowicz', type:'Coordinator', aff:'third_great_war', fate:6, cost:3, rarity:'square'},
  {id:'02', name:'Anicka Konvicka', type:'Initiator', aff:'eventide', fate:8, cost:2, rarity:'star'},
  {id:'05', name:'Test Supporter', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'07', name:'Maja Kaminska', type:'Initiator', aff:'third_great_war', fate:3, cost:1, rarity:'star'},
  {id:'08', name:'Lina', type:'Initiator', aff:'reality', fate:2, cost:2, rarity:'square'},
  {id:'14', name:'Alondra', type:'Dauntless', aff:'expanded_worlds', fate:6, cost:3, rarity:'square'},
  {id:'24', name:"Ralph's Courtesy Clerk", type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'26', name:'UCPD', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'28', name:'2nd Polish-Lithuanian Army', type:'Supporter', aff:'third_great_war', fate:1, cost:0, rarity:'circle'},
  {id:'30', name:'Tatra Mountains Sharpshooter', type:'Initiator', aff:'third_great_war', fate:3, cost:2, rarity:'triangle'},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'41', name:'Jimmy', type:'Dauntless', aff:'reality', fate:0, cost:3, rarity:'triangle'},
  {id:'44', name:'Soviet Grenadiers', type:'Supporter', aff:'third_great_war', fate:1, cost:0, rarity:'circle'},
  {id:'61', name:'CSA Sniper', type:'Initiator', aff:'eventide', fate:4, cost:3, rarity:'square'},
  {id:'64', name:'Cook Islands Duelist', type:'Supporter', aff:'eventide', fate:1, cost:0, rarity:'circle'},
  {id:'69', name:'Breakfast Republic Busser', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'70', name:'Wine Country Guerilla', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'71', name:'Fort Calvin Watcher', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'74', name:'Selva Islands Pirate', type:'Supporter', aff:'eventide', fate:1, cost:0, rarity:'circle'},
  {id:'75', name:'The Ledger-keepers', type:'Supporter', aff:'eventide', fate:1, cost:0, rarity:'circle'},
  {id:'91', name:'Snowy Village', type:'Supporter', aff:'eventide', fate:1, cost:0, rarity:'circle'},
  {id:'81', name:'Wojciech', type:'Initiator', aff:'expanded_worlds', fate:4, cost:2, rarity:'triangle'},
  {id:'94', name:'Wodny Potok Mailman', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'98', name:'Wodny Potok Skier', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'100', name:'Felicyta and Kvetka (Youth)', type:'Dauntless', aff:'expanded_worlds', fate:12, cost:3, rarity:'square'},
  {id:'bh03', name:'Ali, The Indomitable', type:'Improvisor', aff:'expanded_worlds', fate:2, cost:3, rarity:'triangle'},
  {id:'bh05', name:'Taylor', type:'Initiator', aff:'expanded_worlds', fate:5, cost:1, rarity:'star'},
  {id:'bh06', name:'Achille Laurent', type:'Initiator', aff:'third_great_war', fate:2, cost:1, rarity:'triangle'},
  {id:'bh07', name:'Agent-K', type:'Coordinator', aff:'expanded_worlds', fate:3, cost:3, rarity:'square'}
];

function stateFor(matchId, player0, player1 = [], options = {}){
  return createInitialState({
    matchId,
    seed:`${matchId}:seed`,
    handSize:options.handSize ?? 99,
    maxTurns:20,
    landscapeId:options.landscapeId || '',
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:player0},
      {id:'p1', deckIds:player1}
    ]
  });
}

function command(state, playerId, sequence, type, payload = {}){
  return {
    commandId:`${playerId}:${sequence}`,
    matchId:state.matchId,
    expectedRevision:state.revision,
    type,
    payload
  };
}

function take(state, playerIndex, cardId){
  for(const pile of ['hand', 'deck', 'discard', 'limbo']){
    const index = state.players[playerIndex][pile].findIndex(card=>String(card.id) === String(cardId));
    if(index >= 0) return state.players[playerIndex][pile].splice(index, 1)[0];
  }
  throw new Error(`missing ${cardId}`);
}

function board(state, playerIndex, cardId, destination){
  const card = take(state, playerIndex, cardId);
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

const finalSliceIds = [
  '01', '02', '04', '07', '08', '14', '17', '21', '24', '25', '28', '36',
  '37', '41', '43', '44', '45', '52', '61', '62', '64', '70', '71', '72',
  '73', '74', '75', '78', '81', '84', '86', '91', '94', '98', '99', '100',
  'bh03', 'bh05', 'bh06', 'bh07'
];
for(const cardId of finalSliceIds){
  assert(multiplayerEligibleCardIds().includes(cardId), `${cardId} must be v3 eligible`);
}

let state = stateFor(
  'P4FINALOPENING',
  ['05', 'bh05', 'bh03'],
  ['05'],
  {handSize:99}
);
assert.equal(
  state.players[0].hand.filter(card=>card.id === 'bh05').length,
  2,
  'opening Taylor must duplicate exactly once'
);
assert.equal(state.players[1].hand.some(card=>card.id === 'bh03'), true);
assert.equal(state.players[1].hand.find(card=>card.id === 'bh03').owner, 1);
assertInvariants(state);

state = stateFor(
  'P4FINALSKIER',
  ['05', '05', '05', '05', '05', '05', '05', '98'],
  [],
  {handSize:6}
);
assert.equal(state.players[0].hand.filter(card=>card.id === '98').length, 1);
assert.equal(state.players[0].hand.length, 7, 'Skier must be an additional opening card');
assertInvariants(state);

state = stateFor('P4FINALGEOMETRY', ['02', '05', '01', '44'], ['05', '41']);
const anicka = board(state, 0, '02', {z:0, r:2, c:0});
const geometryCtx = {state, events:[], ruleEvents:[]};
applyOperation(geometryCtx, {
  type:'ADD_SAFE_ROW',
  playerIndex:0,
  sourceIid:anicka.iid,
  sourceController:0
});
assert.equal(state.board[0].length, 4);
assert.equal(state.geometry.playableExtraSquares.filter(square=>square.z === 0 && square.r === 3).length, 3);
const friendly = board(state, 0, '05', {z:0, r:2, c:1});
const felicita = board(state, 0, '01', {z:0, r:1, c:1});
assert.equal(effectiveFate(state, friendly), 5, 'Felicyta adjacency must be orthogonal');
const grenadier = board(state, 0, '44', {z:1, r:2, c:0});
const dauntless = board(state, 1, '41', {z:1, r:2, c:1});
dauntless.controller = 0;
grenadier.counters.sovietDeclaredType = 'Dauntless';
grenadier.counters.sovietTargetIid = dauntless.iid;
assert.equal(effectiveFate(state, grenadier), 4);
assert.equal(effectiveFate(state, dauntless), 3);
assertInvariants(state);

state = stateFor('P4FINALWINTERTIDEQUALIFIER', ['100', '01'], []);
const wintertide = board(state, 0, '100', {z:0, r:2, c:0});
assert.equal(
  effectiveFate(state, wintertide),
  12,
  'Felicyta and Květka must not satisfy its own separate-card +3 requirement'
);
board(state, 0, '01', {z:1, r:2, c:0});
assert.equal(
  effectiveFate(state, wintertide),
  15,
  'a distinct controlled Felicyta or Květka card must grant Wintertide +3 Fate'
);
assertInvariants(state);

state = stateFor('P4FINALDECKSET', ['28', '05'], [], {handSize:0});
const army = state.players[0].deck.find(card=>card.id === '28');
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'SET_CARD_FROM_DECK', {
    cardIid:army.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = result.state;
assert.equal(state.board[0][2][0].id, '28');
assert.equal(
  legalCommandTemplates(state, 0).some(template=>template.type === 'SET_CARD_FROM_DECK'),
  false,
  'Army of Exiles must be limited to one deck set per turn'
);

state = stateFor('P4FINALDECKSETALONDRABLOCK', ['28'], ['14'], {handSize:0});
board(state, 1, '14', {z:0, r:1, c:0});
const blockedArmy = state.players[0].deck.find(card=>card.id === '28');
const blockedArmyCommands = legalCommandTemplates(state, 0).filter(template=>
  template.type === 'SET_CARD_FROM_DECK'
  && String(template.payload?.cardIid || '') === String(blockedArmy.iid)
);
assert.equal(
  blockedArmyCommands.some(template=>
    template.payload.destination.z === 0
    && template.payload.destination.r === 2
    && template.payload.destination.c === 0
  ),
  false,
  'deck-set legal commands must not advertise a Supporter square blocked by opponent Alondra'
);
assert.equal(
  blockedArmyCommands.some(template=>
    template.payload.destination.z === 0
    && template.payload.destination.r === 2
    && template.payload.destination.c === 2
  ),
  true,
  'deck-set legal commands must retain unblocked destinations'
);

state = stateFor('P4FINALFREESET', ['08', '05', '05', '32'], ['14']);
board(state, 1, '14', {z:1, r:0, c:0});
const realityFreeTarget = take(state, 0, '32');
state.players[0].deck.push(realityFreeTarget);
const linaTributeA = board(state, 0, '05', {z:0, r:2, c:0});
const linaTributeB = board(state, 0, '05', {z:0, r:2, c:1});
const lina = state.players[0].hand.find(card=>card.id === '08');
result = reduceCommand(
  state,
  command(state, 'p0', 1, 'CONSOLIDATE_CARD', {
    cardIid:lina.iid,
    tributeIids:[linaTributeA.iid, linaTributeB.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'CARD_SELECTION');
state = result.state;
const freeTarget = state.pendingPrompt.eligibleCards.find(card=>card.id === '32');
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:freeTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_DESTINATION');
assert.equal(
  result.prompt.eligible.some(destination=>destination.z === 1 && destination.r === 1 && destination.c === 0),
  false,
  'free-set destination prompts must exclude squares blocked by opponent Alondra'
);
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    destination:{z:1, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[1][2][0].id, '32');
assertInvariants(result.state);

state = stateFor('P4FINALHIDDEN', ['70', '05'], ['05']);
const guerilla = board(state, 0, '70', {z:0, r:2, c:0});
const hiddenCtx = {state, events:[], ruleEvents:[]};
applyOperation(hiddenCtx, {
  type:'DISCARD_CARD',
  targetIid:guerilla.iid,
  sourceIid:guerilla.iid,
  sourceController:0
});
assert.equal(state.players[1].hand.some(card=>card.iid === guerilla.iid), true);
assert.equal(guerilla.counters.guerillaTurnsRemaining, 5);
assert(guerilla.statuses.includes('HAND_EFFECT_IMMUNE'));
state.activePlayer = 1;
assert.equal(
  legalCommandTemplates(state, 1).some(template=>
    template.type === 'SET_CARD' && template.payload.cardIid === guerilla.iid
  ),
  false,
  'an infiltrating Wine Country Guerilla must not be advertised as settable'
);
assertInvariants(state);

state = stateFor('P4FINALTOKENS', ['81'], ['05']);
state.cardsPlacedLastTurn[1] = 2;
const wojciech = board(state, 0, '81', {z:0, r:2, c:0});
const tokenCtx = {state, events:[], ruleEvents:[]};
applyOperation(tokenCtx, {
  type:'CREATE_TOKENS',
  playerIndex:0,
  count:state.cardsPlacedLastTurn[1],
  tokenKind:'PIEROGI',
  sourceIid:wojciech.iid,
  sourceController:0
});
assert.equal(state.players[0].hand.filter(card=>card.counters?.pierogiCounter).length, 2);
assert.equal(
  legalCommandTemplates(state, 0).some(template=>
    template.type === 'SET_CARD'
    && state.players[0].hand.some(card=>
      card.counters?.pierogiCounter && card.iid === template.payload.cardIid
    )
  ),
  true
);
assertInvariants(JSON.parse(stableStringify(state)));

state = stateFor('P4FINALTAYLORCOPYFILTER', ['bh05', '30', '32', '32'], ['32']);
const taylorTribute = board(state, 0, '32', {z:0, r:2, c:0});
const taylor = state.players[0].hand.find(card=>card.id === 'bh05');
result = reduceCommand(
  state,
  command(state, 'p0', 20, 'CONSOLIDATE_CARD', {
    cardIid:taylor.iid,
    tributeIids:[taylorTribute.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'CARD_SELECTION');
assert.equal(
  result.prompt.eligibleCards.some(card=>card.id === '30'),
  false,
  'Taylor must not offer a copied effect whose mandatory opening target is unavailable'
);
assert(result.prompt.eligibleCards.some(card=>card.id === '32'));

state = stateFor('P4FINALTAYLORONESHOTCOPY', ['bh05', '26', '05'], ['05']);
const taylorOneShotTribute = board(state, 0, '05', {z:0, r:2, c:0});
const taylorOneShot = state.players[0].hand.find(card=>card.id === 'bh05');
result = reduceCommand(
  state,
  command(state, 'p0', 30, 'CONSOLIDATE_CARD', {
    cardIid:taylorOneShot.iid,
    tributeIids:[taylorOneShotTribute.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'CARD_SELECTION');
state = result.state;
const copiedUcpd = state.pendingPrompt.eligibleCards.find(card=>card.id === '26');
assert(copiedUcpd, 'Taylor must be able to copy the eligible UCPD effect');
result = reduceCommand(
  state,
  command(state, 'p0', 31, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:copiedUcpd.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
const resolvedTaylor = result.state.board[0][2][0];
assert.equal(resolvedTaylor.counters.copiedEffectId, '26', 'copied identity remains public for presentation and oracle attribution');
assert.equal(
  legalCommandTemplates(result.state, 0).some(template=>
    template.type === 'ACTIVATE_EFFECT'
      && String(template.payload?.sourceIid || '') === String(resolvedTaylor.iid)
  ),
  false,
  'Taylor executes the copied effect once when set and must not inherit a permanent Activate Effect command'
);
assertInvariants(result.state);

state = stateFor('P4FINALPRECISESHOTEMPTY', ['61', '32', '32', '32'], ['32']);
const preciseTributeA = board(state, 0, '32', {z:0, r:2, c:0});
const preciseTributeB = board(state, 0, '32', {z:0, r:2, c:1});
const preciseTributeC = board(state, 0, '32', {z:0, r:1, c:0});
const preciseShot = state.players[0].hand.find(card=>card.id === '61');
result = reduceCommand(
  state,
  command(state, 'p0', 21, 'CONSOLIDATE_CARD', {
    cardIid:preciseShot.iid,
    tributeIids:[preciseTributeA.iid, preciseTributeB.iid, preciseTributeC.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true, 'Precise Shot must resolve when the revealed opponent hand has no Character');
assert.equal(result.state.pendingPrompt, null);
assert.equal(result.state.effectStack.length, 0);

state = stateFor('P4FINALLEDGERLIMIT', ['75', '75', '91', '69'], ['05']);
const recursiveLedgerKeepers = board(state, 0, '75', {z:0, r:1, c:1});
const snowyVillage = board(state, 0, '91', {z:0, r:2, c:0});
const busser = board(state, 0, '69', {z:0, r:2, c:1});
state.statuses.push({
  statusId:'rule-use:snowy_village:p0',
  type:'RULE_USE_COUNTER',
  ruleKey:'SNOWY_VILLAGE',
  playerIndex:0,
  uses:2,
  maxUses:2
});
const ledgerKeepers = state.players[0].hand.find(card=>card.id === '75');
result = reduceCommand(
  state,
  command(state, 'p0', 22, 'SET_CARD', {
    cardIid:ledgerKeepers.iid,
    destination:{z:0, r:1, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt, null, 'Ledger Keepers must not expose retired Busser movement targeting');
assert.equal(result.state.statuses.some(status=>String(status.statusId || '').startsWith('movement-grant:busser:')), false);

console.log('authoritative-v3 Phase 4 final-card dependency smoke test passed');
