(function installFateOnlineEffectTransactions(root){
  'use strict';

  if(!root || root.FateOnlineEffectTransactions) return;

  const TRANSACTION_VERSION = 1;
  const QUIET_WINDOW_MS = 70;
  const COORDINATED_EFFECT_FNS = new Set([
    'triggerCharacterEffect',
    'activatePendingWhenSetEffect',
    'activateVigilantes',
    'activateWodnyPotokYouth'
  ]);
  const bridgeOriginals = new Map();
  let activeTransaction = null;
  let reservedTransactionId = '';
  let transactionSequence = 0;
  let installAttempts = 0;
  let pickerConstructionDepth = 0;

  function gameState(){
    return root.G || null;
  }

  function transactionStateBridge(){
    return root.__fateOnlineEffectTransactionState || null;
  }

  function clonePlain(value){
    if(value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function samePlain(left, right){
    if(left === right) return true;
    try{ return JSON.stringify(left) === JSON.stringify(right); }
    catch(e){ return false; }
  }

  function threeWayMerge(base, local, remote, path, conflicts){
    if(samePlain(local, base)) return clonePlain(remote);
    if(samePlain(remote, base)) return clonePlain(local);
    if(samePlain(local, remote)) return clonePlain(local);

    const baseArray = Array.isArray(base);
    const localArray = Array.isArray(local);
    const remoteArray = Array.isArray(remote);
    if(baseArray || localArray || remoteArray){
      if(!(baseArray && localArray && remoteArray) || base.length !== local.length || base.length !== remote.length){
        conflicts.push(path || '$');
        return clonePlain(remote);
      }
      return base.map(function(entry, index){
        return threeWayMerge(entry, local[index], remote[index], (path || '$') + '[' + index + ']', conflicts);
      });
    }

    const baseObject = !!base && typeof base === 'object';
    const localObject = !!local && typeof local === 'object';
    const remoteObject = !!remote && typeof remote === 'object';
    if(!(baseObject && localObject && remoteObject)){
      conflicts.push(path || '$');
      return clonePlain(remote);
    }

    const merged = {};
    const keys = new Set(Object.keys(base).concat(Object.keys(local), Object.keys(remote)));
    keys.forEach(function(key){
      const nextPath = (path || '$') + '.' + key;
      const value = threeWayMerge(base[key], local[key], remote[key], nextPath, conflicts);
      if(value !== undefined) merged[key] = value;
    });
    return merged;
  }

  function enabled(){
    return root.FATE_EFFECT_TRANSACTIONS !== false;
  }

  function shouldCoordinate(type, payload){
    return enabled()
      && String(type || '').toUpperCase() === 'BOARD_ACTION'
      && COORDINATED_EFFECT_FNS.has(String(payload && payload.fn || ''));
  }

  function transactionId(clientActionId){
    transactionSequence += 1;
    const room = String(gameState() && gameState()._onlineRoomCode || 'local').toUpperCase();
    return [
      'effect-tx-v' + TRANSACTION_VERSION,
      room,
      String(clientActionId || Date.now().toString(36)),
      transactionSequence.toString(36)
    ].join(':');
  }

  function prepare(type, payload, clientActionId){
    if(!shouldCoordinate(type, payload)) return null;
    const descriptor = {
      id:transactionId(clientActionId),
      version:TRANSACTION_VERSION,
      type:String(type || '').toUpperCase(),
      fn:String(payload && payload.fn || ''),
      clientActionId:String(clientActionId || ''),
      payload:payload || {}
    };
    descriptor.payload.effectTransactionId = descriptor.id;
    descriptor.payload.effectTransactionVersion = TRANSACTION_VERSION;
    return descriptor;
  }

  function pendingInteractionReason(g){
    if(!g) return 'Game state is unavailable.';
    if(g._serverPendingReaction || String(g.pendingInteraction && g.pendingInteraction.kind || '') === 'reaction'){
      return 'The opponent reaction must resolve first.';
    }
    if(g._consolidating) return 'Finish or cancel consolidation first.';
    if(
      g.pendingInteraction ||
      g._serverPendingMove ||
      g._serverPendingZonePick ||
      g._serverPendingCardPick ||
      g._serverPendingModalAction ||
      g._onlinePendingPickCardsVisual ||
      g._onlinePendingZonePicker ||
      g._onlinePendingAffiliationPicker ||
      g._onlinePendingLandscapeZonePicker
    ){
      return 'Finish the current effect choice first.';
    }
    return '';
  }

  function canStart(g, descriptor){
    if(!enabled()) return {ok:false, reason:'Effect transactions are disabled.'};
    if(activeTransaction && !activeTransaction.finished){
      return {ok:false, reason:'Another effect is already resolving.'};
    }
    if(reservedTransactionId && reservedTransactionId !== String(descriptor && descriptor.id || '')){
      return {ok:false, reason:'Another effect is waiting for multiplayer synchronization.'};
    }
    if(!g || !g._onlineRoomCode) return {ok:false, reason:'The online match is not ready.'};
    if(g._onlineApplyingRemoteAction) return {ok:false, reason:'The latest multiplayer action is still applying.'};
    if(g._isSpectator || g._onlineRole === 'spectator') return {ok:false, reason:'Spectators cannot activate effects.'};
    if(
      Number.isInteger(Number(g._onlinePlayerIndex)) &&
      Number(g.currentPlayer) !== Number(g._onlinePlayerIndex)
    ){
      return {ok:false, reason:'It is not your turn.'};
    }
    const pendingReason = pendingInteractionReason(g);
    if(pendingReason) return {ok:false, reason:pendingReason};
    if(descriptor && descriptor.id) reservedTransactionId = String(descriptor.id);
    return {ok:true, reason:''};
  }

  function record(event, tx, extra){
    try{
      const perf = root.__fatePerf = root.__fatePerf || {};
      const timeline = perf.effectTransactions = Array.isArray(perf.effectTransactions)
        ? perf.effectTransactions
        : [];
      timeline.push(Object.assign({
        at:Date.now(),
        event:String(event || ''),
        transactionId:String(tx && tx.id || ''),
        fn:String(tx && tx.fn || ''),
        pending:tx && tx.pending ? tx.pending.size : 0
      }, extra || {}));
      if(timeline.length > 120) timeline.splice(0, timeline.length - 120);
    }catch(e){}
  }

  function begin(descriptor){
    if(!descriptor || !enabled()) return null;
    if(activeTransaction && !activeTransaction.finished){
      throw new Error('Another multiplayer effect transaction is already active');
    }
    if(reservedTransactionId && reservedTransactionId !== String(descriptor.id || '')){
      throw new Error('A different multiplayer effect transaction owns the activation reservation');
    }
    reservedTransactionId = '';
    let resolveCompletion;
    let rejectCompletion;
    const completion = new Promise(function(resolve, reject){
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    // Keep an aborted transaction from becoming an unhandled rejection if the
    // gameplay function throws before waitForCompletion receives the promise.
    completion.catch(function(){});
    const tx = {
      id:String(descriptor.id || transactionId(descriptor.clientActionId)),
      version:TRANSACTION_VERSION,
      type:String(descriptor.type || 'BOARD_ACTION'),
      fn:String(descriptor.fn || ''),
      payload:descriptor.payload || {},
      startedAt:Date.now(),
      pending:new Set(),
      interactions:[],
      nextInteractionId:0,
      baseState:(function(){
        const bridge = transactionStateBridge();
        return bridge && typeof bridge.capture === 'function' ? clonePlain(bridge.capture()) : null;
      })(),
      coreSettled:false,
      localResolved:false,
      finished:false,
      quietTimer:null,
      completion,
      resolveCompletion,
      rejectCompletion
    };
    activeTransaction = tx;
    record('begin', tx);
    return tx;
  }

  function clearQuietTimer(tx){
    if(tx && tx.quietTimer){
      clearTimeout(tx.quietTimer);
      tx.quietTimer = null;
    }
  }

  function liveSourceCard(tx){
    const g = gameState();
    const payload = tx && tx.payload || {};
    const source = payload.source || payload.effectCinematic || payload;
    const z = Number(source && source.z !== undefined ? source.z : payload.z);
    const r = Number(source && source.r !== undefined ? source.r : payload.r);
    const c = Number(source && source.c !== undefined ? source.c : payload.c);
    if(!g) return null;
    const atSource = Number.isInteger(z) && Number.isInteger(r) && Number.isInteger(c)
      ? g.board && g.board[z] && g.board[z][r] && g.board[z][r][c] || null
      : null;
    const sourceIid = String(
      source && source.card && source.card.iid ||
      source && source.iid ||
      payload.effectSourceIid ||
      ''
    );
    if(atSource && (!sourceIid || String(atSource.iid || '') === sourceIid)) return atSource;
    if(!sourceIid || !Array.isArray(g.board)) return atSource;
    let found = null;
    g.board.some(function(zone){
      return Array.isArray(zone) && zone.some(function(row){
        return Array.isArray(row) && row.some(function(card){
          if(!card || String(card.iid || '') !== sourceIid) return false;
          found = card;
          return true;
        });
      });
    });
    return found;
  }

  function finalizePayload(tx){
    if(!tx || !tx.payload) return;
    const card = liveSourceCard(tx);
    if(card){
      tx.payload.effectSourceId = String(
        card._bh05CopiedCardId ||
        card._bh05CopiedPassiveId ||
        card._ledgerCopiedSourceId ||
        card.id ||
        ''
      );
      tx.payload.effectSourceType = String(card.type || '');
      tx.payload.effectRuleType = String(
        card._bh05CopiedTrackerState && card._bh05CopiedTrackerState.type ||
        card.type ||
        ''
      );
      tx.payload.effectSourceIid = String(card.iid || '');
    }
    tx.payload.effectTransactionDurationMs = Math.max(0, Date.now() - tx.startedAt);
  }

  function finishLocalResolution(tx){
    if(!tx || tx.finished) return;
    clearQuietTimer(tx);
    finalizePayload(tx);
    tx.localResolved = true;
    record('local-resolution-complete', tx, {durationMs:Date.now() - tx.startedAt});
    tx.resolveCompletion(true);
  }

  function maybeFinish(tx){
    if(!tx || tx.finished || !tx.coreSettled || tx.pending.size) return;
    clearQuietTimer(tx);
    tx.quietTimer = setTimeout(function(){
      tx.quietTimer = null;
      if(!tx.finished && !tx.localResolved && tx.coreSettled && tx.pending.size === 0) finishLocalResolution(tx);
    }, QUIET_WINDOW_MS);
  }

  function abort(tx, error){
    if(!tx || tx.finished) return;
    clearQuietTimer(tx);
    tx.finished = true;
    tx.pending.clear();
    if(activeTransaction === tx) activeTransaction = null;
    if(reservedTransactionId === String(tx.id || '')) reservedTransactionId = '';
    const reason = error instanceof Error ? error : new Error(String(error || 'Effect transaction aborted'));
    record('abort', tx, {message:String(reason.message || reason)});
    tx.rejectCompletion(reason);
    try{
      if(typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function'){
        root.dispatchEvent(new root.CustomEvent('fate-online-effect-transaction-finished', {
          detail:{transactionId:tx.id, committed:false, reason:String(reason.message || reason)}
        }));
      }
    }catch(e){}
  }

  function commitAuthority(tx){
    if(!tx || tx.finished) return false;
    clearQuietTimer(tx);
    tx.finished = true;
    if(activeTransaction === tx) activeTransaction = null;
    record('authority-committed', tx, {durationMs:Date.now() - tx.startedAt});
    try{
      if(typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function'){
        root.dispatchEvent(new root.CustomEvent('fate-online-effect-transaction-finished', {
          detail:{transactionId:tx.id, committed:true}
        }));
      }
    }catch(e){}
    return true;
  }

  function rebasePostState(tx, remoteState, localState){
    if(!tx || tx.finished || !tx.baseState || !remoteState || !localState){
      return {ok:false, reason:'effect transaction rebase state is unavailable'};
    }
    const conflicts = [];
    const state = threeWayMerge(tx.baseState, localState, remoteState, '$', conflicts);
    if(conflicts.length){
      record('rebase-conflict', tx, {conflicts:conflicts.slice(0, 12)});
      return {ok:false, reason:'effect transaction conflicted with a newer multiplayer action', conflicts};
    }
    const bridge = transactionStateBridge();
    const stateHash = bridge && typeof bridge.hash === 'function' ? String(bridge.hash(state) || '') : '';
    if(!stateHash) return {ok:false, reason:'effect transaction rebased state could not be hashed'};
    tx.baseState = clonePlain(remoteState);
    record('rebased', tx);
    return {ok:true, state, stateHash};
  }

  function registerInteraction(label, channel){
    const tx = activeTransaction;
    if(!tx || tx.finished) return null;
    clearQuietTimer(tx);
    if(channel){
      tx.interactions.forEach(function(previous){
        if(
          previous &&
          !previous.settled &&
          !previous.claimed &&
          previous.channel === channel
        ){
          settleInteraction(previous, 'superseded');
        }
      });
    }
    const token = {
      id:++tx.nextInteractionId,
      tx,
      label:String(label || 'effect choice'),
      channel:String(channel || ''),
      claimed:false,
      settled:false,
      openedAt:Date.now()
    };
    tx.pending.add(token);
    tx.interactions.push(token);
    record('choice-opened', tx, {choiceId:token.id, label:token.label});
    return token;
  }

  function settleInteraction(token, reason){
    if(!token || token.settled) return;
    token.settled = true;
    token.tx.pending.delete(token);
    record('choice-settled', token.tx, {
      choiceId:token.id,
      label:token.label,
      reason:String(reason || 'resolved'),
      durationMs:Date.now() - token.openedAt
    });
    maybeFinish(token.tx);
  }

  function wrapChoiceCallback(token, callback, reason){
    if(typeof callback !== 'function') return callback;
    return function transactionChoiceCallback(){
      if(token) token.claimed = true;
      let result;
      try{
        result = callback.apply(this, arguments);
      }catch(error){
        settleInteraction(token, 'callback-threw');
        throw error;
      }
      if(result && typeof result.then === 'function'){
        return Promise.resolve(result).then(function(value){
          settleInteraction(token, reason || 'resolved');
          return value;
        }, function(error){
          settleInteraction(token, 'callback-rejected');
          throw error;
        });
      }
      settleInteraction(token, reason || 'resolved');
      return result;
    };
  }

  function waitForCompletion(tx, localResult){
    if(!tx) return localResult;
    return Promise.resolve(localResult).then(function(value){
      tx.coreSettled = true;
      record('gameplay-returned', tx);
      maybeFinish(tx);
      return tx.completion.then(function(){ return value; });
    }, function(error){
      abort(tx, error);
      throw error;
    });
  }

  function active(){
    return !!(activeTransaction && !activeTransaction.finished);
  }

  function capturePresentationEvent(event){
    const tx = activeTransaction;
    if(!tx || tx.finished || !event || typeof event !== 'object') return false;
    const events = Array.isArray(tx.payload.presentationEvents)
      ? tx.payload.presentationEvents
      : (tx.payload.presentationEvents = []);
    const eventId = String(event.eventId || '');
    if(eventId && events.some(function(existing){
      return String(existing && existing.eventId || '') === eventId;
    })){
      return true;
    }
    events.push(event);
    record('presentation-captured', tx, {
      presentationType:String(event.type || ''),
      eventId
    });
    return true;
  }

  function captureActivationCinematic(effectCinematic){
    const tx = activeTransaction;
    if(!tx || tx.finished) return false;
    if(
      !tx.payload.effectCinematic &&
      effectCinematic &&
      typeof effectCinematic === 'object'
    ){
      tx.payload.effectCinematic = effectCinematic;
    }
    record('activation-cinematic-owned', tx);
    return true;
  }

  function captureReactionContext(actionType, actionData){
    const tx = activeTransaction;
    if(!tx || tx.finished || !tx.payload) return false;
    const data = actionData || {};
    const owners = Array.isArray(data.affectedOwners)
      ? Array.from(new Set(data.affectedOwners.map(Number).filter(function(value){ return value === 0 || value === 1; })))
      : [];
    if(owners.length) tx.payload.affectedOwners = owners;
    if(data.lydiaEligible === false) tx.payload.lydiaEligible = false;
    if(actionType) tx.payload.reactionActionType = String(actionType);
    return true;
  }

  function captureSearchSelection(searchSourceCardId, selectedCards){
    const tx = activeTransaction;
    const chosen = Array.isArray(selectedCards) ? selectedCards.filter(Boolean) : [];
    if(!tx || tx.finished || !tx.payload || !chosen.length) return false;
    tx.payload.opponentSearch = true;
    tx.payload.searchCompleted = true;
    tx.payload.searchSourceCardId = String(searchSourceCardId || '');
    tx.payload.searchedCardIids = chosen.map(function(card){ return String(card && card.iid || ''); }).filter(Boolean);
    return true;
  }

  function withLocalModalBypass(fn){
    const g = gameState();
    const previousState = g && g._onlineLocalModalBypass;
    const previousWindow = root.__fateOnlineLocalModalBypass;
    if(g) g._onlineLocalModalBypass = true;
    root.__fateOnlineLocalModalBypass = true;
    try{
      return fn();
    }finally{
      if(g){
        if(previousState === undefined) delete g._onlineLocalModalBypass;
        else g._onlineLocalModalBypass = previousState;
      }
      if(previousWindow === undefined) delete root.__fateOnlineLocalModalBypass;
      else root.__fateOnlineLocalModalBypass = previousWindow;
    }
  }

  function withPickerConstruction(fn){
    pickerConstructionDepth += 1;
    try{
      return fn();
    }finally{
      pickerConstructionDepth = Math.max(0, pickerConstructionDepth - 1);
    }
  }

  function openAfterPresentationIdle(open, token, failureReason){
    const presenter = root.FateActionPresentation;
    const run = function(){
      try{
        return open();
      }catch(error){
        if(token) settleInteraction(token, failureReason || 'interaction-open-threw');
        throw error;
      }
    };
    if(!presenter || typeof presenter.waitForIdle !== 'function') return run();
    return Promise.resolve(presenter.waitForIdle({
      minQuietMs:110,
      timeoutMs:7600
    })).catch(function(){
      return null;
    }).then(run, function(error){
      if(token) settleInteraction(token, failureReason || 'interaction-open-threw');
      throw error;
    });
  }

  function bridged(name, factory){
    const current = root[name];
    if(typeof current !== 'function') return false;
    if(current.__fateEffectTransactionBridge === true) return true;
    if(!bridgeOriginals.has(name)) bridgeOriginals.set(name, current);
    const wrapper = factory(current);
    if(typeof wrapper !== 'function') return false;
    Object.defineProperty(wrapper, '__fateEffectTransactionBridge', {value:true});
    root[name] = wrapper;
    return true;
  }

  function hasEntries(entries){
    return Array.isArray(entries) && entries.some(function(entry){ return !!entry; });
  }

  function installPickerBridges(){
    installAttempts += 1;

    bridged('showCanvasCardGalleryModal', function(original){
      return function transactionCardGallery(title, cards, opts){
        if(!active()) return original.apply(this, arguments);
        const args = arguments;
        return openAfterPresentationIdle(function(){
          return withPickerConstruction(function(){
            return original.apply(this, args);
          }.bind(this));
        }.bind(this), null, 'card-gallery-open-threw');
      };
    });

    bridged('showModal', function(original){
      return function transactionShowModal(title, bodyHtml, actions, opts){
        if(active() && pickerConstructionDepth > 0){
          const nestedArgs = arguments;
          return withLocalModalBypass(function(){ return original.apply(this, nestedArgs); }.bind(this));
        }
        if(!active() || !Array.isArray(actions) || actions.length === 0){
          return original.apply(this, arguments);
        }
        const token = registerInteraction('modal: ' + String(title || 'effect choice'), 'modal');
        const wrappedActions = actions.map(function(action){
          if(!action || typeof action.action !== 'function') return action;
          return Object.assign({}, action, {
            action:wrapChoiceCallback(token, action.action, 'modal-action')
          });
        });
        const args = [title, bodyHtml, wrappedActions, opts];
        return openAfterPresentationIdle(function(){
          return withLocalModalBypass(function(){ return original.apply(this, args); }.bind(this));
        }.bind(this), token, 'modal-open-threw');
      };
    });

    bridged('pickCardsVisual', function(original){
      return function transactionPickCardsVisual(cards, opts, onConfirm){
        if(!active() || !Array.isArray(cards) || cards.length === 0){
          return original.apply(this, arguments);
        }
        const token = registerInteraction('card picker: ' + String(opts && opts.title || 'choose cards'), 'modal');
        const nextOpts = Object.assign({}, opts || {}, {
          onlineParentAction:true
        });
        if(typeof nextOpts.onCancel === 'function'){
          nextOpts.onCancel = wrapChoiceCallback(token, nextOpts.onCancel, 'card-picker-cancel');
        }
        const confirm = function(chosen){
          if(opts && opts.opponentSearch === true && Array.isArray(chosen) && chosen.length){
            captureSearchSelection(opts.searchSourceCardId, chosen);
          }
          return typeof onConfirm === 'function' ? onConfirm(chosen) : undefined;
        };
        return openAfterPresentationIdle(function(){
          return withPickerConstruction(function(){
            return original.call(this, cards, nextOpts, wrapChoiceCallback(token, confirm, 'card-picker-confirm'));
          }.bind(this));
        }.bind(this), token, 'card-picker-open-threw');
      };
    });

    bridged('showBoardTargetPicker', function(original){
      return function transactionBoardTargetPicker(opts, onConfirm){
        if(active() && pickerConstructionDepth > 0){
          const nestedOpts = Object.assign({}, opts || {}, {onlineClientOwnedChoice:true});
          return original.call(this, nestedOpts, onConfirm);
        }
        const entries = opts && opts.entries;
        if(!active() || !hasEntries(entries)) return original.apply(this, arguments);
        const token = registerInteraction('board target: ' + String(opts && (opts.title || opts.prompt) || 'choose target'), 'modal');
        const nextOpts = Object.assign({}, opts || {}, {
          onlineClientOwnedChoice:true
        });
        nextOpts.onCancel = wrapChoiceCallback(token, nextOpts.onCancel || function(){}, 'board-picker-cancel');
        return openAfterPresentationIdle(function(){
          return withPickerConstruction(function(){
            return original.call(this, nextOpts, wrapChoiceCallback(token, onConfirm, 'board-picker-confirm'));
          }.bind(this));
        }.bind(this), token, 'board-picker-open-threw');
      };
    });

    bridged('showZonePicker', function(original){
      return function transactionZonePicker(z, prompt, entries, maxCount, viewerP, onConfirm, filter, onCancel){
        if(!active() || !hasEntries(entries)) return original.apply(this, arguments);
        const token = registerInteraction('zone target: ' + String(prompt || 'choose target'), 'modal');
        return openAfterPresentationIdle(function(){
          return withPickerConstruction(function(){
            return original.call(
              this,
              z,
              prompt,
              entries,
              maxCount,
              viewerP,
              wrapChoiceCallback(token, onConfirm, 'zone-picker-confirm'),
              filter,
              wrapChoiceCallback(token, onCancel || function(){}, 'zone-picker-cancel')
            );
          }.bind(this));
        }.bind(this), token, 'zone-picker-open-threw');
      };
    });

    bridged('showAffiliationPickerVisual', function(original){
      return function transactionAffiliationPicker(callback){
        if(!active() || typeof callback !== 'function') return original.apply(this, arguments);
        const token = registerInteraction('affiliation picker', 'modal');
        return openAfterPresentationIdle(function(){
          return withLocalModalBypass(function(){
            return original.call(this, wrapChoiceCallback(token, callback, 'affiliation-picked'));
          }.bind(this));
        }.bind(this), token, 'affiliation-picker-open-threw');
      };
    });

    bridged('showZonePickerVisual', function(original){
      return function transactionVisualZonePicker(options, callback){
        if(!active() || typeof callback !== 'function') return original.apply(this, arguments);
        const token = registerInteraction('visual zone picker', 'modal');
        return openAfterPresentationIdle(function(){
          return original.call(this, options, wrapChoiceCallback(token, callback, 'visual-zone-picked'));
        }.bind(this), token, 'visual-zone-picker-open-threw');
      };
    });

    bridged('chooseLandscapeZone', function(original){
      return function transactionLandscapeZonePicker(player, title, subtitle, onChoose, opts){
        if(!active() || typeof onChoose !== 'function') return original.apply(this, arguments);
        const token = registerInteraction('landscape zone picker', 'modal');
        const onlineOriginal = root.__fateOnlineOriginalFns && root.__fateOnlineOriginalFns.chooseLandscapeZone;
        const target = typeof onlineOriginal === 'function' ? onlineOriginal : original;
        return openAfterPresentationIdle(function(){
          return withPickerConstruction(function(){
            return target.call(
              this,
              player,
              title,
              subtitle,
              wrapChoiceCallback(token, onChoose, 'landscape-zone-picked'),
              opts
            );
          }.bind(this));
        }.bind(this), token, 'landscape-zone-picker-open-threw');
      };
    });

    bridged('closeModal', function(original){
      return function transactionCloseModal(){
        const tx = activeTransaction;
        const openToken = tx && tx.interactions.slice().reverse().find(function(token){
          return token && !token.settled && !token.claimed && token.channel === 'modal';
        });
        const result = original.apply(this, arguments);
        if(openToken){
          Promise.resolve().then(function(){
            if(!openToken.settled && !openToken.claimed) settleInteraction(openToken, 'modal-closed');
          });
        }
        return result;
      };
    });

    return true;
  }

  function cancelActive(reason){
    if(!activeTransaction || activeTransaction.finished) return false;
    abort(activeTransaction, new Error(String(reason || 'Effect transaction cancelled')));
    return true;
  }

  function release(descriptor, reason){
    const id = String(descriptor && descriptor.id || descriptor || '');
    if(!id || reservedTransactionId !== id) return false;
    reservedTransactionId = '';
    record('reservation-released', descriptor, {reason:String(reason || '')});
    return true;
  }

  function snapshot(){
    const tx = activeTransaction;
    if(!tx || tx.finished) return null;
    return {
      id:tx.id,
      fn:tx.fn,
      startedAt:tx.startedAt,
      coreSettled:tx.coreSettled,
      localResolved:tx.localResolved,
      pending:Array.from(tx.pending).map(function(token){
        return {id:token.id, label:token.label, claimed:token.claimed, openedAt:token.openedAt};
      })
    };
  }

  const api = {
    version:TRANSACTION_VERSION,
    enabled,
    shouldCoordinate,
    prepare,
    canStart,
    begin,
    waitForCompletion,
    abort,
    release,
    isActive:active,
    capturePresentationEvent,
    captureActivationCinematic,
    captureReactionContext,
    captureSearchSelection,
    commitAuthority,
    rebasePostState,
    cancelActive,
    installPickerBridges,
    snapshot
  };

  root.FateOnlineEffectTransactions = api;

  // The room module installs its wrappers on a zero-delay timer. These retries
  // ensure this bridge remains the outer layer regardless of module timing.
  [0, 40, 180, 700].forEach(function(delay){
    setTimeout(installPickerBridges, delay);
  });
  if(typeof root.addEventListener === 'function'){
    root.addEventListener('fate-online-modules-ready', installPickerBridges);
  }

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
