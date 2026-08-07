import {
  cloneSerializable,
  createInitialState,
  refreshHandLimitRequirement
} from '../../shared/engine/index.mjs';
import {FateAuthoritativeV3SinglePlayerAdapter} from '../../src/scripts/authoritative-v3-single-player-adapter.mjs';
import {FateAuthoritativeV3SinglePlayerScreen} from '../../src/scripts/authoritative-v3-single-player-screen.mjs';

const params = new URLSearchParams(window.location.search || '');
const enabled = params.get('fateV3BrowserCoverage') === '1';
const scenario = String(params.get('scenario') || 'consolidation');
const status = document.getElementById('harness-status');

const DEFINITIONS = [
  {id:'02', name:'Anicka Konvicka', ability:'Starlit Path', type:'Coordinator', aff:'third_great_war', fate:2, cost:1, rarity:'triangle'},
  {id:'05', name:'17th British Regiment', ability:'Liberators of Rwanda', type:'Supporter', aff:'third_great_war', fate:1, cost:0, rarity:'circle'},
  {id:'07', name:'Maja Kaminska', ability:'Oblique Order', type:'Initiator', aff:'third_great_war', fate:3, cost:1, rarity:'star'},
  {id:'21', name:'Henry Dong', ability:'Production Coordinator', type:'Dauntless', aff:'third_great_war', fate:5, cost:2, rarity:'triangle'},
  {id:'27', name:'Kazumi', ability:'Temporal Reflection', type:'Initiator', aff:'eventide', fate:1, cost:1, rarity:'triangle'},
  {id:'31', name:'Oathbound Noble Fighter', ability:'Hemorrhaging Wound', type:'Supporter', aff:'eventide', fate:1, cost:0, rarity:'circle'},
  {id:'32', name:'Temecula Resident', ability:'Wine Country Fanaticism', type:'Supporter', aff:'reality', fate:1, cost:0, rarity:'circle'},
  {id:'93', name:'Wodny Potok Youth', ability:'Snowball Fight', type:'Supporter', aff:'expanded_worlds', fate:1, cost:0, rarity:'circle'},
  {id:'bh01', name:'Anicka Konvicka (Voyager)', ability:'Brave Horizons', type:'Dauntless', aff:'eventide', fate:12, cost:3, rarity:'star'},
  {id:'bh06-token', name:'Adaptive Tactics', ability:'Adaptive Tactics', type:'Supporter', aff:'third_great_war', fate:2, cost:0, rarity:'circle'}
];

window.showScreen = ()=>true;
window.toast = message=>{
  status.dataset.toast = String(message || '');
};
window.FateMatchRendererAdapter = {teardownScene(){}};

function stateFor(id, player0, player1 = ['32'], landscapeId = 'igb1'){
  return createInitialState({
    matchId:`PHASE5-BROWSER-${id.toUpperCase()}`,
    seed:`phase5-browser-${id}`,
    handSize:99,
    activePlayer:0,
    landscapeId,
    cardDefinitions:DEFINITIONS,
    players:[
      {id:'p0', name:'Browser Human', deckIds:player0},
      {id:'p1', name:'Browser AI', deckIds:player1}
    ]
  });
}

function moveToBoard(state, playerIndex, cardId, destination){
  const hand = state.players[playerIndex].hand;
  const index = hand.findIndex(card=>String(card.id) === String(cardId));
  if(index < 0) throw new Error(`missing fixture card ${cardId}`);
  const card = hand.splice(index, 1)[0];
  card.controller = playerIndex;
  state.board[destination.z][destination.r][destination.c] = card;
  return card;
}

function moveToDeck(state, playerIndex, cardId){
  const hand = state.players[playerIndex].hand;
  const index = hand.findIndex(card=>String(card.id) === String(cardId));
  if(index < 0) throw new Error(`missing fixture card ${cardId}`);
  state.players[playerIndex].deck.push(hand.splice(index, 1)[0]);
}

function buildScenario(name){
  if(name === 'consolidation'){
    const state = stateFor(name, ['27', '32']);
    moveToBoard(state, 0, '32', {z:0, r:2, c:0});
    return {state, expected:'CONSOLIDATE_CARD'};
  }
  if(name === 'adaptive'){
    const state = stateFor(name, ['bh06-token']);
    state.players[0].hand[0].counters.adaptiveToken = true;
    return {state, expected:'SET_ADAPTIVE_TOKEN'};
  }
  if(name === 'movement'){
    const state = stateFor(name, ['bh01']);
    moveToBoard(state, 0, 'bh01', {z:0, r:2, c:0});
    return {state, expected:'MOVE_CARD'};
  }
  if(name === 'activation'){
    const state = stateFor(name, ['93'], ['32']);
    moveToBoard(state, 0, '93', {z:0, r:2, c:0});
    moveToBoard(state, 1, '32', {z:1, r:0, c:0});
    return {state, expected:'ACTIVATE_EFFECT'};
  }
  if(name === 'hand-limit'){
    const state = stateFor(name, ['05', '31', '32']);
    state.baseHandLimit = 2;
    refreshHandLimitRequirement(state);
    return {state, expected:'DISCARD_TO_HAND_LIMIT'};
  }
  if(name === 'landscape'){
    const state = stateFor(name, ['05', '31', '32'], ['32'], 'igb16');
    moveToBoard(state, 0, '32', {z:0, r:2, c:0});
    return {state, expected:'ACTIVATE_LANDSCAPE'};
  }
  if(name === 'geometry'){
    const state = stateFor(name, ['02', '32']);
    moveToBoard(state, 0, '32', {z:0, r:2, c:0});
    return {state, expected:'CONSOLIDATE_CARD'};
  }
  if(name === 'multi-card'){
    const state = stateFor(name, ['07', '05', '31', '32', '32']);
    moveToBoard(state, 0, '32', {z:0, r:2, c:0});
    moveToDeck(state, 0, '05');
    moveToDeck(state, 0, '31');
    moveToDeck(state, 0, '32');
    return {state, expected:'CONSOLIDATE_CARD'};
  }
  if(name === 'multi-square'){
    const state = stateFor(name, ['21', '32', '05']);
    moveToBoard(state, 0, '32', {z:0, r:2, c:0});
    moveToBoard(state, 0, '05', {z:0, r:2, c:1});
    return {state, expected:'CONSOLIDATE_CARD'};
  }
  if(name === 'resume'){
    const initialState = stateFor(name, ['32', '05']);
    const first = new FateAuthoritativeV3SinglePlayerAdapter({
      state:initialState,
      humanPlayerId:'p0',
      aiPlayerId:'p1'
    });
    const set = first.view().legalCommands.find(command=>command.type === 'SET_CARD');
    if(!set || !first.dispatchLegalCommand(set, 'browser-harness-resume-seed').ok){
      throw new Error('resume fixture could not seed its replay');
    }
    return {
      initialState:cloneSerializable(initialState),
      replay:first.exportReplay(),
      expected:'SET_CARD',
      resumed:true
    };
  }
  throw new Error(`unknown browser coverage scenario ${name}`);
}

function updateStatus(adapter, metadata = {}){
  const view = adapter.view();
  const commandTypes = [...new Set(view.legalCommands.map(command=>command.type))].sort();
  const extraSquares = view.state.geometry?.playableExtraSquares?.length || 0;
  status.dataset.state = 'ready';
  status.dataset.scenario = scenario;
  status.dataset.revision = String(view.state.revision);
  status.dataset.lastCommand = String(metadata.lastCommand || status.dataset.lastCommand || '');
  status.dataset.prompt = String(view.state.pendingPrompt?.type || '');
  status.dataset.handLimit = String(view.state.pendingHandLimit?.required || 0);
  status.dataset.extraSquares = String(extraSquares);
  status.textContent = [
    `scenario=${scenario}`,
    `revision=${view.state.revision}`,
    `lastCommand=${status.dataset.lastCommand}`,
    `prompt=${status.dataset.prompt}`,
    `handLimit=${status.dataset.handLimit}`,
    `extraSquares=${extraSquares}`,
    `legal=${commandTypes.join(',')}`
  ].join('\n');
}

function mountFixture(fixture){
  let screen = null;
  let adapter;
  const callbacks = {
    render(view){
      screen?.render(view);
      if(adapter) updateStatus(adapter);
    },
    onEvents(_events, metadata){
      updateStatus(adapter, {lastCommand:metadata?.command?.type});
    }
  };
  if(fixture.resumed){
    adapter = FateAuthoritativeV3SinglePlayerAdapter.recover({
      initialState:fixture.initialState,
      replay:fixture.replay,
      humanPlayerId:'p0',
      aiPlayerId:'p1',
      ...callbacks
    });
    document.body.dataset.resumed = 'true';
  }else{
    adapter = new FateAuthoritativeV3SinglePlayerAdapter({
      state:fixture.state,
      humanPlayerId:'p0',
      aiPlayerId:'p1',
      ...callbacks
    });
  }
  screen = new FateAuthoritativeV3SinglePlayerScreen({
    windowRef:window,
    adapter,
    cardDefinitions:DEFINITIONS,
    onExit(){}
  }).mount();
  updateStatus(adapter);
  window.FateAuthorityV3BrowserCoverageHarness = Object.freeze({
    enabled:true,
    scenario,
    expectedCommandType:fixture.expected,
    authorityRoutingChanged:false,
    adapter,
    screen
  });
}

if(!enabled){
  status.dataset.state = 'disabled';
  status.textContent = 'Exact fateV3BrowserCoverage=1 flag required';
}else{
  try{
    mountFixture(buildScenario(scenario));
  }catch(error){
    status.dataset.state = 'failed';
    status.textContent = String(error?.stack || error);
    throw error;
  }
}
