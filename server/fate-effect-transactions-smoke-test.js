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
const gameplaySource = read('src/scripts/05-gameplay-core.js');
const renderingSource = read('src/scripts/06-rendering-and-helpers.js');
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
  /if\(coordinatedEffectBoardAction\)\{\s*return applyLocalAndSend\(\);\s*\}/,
  'coordinated effects must enter local resolution immediately and serialize their completed state afterward'
);
assert.doesNotMatch(
  onlineSource,
  /settleEffectTransactionAuthorityBase|effectTransactionAuthorityBaseReadyNow|optimisticSendDepth/,
  'the retired pre-activation authority wait must not remain beside the transaction path'
);
assert.match(
  onlineSource,
  /function sendAuthorityNow\(retryInsideCurrentQueue\)[\s\S]*retryInsideCurrentQueue === true[\s\S]*performSend\(\)[\s\S]*enqueueOptimisticSend\(performSend\)[\s\S]*sendAuthorityNow\(true\)/,
  'a stale-base retry must run inside its existing send slot instead of deadlocking behind itself'
);
assert.match(
  onlineSource,
  /function sendMoreBoardCardsAuthoritySyncNow[\s\S]*effectTransactions\.isBusy\(\)[\s\S]*deferred-during-effect-transaction/,
  'background board repair commits must defer while an effect is reserved or active'
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
assert.match(
  transactionSource,
  /const BOARD_CONTINUATION_KEYS[\s\S]*_markSelecting[\s\S]*_wolfCreekMoving[\s\S]*function ownsBoardContinuation[\s\S]*function sourceResolutionPending[\s\S]*_pendingWhenSetActivationInFlight === true[\s\S]*_effectActivationInFlight === true[\s\S]*function maybeFinish[\s\S]*ownsBoardContinuation\(gameState\(\)\) \|\| sourceResolutionPending\(tx\)/,
  'board-targeting continuations and actual source execution flags must remain part of the parent effect transaction'
);
const sourceResolutionSection = transactionSource.slice(
  transactionSource.indexOf('function sourceResolutionPending'),
  transactionSource.indexOf('function maybeFinish')
);
assert.doesNotMatch(
  sourceResolutionSection,
  /_pendingWhenSetEffect|effectUsedInitial/,
  'unused effect availability must not be mistaken for an effect that is still executing'
);
assert.match(
  onlineSource,
  /function onlineBoardEffectActivationBlockReason[\s\S]{0,1800}isCardSupporterForRules[\s\S]{0,500}canActivateLandscapeSupporterEffect[\s\S]{0,400}Snow on the Carpathians/,
  'Snow must reject a blocked deferred Supporter effect before an online transaction starts'
);
assert.match(
  gameplaySource,
  /window\.canActivateLandscapeSupporterEffect = canActivateLandscapeSupporterEffect/,
  'the shared Snow permission check must be available to online preflight validation'
);
assert.match(
  transactionSource,
  /function gameState\(\)[\s\S]{0,240}root\.getFateGameState[\s\S]{0,160}root\.FATE_GAME_STATE/,
  'the transaction layer must read the real lexical game state through its public bridge'
);
assert.doesNotMatch(
  transactionSource,
  /return root\.G \|\| null/,
  'the transaction layer must not create a shadow window.G dependency'
);
assert.match(
  onlineSource,
  /effectTransactions\.mergeIncomingState\([\s\S]*captureOnlineCanonicalState\(g\)[\s\S]*effect-transaction-authoritative-state-merged/,
  'authoritative refreshes must three-way merge through an active local effect instead of replacing it'
);
assert.match(
  onlineSource,
  /cancelActive\(msg\.reason[\s\S]{0,500}clearOnlineClientEffectPending\(gameState\(\), 'authority rejection rollback', \{force:true\}\)[\s\S]{0,300}applyOnlineCanonicalState\(msg\.serverState/,
  'authority rejection must cancel and clear the transaction-owned selector before applying its rollback state'
);
assert.match(
  onlineSource,
  /const absentInteractionDefaults = \{[\s\S]*_wolfCreekMoving:null[\s\S]*_busserMovingCard:null[\s\S]*_markSelecting:null[\s\S]*if\(!Object\.prototype\.hasOwnProperty\.call\(state, key\)\)/,
  'an omitted authoritative interaction field must clear stale client selectors'
);
assert.match(
  onlineSource,
  /collectOnlineCardObjectPool\(g\)[\s\S]*syncOnlinePlayersInPlace\([\s\S]*onlineCardObjectPool[\s\S]*syncOnlineBoardInPlace\([\s\S]*onlineCardObjectPool/,
  'authoritative refreshes must preserve live card object identity across zones while an effect is resolving'
);
assert.doesNotMatch(
  onlineSource,
  /onlineSubmittedEffectActivations|fateOnlineEffectActivationWasSubmitted|rememberOnlineEffectActivation/,
  'the premature legacy effect-submission latch must stay removed'
);
assert.match(
  onlineSource,
  /effectTransactions\.ownsBoardContinuation\(g\)[\s\S]*originals\.clickCell\.apply/,
  'effect-owned board target clicks must resolve locally inside their parent transaction'
);
assert.match(
  onlineSource,
  /window\[fnName\] = function\(\)\{[\s\S]{0,900}effectTransactions\.snapshot\(\)[\s\S]{0,260}parentEffectTransaction\.localResolved !== true[\s\S]{0,180}return originals\[fnName\]\.apply\(this, arguments\);[\s\S]{0,180}const g = gameState\(\)/,
  'every nested board operation must remain inside its still-resolving parent effect transaction'
);
assert.match(
  renderingSource,
  /function showModal\([\s\S]*opts\.onOpen[\s\S]*opts\.onOpen\(\)/,
  'delayed modals must expose an onOpen lifecycle after their DOM exists'
);
assert.match(
  gameplaySource,
  /function chooseDestructionOfParadiseType[\s\S]*showModal\('The Destruction of Paradise'[\s\S]*onOpen:function\(\)[\s\S]*bh04-type-choice/,
  'Selva Anicka must bind her custom type choices after the delayed multiplayer modal opens'
);
assert.match(
  renderingSource,
  /function showLandscapeChoiceModal[\s\S]*showModal\('Choose Landscape'[\s\S]*onOpen:function\(\)[\s\S]*landscape-choice-card/,
  'landscape cards must bind custom choices after the delayed multiplayer modal opens'
);
assert.match(
  gameplaySource,
  /function showAchillesTokenChoiceStep[\s\S]*showModal\('Adaptive Tactics[\s\S]*onOpen:function\(\)[\s\S]*achilles-token-choice/,
  'multi-step custom card pickers must share the delayed modal lifecycle'
);
assert.doesNotMatch(
  onlineSource,
  /internalWhenSetInitiatorResolution|internalWhenSetVigilantesResolution/,
  'nested effect ownership must not regress into card-specific bypasses'
);
assert.doesNotMatch(
  gameplaySource,
  /card\._pendingWhenSetActivationInFlight = true;\s*delete card\._pendingWhenSetEffect;\s*if\(card\.type === 'Supporter'\) card\.whenSetActivated = true;/,
  'the outer button handler must not spend or clear an effect before its resolver starts'
);
assert.match(
  gameplaySource,
  /await triggerWhenSet\(card, az, ar, ac,[\s\S]{0,240}const activationStarted = card\.whenSetActivated === true \|\| card\.effectUsedInitial === true[\s\S]{0,300}throw new Error\('The effect resolver did not start'\)/,
  'a genuinely failed resolver handoff must abort instead of submitting an unspent source'
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
  const liveGameState = {
    _onlineRoomCode:'ABC123',
    _onlinePlayerIndex:0,
    currentPlayer:0,
    players:[
      {deck:[], hand:[], discard:[]},
      {deck:[], hand:[], discard:[]}
    ],
    board:[[[sourceCard]]]
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
      getFateGameState(){ return liveGameState; },
      addEventListener(){},
      __fateOnlineEffectTransactionState:{
        capture(){
          return JSON.parse(JSON.stringify(liveGameState));
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
  assert.match(payload.effectTransactionId, /^effect-tx-v1:ABC123:/, 'live transaction ids must carry the actual room instead of LOCAL');
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
  const localResolvedState = JSON.parse(JSON.stringify(liveGameState));
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

  const continuationPayload = {
    fn:'activatePendingWhenSetEffect',
    source:{z:0, r:0, c:0, card:{id:'54', iid:'wolf-creek-source'}}
  };
  const continuationTransaction = api.begin(api.prepare('BOARD_ACTION', continuationPayload, 'board-action-continuation'));
  liveGameState._wolfCreekMoving = {options:[{z:0, r:0, c:1, kind:'move'}]};
  let continuationCompleted = false;
  const continuationCompletion = api.waitForCompletion(continuationTransaction, true).then(function(){
    continuationCompleted = true;
  });
  await wait(180);
  assert.equal(continuationCompleted, false, 'Wolf Creek movement squares must keep the parent effect transaction open');
  delete liveGameState._wolfCreekMoving;
  await continuationCompletion;
  assert.equal(continuationCompleted, true, 'the parent effect transaction must finish after its board continuation resolves');
  api.commitAuthority(continuationTransaction);

  sourceCard.effectUsedInitial = false;
  sourceCard._effectTurnLocked = false;
  const blockPayload = {
    fn:'triggerCharacterEffect',
    source:{z:0, r:0, c:0, card:{id:'03', iid:'source-1'}}
  };
  const blockTransaction = api.begin(api.prepare('BOARD_ACTION', blockPayload, 'board-action-block-selector'));
  liveGameState.blockingCell = true;
  let blockCompleted = false;
  const blockCompletion = api.waitForCompletion(blockTransaction, true).then(function(){
    blockCompleted = true;
  });
  await wait(180);
  assert.equal(blockCompleted, false, 'Zoe-style open-square targeting must keep the parent transaction open');
  const blockRemoteState = JSON.parse(JSON.stringify(blockTransaction.baseState));
  blockRemoteState.players[1].hand.push({id:'remote-block-card', iid:'remote-block-card-1'});
  const blockMerge = api.mergeIncomingState(blockRemoteState, JSON.parse(JSON.stringify(liveGameState)));
  assert.equal(blockMerge.ok, true, 'an authoritative refresh must merge while Zoe-style targeting is open');
  assert.equal(blockMerge.state.blockingCell, true, 'the merge must retain Zoe-style targeting ownership');
  liveGameState.blockingCell = false;
  sourceCard.effectUsedInitial = true;
  sourceCard._effectTurnLocked = true;
  await blockCompletion;
  assert.equal(blockCompleted, true, 'Zoe-style targeting may complete only after its square is selected');
  api.commitAuthority(blockTransaction);

  sourceCard._pendingWhenSetEffect = {z:0, r:0, c:0, owner:0, turnQueued:1};
  sourceCard.whenSetActivated = false;
  const pendingPayload = {
    fn:'activatePendingWhenSetEffect',
    source:{z:0, r:0, c:0, card:{id:'03', iid:'source-1'}}
  };
  const pendingTransaction = api.begin(api.prepare('BOARD_ACTION', pendingPayload, 'board-action-pending-source'));
  let pendingCompleted = false;
  const pendingCompletion = api.waitForCompletion(pendingTransaction, true).then(function(){
    pendingCompleted = true;
  });
  await wait(180);
  assert.equal(pendingCompleted, true, 'an available deferred effect must not hold a settled no-op transaction open');
  await pendingCompletion;
  api.commitAuthority(pendingTransaction);

  sourceCard._pendingWhenSetActivationInFlight = true;
  const pendingInFlightTransaction = api.begin(api.prepare('BOARD_ACTION', pendingPayload, 'board-action-pending-source-in-flight'));
  let pendingInFlightCompleted = false;
  const pendingInFlightCompletion = api.waitForCompletion(pendingInFlightTransaction, true).then(function(){
    pendingInFlightCompleted = true;
  });
  await wait(180);
  assert.equal(pendingInFlightCompleted, false, 'a deferred effect that is actually executing must keep its transaction open');
  delete sourceCard._pendingWhenSetActivationInFlight;
  await pendingInFlightCompletion;
  assert.equal(pendingInFlightCompleted, true, 'the deferred effect transaction may complete after execution leaves flight');
  api.commitAuthority(pendingInFlightTransaction);

  delete sourceCard._pendingWhenSetEffect;
  sourceCard.whenSetActivated = true;
  sourceCard.effectUsedInitial = false;
  sourceCard._effectTurnLocked = false;
  const unusedInitiatorTransaction = api.begin(api.prepare('BOARD_ACTION', blockPayload, 'board-action-unused-initiator-no-op'));
  let unusedInitiatorCompleted = false;
  const unusedInitiatorCompletion = api.waitForCompletion(unusedInitiatorTransaction, true).then(function(){
    unusedInitiatorCompleted = true;
  });
  await wait(180);
  assert.equal(unusedInitiatorCompleted, true, 'an unused Initiator must not hold a settled suppressed or blocked activation open');
  await unusedInitiatorCompletion;
  api.commitAuthority(unusedInitiatorTransaction);

  sourceCard._effectActivationInFlight = true;
  const initiatorInFlightTransaction = api.begin(api.prepare('BOARD_ACTION', blockPayload, 'board-action-initiator-in-flight'));
  let initiatorInFlightCompleted = false;
  const initiatorInFlightCompletion = api.waitForCompletion(initiatorInFlightTransaction, true).then(function(){
    initiatorInFlightCompleted = true;
  });
  await wait(180);
  assert.equal(initiatorInFlightCompleted, false, 'an Initiator that is actually executing must keep its transaction open');
  delete sourceCard._effectActivationInFlight;
  await initiatorInFlightCompletion;
  assert.equal(initiatorInFlightCompleted, true, 'the Initiator transaction may complete after execution leaves flight');
  api.commitAuthority(initiatorInFlightTransaction);

  sourceCard._pendingWhenSetEffect = {z:0, r:0, c:0, owner:0, turnQueued:1};
  sourceCard.whenSetActivated = false;
  const incomingPayload = {
    fn:'activatePendingWhenSetEffect',
    source:{z:0, r:0, c:0, card:{id:'03', iid:'source-1'}}
  };
  const incomingTransaction = api.begin(api.prepare('BOARD_ACTION', incomingPayload, 'board-action-incoming-merge'));
  delete sourceCard._pendingWhenSetEffect;
  sourceCard.whenSetActivated = true;
  liveGameState._busserMovingCard = {
    card:sourceCard,
    fromZ:0,
    fromR:0,
    fromC:0,
    options:[{z:1, r:1, c:0}]
  };
  const incomingLocalState = JSON.parse(JSON.stringify(liveGameState));
  const incomingRemoteState = JSON.parse(JSON.stringify(incomingTransaction.baseState));
  incomingRemoteState.players[1].hand.push({id:'remote-draw', iid:'remote-draw-1'});
  const incomingMerge = api.mergeIncomingState(incomingRemoteState, incomingLocalState);
  assert.equal(incomingMerge.ok, true, 'an authoritative refresh must merge through an open local effect');
  assert.equal(incomingMerge.state.board[0][0][0]._pendingWhenSetEffect, undefined, 'the merge must not restore a locally cleared pending-effect flag');
  assert.equal(incomingMerge.state.board[0][0][0].whenSetActivated, true, 'the merge must retain the locally spent source state');
  assert.equal(incomingMerge.state.players[1].hand[0].iid, 'remote-draw-1', 'the merge must also retain independent authoritative changes');
  assert.equal(incomingMerge.state._busserMovingCard.options[0].z, 1, 'the merge must retain the active local movement continuation');
  delete liveGameState._busserMovingCard;
  api.commitAuthority(incomingTransaction);

  const searchedA = {id:'68-target', iid:'search-a', name:'Search A', type:'Coordinator', owner:0};
  const searchedB = {id:'68-other', iid:'search-b', name:'Search B', type:'Coordinator', owner:0};
  liveGameState.players[0].deck = [searchedA, searchedB];
  liveGameState.players[0].hand = [];
  const collectionPayload = {
    fn:'activatePendingWhenSetEffect',
    source:{z:0, r:0, c:0, card:{id:'03', iid:'source-1'}}
  };
  const collectionTransaction = api.begin(api.prepare('BOARD_ACTION', collectionPayload, 'board-action-collection-rebase'));
  liveGameState.players[0].deck = [searchedB];
  liveGameState.players[0].hand = [searchedA];
  const collectionLocalState = JSON.parse(JSON.stringify(liveGameState));
  const collectionRemoteState = JSON.parse(JSON.stringify(collectionTransaction.baseState));
  collectionRemoteState.players[0].deck[1]._authorityObserved = true;
  const collectionRebase = api.rebasePostState(collectionTransaction, collectionRemoteState, collectionLocalState);
  assert.equal(collectionRebase.ok, true, 'draw/search collection length changes must rebase by card identity');
  assert.equal(Array.from(collectionRebase.state.players[0].hand, card=>card.iid).join(','), 'search-a');
  assert.equal(Array.from(collectionRebase.state.players[0].deck, card=>card.iid).join(','), 'search-b');
  assert.equal(collectionRebase.state.players[0].deck[0]._authorityObserved, true, 'remote card metadata must survive the draw/search rebase');
  api.commitAuthority(collectionTransaction);

  liveGameState.players[0].deck = [searchedA];
  liveGameState.players[0].hand = [];
  const inferredSearchPayload = {
    fn:'activatePendingWhenSetEffect',
    playerIndex:0,
    source:{z:0, r:0, c:0, card:{id:'03', iid:'source-1'}}
  };
  const inferredSearchTransaction = api.begin(api.prepare('BOARD_ACTION', inferredSearchPayload, 'board-action-inferred-search'));
  api.captureSearchSelection('', [searchedA]);
  liveGameState.players[0].deck = [];
  liveGameState.players[0].hand = [searchedA];
  await api.waitForCompletion(inferredSearchTransaction, true);
  assert.equal(inferredSearchPayload.opponentSearch, true, 'a selected deck-to-hand move must be classified as a search without picker-specific flags');
  assert.equal(inferredSearchPayload.searchSourceCardId, '03', 'an inferred search must use the active effect source');
  assert.deepEqual(Array.from(inferredSearchPayload.searchedCardIids), ['search-a']);
  api.commitAuthority(inferredSearchTransaction);

  const shovelDeckCard = {id:'40', iid:'shovel-deck-base', name:'Deck Base', type:'Improvisor', owner:0};
  const shovelReturns = [1, 2, 3, 4].map(function(index){
    return {id:String(40 + index), iid:'shovel-return-' + index, name:'Return ' + index, type:'Supporter', owner:0, rarity:'circle'};
  });
  const shovelStar = {id:'55', iid:'shovel-star', name:'Star', type:'Dauntless', owner:0, rarity:'star'};
  liveGameState.players[0].deck = [shovelDeckCard];
  liveGameState.players[0].discard = shovelReturns.concat([shovelStar]);
  const shovelPayload = {
    fn:'activatePendingWhenSetEffect',
    source:{z:0, r:0, c:0, card:{id:'96', iid:'shoveler-source'}}
  };
  const shovelTransaction = api.begin(api.prepare('BOARD_ACTION', shovelPayload, 'board-action-shoveler-rebase'));
  liveGameState.players[0].deck = [shovelDeckCard].concat(shovelReturns);
  liveGameState.players[0].discard = [shovelStar];
  const shovelLocalState = JSON.parse(JSON.stringify(liveGameState));
  const shovelRemoteState = JSON.parse(JSON.stringify(shovelTransaction.baseState));
  shovelRemoteState.players[0].discard[4]._authorityObserved = true;
  const shovelRebase = api.rebasePostState(shovelTransaction, shovelRemoteState, shovelLocalState);
  assert.equal(shovelRebase.ok, true, 'Snow Shoveler must rebase four discard-to-deck moves atomically');
  assert.deepEqual(
    Array.from(shovelRebase.state.players[0].deck, function(card){ return card.iid; }),
    ['shovel-deck-base', 'shovel-return-1', 'shovel-return-2', 'shovel-return-3', 'shovel-return-4']
  );
  assert.deepEqual(Array.from(shovelRebase.state.players[0].discard, function(card){ return card.iid; }), ['shovel-star']);
  assert.equal(shovelRebase.state.players[0].discard[0]._authorityObserved, true);
  api.commitAuthority(shovelTransaction);

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
    playerIndex:0,
    source:{z:0, r:0, c:0, card:{id:'60', iid:'ib-student-1'}}
  };
  const searchedCardOne = {id:'target', iid:'searched-card-1'};
  const searchedCardTwo = {id:'target-2', iid:'searched-card-2'};
  liveGameState.players[0].deck = [searchedCardOne, searchedCardTwo];
  liveGameState.players[0].hand = [];
  const searchTransaction = api.begin(api.prepare('BOARD_ACTION', searchPayload, 'board-action-search'));
  sandbox.window.pickCardsVisual(
    [searchedCardOne],
    {title:'Search', opponentSearch:true, searchSourceCardId:'60'},
    function(chosen){
      liveGameState.players[0].deck = liveGameState.players[0].deck.filter(function(card){
        return card !== chosen[0];
      });
      liveGameState.players[0].hand.push(chosen[0]);
    }
  );
  assert.equal(searchPayload.opponentSearch, undefined, 'opening a picker must not claim that a search completed');
  assert.equal(searchPayload.searchCompleted, undefined, 'opening a picker must not arm Boleslaw before a card is chosen');
  const searchCompletion = api.waitForCompletion(searchTransaction, Promise.resolve());
  cardConfirm([searchedCardOne]);
  assert.equal(searchPayload.searchSourceCardId, '60', 'transaction-owned searches must preserve their source identity');
  assert.deepEqual(searchPayload.searchedCardIids, ['searched-card-1'], 'transaction-owned searches must preserve the chosen card identity');
  sandbox.window.pickCardsVisual(
    [searchedCardTwo],
    {title:'Second Search', opponentSearch:true, searchSourceCardId:'60'},
    function(chosen){
      liveGameState.players[0].deck = liveGameState.players[0].deck.filter(function(card){
        return card !== chosen[0];
      });
      liveGameState.players[0].hand.push(chosen[0]);
    }
  );
  cardConfirm([searchedCardTwo]);
  assert.deepEqual(
    searchPayload.searchedCardIids,
    ['searched-card-1', 'searched-card-2'],
    'multi-stage searches must accumulate successful choices instead of replacing the earlier search'
  );
  await searchCompletion;
  assert.equal(searchPayload.opponentSearch, true, 'a completed transaction-owned search must mark the parent authority action');
  assert.equal(searchPayload.searchCompleted, true, 'verified cards added to hand must keep the completed-search marker');
  assert.deepEqual(searchPayload.searchedCardIids, ['searched-card-1', 'searched-card-2']);
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

function testOathboundPermanentFateLoss(){
  const preState = baseState();
  preState.board[0][0] = [
    {
      id:'31',
      iid:'oathbound-1',
      name:'Oathbound Noble Fighter',
      type:'Supporter',
      owner:0,
      currentFate:1,
      whenSetActivated:false,
      _pendingWhenSetEffect:{z:0, r:0, c:0, owner:0, turnQueued:3}
    },
    {id:'09', iid:'oathbound-target-1', name:'Target', type:'Supporter', owner:1, currentFate:4}
  ];
  const postState = JSON.parse(JSON.stringify(preState));
  postState.board[0][0][0].whenSetActivated = true;
  delete postState.board[0][0][0]._pendingWhenSetEffect;
  Object.assign(postState.board[0][0][1], {
    currentFate:1,
    _permanentFateCeiling:1,
    _permanentFateDebuffAmount:3,
    _permanentFateDebuffed:true
  });
  const payload = {
    actionKind:'BOARD_ACTION',
    fn:'activatePendingWhenSetEffect',
    playerIndex:0,
    z:0,
    r:0,
    c:0,
    source:{z:0, r:0, c:0, card:{id:'31', iid:'oathbound-1'}},
    effectTransactionId:'effect-tx-v1:ABC123:oathbound:1',
    effectTransactionVersion:1,
    effectSourceId:'31',
    effectSourceType:'Supporter',
    effectRuleType:'Supporter',
    presentationEvents:[{
      type:'CARD_EFFECT_FLASH',
      eventId:'oathbound-overlay-1',
      playerIndex:0,
      target:{iid:'oathbound-target-1', z:0, r:0, c:1},
      kind:'oathbound_crescent',
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
  assert.equal(result.canonicalState.board[0][0][1].currentFate, 1, 'Oathbound Fate loss must survive authority validation');
  assert.equal(result.canonicalState.board[0][0][1]._permanentFateDebuffAmount, 3);
}

function testBoleslawFromTransactionalSearch(sourceId, sourceName, searchedType, sourceType, includeSearchSource){
  const searchedCard = {id:'24', iid:'searched-' + String(sourceId), name:'Searched Card', type:searchedType, owner:0, currentFate:1};
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
          id:String(sourceId),
          iid:'search-source-' + String(sourceId),
          name:String(sourceName),
          type:String(sourceType || 'Supporter'),
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
    source:{z:0, r:0, c:0, card:{id:String(sourceId), iid:'search-source-' + String(sourceId)}},
    effectTransactionId:'effect-tx-v1:ABC123:ib-search:1',
    effectTransactionVersion:1,
    effectSourceId:String(sourceId),
    effectSourceType:String(sourceType || 'Supporter'),
    effectRuleType:String(sourceType || 'Supporter'),
    opponentSearch:true,
    searchedCardIids:[searchedCard.iid],
    baseStateHash:canonicalStateHash(preState),
    stateHash:canonicalStateHash(postState),
    postState
  };
  if(includeSearchSource !== false) payload.searchSourceCardId = String(sourceId);
  const result = reduceServerAction({
    canonicalState:preState,
    canonicalHash:canonicalStateHash(preState)
  }, {type:'ACTION_RESULT', payload}, {requireBaseHash:true});
  assert.equal(result.ok, true);
  assert.equal(result.canonicalState.players[0].hand[0].iid, searchedCard.iid);
  assert.equal(result.canonicalState.players[1].hand[0].iid, 'boleslaw-draw', 'Boleslaw must draw from ' + sourceName + ' inside the parent transaction');
  assert.equal(result.canonicalState.board[0][0][1].currentFate, 4, 'Boleslaw must gain 2 Fate from ' + sourceName);
}

(async function main(){
  await testNestedPickerTransaction();
  testAuthorityReactionBoundary();
  testBritishFateGainWithoutReaction();
  testOathboundPermanentFateLoss();
  testBoleslawFromTransactionalSearch('60', 'IB Student search', 'Supporter');
  testBoleslawFromTransactionalSearch('68', 'Great Oak High Schooler search', 'Coordinator');
  [
    ['06', 'Jorge Alvarez search', 'Supporter'],
    ['07', 'Maja Kaminska search', 'Supporter'],
    ['08', 'Lina deck or discard search', 'Initiator'],
    ['13', 'Johnathan Kirby search', 'Supporter'],
    ['29', 'Dylan Kirby deck or discard search', 'Initiator'],
    ['48', 'Cosmic GF multi-stage search', 'Initiator']
  ].forEach(function(entry){
    testBoleslawFromTransactionalSearch(entry[0], entry[1], entry[2], 'Initiator', false);
  });
  console.log('Online effect transaction smoke test passed.');
})().catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
