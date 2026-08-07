import assert from 'node:assert/strict';
import {
  createInitialState,
  legalCommandTemplates,
  reduceCommand,
  stableStringify
} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const DEFINITIONS = [
  {id:'03', name:'Howard', type:'Initiator', aff:'reality', fate:5, cost:2, rarity:'star'},
  {id:'05', name:'Fort Calvin Watcher', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'22', name:'Isaac Perez', type:'Initiator', aff:'expanded_worlds', fate:1, cost:1, rarity:'triangle'},
  {id:'31', name:'Oathbound Noble Fighter', type:'Supporter', aff:'eventide', fate:1, cost:0, rarity:'circle'},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'40', name:'Christopher Erbs', type:'Improvisor', aff:'expanded_worlds', fate:3, cost:2, rarity:'triangle'},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'83', name:'Sebastyen Janowicz', type:'Initiator', aff:'expanded_worlds', fate:3, cost:2, rarity:'triangle'},
  {id:'93', name:'Wodny Potok Youth', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'bh01', name:'AniÄka Voyager', type:'Dauntless', aff:'eventide', fate:12, cost:3, rarity:'star'},
  {id:'bh02', name:'Joie de Vivre', type:'Coordinator', aff:'eventide', fate:4, cost:2, rarity:'triangle'}
];

function stateFor(matchId, player0, player1 = ['31']){
  return createInitialState({
    matchId,
    seed:`${matchId}-seed`,
    handSize:0,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:player0},
      {id:'p1', deckIds:player1}
    ]
  });
}

function moveToBoard(state, playerIndex, cardId, destination){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>card.id === cardId);
    if(index < 0) continue;
    const card = state.players[playerIndex][pile].splice(index, 1)[0];
    card.controller = playerIndex;
    state.board[destination.z][destination.r][destination.c] = card;
    return card;
  }
  throw new Error(`missing ${cardId} for player ${playerIndex}`);
}

// Howard snapshots stored Fate and applies current × 2 + 5 to any mutable card
// in his zone, including an opponent card.
let state = stateFor('P4FATE03', ['03', '32'], ['31', '76']);
const howard = moveToBoard(state, 0, '03', {z:0, r:2, c:0});
const ownTarget = moveToBoard(state, 0, '32', {z:0, r:2, c:1});
const opponentTarget = moveToBoard(state, 1, '31', {z:0, r:0, c:0});
const alpine = moveToBoard(state, 1, '76', {z:0, r:0, c:1});
opponentTarget.currentFate = 4;
let result = reduceCommand(
  state,
  command(state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:howard.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert(result.prompt.eligibleIids.includes(ownTarget.iid));
assert(result.prompt.eligibleIids.includes(opponentTarget.iid));
assert.equal(result.prompt.eligibleIids.includes(alpine.iid), false, 'effect-immutable cards must not be offered');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 2, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:opponentTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(
  result.state.board[0][0][0].currentFate,
  13,
  'Howard must double the current 4 Fate and then add 5'
);
assert(result.events.some(event=>
  event.type === 'FATE_CHANGED'
  && event.cardIid === opponentTarget.iid
  && event.before === 4
  && event.after === 13
));
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 3, 'ACTIVATE_EFFECT', {sourceIid:howard.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'USE_LIMIT_REACHED');

// Shipping play consolidates Initiators and immediately admits their effect.
// That automatic admission must consume the same one-use counter as a manual
// activation; otherwise Howard resolves once during placement and again from
// a stale Activate Effect affordance.
state = stateFor('P4FATE03CONSOLIDATEDONCE', ['03', '32', '31'], ['31']);
const consolidatedHoward = state.players[0].deck.splice(
  state.players[0].deck.findIndex(card=>card.id === '03'),
  1
)[0];
state.players[0].hand.push(consolidatedHoward);
const howardTributeA = moveToBoard(state, 0, '32', {z:0, r:2, c:0});
const howardTributeB = moveToBoard(state, 0, '31', {z:0, r:2, c:1});
const howardConsolidationTarget = moveToBoard(state, 1, '31', {z:0, r:0, c:0});
howardConsolidationTarget.currentFate = 4;
result = reduceCommand(
  state,
  command(state, 'p0', 31, 'CONSOLIDATE_CARD', {
    cardIid:consolidatedHoward.iid,
    tributeIids:[howardTributeA.iid, howardTributeB.iid],
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt?.type, 'BOARD_TARGET');
assert.equal(result.state.board[0][2][0].counters.effectUses, 1);
assert.equal(result.events.filter(event=>
  event.type === 'EFFECT_ACTIVATED' && event.sourceIid === consolidatedHoward.iid
).length, 1, 'automatic Howard admission must emit exactly one activation');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 32, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:howardConsolidationTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][0][0].currentFate, 13);
assert.equal(result.events.filter(event=>
  event.type === 'FATE_CHANGED'
  && event.sourceIid === consolidatedHoward.iid
  && event.cardIid === howardConsolidationTarget.iid
).length, 1, 'Howard must apply exactly one Fate mutation per resolution');
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 33, 'ACTIVATE_EFFECT', {sourceIid:consolidatedHoward.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'USE_LIMIT_REACHED');

// Isaac's optional two-target selection is validated as a batch and each
// selected card receives its own standard Fate event.
state = stateFor('P4FATE22', ['22', '03', '32', '76']);
const isaac = moveToBoard(state, 0, '22', {z:1, r:2, c:0});
const isaacTargetA = moveToBoard(state, 0, '03', {z:1, r:2, c:1});
const isaacTargetB = moveToBoard(state, 0, '32', {z:1, r:1, c:0});
const ownAlpine = moveToBoard(state, 0, '76', {z:1, r:1, c:1});
result = reduceCommand(
  state,
  command(state, 'p0', 4, 'ACTIVATE_EFFECT', {sourceIid:isaac.iid}),
  {playerId:'p0'}
);
assert.equal(result.prompt.min, 0);
assert.equal(result.prompt.max, 2);
assert.equal(result.prompt.eligibleIids.includes(ownAlpine.iid), false);
const promptedState = result.state;
const beforeA = isaacTargetA.currentFate;
const beforeB = isaacTargetB.currentFate;
result = reduceCommand(
  promptedState,
  command(promptedState, 'p0', 5, 'ANSWER_PROMPT', {
    promptId:promptedState.pendingPrompt.promptId,
    selectedIids:[isaac.iid, isaacTargetA.iid, isaacTargetB.iid]
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'INVALID_CHOICE');
assert.equal(promptedState.board[1][2][1].currentFate, beforeA, 'rejected batches must not partially mutate state');
state = promptedState;
result = reduceCommand(
  state,
  command(state, 'p0', 6, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIids:[isaacTargetA.iid, isaacTargetB.iid]
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[1][2][1].currentFate, beforeA + 3);
assert.equal(result.state.board[1][1][0].currentFate, beforeB + 3);
assert.equal(result.events.filter(event=>event.type === 'FATE_CHANGED').length, 2);

// Sebastyen automatically snapshots all face-up, mutable Characters controlled
// by the player in his zone. Supporters, face-down cards, and opponents are out.
state = stateFor('P4FATE83', ['83', '03', '22', '32'], ['03']);
const sebastyen = moveToBoard(state, 0, '83', {z:2, r:2, c:0});
const faceUpCharacter = moveToBoard(state, 0, '03', {z:2, r:2, c:1});
const faceDownCharacter = moveToBoard(state, 0, '22', {z:2, r:1, c:0});
faceDownCharacter.faceDown = true;
const supporter = moveToBoard(state, 0, '32', {z:2, r:1, c:1});
const opponentCharacter = moveToBoard(state, 1, '03', {z:2, r:0, c:0});
const beforeSebastyen = sebastyen.currentFate;
const beforeFaceUp = faceUpCharacter.currentFate;
result = reduceCommand(
  state,
  command(state, 'p0', 7, 'ACTIVATE_EFFECT', {sourceIid:sebastyen.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt, null);
assert.equal(result.state.board[2][2][0].currentFate, beforeSebastyen + 2);
assert.equal(result.state.board[2][2][1].currentFate, beforeFaceUp + 2);
assert.equal(result.state.board[2][1][0].currentFate, faceDownCharacter.currentFate);
assert.equal(result.state.board[2][1][1].currentFate, supporter.currentFate);
assert.equal(result.state.board[2][0][0].currentFate, opponentCharacter.currentFate);

// Fate loss clamps at zero, matching the legacy permanent Fate helpers.
state = stateFor('P4FATECLAMP', ['31']);
const clamped = state.players[0].deck[0];
result = reduceCommand(
  state,
  command(state, 'p0', 8, 'MODIFY_FATE', {targetIid:clamped.iid, amount:-3}),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[0].deck[0].currentFate, 0);

// An effect-immutable card may resolve its own intrinsic placement operations,
// but a different card source still cannot mutate it.
state = stateFor('P4FATE76', ['03', '76']);
const alpineSource = moveToBoard(state, 0, '03', {z:0, r:2, c:0});
const alpineHandIndex = state.players[0].deck.findIndex(card=>card.id === '76');
const alpineHandCard = state.players[0].deck.splice(alpineHandIndex, 1)[0];
state.players[0].hand.push(alpineHandCard);
result = reduceCommand(
  state,
  command(state, 'p0', 9, 'SET_CARD', {
    cardIid:alpineHandCard.iid,
    destination:{z:0, r:2, c:1}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][1].currentFate, 5);
assert(result.state.board[0][2][1].statuses.includes('IMMUNE_TO_OPPONENT_EFFECTS'));
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 10, 'MODIFY_FATE', {
    targetIid:alpineHandCard.iid,
    amount:3,
    sourceIid:alpineSource.iid
  }),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'TARGET_IMMUNE');

// Erbs cannot be armed twice at once, consumes the status on the next draw,
// and applies the catalog/legacy +6 value.
state = stateFor('P4FATE40', ['40', '03']);
const erbs = moveToBoard(state, 0, '40', {z:0, r:2, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 11, 'ACTIVATE_EFFECT', {sourceIid:erbs.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert(result.state.board[0][2][0].statuses.includes('NEXT_DRAW_GAINS_6'));
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 12, 'ACTIVATE_EFFECT', {sourceIid:erbs.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'EFFECT_ALREADY_PENDING');
assert.equal(
  legalCommandTemplates(state, 0).some(template=>
    template.type === 'ACTIVATE_EFFECT' && template.payload.sourceIid === erbs.iid
  ),
  false,
  'an already-armed Christopher Erbs effect must not be advertised as legal'
);
result = reduceCommand(
  state,
  command(state, 'p0', 13, 'DRAW_CARD', {playerIndex:0, count:1, activatedEffect:true}),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
assert.equal(result.state.players[0].hand[0].id, '03');
assert.equal(result.state.players[0].hand[0].currentFate, 11);
assert.equal(result.state.board[0][2][0].statuses.includes('NEXT_DRAW_GAINS_6'), false);
assert(result.events.some(event=>
  event.type === 'FATE_CHANGED'
  && event.amount === 6
  && event.reason === 'CHRISTOPHER_ERBS_NEXT_DRAW'
));

// Snowball Fight targets any mutable opponent card on the field, persists its
// exact continuation through serialization, and is limited by authoritative
// turn number rather than a client-reset boolean.
state = stateFor('P4FATE93', ['93', '32'], ['31', '76']);
const youth = moveToBoard(state, 0, '93', {z:0, r:2, c:0});
const snowballTarget = moveToBoard(state, 1, '31', {z:2, r:0, c:0});
const immuneSnowballTarget = moveToBoard(state, 1, '76', {z:1, r:0, c:0});
result = reduceCommand(
  state,
  command(state, 'p0', 14, 'ACTIVATE_EFFECT', {sourceIid:youth.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert(result.prompt.eligibleIids.includes(snowballTarget.iid), 'Snowball Fight may target another zone');
assert.equal(result.prompt.eligibleIids.includes(immuneSnowballTarget.iid), false);
state = JSON.parse(stableStringify(result.state));
result = reduceCommand(
  state,
  command(state, 'p0', 15, 'ANSWER_PROMPT', {
    promptId:state.pendingPrompt.promptId,
    selectedIid:snowballTarget.iid
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[2][0][0].currentFate, 0);
assert(result.events.some(event=>
  event.type === 'FATE_CHANGED'
  && event.cardIid === snowballTarget.iid
  && event.before === 1
  && event.after === 0
));
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 16, 'ACTIVATE_EFFECT', {sourceIid:youth.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, false);
assert.equal(result.rejection.code, 'USE_LIMIT_REACHED');
assert.equal(state.board[0][2][0].counters.lastEffectTurn, state.turn);
result = reduceCommand(
  state,
  command(state, 'p0', 17, 'END_TURN'),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p1', 18, 'END_TURN'),
  {playerId:'p1'}
);
assert.equal(result.ok, true);
state = result.state;
result = reduceCommand(
  state,
  command(state, 'p0', 19, 'ACTIVATE_EFFECT', {sourceIid:youth.iid}),
  {playerId:'p0'}
);
assert.equal(result.ok, true, 'once-per-turn effects must unlock on a later authoritative turn');
assert.equal(result.prompt.type, 'BOARD_TARGET');

state = stateFor('P4FATE05IMMUNE', ['05'], ['76', '32']);
const fortCalvin = state.players[0].deck.shift();
state.players[0].hand.push(fortCalvin);
const immutableFortTarget = moveToBoard(state, 1, '76', {z:0, r:0, c:0});
const mutableFortTarget = moveToBoard(state, 1, '32', {z:0, r:0, c:1});
result = reduceCommand(
  state,
  command(state, 'p0', 20, 'SET_CARD', {
    cardIid:fortCalvin.iid,
    destination:{z:0, r:2, c:0}
  }),
  {playerId:'p0'}
);
assert.equal(result.ok, true);
assert.equal(result.prompt.type, 'BOARD_TARGET');
assert(result.prompt.eligibleIids.includes(mutableFortTarget.iid));
assert.equal(
  result.prompt.eligibleIids.includes(immutableFortTarget.iid),
  false,
  'Fort Calvin must not offer an immutable target that MODIFY_FATE will reject'
);

// Joie's draw-effect trigger must skip immutable friendly cards while still
// resolving its bonus for legal cards in the same zone.
state = stateFor('P4FATEJOIEIMMUNE', ['bh02', 'bh01', '32'], ['31']);
const joie = moveToBoard(state, 0, 'bh02', {z:0, r:2, c:0});
const immuneAnicka = moveToBoard(state, 0, 'bh01', {z:0, r:2, c:1});
const joieBefore = joie.currentFate;
const anickaBefore = immuneAnicka.currentFate;
result = reduceCommand(
  state,
  command(state, 'p0', 21, 'DRAW_CARD', {playerIndex:0, count:1, activatedEffect:true}),
  {playerId:'p0', allowDebugCommands:true}
);
assert.equal(result.ok, true);
assert.equal(result.state.board[0][2][0].currentFate, joieBefore + 1);
assert.equal(result.state.board[0][2][1].currentFate, anickaBefore);

console.log('authoritative-v3 Phase 4 Fate-modification family smoke test passed');
