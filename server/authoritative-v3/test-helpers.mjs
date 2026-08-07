import {createInitialState} from '../../shared/engine/state.mjs';

export const TEST_DEFINITIONS = [
  {id:'05', name:'17th British Regiment', type:'Supporter', aff:'third_great_war', fate:1, cost:0},
  {id:'26', name:'UCPD', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'27', name:'Kazumi', type:'Initiator', aff:'eventide', fate:1, cost:1},
  {id:'30', name:'Santiago', type:'Initiator', aff:'eventide', fate:5, cost:3},
  {id:'31', name:'Oathbound Noble Fighter', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'32', name:'Temecula Resident', type:'Supporter', aff:'reality', fate:1, cost:0},
  {id:'34', name:'Rozsi Szocs', type:'Coordinator', aff:'third_great_war', fate:3, cost:2},
  {id:'39', name:'Juan Carlos', type:'Initiator', aff:'expanded_worlds', fate:3, cost:2},
  {id:'40', name:'Christopher Erbs', type:'Improvisor', aff:'expanded_worlds', fate:6, cost:2},
  {id:'54', name:'Wolf Creek Light Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'56', name:'Lydia', type:'Improvisor', aff:'expanded_worlds', fate:7, cost:2},
  {id:'65', name:'1st West Caribbea Marines', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'67', name:'Mr. Secules', type:'Improvisor', aff:'reality', fate:4, cost:1},
  {id:'70', name:'Wine Country Guerilla', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'76', name:'ALPINE Infantry', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0},
  {id:'79', name:'Havano Citizen', type:'Supporter', aff:'eventide', fate:1, cost:0},
  {id:'bh01', name:'Anička Voyager', type:'Dauntless', aff:'eventide', fate:12, cost:3},
  {id:'bh02', name:'Joie', type:'Coordinator', aff:'reality', fate:1, cost:5}
];

export function testState(options = {}){
  const player0 = options.player0 || ['27', '32', '34', '54', '30', '39', 'bh01', 'bh02'];
  const player1 = options.player1 || ['56', '67', '79', '32', '76'];
  return createInitialState({
    matchId:options.matchId || 'AUTHV3TEST',
    seed:options.seed || 'authority-v3-test',
    handSize:99,
    activePlayer:options.activePlayer || 0,
    cardDefinitions:TEST_DEFINITIONS,
    players:[
      {id:'p0', name:'Player 0', deckIds:player0},
      {id:'p1', name:'Player 1', deckIds:player1}
    ]
  });
}

export function takeFromHandToBoard(state, playerIndex, cardId, destination){
  const player = state.players[playerIndex];
  const index = player.hand.findIndex(card=>String(card.id) === String(cardId));
  if(index < 0) throw new Error(`fixture card ${cardId} is not in player ${playerIndex} hand`);
  const card = player.hand.splice(index, 1)[0];
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

export function command(state, playerId, number, type, payload = {}){
  return {
    commandId:`${playerId}:${number}`,
    matchId:state.matchId,
    expectedRevision:state.revision,
    type,
    payload
  };
}
