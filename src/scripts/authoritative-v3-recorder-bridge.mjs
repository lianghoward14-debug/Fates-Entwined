import {ENGINE_VERSION, RULESET_VERSION} from '../../shared/engine/index.mjs';
import {FateLegacyActionRecorderV3} from './authoritative-v3-legacy-recorder.mjs';
import {
  captureLegacyCanonicalState,
  captureLegacyVisibleOutcomes,
  legacyChoicesFromAIMove,
  legacyCommandFromAIMove
} from './authoritative-v3-legacy-capture.mjs';

const RECORDER_QUERY_FLAG = 'fateV3Recorder';
const LEGACY_CORPUS_QUERY_FLAG = 'fateV3LegacyCorpus';

function enabledByExplicitFlag(){
  return new URLSearchParams(window.location.search || '').get(RECORDER_QUERY_FLAG) === '1';
}

function corpusDriverEnabled(){
  const params = new URLSearchParams(window.location.search || '');
  return params.get(RECORDER_QUERY_FLAG) === '1'
    && params.get(LEGACY_CORPUS_QUERY_FLAG) === '1'
    && params.get('fateV3SinglePlayer') !== '1';
}

function hashSeed(seed){
  let hash = 2166136261;
  for(const character of String(seed || 'legacy-corpus')){
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed){
  let value = hashSeed(seed);
  return function nextSeededRandom(){
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function activeGame(){
  if(typeof window.getFateGameState === 'function') return window.getFateGameState();
  return typeof window.FATE_GAME_STATE === 'object' && window.FATE_GAME_STATE
    ? window.FATE_GAME_STATE
    : null;
}

function isLegacySinglePlayer(game){
  if(!game) return false;
  return !game._onlineRoomCode
    && !game._onlineMatchId
    && game.online !== true
    && game._isOnline !== true;
}

function matchSeed(game){
  return String(game?.seed || game?.matchSeed || game?.roomSeed || game?._onlineSeed || 'legacy-unseeded');
}

function playerId(game, playerIndex){
  return String(game?.players?.[playerIndex]?.name || `legacy-player-${playerIndex}`);
}

function legacyCardLocation(stateEnvelope, iid){
  const state = stateEnvelope?.format === 'fates-legacy-canonical-state-v1'
    ? stateEnvelope.state
    : stateEnvelope;
  const needle = String(iid || '');
  if(!needle) return null;
  for(let zone = 0; zone < (state?.board?.length || 0); zone += 1){
    for(let row = 0; row < (state.board[zone]?.length || 0); row += 1){
      for(let column = 0; column < (state.board[zone][row]?.length || 0); column += 1){
        if(String(state.board[zone][row][column]?.iid || '') === needle){
          return {zone, row, column};
        }
      }
    }
  }
  return null;
}

function legacyCardAt(stateEnvelope, destination){
  const state = stateEnvelope?.format === 'fates-legacy-canonical-state-v1'
    ? stateEnvelope.state
    : stateEnvelope;
  return state?.board?.[Number(destination?.zone)]
    ?.[Number(destination?.row)]
    ?.[Number(destination?.column)] || null;
}

function sameLegacyDestination(left, right){
  return Number(left?.zone ?? left?.z) === Number(right?.zone ?? right?.z)
    && Number(left?.row ?? left?.r) === Number(right?.row ?? right?.r)
    && Number(left?.column ?? left?.c) === Number(right?.column ?? right?.c);
}

function resolvedLegacyChoices(token, postState){
  const choices = Array.isArray(token.choices) ? [...token.choices] : [];
  const command = token.command || {};
  const cardIid = String(command.cardIid || '');
  const cardId = String(command.cardId || '');
  if(cardIid && cardId === '62'){
    const finalDestination = legacyCardLocation(postState, cardIid);
    if(finalDestination && !sameLegacyDestination(finalDestination, command.destination)){
      choices.push({kind:'AI_RESOLVED_DESTINATION', destination:finalDestination});
    }else{
      choices.push({kind:'AI_RESOLVED_PROMPT_CHOICE', choice:'DECLINE'});
    }
  }
  const beforeLandscape = String(token.preState?.state?.landscapeId || '');
  const afterLandscape = String(postState?.state?.landscapeId || '');
  if(afterLandscape && afterLandscape !== beforeLandscape){
    choices.push({kind:'AI_RESOLVED_LANDSCAPE', choice:afterLandscape});
  }
  return choices;
}

function reviewedLegacyMismatch(token, postState){
  const command = token.command || {};
  const pre = token.preState?.state || {};
  const post = postState?.state || {};
  const playerIndex = Number(token.playerIndex) === 1 ? 1 : 0;
  if(String(command.type || '') === 'LEGACY_SET_CARD' && String(command.cardId || '') === '65'){
    const location = legacyCardLocation(postState, command.cardIid);
    const placed = legacyCardAt(postState, location);
    if(placed && Number(placed.currentFate ?? placed.fate) === 1){
      return {
        classification:'existing-single-player-defect',
        rationale:'Legacy AI placement leaves 1st West Caribbea Marines at 1 Fate even though its card text raises it to 4; authoritative v3 applies the documented when-set rule.'
      };
    }
  }
  if(String(command.cardId || '') === '96'
    && String(pre.landscapeId || '') === 'igb4'
    && (pre.players?.[playerIndex]?.discard?.length || 0) > (post.players?.[playerIndex]?.discard?.length || 0)){
    return {
      classification:'existing-single-player-defect',
      rationale:'Legacy Snow Shoveler bypasses Zion Canyon and recovers discarded cards even though the active landscape says discarded cards cannot be recovered; authoritative v3 preserves the landscape prohibition.'
    };
  }
  if(Number(pre?._handLimitDiscard?.player) === playerIndex
    && String(command.type || '') !== 'LEGACY_DISCARD_TO_HAND_LIMIT'){
    return {
      classification:'existing-single-player-defect',
      rationale:'Legacy AI continued with a normal card action while mandatory hand-limit resolution was deferred, folding that discard into the later action; authoritative v3 requires the hand-limit command to resolve before any normal action.'
    };
  }
  return null;
}

function downloadCorpus(corpus){
  const blob = new Blob([JSON.stringify(corpus, null, 2) + '\n'], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fates-legacy-corpus-${Date.now()}.json`;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url), 0);
}

export function installLegacyRecorderBridge(){
  if(!enabledByExplicitFlag()) return null;
  if(window.FateAuthorityV3LegacyRecorderBridge) return window.FateAuthorityV3LegacyRecorderBridge;

  const initialGame = activeGame();
  const recorder = new FateLegacyActionRecorderV3({
    engineVersion:ENGINE_VERSION,
    rulesetVersion:RULESET_VERSION,
    seed:matchSeed(initialGame)
  });
  const nativeRandom = Math.random.bind(Math);
  let randomSource = nativeRandom;
  let activeRandomTrace = null;
  let tokenCounter = 0;

  Math.random = function fatePhase0RecordedRandom(){
    const value = randomSource();
    if(activeRandomTrace) activeRandomTrace.samples.push(value);
    return value;
  };

  function begin(command, choices){
    const game = activeGame();
    if(!isLegacySinglePlayer(game)) return null;
    const token = {
      tokenId:`legacy-action-${++tokenCounter}`,
      playerIndex:Number.isInteger(Number(game.currentPlayer)) ? Number(game.currentPlayer) : null,
      preState:captureLegacyCanonicalState(game),
      command,
      choices:Array.isArray(choices) ? choices : [],
      rng:{
        seed:matchSeed(game),
        counterBefore:Math.max(0, Number(game._serverRngCounter) || 0),
        mathRandomSamples:[]
      },
      context:{
        captureMode:String(game._legacyCorpusCaptureMode || ''),
        matchIndex:Number.isInteger(Number(game._legacyCorpusMatchIndex))
          ? Number(game._legacyCorpusMatchIndex)
          : null,
        landscapeId:String(game.landscapeId || '')
      }
    };
    activeRandomTrace = {tokenId:token.tokenId, samples:token.rng.mathRandomSamples};
    return token;
  }

  function finish(token){
    if(!token) return null;
    const game = activeGame();
    if(activeRandomTrace?.tokenId === token.tokenId) activeRandomTrace = null;
    if(!isLegacySinglePlayer(game)) return null;
    token.rng.counterAfter = Math.max(0, Number(game._serverRngCounter) || 0);
    const expectedPostState = captureLegacyCanonicalState(game);
    return recorder.record({
      preState:token.preState,
      playerId:playerId(game, token.playerIndex),
      playerIndex:token.playerIndex,
      command:token.command,
      choices:resolvedLegacyChoices(token, expectedPostState),
      rng:token.rng,
      context:token.context,
      expectedMismatch:reviewedLegacyMismatch(token, expectedPostState),
      expectedPostState,
      visibleOutcomes:captureLegacyVisibleOutcomes(
        game,
        typeof window.getBaseZoneScore === 'function' ? window.getBaseZoneScore : null
      )
    });
  }

  const bridge = Object.freeze({
    enabled:true,
    mode:'observe-only',
    authorityRoutingChanged:false,
    beginAIAction(move){
      return begin(legacyCommandFromAIMove(move), legacyChoicesFromAIMove(move));
    },
    beginNamedAction(type, payload = {}, choices = []){
      return begin({type:String(type || 'LEGACY_ACTION'), payload}, choices);
    },
    finishAction:finish,
    cancelAction(token){
      if(activeRandomTrace?.tokenId === token?.tokenId) activeRandomTrace = null;
    },
    configureDeterministicRandom(seed){
      if(!corpusDriverEnabled()){
        throw new Error('deterministic legacy randomness is restricted to fateV3LegacyCorpus=1 recorder sessions');
      }
      const normalizedSeed = String(seed || 'legacy-corpus');
      randomSource = seededRandom(normalizedSeed);
      recorder.metadata.seed = normalizedSeed;
      return normalizedSeed;
    },
    resetCorpus(seed){
      if(!corpusDriverEnabled()){
        throw new Error('legacy corpus reset is restricted to fateV3LegacyCorpus=1 recorder sessions');
      }
      recorder.clear({seed});
      tokenCounter = 0;
      activeRandomTrace = null;
    },
    exportCorpus(){
      return recorder.export();
    },
    downloadCorpus(){
      const corpus = recorder.export();
      downloadCorpus(corpus);
      return corpus.actions.length;
    }
  });

  window.FateAuthorityV3LegacyRecorderBridge = bridge;
  window.fateExportAuthorityV3Corpus = ()=>bridge.downloadCorpus();
  window.dispatchEvent(new CustomEvent('fate-authority-v3-recorder-ready', {
    detail:{mode:bridge.mode, authorityRoutingChanged:false}
  }));
  return bridge;
}

installLegacyRecorderBridge();
