import {
  ENGINE_VERSION,
  RULESET_VERSION,
  legalCommandTemplates,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {
  firstDifference,
  reduceTranslatedAction
} from '../../tools/authority-v3-differential-replay.mjs';
import {
  engineVisibleOutcomes,
  normalizeLegacyExpectedOutcomes,
  translateLegacyRecorderAction
} from '../../tools/authority-v3-legacy-normalization.mjs';

export const PHASE6_SHADOW_FORMAT = 'fates-authority-v3-shadow-comparison-v1';

function stateEnvelope(state){
  return {
    format:'fates-legacy-canonical-state-v1',
    state
  };
}

function effectiveActionType(action){
  const rawType = String(action?.type || '').toUpperCase();
  const actionKind = String(action?.payload?.actionKind || '').toUpperCase();
  return rawType === 'ACTION_RESULT' && actionKind ? actionKind : rawType;
}

function playerIndexFromAccepted(action, room){
  const explicit = Number(action?.payload?.playerIndex);
  if(explicit === 0 || explicit === 1) return explicit;
  const uid = String(action?.uid || '');
  if(uid && uid === room.playerOrder[0]) return 0;
  if(uid && uid === room.playerOrder[1]) return 1;
  return null;
}

function boardCards(state){
  const cards = [];
  for(let z = 0; z < (state?.board?.length || 0); z += 1){
    for(let r = 0; r < (state.board[z]?.length || 0); r += 1){
      for(let c = 0; c < (state.board[z][r]?.length || 0); c += 1){
        const card = state.board[z][r][c];
        if(card?.iid) cards.push({card, destination:{zone:z, row:r, column:c}});
      }
    }
  }
  return cards;
}

function playerPileCards(state, playerIndex, pile){
  return state?.players?.[playerIndex]?.[pile] || [];
}

function cardIids(cards){
  return new Set((cards || []).map(card=>String(card?.iid || '')).filter(Boolean));
}

function destinationFromPayload(payload){
  const source = payload?.destination || payload?.to || payload?.target || payload;
  const zone = Number(source?.z ?? source?.zone);
  const row = Number(source?.r ?? source?.row);
  const column = Number(source?.c ?? source?.column);
  return [zone, row, column].every(Number.isInteger)
    ? {zone, row, column}
    : null;
}

function selectedCardIid(payload){
  return String(
    payload?.cardIid
    || payload?.selectedHand?.iid
    || payload?.card?.iid
    || payload?.source?.card?.iid
    || payload?.sourceIid
    || ''
  );
}

function inferPlacementCommand(preState, postState, playerIndex, actionType, payload){
  const preHand = cardIids(playerPileCards(preState, playerIndex, 'hand'));
  const preDeck = cardIids(playerPileCards(preState, playerIndex, 'deck'));
  const preBoard = new Map(boardCards(preState).map(entry=>[String(entry.card.iid), entry]));
  const postBoard = new Map(boardCards(postState).map(entry=>[String(entry.card.iid), entry]));
  const requestedIid = selectedCardIid(payload);
  const added = [...postBoard.values()].filter(entry=>{
    const iid = String(entry.card.iid);
    return !preBoard.has(iid) && (preHand.has(iid) || preDeck.has(iid));
  });
  const placed = postBoard.get(requestedIid)
    || (added.length === 1 ? added[0] : null);
  if(!placed) return null;
  const iid = String(placed.card.iid);
  const source = preDeck.has(iid) ? 'deck' : (preHand.has(iid) ? 'hand' : '');
  if(!source) return null;

  const preDiscard = cardIids(playerPileCards(preState, playerIndex, 'discard'));
  const postDiscard = cardIids(playerPileCards(postState, playerIndex, 'discard'));
  const inferredTributeIids = [...preBoard.values()]
    .filter(entry=>{
      const tributeIid = String(entry.card.iid);
      return Number(entry.card.controller ?? entry.card.owner) === playerIndex
        && !postBoard.has(tributeIid)
        && !preDiscard.has(tributeIid)
        && postDiscard.has(tributeIid);
    })
    .map(entry=>String(entry.card.iid));
  const declaredTributeIids = (
    payload?.tributeIids
    || payload?.selectedTributeIids
    || payload?.consolidationTributeIids
    || []
  ).map(String);
  const declaredTributes = (payload?.tributes || payload?.selectedTributes || [])
    .map(item=>String(item?.iid || item?.card?.iid || item || ''))
    .filter(Boolean);
  const tributeIids = declaredTributeIids.length
    ? declaredTributeIids
    : (declaredTributes.length ? declaredTributes : inferredTributeIids);
  const consolidation = /CONSOLIDAT/i.test(actionType) || tributeIids.length > 0;
  return {
    type:consolidation ? 'LEGACY_CONSOLIDATE_CARD' : 'LEGACY_SET_CARD',
    cardIid:iid,
    cardId:String(placed.card.id || ''),
    source,
    destination:destinationFromPayload(payload) || placed.destination,
    ...(consolidation ? {tributeIids} : {})
  };
}

function inferMoveCommand(preState, postState, playerIndex, payload){
  const preBoard = new Map(boardCards(preState).map(entry=>[String(entry.card.iid), entry]));
  const postBoard = new Map(boardCards(postState).map(entry=>[String(entry.card.iid), entry]));
  const requestedIid = selectedCardIid(payload);
  const moved = [...postBoard.values()].filter(entry=>{
    const before = preBoard.get(String(entry.card.iid));
    if(!before) return false;
    return before.destination.zone !== entry.destination.zone
      || before.destination.row !== entry.destination.row
      || before.destination.column !== entry.destination.column;
  });
  const entry = postBoard.get(requestedIid)
    || (moved.length === 1 ? moved[0] : null);
  if(!entry || Number(entry.card.controller ?? entry.card.owner) !== playerIndex) return null;
  return {
    type:'LEGACY_MOVE_CARD',
    payload:{
      cardIid:String(entry.card.iid),
      destination:entry.destination
    }
  };
}

function sameDestination(left, right){
  return Number(left?.zone ?? left?.z) === Number(right?.zone ?? right?.z)
    && Number(left?.row ?? left?.r) === Number(right?.row ?? right?.r)
    && Number(left?.column ?? left?.c) === Number(right?.column ?? right?.c);
}

function inferredShadowChoices(command, preState, postState){
  const choices = [];
  const cardIid = String(command?.cardIid || command?.payload?.cardIid || '');
  const cardId = String(command?.cardId || '');
  if(cardIid && cardId === '62'){
    const finalEntry = boardCards(postState).find(entry=>String(entry.card.iid) === cardIid);
    if(finalEntry && !sameDestination(finalEntry.destination, command.destination)){
      choices.push({
        kind:'AI_RESOLVED_DESTINATION',
        destination:finalEntry.destination
      });
    }else{
      choices.push({kind:'AI_RESOLVED_PROMPT_CHOICE', choice:'DECLINE'});
    }
  }
  const beforeLandscape = String(preState?.landscapeId || '');
  const afterLandscape = String(postState?.landscapeId || '');
  if(afterLandscape && afterLandscape !== beforeLandscape){
    choices.push({kind:'AI_RESOLVED_LANDSCAPE', choice:afterLandscape});
  }
  return choices;
}

function legacyReactionOption(preState, payload){
  const options = preState?._serverPendingReaction?.options || [];
  const optionIndex = Number(payload?.optionIndex);
  if(Number.isInteger(optionIndex) && options[optionIndex]) return options[optionIndex];
  const reaction = payload?.reaction;
  if(reaction && typeof reaction === 'object'){
    return options.find(option=>{
      if(reaction.kind && String(option?.kind || '') !== String(reaction.kind)) return false;
      for(const key of ['z', 'r', 'c']){
        if(Number.isInteger(Number(reaction[key]))
          && Number(option?.[key]) !== Number(reaction[key])) return false;
      }
      return true;
    }) || null;
  }
  return options.length === 1 ? options[0] : null;
}

function statefulReactionTemplate(room, preState, playerIndex, action){
  const state = room.shadowState;
  if(!state?.pendingPrompt || state.pendingPrompt.type !== 'REACTION') return null;
  const payload = action?.payload || {};
  const requestedChoice = String(payload.choice || '').toUpperCase();
  const choice = requestedChoice === 'TIMEOUT' ? 'DECLINE' : requestedChoice;
  const option = legacyReactionOption(preState, payload);
  const reactionIid = String(
    option?.card?.iid
    || option?.reactionIid
    || payload?.reactionIid
    || ''
  );
  const templates = legalCommandTemplates(state, playerIndex)
    .filter(template=>template.type === 'ANSWER_PROMPT');
  if(choice === 'DECLINE'){
    return templates.find(template=>String(template.payload?.choice || '') === 'DECLINE') || null;
  }
  if(!['NEGATE', 'SUPPRESS'].includes(choice) || !reactionIid) return null;
  return templates.find(template=>
    String(template.payload?.choice || '') === choice
    && String(template.payload?.reactionIid || '') === reactionIid
  ) || null;
}

function statefulHandLimitTemplate(room, playerIndex, action){
  const state = room.shadowState;
  if(!state?.pendingHandLimit
    || Number(state.pendingHandLimit.playerIndex) !== Number(playerIndex)){
    return null;
  }
  const payload = action?.payload || {};
  const requestedSource = Array.isArray(payload.discardedIids)
    ? payload.discardedIids
    : payload.selectedIids;
  if(!Array.isArray(requestedSource) || requestedSource.length === 0) return null;
  const requested = requestedSource.map(String);
  if(requested.some(iid=>!iid) || new Set(requested).size !== requested.length) return null;
  const requestedSorted = [...requested].sort();
  return legalCommandTemplates(state, playerIndex)
    .filter(template=>template.type === 'DISCARD_TO_HAND_LIMIT')
    .find(template=>{
      const legal = (template.payload?.discardedIids || []).map(String).sort();
      return legal.length === requestedSorted.length
        && legal.every((iid, index)=>iid === requestedSorted[index]);
    }) || null;
}

export function inferLegacyShadowCommand(preState, postState, playerIndex, action){
  const actionType = effectiveActionType(action);
  const payload = action?.payload || {};
  if(actionType === 'END_TURN') return {type:'LEGACY_END_TURN', payload:{}};
  if(actionType === 'FORFEIT' || actionType === 'CONCEDE'){
    return {type:'LEGACY_CONCEDE', payload:{}};
  }
  if(actionType === 'HAND_LIMIT_DISCARD' || actionType === 'DISCARD_TO_HAND_LIMIT'){
    return {
      type:'LEGACY_DISCARD_TO_HAND_LIMIT',
      payload:{
        discardedIids:(payload.discardedIids || payload.selectedIids || []).map(String)
      }
    };
  }

  const placement = inferPlacementCommand(
    preState,
    postState,
    playerIndex,
    actionType,
    payload
  );
  if(placement) return placement;

  if(/MOVE|PENDING_MOVE/.test(actionType)){
    const movement = inferMoveCommand(preState, postState, playerIndex, payload);
    if(movement) return movement;
  }
  if(actionType === 'BOARD_ACTION' && selectedCardIid(payload)){
    return {
      type:'LEGACY_ACTIVATE_EFFECT',
      payload:{sourceIid:selectedCardIid(payload)}
    };
  }
  if(actionType === 'PICK_LANDSCAPE_ZONE' || actionType === 'ACTIVATE_LANDSCAPE'){
    return {
      type:'LEGACY_ACTIVATE_LANDSCAPE',
      payload:{
        zone:Number(payload.zone ?? payload.z ?? payload.targetZone)
      }
    };
  }
  return null;
}

function baseTelemetry(record, action, roomCode, seq, buildId){
  return {
    format:PHASE6_SHADOW_FORMAT,
    observedAt:new Date().toISOString(),
    roomCode,
    sequence:seq,
    command:{
      acceptedType:String(action?.type || ''),
      effectiveType:effectiveActionType(action),
      clientActionId:String(action?.clientActionId || ''),
      uid:String(action?.uid || '')
    },
    legacyHash:String(
      action?.payload?.stateHash
      || record?.accepted?.serverStateHash
      || ''
    ),
    engineHash:'',
    firstDifferingStatePath:null,
    buildId:String(buildId || ''),
    engineVersion:ENGINE_VERSION,
    rulesetVersion:RULESET_VERSION
  };
}

export class Phase6ShadowComparator {
  constructor(options = {}){
    this.rooms = new Map();
    this.buildId = String(options.buildId || '');
  }

  processRecord(record){
    const accepted = record?.accepted;
    const action = accepted?.action;
    if(!action) return null;
    const roomCode = String(record?.code || accepted?.roomCode || '').toUpperCase();
    const seq = Number(action.seq || 0) || 0;
    const telemetry = baseTelemetry(record, action, roomCode, seq, this.buildId);
    const postState = action?.payload?.postState || null;
    let room = this.rooms.get(roomCode);
    if(!room){
      room = {state:null, lastSeq:0, playerOrder:['', ''], seed:''};
      this.rooms.set(roomCode, room);
    }

    if(effectiveActionType(action) === 'MATCH_START'){
      room.state = postState;
      room.shadowState = null;
      room.lastSeq = seq;
      room.playerOrder = [
        String(action.payload?.hostUid || ''),
        String(action.payload?.guestUid || '')
      ];
      room.seed = String(action.payload?.seed || '');
      return {
        ...telemetry,
        status:'baseline',
        reason:'match-start establishes the read-only legacy pre-state'
      };
    }

    if(seq && room.lastSeq && seq <= room.lastSeq){
      return {...telemetry, status:'duplicate', reason:'sequence was already observed'};
    }
    const preState = room.state;
    room.state = postState || room.state;
    room.lastSeq = Math.max(room.lastSeq, seq);

    const actionType = effectiveActionType(action);
    if(actionType === 'EFFECT_CINEMATIC'){
      return {
        ...telemetry,
        status:'not-compared',
        coverageClass:'presentation-only',
        reason:'EFFECT_CINEMATIC is a legacy presentation-only envelope'
      };
    }
    if(!preState || !postState){
      room.shadowState = null;
      return {
        ...telemetry,
        status:'not-compared',
        coverageClass:'missing-state',
        reason:!preState ? 'missing legacy pre-state baseline' : 'accepted action has no canonical post-state'
      };
    }
    if(['STATE_SYNC', 'MATCH_RESULT'].includes(actionType)){
      room.shadowState = null;
      return {
        ...telemetry,
        status:'not-compared',
        coverageClass:actionType === 'STATE_SYNC'
          ? 'control-baseline'
          : 'gameplay-untranslated',
        reason:actionType === 'STATE_SYNC'
          ? 'STATE_SYNC establishes a new legacy control baseline'
          : 'MATCH_RESULT has no deterministic v3 command translation'
      };
    }
    const playerIndex = playerIndexFromAccepted(action, room);
    if(playerIndex === null){
      room.shadowState = null;
      return {
        ...telemetry,
        status:'not-compared',
        coverageClass:'gameplay-untranslated',
        reason:'accepted actor seat could not be identified'
      };
    }
    if(actionType === 'REACTION_CHOICE'){
      const template = statefulReactionTemplate(room, preState, playerIndex, action);
      if(template){
        const shadowState = room.shadowState;
        const shadowPlayer = shadowState.players?.[playerIndex];
        const command = {
          commandId:`shadow:${roomCode}:${seq}:reaction`,
          matchId:shadowState.matchId,
          expectedRevision:shadowState.revision,
          ...template
        };
        telemetry.command.inferred = command;
        telemetry.command.translationMethod = 'stateful-v3-reaction-prompt';
        const result = reduceCommand(shadowState, command, {
          playerId:String(shadowPlayer?.id || '')
        });
        if(!result.ok){
          room.shadowState = null;
          return {
            ...telemetry,
            status:'engine-rejection',
            reason:String(result.rejection?.reason || result.rejection?.message || 'v3 engine rejected reaction'),
            errorCode:String(result.rejection?.code || 'SHADOW_ENGINE_REJECTION')
          };
        }
        const expected = normalizeLegacyExpectedOutcomes({
          index:seq,
          playerId:String(action.uid || ''),
          playerIndex,
          expectedPostState:stateEnvelope(postState),
          rng:{
            seed:String(preState.seed || preState.matchSeed || room.seed || ''),
            counterAfter:Math.max(0, Number(postState._serverRngCounter) || 0)
          }
        });
        const difference = firstDifference(expected, engineVisibleOutcomes(result.state));
        room.shadowState = difference ? null : result.state;
        return {
          ...telemetry,
          status:difference ? 'mismatch' : 'match',
          engineHash:String(result.stateHash || ''),
          firstDifferingStatePath:difference?.path || null,
          firstDifference:difference || null
        };
      }
    }
    if(actionType === 'HAND_LIMIT_DISCARD' || actionType === 'DISCARD_TO_HAND_LIMIT'){
      const template = statefulHandLimitTemplate(room, playerIndex, action);
      if(template){
        const shadowState = room.shadowState;
        const shadowPlayer = shadowState.players?.[playerIndex];
        const command = {
          commandId:`shadow:${roomCode}:${seq}:hand-limit`,
          matchId:shadowState.matchId,
          expectedRevision:shadowState.revision,
          ...template
        };
        telemetry.command.inferred = command;
        telemetry.command.translationMethod = 'stateful-v3-hand-limit';
        const result = reduceCommand(shadowState, command, {
          playerId:String(shadowPlayer?.id || '')
        });
        if(!result.ok){
          room.shadowState = null;
          return {
            ...telemetry,
            status:'engine-rejection',
            reason:String(result.rejection?.reason || result.rejection?.message || 'v3 engine rejected hand-limit discard'),
            errorCode:String(result.rejection?.code || 'SHADOW_ENGINE_REJECTION')
          };
        }
        const expected = normalizeLegacyExpectedOutcomes({
          index:seq,
          playerId:String(action.uid || ''),
          playerIndex,
          expectedPostState:stateEnvelope(postState),
          rng:{
            seed:String(preState.seed || preState.matchSeed || room.seed || ''),
            counterAfter:Math.max(0, Number(postState._serverRngCounter) || 0)
          }
        });
        const difference = firstDifference(expected, engineVisibleOutcomes(result.state));
        room.shadowState = difference ? null : result.state;
        return {
          ...telemetry,
          status:difference ? 'mismatch' : 'match',
          engineHash:String(result.stateHash || ''),
          firstDifferingStatePath:difference?.path || null,
          firstDifference:difference || null
        };
      }
    }
    const legacyCommand = inferLegacyShadowCommand(
      preState,
      postState,
      playerIndex,
      action
    );
    if(!legacyCommand){
      room.shadowState = null;
      return {
        ...telemetry,
        status:'not-compared',
        coverageClass:'gameplay-untranslated',
        reason:`no Phase 6 translation for accepted ${actionType || '(missing type)'}`
      };
    }

    const shadowAction = {
      index:seq,
      playerId:String(room.playerOrder[playerIndex] || action.uid || `legacy-player-${playerIndex}`),
      playerIndex,
      preState:stateEnvelope(preState),
      expectedPostState:stateEnvelope(postState),
      command:{
        commandId:`shadow:${roomCode}:${seq}`,
        ...legacyCommand
      },
      choices:inferredShadowChoices(legacyCommand, preState, postState),
      rng:{
        seed:String(preState.seed || preState.matchSeed || room.seed || ''),
        counterBefore:Math.max(0, Number(preState._serverRngCounter) || 0),
        counterAfter:Math.max(0, Number(postState._serverRngCounter) || 0)
      }
    };
    telemetry.command.inferred = shadowAction.command;

    let translated;
    try{
      translated = translateLegacyRecorderAction(shadowAction, {seed:room.seed});
    }catch(error){
      room.shadowState = null;
      return {
        ...telemetry,
        status:'translation-failure',
        reason:String(error?.message || error),
        errorCode:String(error?.code || 'SHADOW_TRANSLATION_FAILED')
      };
    }
    const result = reduceTranslatedAction(translated);
    if(!result.ok){
      room.shadowState = null;
      return {
        ...telemetry,
        status:'engine-rejection',
        reason:String(result.rejection?.reason || result.rejection?.message || 'v3 engine rejected command'),
        errorCode:String(result.rejection?.code || 'SHADOW_ENGINE_REJECTION')
      };
    }
    const actual = translated.normalizeActual(result.state);
    const difference = firstDifference(translated.expected, actual);
    room.shadowState = difference ? null : result.state;
    return {
      ...telemetry,
      status:difference ? 'mismatch' : 'match',
      engineHash:String(result.stateHash || ''),
      firstDifferingStatePath:difference?.path || null,
      firstDifference:difference || null
    };
  }
}
