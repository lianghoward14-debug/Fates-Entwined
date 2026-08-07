import assert from 'node:assert/strict';

const game = {
  players:[
    {name:'Recorder P1', hand:[{id:'05', iid:'card-05', fate:1}], deck:[], discard:[]},
    {name:'Recorder P2', hand:[], deck:[], discard:[]}
  ],
  board:Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array(3).fill(null))),
  currentPlayer:0,
  turn:1,
  phase:'main',
  seed:'phase0-runtime-seed',
  _serverRngCounter:2
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}){
    this.type = type;
    this.detail = options.detail;
  }
};
globalThis.window = {
  location:{search:'?fateV3Recorder=1'},
  getFateGameState:()=>game,
  dispatchEvent:()=>true
};

await import('../../src/scripts/authoritative-v3-recorder-bridge.mjs?phase0-runtime-test=1');
const bridge = window.FateAuthorityV3LegacyRecorderBridge;
assert(bridge);
assert.equal(bridge.enabled, true);
assert.equal(bridge.mode, 'observe-only');
assert.equal(bridge.authorityRoutingChanged, false);

const card = game.players[0].hand[0];
const token = bridge.beginAIAction({type:'place', card, z:0, r:2, c:0});
const randomSample = Math.random();
game.players[0].hand.splice(0, 1);
game.board[0][2][0] = {...card, owner:0, currentFate:1};
bridge.finishAction(token);

const corpus = bridge.exportCorpus();
assert.equal(corpus.actions.length, 1);
assert.equal(corpus.actions[0].command.type, 'LEGACY_SET_CARD');
assert.equal(corpus.actions[0].preState.state.players[0].hand.length, 1);
assert.equal(corpus.actions[0].expectedPostState.state.players[0].hand.length, 0);
assert.deepStrictEqual(corpus.actions[0].rng.mathRandomSamples, [randomSample]);
assert.notEqual(corpus.actions[0].preStateHash, corpus.actions[0].expectedPostStateHash);

game._onlineRoomCode = 'ONLINE';
assert.equal(
  bridge.beginNamedAction('MUST_NOT_RECORD_ONLINE'),
  null,
  'the legacy corpus recorder must refuse online matches'
);

console.log('authoritative-v3 Phase 0 recorder runtime smoke test passed');
