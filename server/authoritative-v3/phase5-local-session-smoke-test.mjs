import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalHash} from '../../shared/engine/index.mjs';
import {FateAuthoritativeV3LocalSession} from '../../src/scripts/authoritative-v3-local-session.mjs';
import {
  FateAuthoritativeV3SinglePlayerAdapter,
  createFateV3SinglePlayerState,
  installFateV3SinglePlayerBrowserAdapter,
  isFateV3SinglePlayerExplicitlyEnabled
} from '../../src/scripts/authoritative-v3-single-player-adapter.mjs';
import {
  fateV3CommandsForCard,
  fateV3ScreenCommandLabel
} from '../../src/scripts/authoritative-v3-single-player-screen.mjs';
import {testState} from './test-helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const setupSource = fs.readFileSync(path.join(root, 'src', 'scripts', '04-game-setup.js'), 'utf8');
const aiSource = fs.readFileSync(path.join(root, 'src', 'scripts', '07-ai.js'), 'utf8');
const adapterSource = fs.readFileSync(
  path.join(root, 'src', 'scripts', 'authoritative-v3-single-player-adapter.mjs'),
  'utf8'
);

assert.equal(isFateV3SinglePlayerExplicitlyEnabled('?fateV3SinglePlayer=1'), true);
assert.equal(isFateV3SinglePlayerExplicitlyEnabled('?fateV3SinglePlayer=true'), false);
assert.equal(isFateV3SinglePlayerExplicitlyEnabled('?fateV3SinglePlayer=0'), false);
assert.equal(isFateV3SinglePlayerExplicitlyEnabled('?FATEV3SINGLEPLAYER=1'), false);
assert.equal(isFateV3SinglePlayerExplicitlyEnabled(''), false);
assert.match(
  indexSource,
  /if\(params\.get\('fateV3SinglePlayer'\) !== '1'\) return;\s*import\('\.\/src\/scripts\/authoritative-v3-single-player-adapter\.mjs'\)/,
  'index must import Phase 5 only after the exact single-player opt-in'
);
assert.doesNotMatch(setupSource, /authoritative-v3-single-player-adapter|import\s*\(/);
assert.match(
  setupSource,
  /get\('fateV3SinglePlayer'\) === '1'[\s\S]{0,500}FateAuthorityV3SinglePlayer[\s\S]{0,500}return authority\.startFromLegacyUi/,
  'legacy start must hand off only after the exact Phase 5 flag'
);
assert(
  setupSource.indexOf("get('fateV3SinglePlayer') === '1'")
    < setupSource.indexOf('const keepHowardDevMode'),
  'Phase 5 route ownership must occur before any legacy match-state setup'
);
assert.doesNotMatch(aiSource, /FateAuthorityV3SinglePlayer|authoritative-v3-single-player-adapter/);
assert.doesNotMatch(adapterSource, /\bWebSocket\b|\/v3\/socket|FATE_SERVER_AUTHORITATIVE_V3_ENABLED/);

const disabledWindow = {location:{search:''}};
assert.equal(installFateV3SinglePlayerBrowserAdapter(disabledWindow), null);
assert.equal(disabledWindow.FateAuthorityV3SinglePlayer, undefined);
assert.throws(
  ()=>installFateV3SinglePlayerBrowserAdapter({
    location:{search:'?fateV3SinglePlayer=1&fateV3Recorder=1'}
  }),
  /mutually exclusive/
);

const initialState = testState({matchId:'PHASE5LOCAL'});
const initialHash = canonicalHash(initialState);
const renderViews = [];
const visibleEvents = [];
const adapter = new FateAuthoritativeV3SinglePlayerAdapter({
  state:initialState,
  humanPlayerId:'p0',
  aiPlayerId:'p1',
  render:view=>renderViews.push(view),
  onEvents:events=>visibleEvents.push(...events)
});

assert.equal(adapter.lastView.mode, 'authoritative-v3-single-player');
assert.equal(adapter.lastView.authority, 'shared-engine-local-session');
assert(Array.isArray(adapter.lastView.state.players[0].hand));
assert.equal(adapter.lastView.state.players[1].hand, undefined, 'human projection must hide AI hand');
assert.equal(adapter.lastView.state.players[1].deck, undefined, 'render adapter must not expose canonical AI deck');
assert.equal(canonicalHash(initialState), initialHash, 'adapter construction must not mutate its input state');

const illegalRevision = adapter.session.state.revision;
const illegal = adapter.dispatchHuman('SET_CARD', {
  cardIid:'not-a-real-card',
  destination:{z:0, r:2, c:0}
});
assert.equal(illegal.ok, false);
assert.equal(illegal.rejection.code, 'ILLEGAL_UI_COMMAND');
assert.equal(adapter.session.state.revision, illegalRevision);

const setTemplate = adapter.lastView.legalCommands.find(command=>command.type === 'SET_CARD');
assert(setTemplate, 'human projection must expose a complete SET_CARD interaction');
assert.deepEqual(
  fateV3CommandsForCard(adapter.lastView.legalCommands, setTemplate.payload.cardIid)
    .every(command=>String(command.payload.cardIid || command.payload.sourceIid) === setTemplate.payload.cardIid),
  true
);
assert.match(fateV3ScreenCommandLabel(setTemplate), /^Set card — Zone /);
const setResult = adapter.setCard(
  setTemplate.payload.cardIid,
  setTemplate.payload.destination,
  'phase5-human-set'
);
assert.equal(setResult.ok, true);
assert.equal(setResult.command.type, 'SET_CARD');
assert.equal(adapter.session.state.revision, 1);
assert(renderViews.length >= 2, 'accepted command must publish a new projection to the renderer');
assert.equal(renderViews.at(-1).state.players[1].hand, undefined);
assert.equal(
  adapter.session.state.board[setTemplate.payload.destination.z][setTemplate.payload.destination.r][setTemplate.payload.destination.c]?.iid,
  setTemplate.payload.cardIid
);

const turnState = testState({matchId:'PHASE5AITURN'});
const turnAdapter = new FateAuthoritativeV3SinglePlayerAdapter({
  state:turnState,
  humanPlayerId:'p0',
  aiPlayerId:'p1'
});
assert.equal(turnAdapter.endTurn('phase5-human-end').ok, true);
const aiResult = turnAdapter.runAiTurn({maxCommands:128});
assert.equal(aiResult.ok, true);
assert.equal(turnAdapter.session.state.activePlayer, 0);
assert.equal(turnAdapter.session.state.turn, 3);
const replay = turnAdapter.exportReplay();
assert(replay.commands.some(entry=>entry.playerId === 'p1'), 'AI must submit commands as its own engine actor');
assert(replay.commands.filter(entry=>entry.playerId === 'p1').every(entry=>
  entry.command && typeof entry.command.type === 'string'
));
assert.equal(replay.commands.at(-1).command.type, 'END_TURN');

const recovered = FateAuthoritativeV3LocalSession.recover({
  initialState:turnState,
  replay,
  perspectivePlayerId:'p0'
});
assert.equal(canonicalHash(recovered.state), replay.finalStateHash);
assert.deepEqual(recovered.exportReplay(), replay);
assert.equal(recovered.projectionFor('p0').players[1].hand, undefined);
assert.equal(recovered.projectionFor('p1').players[0].hand, undefined);
assert.equal(recovered.dispatchForPlayer('intruder', 'END_TURN').rejection.code, 'UNAUTHORIZED_PLAYER');
recovered.subscribe(()=>{ throw new Error('renderer exploded'); });
const beforeListenerFailure = recovered.state.revision;
const listenerSafeResult = recovered.dispatchForPlayer('p0', 'END_TURN', {}, 'listener-safe');
assert.equal(listenerSafeResult.ok, true);
assert.equal(recovered.state.revision, beforeListenerFailure + 1);
assert.equal(recovered.listenerErrors.at(-1).message, 'renderer exploded');

const recoveredAdapter = FateAuthoritativeV3SinglePlayerAdapter.recover({
  initialState:turnState,
  replay,
  humanPlayerId:'p0',
  aiPlayerId:'p1'
});
assert.equal(canonicalHash(recoveredAdapter.session.state), replay.finalStateHash);
assert.deepEqual(recoveredAdapter.exportReplay(), replay);
assert.equal(recoveredAdapter.view().state.players[1].hand, undefined);

const fortyCardDeck = Array.from({length:40}, ()=>'32');
const productionLocalState = createFateV3SinglePlayerState({
  matchId:'PHASE5FORTY',
  seed:'phase5-forty',
  landscapeId:'igb1',
  cardDefinitions:[{
    id:'32',
    name:'Temecula Resident',
    type:'Supporter',
    aff:'reality',
    fate:1,
    cost:0,
    rarity:'circle'
  }],
  players:[
    {id:'human', name:'Human', deckIds:fortyCardDeck},
    {id:'ai', name:'AI', deckIds:fortyCardDeck}
  ]
});
assert.equal(productionLocalState.players[0].hand.length, 6);
assert.equal(productionLocalState.players[0].deck.length, 34);
assert.equal(productionLocalState.landscapeId, 'igb1');
assert.throws(
  ()=>createFateV3SinglePlayerState({
    matchId:'PHASE5SHORT',
    cardDefinitions:[],
    players:[
      {id:'human', deckIds:['32']},
      {id:'ai', deckIds:['32']}
    ]
  }),
  /exactly 40/
);

const browserEvents = [];
class FakeCustomEvent {
  constructor(type, options){
    this.type = type;
    this.detail = options?.detail;
  }
}
const browserWindow = {
  location:{search:'?fateV3SinglePlayer=1'},
  CustomEvent:FakeCustomEvent,
  dispatchEvent:event=>browserEvents.push(event),
  getFateGameState:()=>({
    players:[{name:'Browser Human'}, {name:'Browser AI'}],
    p1Deck:fortyCardDeck,
    p2Deck:fortyCardDeck,
    maxTurns:20,
    landscapeId:'igb1'
  }),
  getFateCardDefinitions:()=>[{
    id:'32',
    name:'Temecula Resident',
    type:'Supporter',
    aff:'reality',
    fate:1,
    cost:0,
    rarity:'circle'
  }]
};
const browserApi = installFateV3SinglePlayerBrowserAdapter(browserWindow);
assert.equal(browserApi.enabled, true);
assert.equal(browserApi.legacyGameplayAuthorityChanged, false);
const browserMatch = browserApi.createFromLegacySelection({
  matchId:'PHASE5BROWSER',
  seed:'phase5-browser'
});
assert.equal(browserMatch.view().state.players[0].name, 'Browser Human');
assert.equal(browserMatch.view().state.players[1].hand, undefined);
assert(browserEvents.some(event=>event.type === 'fate-authority-v3-single-player-ready'));
assert(browserEvents.some(event=>event.type === 'fate-authority-v3-single-player-state'));
const browserEnd = browserApi.view().legalCommands.find(command=>command.type === 'END_TURN');
assert.equal(browserApi.dispatch(browserEnd, 'phase5-browser-end').ok, true);
assert(browserEvents.some(event=>event.type === 'fate-authority-v3-single-player-events'));

assert(visibleEvents.every(event=>!Object.hasOwn(event, 'privateTo')));
console.log('authoritative v3 Phase 5 local session smoke test passed');
