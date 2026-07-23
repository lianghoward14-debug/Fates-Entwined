'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  canonicalStateHash,
  reduceServerAction
} = require('./fate-authority-reducer.js');

const root = path.resolve(__dirname, '..');
const read = relative=>fs.readFileSync(path.join(root, relative), 'utf8');
const transactionSource = read('src/scripts/18a-online-effect-transactions.js');
const onlineSource = read('src/scripts/18-online-rooms.js');
const indexSource = read('index.html');

assert.match(
  indexSource,
  /18-online-rooms\.js[^'"]*['"][\s\S]*18a-online-effect-transactions\.js[^'"]*['"][\s\S]*19-online-elo\.js/,
  'the reversible effect transaction layer must load immediately after online rooms'
);
assert.match(
  onlineSource,
  /FateOnlineEffectTransactions[\s\S]*prepare\(type, outbound, clientActionId\)[\s\S]*begin\(preparedEffectTransaction\)[\s\S]*waitForCompletion\(activeEffectTransaction, localResult\)/,
  'online actions must opt into the isolated transaction lifecycle before state capture'
);
assert.match(
  onlineSource,
  /\(!clientOwnedEffectBoardAction \|\| coordinatedEffectBoardAction\) && needsAuthorityCatchupBeforeLocal\(type\)/,
  'coordinated effects must catch up authoritative actions before local resolution'
);
assert.match(
  onlineSource,
  /online-action-blocked-by-effect-transaction[\s\S]*Finish the current effect choice first/,
  'other gameplay actions must not interleave with an active effect transaction'
);
assert.match(
  onlineSource,
  /periodic-hash-check-deferred-for-effect-transaction/,
  'periodic drift repair must not replace local state while an effect choice is open'
);
assert.match(
  onlineSource,
  /fate-online-effect-transaction-finished[\s\S]*accepted-authority-action-deferred-for-effect-transaction/,
  'authoritative actions must remain buffered until the active effect transaction commits'
);
assert.match(
  onlineSource,
  /effectTransactionManager\.rebasePostState\([\s\S]*effectTransactionRebased = true/,
  'a stale effect commit must three-way rebase its resolved draw/search state instead of discarding it'
);
assert.match(
  onlineSource,
  /function compactOnlineCard[\s\S]*_onlineEffectActivationSubmitPending/,
  'the local activation submission lock must never enter canonical multiplayer state'
);
assert.match(
  onlineSource,
  /__fateSendEffectActivationCinematic[\s\S]*captureActivationCinematic\(\{[\s\S]*return true;[\s\S]*sendAction\('EFFECT_CINEMATIC'/,
  'a coordinated activation must keep its cinematic inside the parent transaction instead of sending an intermediate authority action'
);
assert.match(
  onlineSource,
  /transactionOwnsPicker = opts\?\.onlineParentAction === true[\s\S]*effectTransactions\.isActive\(\)[\s\S]*opts\?\.onlineParentAction === true && \(g\?\._onlineClientOwnedBoardActionPickerDepth > 0 \|\| transactionOwnsPicker\)[\s\S]*originals\.pickCardsVisual/,
  'a delayed card-search picker must remain owned by its active parent transaction after the temporary picker-depth scope ends'
);
assert.match(
  transactionSource,
  /function openAfterPresentationIdle[\s\S]*presenter\.waitForIdle\(\{[\s\S]*minQuietMs:110[\s\S]*transactionPickCardsVisual[\s\S]*openAfterPresentationIdle/,
  'effect-owned pickers must wait for the shared presentation pipeline before opening'
);
assert.match(
  transactionSource,
  /transactionCardGallery[\s\S]*openAfterPresentationIdle[\s\S]*withPickerConstruction[\s\S]*original\.apply/,
  'presentation-only card galleries must wait as one unit without becoming a nested authority choice'
);

function wait(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

async function testNestedPickerTransaction(){
  let currentModalActions = [];
  let cardConfirm = null;
  const sourceCard = {
    id:'03',
    iid:'source-1',
    name:'Howard',
    type:'Initiator',
    owner:0,
    effectUsedInitial:false
  };
  const sandbox = {
    console,
    Promise,
    Date,
    Math,
    Number,
    String,
    Array,
    Set,
    Map,
    Object,
    Error,
    setTimeout,
    clearTimeout,
    globalThis:null,
    window:{
      G:{
        _onlineRoomCode:'ABC123',
        _onlinePlayerIndex:0,
        currentPlayer:0,
        players:[
          {deck:[], hand:[], discard:[]},
          {deck:[], hand:[], discard:[]}
        ],
        board:[[[sourceCard]]]
      },
      addEventListener(){},
      __fateOnlineEffectTransactionState:{
        capture(){
          return JSON.parse(JSON.stringify(sandbox.window.G));
        },
        hash(state){
          return JSON.stringify(state);
        }
      },
      showModal(title, body, actions){
        currentModalActions = actions;
      },
      pickCardsVisual(cards, opts, onConfirm){
        cardConfirm = onConfirm;
      },
      showBoardTargetPicker(opts, onConfirm){
        this.showModal('Board Target', '', [{
          label:'Confirm',
          action(){
            return onConfirm([opts.entries[0]]);
          }
        }]);
      },
      closeModal(){}
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(transactionSource, sandbox, {filename:'18a-online-effect-transactions.js'});
  const api = sandbox.window.FateOnlineEffectTransactions;
  api.installPickerBridges();

  const payload = {
    fn:'triggerCharacterEffect',
    z:0,
    r:0,
    c:0,
    source:{z:0, r:0, c:0, card:{id:'03', iid:'source-1'}}
  };
  const descriptor = api.prepare('BOARD_ACTION', payload, 'board-action-1');
  assert.equal(payload.effectTransactionVersion, 1);
  const transaction = api.begin(descriptor);
  assert.equal(
    api.captureActivationCinematic({z:0, r:0, c:0, card:{id:'03', iid:'source-1'}}),
    true,
    'the parent transaction must own its activation cinematic'
  );
  assert.equal(
    payload.effectCinematic.card.iid,
    'source-1',
    'transaction-owned cinematics must travel with the completed effect'
  );
  const capturedOverlay = {
    type:'CARD_EFFECT_FLASH',
    eventId:'overlay-1',
    playerIndex:0,
    target:{iid:'target-1', z:0, r:0, c:0},
    kind:'test-overlay',
    localActorAlreadyPresented:true
  };
  assert.equal(api.capturePresentationEvent(capturedOverlay), true);
  assert.equal(payload.presentationEvents.length, 1, 'presentation must travel with its parent effect transaction');

  sandbox.window.showModal('Choose Mode', '', [{
    label:'Continue',
    action(){
      sandbox.window.pickCardsVisual(
        [{id:'target', iid:'target-1'}],
        {title:'Choose Target'},
        function(){
          sourceCard.effectUsedInitial = true;
          sourceCard._effectTurnLocked = true;
        }
      );
    }
  }]);

  let completed = false;
  const completion = api.waitForCompletion(transaction, Promise.resolve('resolved')).then(value=>{
    completed = true;
    return value;
  });
  await wait(100);
  assert.equal(completed, false, 'the parent action must wait while its first modal is open');

  currentModalActions[0].action();
  await wait(100);
  assert.equal(completed, false, 'a nested card picker must keep the same parent action open');
  assert.equal(typeof cardConfirm, 'function');

  cardConfirm([{id:'target', iid:'target-1'}]);
  assert.equal(await completion, 'resolved');
  assert.equal(completed, true);
  assert.equal(payload.effectSourceId, '03');
  assert.equal(payload.effectSourceType, 'Initiator');
  assert.equal(payload.presentationEvents[0].eventId, 'overlay-1');
  assert.equal(payload.effectTransactionDurationMs >= 0, true);
  assert.equal(api.snapshot().localResolved, true, 'local resolution must remain locked until authority commits it');
  const localResolvedState = JSON.parse(JSON.stringify(sandbox.window.G));
  const concurrentRemoteState = JSON.parse(JSON.stringify(localResolvedState));
  concurrentRemoteState.board[0][0][0].effectUsedInitial = false;
  delete concurrentRemoteState.board[0][0][0]._effectTurnLocked;
  concurrentRemoteState.players[1].hand.push({id:'remote-card', iid:'remote-card-1'});
  const rebased = api.rebasePostState(transaction, concurrentRemoteState, localResolvedState);
  assert.equal(rebased.ok, true, 'independent remote state must rebase into a locally resolved effect');
  assert.equal(rebased.state.board[0][0][0].effectUsedInitial, true);
  assert.equal(rebased.state.players[1].hand[0].iid, 'remote-card-1');
  assert.equal(api.commitAuthority(transaction), true);
  assert.equal(api.snapshot(), null, 'authority-committed transactions must release their activation lock');
  assert.equal(
    api.captureActivationCinematic({z:0, r:0, c:0}),
    false,
    'cinematics outside a transaction must retain the legacy standalone path'
  );

  const boardPayload = {
    fn:'triggerCharacterEffect',
    z:0,
    r:0,
    c:0,
    source:{z:0, r:0, c:0, card:{id:'03', iid:'source-1'}}
  };
  const boardTransaction = api.begin(api.prepare('BOARD_ACTION', boardPayload, 'board-action-2'));
  let releasePresentation = null;
  sandbox.window.FateActionPresentation = {
    waitForIdle(){
      return new Promise(resolve=>{ releasePresentation = resolve; });
    }
  };
  currentModalActions = [];
  let asyncBoardCallbackFinished = false;
  sandbox.window.showBoardTargetPicker({
    title:'Async Board Choice',
    entries:[{card:{id:'target'}, z:0, r:0, c:0}]
  }, async function(){
    await wait(80);
    asyncBoardCallbackFinished = true;
  });
  let boardTransactionFinished = false;
  const boardCompletion = api.waitForCompletion(boardTransaction, Promise.resolve()).then(()=>{
    boardTransactionFinished = true;
  });
  await wait(30);
  assert.equal(currentModalActions.length, 0, 'the board picker must not overlap an active presentation');
  releasePresentation();
  await wait(30);
  assert.equal(currentModalActions.length, 1, 'the board picker must open after presentation becomes idle');
  currentModalActions[0].action();
  await wait(30);
  assert.equal(boardTransactionFinished, false, 'ignored picker callback return values must not end the parent transaction early');
  await boardCompletion;
  assert.equal(asyncBoardCallbackFinished, true);
  api.commitAuthority(boardTransaction);

  sandbox.window.FateActionPresentation = null;
  const searchPayload = {
    fn:'activatePendingWhenSetEffect',
    source:{z:0, r:0, c:0, card:{id:'60', iid:'ib-student-1'}}
  };
  const searchTransaction = api.begin(api.prepare('BOARD_ACTION', searchPayload, 'board-action-search'));
  sandbox.window.pickCardsVisual(
    [{id:'target', iid:'searched-card-1'}],
    {title:'Search', opponentSearch:true, searchSourceCardId:'60'},
    function(){}
  );
  assert.equal(searchPayload.opponentSearch, undefined, 'opening a picker must not claim that a search completed');
  assert.equal(searchPayload.searchCompleted, undefined, 'opening a picker must not arm Boleslaw before a card is chosen');
  const searchCompletion = api.waitForCompletion(searchTransaction, Promise.resolve());
  cardConfirm([{id:'target', iid:'searched-card-1'}]);
  assert.equal(searchPayload.opponentSearch, true, 'a completed transaction-owned search must mark the parent authority action');
  assert.equal(searchPayload.searchCompleted, true, 'a completed transaction-owned search must record successful selection');
  assert.equal(searchPayload.searchSourceCardId, '60', 'transaction-owned searches must preserve their source identity');
  assert.deepEqual(searchPayload.searchedCardIids, ['searched-card-1'], 'transaction-owned searches must preserve the chosen card identity');
  await searchCompletion;
  api.commitAuthority(searchTransaction);
}

function baseState(){
  return {
    v:2,
    players:[
      {name:'P1', color:'blue', deck:[], hand:[], discard:[]},
      {name:'P2', color:'red', deck:[], hand:[], discard:[]}
    ],
    board:[
      [
        [
          {id:'03', iid:'source-1', name:'Howard', type:'Initiator', owner:0, currentFate:2, effectUsedInitial:false},
          {id:'56', iid:'lydia-1', name:'Lydia', type:'Improvisor', owner:1, currentFate:2, usesLeft:3},
          {id:'05', iid:'target-1', name:'Target', type:'Initiator', owner:1, currentFate:4}
        ]
      ],
      [[]],
      [[]]
    ],
    currentPlayer:0,
    turn:3,
    phase:'main'
  };
}

function activationMessage(preState, postState, transactional){
  const payload = {
    actionKind:'BOARD_ACTION',
    fn:'triggerCharacterEffect',
    playerIndex:0,
    z:0,
    r:0,
    c:0,
    source:{z:0, r:0, c:0, card:{id:'03', iid:'source-1', name:'Howard'}},
    baseStateHash:canonicalStateHash(preState),
    stateHash:canonicalStateHash(postState),
    postState
  };
  if(transactional){
    payload.effectTransactionId = 'effect-tx-v1:ABC123:board-action-1:1';
    payload.effectTransactionVersion = 1;
    payload.effectSourceId = '03';
    payload.effectSourceType = 'Initiator';
    payload.effectRuleType = 'Initiator';
  }
  return {type:'ACTION_RESULT', payload};
}

function testAuthorityReactionBoundary(){
  const preState = baseState();
  const postState = JSON.parse(JSON.stringify(preState));
  postState.board[0][0][0].effectUsedInitial = true;
  postState.board[0][0][0]._effectTurnLocked = true;
  postState.board[0][0][2].currentFate = 13;
  const event = {
    type:'CARD_EFFECT_FLASH',
    eventId:'howard-overlay-1',
    playerIndex:0,
    target:{iid:'target-1', z:0, r:0, c:2},
    kind:'test-overlay',
    localActorAlreadyPresented:true
  };
  const room = {
    canonicalState:preState,
    canonicalHash:canonicalStateHash(preState)
  };

  const transactionalMessage = activationMessage(preState, postState, true);
  transactionalMessage.payload.presentationEvents = [event];
  const transactional = reduceServerAction(
    room,
    transactionalMessage,
    {requireBaseHash:true}
  );
  assert.equal(transactional.ok, true);
  assert.equal(transactional.reactionArmed, true, 'transactional manual activation must arm Lydia');
  assert.equal(transactional.canonicalState.board[0][0][2].currentFate, 13, 'accepted optimistic effect must remain visible during the reaction');
  assert.equal(transactional.canonicalState._serverPendingReaction.actionType, 'initiator_effect');
  assert.equal(transactional.canonicalState._serverPendingReaction.options[0].kind, 'lydia');
  assert.equal(transactional.canonicalState._serverPendingReaction.preEffectState.board[0][0][2].currentFate, 4);
  assert.equal(transactional.suppressPresentationEvents, true, 'the icon overlay must wait for the reaction result');

  const pendingRoom = {
    canonicalState:transactional.canonicalState,
    canonicalHash:transactional.canonicalHash
  };
  const negated = reduceServerAction(pendingRoom, {
    type:'REACTION_CHOICE',
    payload:{
      playerIndex:1,
      promptId:transactional.canonicalState._serverPendingReaction.promptId,
      choice:'negate',
      optionIndex:0
    }
  }, {requireBaseHash:true});
  assert.equal(negated.ok, true);
  assert.equal(negated.canonicalState.board[0][0][2].currentFate, 4);
  assert.equal(negated.canonicalState.board[0][0][0].effectUsedInitial, true);
  assert.equal(negated.canonicalState.board[0][0][0]._effectNegatedByReaction, true);
  assert.equal(negated.canonicalState.board[0][0][1].usesLeft, 2);
  assert.equal(Array.isArray(negated.presentationEvents) ? negated.presentationEvents.length : 0, 0, 'negated effects must not publish their captured overlay');

  const secondTransactional = reduceServerAction(
    room,
    transactionalMessage,
    {requireBaseHash:true}
  );
  const allowed = reduceServerAction({
    canonicalState:secondTransactional.canonicalState,
    canonicalHash:secondTransactional.canonicalHash
  }, {
    type:'REACTION_CHOICE',
    payload:{
      playerIndex:1,
      promptId:secondTransactional.canonicalState._serverPendingReaction.promptId,
      choice:'allow'
    }
  }, {requireBaseHash:true});
  assert.equal(allowed.ok, true);
  assert.equal(allowed.canonicalState.board[0][0][2].currentFate, 13, 'allowing the reaction must retain the Fate gain');
  assert.equal(allowed.presentationEvents[0].eventId, 'howard-overlay-1', 'the accepted effect must release its captured overlay');

  const legacy = reduceServerAction(
    room,
    activationMessage(preState, postState, false),
    {requireBaseHash:true}
  );
  assert.equal(legacy.ok, true);
  assert.equal(legacy.reactionArmed, true, 'shared activation metadata must keep Lydia coverage even for a client without transaction annotations');
  assert.equal(legacy.canonicalState.board[0][0][2].currentFate, 13);
}

function testBritishFateGainWithoutReaction(){
  const preState = baseState();
  preState.board[0][0] = [
    {
      id:'05',
      iid:'british-1',
      name:'17th British Regiment of Africa',
      type:'Supporter',
      owner:0,
      currentFate:2,
      whenSetActivated:false,
      _pendingWhenSetEffect:{z:0, r:0, c:0, owner:0, turnQueued:3}
    },
    {id:'09', iid:'target-1', name:'Target', type:'Supporter', owner:0, currentFate:4}
  ];
  const postState = JSON.parse(JSON.stringify(preState));
  postState.board[0][0][0].whenSetActivated = true;
  delete postState.board[0][0][0]._pendingWhenSetEffect;
  postState.board[0][0][1].currentFate = 7;
  const payload = {
    actionKind:'BOARD_ACTION',
    fn:'activatePendingWhenSetEffect',
    playerIndex:0,
    z:0,
    r:0,
    c:0,
    source:{z:0, r:0, c:0, card:{id:'05', iid:'british-1'}},
    effectTransactionId:'effect-tx-v1:ABC123:british:1',
    effectTransactionVersion:1,
    effectSourceId:'05',
    effectSourceType:'Supporter',
    effectRuleType:'Supporter',
    presentationEvents:[{
      type:'CARD_EFFECT_FLASH',
      eventId:'british-overlay-1',
      playerIndex:0,
      target:{iid:'target-1', z:0, r:0, c:1},
      kind:'british_union_jack',
      localActorAlreadyPresented:true
    }],
    baseStateHash:canonicalStateHash(preState),
    stateHash:canonicalStateHash(postState),
    postState
  };
  const result = reduceServerAction({
    canonicalState:preState,
    canonicalHash:canonicalStateHash(preState)
  }, {type:'ACTION_RESULT', payload}, {requireBaseHash:true});
  assert.equal(result.ok, true);
  assert.equal(result.reactionArmed, undefined);
  assert.equal(result.canonicalState.board[0][0][1].currentFate, 7, '17th British Fate gain must survive authority validation');
}

function testBoleslawFromTransactionalSearch(){
  const searchedCard = {id:'24', iid:'searched-supporter', name:'Supporter', type:'Supporter', owner:0, currentFate:1};
  const boleslawDraw = {id:'32', iid:'boleslaw-draw', name:'Drawn Card', type:'Supporter', owner:1, currentFate:1};
  const preState = {
    v:2,
    players:[
      {name:'P1', color:'blue', deck:[searchedCard], hand:[], discard:[]},
      {name:'P2', color:'red', deck:[boleslawDraw], hand:[], discard:[]}
    ],
    board:[[
      [
        {
          id:'60',
          iid:'ib-student-1',
          name:'IB Student',
          type:'Supporter',
          owner:0,
          currentFate:1,
          whenSetActivated:false,
          _pendingWhenSetEffect:{z:0, r:0, c:0, owner:0, turnQueued:3}
        },
        {id:'86', iid:'boleslaw-1', name:'Boleslaw Kopewicz', type:'Improvisor', owner:1, currentFate:2}
      ]
    ], [[]], [[]]],
    currentPlayer:0,
    turn:3,
    phase:'main'
  };
  const postState = JSON.parse(JSON.stringify(preState));
  postState.players[0].deck = [];
  postState.players[0].hand = [JSON.parse(JSON.stringify(searchedCard))];
  postState.board[0][0][0].whenSetActivated = true;
  delete postState.board[0][0][0]._pendingWhenSetEffect;
  const payload = {
    actionKind:'BOARD_ACTION',
    fn:'activatePendingWhenSetEffect',
    playerIndex:0,
    z:0,
    r:0,
    c:0,
    source:{z:0, r:0, c:0, card:{id:'60', iid:'ib-student-1'}},
    effectTransactionId:'effect-tx-v1:ABC123:ib-search:1',
    effectTransactionVersion:1,
    effectSourceId:'60',
    effectSourceType:'Supporter',
    effectRuleType:'Supporter',
    opponentSearch:true,
    searchSourceCardId:'60',
    baseStateHash:canonicalStateHash(preState),
    stateHash:canonicalStateHash(postState),
    postState
  };
  const result = reduceServerAction({
    canonicalState:preState,
    canonicalHash:canonicalStateHash(preState)
  }, {type:'ACTION_RESULT', payload}, {requireBaseHash:true});
  assert.equal(result.ok, true);
  assert.equal(result.canonicalState.players[0].hand[0].iid, 'searched-supporter');
  assert.equal(result.canonicalState.players[1].hand[0].iid, 'boleslaw-draw', 'Boleslaw must draw from an IB Student search inside the parent transaction');
  assert.equal(result.canonicalState.board[0][0][1].currentFate, 5, 'Boleslaw must gain 3 Fate from the transactional search');
}

(async function main(){
  await testNestedPickerTransaction();
  testAuthorityReactionBoundary();
  testBritishFateGainWithoutReaction();
  testBoleslawFromTransactionalSearch();
  console.log('Online effect transaction smoke test passed.');
})().catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
