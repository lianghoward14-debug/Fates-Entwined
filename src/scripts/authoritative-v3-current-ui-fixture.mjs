import {
  createInitialState,
  legalCommandTemplates,
  projectStateForPlayer,
  reduceCommand
} from '../../shared/engine/index.mjs';

const params = new URLSearchParams(globalThis.location?.search || '');
if(params.get('fateV3CurrentUiFixture') !== '1'){
  throw new Error('Phase 7 current UI fixture requires its exact test flag');
}
globalThis.__fateDailyLoginPromptedThisSession = true;
for(const delay of [0, 250, 750]){
  setTimeout(()=>{
    if(globalThis.document?.querySelector('#modal .modal.daily-login-modal')) globalThis.closeModal?.();
  }, delay);
}

const definitions = globalThis.getFateCardDefinitions?.() || [];
const playable = definitions.filter(card=>card && card.id && !/^token/i.test(String(card.id)));
if(playable.length < 20) throw new Error('Card definitions are unavailable for the current UI fixture');
const deckIds = Array.from({length:40}, (_, index)=>String(playable[index % playable.length].id));
let fixtureState = createInitialState({
  matchId:'PHASE7UIFIXTURE',
  seed:'phase7-current-ui-fixture',
  landscapeId:String(params.get('fixtureLandscape') || 'igb15'),
  players:[
    {id:'fixture-player-0', name:'Current UI — Player 1', deckIds},
    {id:'fixture-player-1', name:'Current UI — Player 2', deckIds:[...deckIds].reverse()}
  ],
  cardDefinitions:definitions
});
let fixtureScreen = null;
let commandCounter = 0;
const fixturePlayerIndex = params.get('fixturePlayer') === '1' ? 1 : 0;
let lastFixtureCommand = '';

function publishFixtureStatus(){
  const root = globalThis.document?.documentElement;
  if(!root) return;
  const player = fixtureState.players[fixturePlayerIndex];
  root.dataset.phase7FixturePlayer = String(fixturePlayerIndex);
  root.dataset.phase7FixtureActivePlayer = String(fixtureState.activePlayer);
  root.dataset.phase7FixtureRevision = String(fixtureState.revision);
  root.dataset.phase7FixtureHandCount = String(player.hand.length);
  root.dataset.phase7FixtureDeckCount = String(player.deck.length);
  root.dataset.phase7FixtureLastCommand = lastFixtureCommand;
}

if(params.get('fixtureActivation') === '1'){
  fixtureState.activePlayer = fixturePlayerIndex;
  const player = fixtureState.players[fixturePlayerIndex];
  const sourcePile = ['hand', 'deck'].find(pile=>player[pile].some(card=>String(card.id) === '27'));
  const sourceIndex = sourcePile ? player[sourcePile].findIndex(card=>String(card.id) === '27') : -1;
  if(sourceIndex < 0) throw new Error('Phase 7 activation fixture requires card 27');
  const [source] = player[sourcePile].splice(sourceIndex, 1);
  source.owner = fixturePlayerIndex;
  source.controller = fixturePlayerIndex;
  fixtureState.board[0][fixturePlayerIndex === 0 ? 2 : 0][0] = source;
}

function view(){
  publishFixtureStatus();
  return {
    mode:'server-authoritative-v3-phase7-current-ui-fixture',
    playerId:'fixture-player-' + fixturePlayerIndex,
    playerIndex:fixturePlayerIndex,
    aiPlayerId:'fixture-player-' + (1 - fixturePlayerIndex),
    aiPlayerIndex:1 - fixturePlayerIndex,
    state:projectStateForPlayer(fixtureState, fixturePlayerIndex),
    legalCommands:legalCommandTemplates(fixtureState, fixturePlayerIndex)
  };
}

const adapter = {
  view,
  async dispatchLegalCommand(template){
    commandCounter += 1;
    lastFixtureCommand = String(template?.type || '');
    const result = reduceCommand(fixtureState, {
      commandId:'fixture-command-' + commandCounter,
      matchId:fixtureState.matchId,
      expectedRevision:fixtureState.revision,
      type:template.type,
      payload:template.payload || {}
    }, {playerId:'fixture-player-' + fixturePlayerIndex, playerIndex:fixturePlayerIndex});
    if(!result.ok) return result;
    fixtureState = result.state;
    publishFixtureStatus();
    fixtureScreen?.render(view());
    return {ok:true, state:view().state, legalCommands:view().legalCommands};
  }
};

const bridge = globalThis.FatePhase7CurrentMultiplayerUi;
if(!bridge?.mount) throw new Error('Current multiplayer UI bridge did not load');
fixtureScreen = bridge.mount({
  adapter,
  onExit(){ globalThis.showScreen?.('s-title'); }
});
globalThis.__fatePhase7CurrentUiFixture = Object.freeze({
  view,
  report(){ return bridge.report(); }
});
