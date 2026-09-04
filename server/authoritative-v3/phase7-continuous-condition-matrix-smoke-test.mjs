import assert from 'node:assert/strict';
import {
  createInitialState,
  effectiveFate
} from '../../shared/engine/index.mjs';
import {expectedEffectiveFateFromOracle} from '../../shared/engine/rules-oracle.mjs';

const DEFINITIONS = [
  {id:'01', name:'Felicyta Janowicz', type:'Coordinator', aff:'third_great_war', fate:6, cost:3},
  {id:'10', name:'Post-Modernist Dylan', type:'Coordinator', aff:'expanded_worlds', fate:5, cost:2},
  {id:'11', name:'Anne Stone', type:'Coordinator', aff:'eventide', fate:6, cost:2},
  {id:'19', name:'Kvetka Svoboda', type:'Coordinator', aff:'third_great_war', fate:4, cost:2},
  {id:'23', name:'Cathy', type:'Coordinator', aff:'reality', fate:3, cost:2},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'35', name:'Alexander the Magnificient', type:'Dauntless', aff:'third_great_war', fate:12, cost:3},
  {id:'41', name:'Jimmy', type:'Dauntless', aff:'reality', fate:0, cost:3},
  {id:'44', name:'Soviet Grenadiers', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'55', name:'Bobby Jones', type:'Dauntless', aff:'expanded_worlds', fate:5, cost:1},
  {id:'57', name:'Jeremiah Jones', type:'Coordinator', aff:'expanded_worlds', fate:3, cost:3},
  {id:'59', name:'Maroon Knights', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'63', name:'Greek Hoplite', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'64', name:'Cook Islands Duelist', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'77', name:'Duncan Heyward', type:'Coordinator', aff:'eventide', fate:6, cost:3},
  {id:'85', name:'Felicyta Janowicz (Specters)', type:'Dauntless', aff:'expanded_worlds', fate:1, cost:4},
  {id:'88', name:'Rozsi Szocs (Youth)', type:'Dauntless', aff:'expanded_worlds', fate:1, cost:3},
  {id:'89', name:'Zsofia Szocs (Youth)', type:'Dauntless', aff:'expanded_worlds', fate:7, cost:2},
  {id:'100', name:'Felicyta and Kvetka (Youth)', type:'Dauntless', aff:'expanded_worlds', fate:12, cost:3},
  {id:'bh01', name:'Anicka Voyager', type:'Dauntless', aff:'eventide', fate:12, cost:3},
  {id:'bh07', name:'Agent-K', type:'Coordinator', aff:'expanded_worlds', fate:3, cost:3},
  {id:'bh11', name:'Felicyta Janowicz (University)', type:'Coordinator', aff:'reality', fate:5, cost:3},
  {id:'coord', name:'Fixture Coordinator', type:'Coordinator', aff:'reality', fate:2, cost:0},
  {id:'char', name:'Fixture Character', type:'Initiator', aff:'reality', fate:4, cost:0},
  {id:'support-eventide', name:'Eventide Supporter', type:'Supporter', aff:'eventide', fate:2, cost:0}
];

let scenarioNumber = 0;
function scenario(player0, player1 = []){
  scenarioNumber += 1;
  return createInitialState({
    matchId:`P7-CONTINUOUS-MATRIX-${scenarioNumber}`,
    seed:`p7-continuous-matrix-${scenarioNumber}`,
    handSize:12,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', deckIds:player0},
      {id:'p1', deckIds:player1}
    ]
  });
}

function takeCard(state, playerIndex, cardId){
  for(const pile of ['hand', 'deck', 'discard']){
    const index = state.players[playerIndex][pile].findIndex(card=>String(card.id) === String(cardId));
    if(index >= 0) return state.players[playerIndex][pile].splice(index, 1)[0];
  }
  throw new Error(`missing fixture card ${cardId} for player ${playerIndex}`);
}

function put(state, playerIndex, cardId, z, r, c){
  const card = takeCard(state, playerIndex, cardId);
  card.controller = playerIndex;
  state.board[z][r][c] = card;
  return card;
}

{
  const state = scenario(['41', '44']);
  const jimmy = put(state, 0, '41', 0, 2, 0);
  assert.equal(effectiveFate(state, jimmy), 0, 'Jimmy must not gain Fate before a qualifying reduction');
  state.fateReductionEffectUses[0] = 2;
  assert.equal(effectiveFate(state, jimmy), 6, 'Jimmy must gain exactly 3 Fate per qualifying effect use');
  const grenadier = put(state, 0, '44', 0, 2, 1);
  grenadier.counters.sovietDeclaredType = 'Dauntless';
  grenadier.counters.sovietTargetIid = jimmy.iid;
  assert.equal(effectiveFate(state, jimmy), 9, 'Jimmy must receive an adjacent Soviet Grenadier aura');
  jimmy.currentFate += 3;
  assert.equal(effectiveFate(state, jimmy), 12, 'Jimmy must receive permanent Fate on top of his derived value and aura');
}

{
  const state = scenario(['35', '32', '76']);
  const alexander = put(state, 0, '35', 0, 2, 0);
  assert.equal(effectiveFate(state, alexander), 12, 'Alexander must retain its printed Fate with no Supporters');
  put(state, 0, '32', 0, 2, 1);
  assert.equal(effectiveFate(state, alexander), 12, 'Alexander must not derive Fate from ordinary Supporters');
  alexander.currentFate += 3;
  assert.equal(effectiveFate(state, alexander), 15, 'Alexander must retain permanent Fate on top of its printed Fate');
  put(state, 0, '76', 0, 2, 2);
  assert.equal(effectiveFate(state, alexander), 15, 'Alexander must ignore Supporters while retaining permanent Fate');
}

{
  const state = scenario(['32', '32'], ['10']);
  const penalized = put(state, 0, '32', 0, 2, 0);
  const otherZone = put(state, 0, '32', 1, 2, 0);
  put(state, 1, '10', 0, 0, 0);
  assert.equal(effectiveFate(state, penalized), 0, 'opposing Dylan must penalize only cards in his zone');
  assert.equal(effectiveFate(state, otherZone), 1, 'opposing Dylan must not leak into another zone');
}

{
  const state = scenario(['01', '32', '32']);
  put(state, 0, '01', 0, 2, 0);
  const adjacent = put(state, 0, '32', 0, 2, 1);
  const nonAdjacent = put(state, 0, '32', 0, 0, 2);
  assert.equal(effectiveFate(state, adjacent), 5, 'Felicyta must buff an adjacent card');
  assert.equal(effectiveFate(state, nonAdjacent), 1, 'Felicyta must not buff a non-adjacent card');
}

{
  const state = scenario(['bh11', '01', '32', '32']);
  put(state, 0, 'bh11', 0, 2, 0);
  put(state, 0, '01', 0, 2, 1);
  const adjacent = put(state, 0, '32', 0, 2, 2);
  const otherZone = put(state, 0, '32', 1, 2, 0);
  assert.equal(effectiveFate(state, adjacent), 9, 'University Felicyta must double a controlled adjacency bonus in her zone');
  assert.equal(effectiveFate(state, otherZone), 1, 'University Felicyta must not double adjacency bonuses in another zone');
}

{
  const state = scenario(['11', '32', 'char']);
  put(state, 0, '11', 0, 2, 0);
  const supporter = put(state, 0, '32', 0, 2, 1);
  const character = put(state, 0, 'char', 0, 1, 0);
  assert.equal(effectiveFate(state, supporter), 4, 'Anne must buff Supporters');
  assert.equal(effectiveFate(state, character), 4, 'Anne must not buff Characters');
}

{
  const state = scenario(['19', 'coord', '32']);
  const kvetka = put(state, 0, '19', 0, 2, 0);
  const coordinator = put(state, 0, 'coord', 0, 2, 1);
  const supporter = put(state, 0, '32', 0, 2, 2);
  assert.equal(effectiveFate(state, kvetka), 7, 'Kvetka must count herself as a Coordinator');
  assert.equal(effectiveFate(state, coordinator), 5, 'Kvetka must buff another Coordinator');
  assert.equal(effectiveFate(state, supporter), 1, 'Kvetka must not buff a Supporter');
}

{
  const state = scenario(['23', 'char', '32']);
  const cathy = put(state, 0, '23', 0, 2, 0);
  const character = put(state, 0, 'char', 0, 2, 1);
  const supporter = put(state, 0, '32', 0, 2, 2);
  assert.equal(effectiveFate(state, cathy), 5, 'Cathy must count herself as a Character');
  assert.equal(effectiveFate(state, character), 6, 'Cathy must buff another Character');
  assert.equal(effectiveFate(state, supporter), 1, 'Cathy must not buff a Supporter');
}

{
  const state = scenario(['77', '32', 'support-eventide']);
  const duncan = put(state, 0, '77', 0, 2, 0);
  duncan.counters.declaredAffiliation = 'reality';
  const matching = put(state, 0, '32', 0, 2, 1);
  const mismatch = put(state, 0, 'support-eventide', 0, 2, 2);
  assert.equal(effectiveFate(state, duncan), 6, 'Duncan must not buff himself when his affiliation does not match the declaration');
  assert.equal(effectiveFate(state, matching), 5, 'Duncan must buff a matching affiliation');
  assert.equal(effectiveFate(state, mismatch), 2, 'Duncan must not buff a mismatched affiliation');
}

{
  const state = scenario(['59', '32', 'char']);
  const maroon = put(state, 0, '59', 0, 2, 0);
  const supporter = put(state, 0, '32', 0, 2, 1);
  const character = put(state, 0, 'char', 0, 2, 2);
  assert.equal(effectiveFate(state, maroon), 2, 'Maroon Knights must buff themselves');
  assert.equal(effectiveFate(state, supporter), 2, 'Maroon Knights must buff another Supporter');
  assert.equal(effectiveFate(state, character), 4, 'Maroon Knights must not buff a Character');
}

{
  const state = scenario(['bh07', '32', 'char']);
  const agentK = put(state, 0, 'bh07', 0, 2, 0);
  const beneficiary = put(state, 0, '32', 0, 0, 2);
  assert.equal(effectiveFate(state, agentK), 3, 'Agent-K must be inactive without an adjacent Dauntless');
  assert.equal(effectiveFate(state, beneficiary), 1, 'Agent-K must not grant a bonus without an adjacent Dauntless');
  put(state, 0, 'char', 0, 2, 1).type = 'Dauntless';
  assert.equal(effectiveFate(state, agentK), 5, 'Agent-K must gain its own zone-wide bonus after adjacency qualifies');
  assert.equal(effectiveFate(state, beneficiary), 3, 'Agent-K must grant the zone-wide bonus to a non-adjacent friendly card');
}

{
  const state = scenario(['44', 'char', 'bh01']);
  const grenadier = put(state, 0, '44', 0, 2, 0);
  grenadier.counters.sovietDeclaredType = 'Dauntless';
  assert.equal(effectiveFate(state, grenadier), 1, 'Grenadiers must be inactive without an adjacent Dauntless');
  const immuneDauntless = put(state, 0, 'bh01', 0, 2, 1);
  grenadier.counters.sovietTargetIid = immuneDauntless.iid;
  assert.equal(effectiveFate(state, grenadier), 4, 'an immune Dauntless must still satisfy the adjacency condition');
  assert.equal(effectiveFate(state, immuneDauntless), 12, 'an immune Dauntless must not receive the reciprocal Fate bonus');
  state.board[0][2][1] = null;
  const dauntless = put(state, 0, 'char', 0, 2, 1);
  dauntless.type = 'Dauntless';
  grenadier.counters.sovietTargetIid = dauntless.iid;
  assert.equal(effectiveFate(state, grenadier), 4, 'Grenadiers must gain Fate beside a legal Dauntless');
  assert.equal(effectiveFate(state, dauntless), 7, 'the adjacent Dauntless must receive the reciprocal bonus');
}

{
  const state = scenario(['55', '32', '32', '32']);
  const bobby = put(state, 0, '55', 0, 2, 0);
  put(state, 0, '32', 0, 2, 1);
  put(state, 0, '32', 0, 2, 2);
  assert.equal(effectiveFate(state, bobby), 5, 'Bobby must remain inactive with only two peer cards');
  const thirdPeer = put(state, 0, '32', 0, 1, 0);
  assert.equal(effectiveFate(state, bobby), 10, 'Bobby must activate when three peers share one affiliation, even if it differs from his own');
  thirdPeer.affiliation = 'eventide';
  assert.equal(effectiveFate(state, bobby), 5, 'Bobby must turn off when the peer affiliations are mixed');
}

{
  const state = scenario(['55', '32', '32', '76', '32']);
  const bobby = put(state, 0, '55', 0, 2, 0);
  put(state, 0, '32', 0, 2, 1);
  put(state, 0, '32', 0, 2, 2);
  put(state, 0, '76', 0, 1, 0);
  assert.equal(effectiveFate(state, bobby), 5, 'effect-immutable ALPINE must not satisfy Bobby\'s third-peer prerequisite');
  assert.equal(expectedEffectiveFateFromOracle(state, bobby.iid), 5, 'the detailed oracle must also exclude ALPINE from Bobby\'s prerequisite');
  state.board[0][1][0] = null;
  put(state, 0, '32', 0, 1, 0);
  assert.equal(effectiveFate(state, bobby), 10, 'a third ordinary same-affiliation peer must still activate Bobby');
  assert.equal(expectedEffectiveFateFromOracle(state, bobby.iid), 10, 'the detailed oracle must accept Bobby\'s ordinary third peer');
}

{
  const state = scenario(['63', '63']);
  const first = put(state, 0, '63', 0, 2, 0);
  assert.equal(effectiveFate(state, first), 3, 'one Hoplite must count itself as one copy');
  const second = put(state, 0, '63', 0, 2, 1);
  assert.equal(effectiveFate(state, first), 5, 'two Hoplites must each count both copies');
  assert.equal(effectiveFate(state, second), 5, 'the second Hoplite must receive the same copy bonus');
}

{
  const state = scenario(['88', '32', 'bh01']);
  const rozsi = put(state, 0, '88', 0, 2, 0);
  put(state, 0, '32', 0, 2, 1);
  assert.equal(effectiveFate(state, rozsi), 3, 'Rozsi must count herself but not a Supporter');
  put(state, 0, 'bh01', 1, 2, 0);
  assert.equal(effectiveFate(state, rozsi), 3, 'Rozsi must not count an effect-immutable Character, matching singleplayer invisibility rules');
  assert.equal(expectedEffectiveFateFromOracle(state, rozsi.iid), 3, 'the detailed oracle must also exclude effect-immutable Characters from Rozsi');
}

{
  const state = scenario(['85']);
  const specters = put(state, 0, '85', 0, 2, 0);
  assert.equal(effectiveFate(state, specters), 1, 'Specters must have no bonus before the opponent sets a Supporter');
  state.supportersSetTotal[1] = 3;
  assert.equal(effectiveFate(state, specters), 4, 'Specters must gain exactly one Fate per opposing Supporter set');
}

{
  const state = scenario(['89']);
  const zsofia = put(state, 0, '89', 0, 2, 0);
  assert.equal(effectiveFate(state, zsofia), 14, 'Zsofia must begin with her under-ten bonus');
  state.supporterEffectsActivated[0] = 9;
  assert.equal(effectiveFate(state, zsofia), 14, 'Zsofia must retain the bonus at nine activations');
  state.supporterEffectsActivated[0] = 10;
  assert.equal(effectiveFate(state, zsofia), 7, 'Zsofia must lose the bonus at exactly ten activations');
}

{
  const state = scenario(['64'], ['char']);
  const duelist = put(state, 0, '64', 0, 2, 0);
  const target = put(state, 1, 'char', 0, 0, 2);
  assert.equal(effectiveFate(state, duelist), 1, 'Duelist must be inactive without an adjacent opposing card');
  assert.equal(effectiveFate(state, target), 4, 'a non-adjacent opposing card must not be penalized');
  state.board[0][0][2] = null;
  state.board[0][2][1] = target;
  assert.equal(effectiveFate(state, duelist), 4, 'Duelist must gain 3 Fate after acquiring a legal adjacent target');
  assert.equal(effectiveFate(state, target), 1, 'Duelist must subtract 3 Fate from that target');
}

{
  const state = scenario(['100', '01']);
  const wintertide = put(state, 0, '100', 0, 2, 0);
  assert.equal(effectiveFate(state, wintertide), 12, 'Wintertide must not satisfy its own named-card condition');
  put(state, 0, '01', 1, 2, 0);
  assert.equal(effectiveFate(state, wintertide), 15, 'Wintertide must activate for a distinct Felicyta card');
}

console.log('authoritative-v3 Phase 7 continuous-condition false/true matrix passed');
