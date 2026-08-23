import {
  createInitialState,
  multiplayerEligibleCardIds,
  multiplayerEligibleLandscapeIds,
  stableStringify
} from '../../shared/engine/index.mjs';
import {FateAuthoritativeV3LocalSession} from './authoritative-v3-local-session.mjs';
import {chooseStrategicV3AiCommand} from './authoritative-v3-ai-policy.mjs';
import {FateAuthoritativeV3SinglePlayerScreen} from './authoritative-v3-single-player-screen.mjs';

export const FATE_V3_SINGLE_PLAYER_QUERY_FLAG = 'fateV3SinglePlayer';
const RECORDER_QUERY_FLAG = 'fateV3Recorder';
const MODE = 'authoritative-v3-single-player';

export function isFateV3SinglePlayerExplicitlyEnabled(search = ''){
  return new URLSearchParams(String(search || '')).get(FATE_V3_SINGLE_PLAYER_QUERY_FLAG) === '1';
}

function rejection(code, reason){
  return {ok:false, rejection:{code, reason}};
}

function commandPriority(command){
  const priorities = {
    ANSWER_PROMPT:0,
    DISCARD_TO_HAND_LIMIT:1,
    ACTIVATE_EFFECT:2,
    ACTIVATE_LANDSCAPE:3,
    SET_CARD_FROM_DECK:4,
    SET_ADAPTIVE_TOKEN:5,
    SET_CARD:6,
    CONSOLIDATE_CARD:7,
    FLIP_CARD:8,
    MOVE_CARD:9,
    END_TURN:90,
    CONCEDE:100
  };
  return priorities[command?.type] ?? 50;
}

// The default Phase 5 policy is deliberately deterministic. It chooses only
// from engine-generated legal commands and submits the chosen command back to
// the local session; it never edits canonical state.
export function chooseDeterministicV3AiCommand(commands = []){
  return [...commands]
    .filter(command=>command?.type !== 'CONCEDE')
    .sort((left, right)=>
      commandPriority(left) - commandPriority(right)
      || stableStringify(left).localeCompare(stableStringify(right))
    )[0] || null;
}

function matchingTemplate(commands, type, payload){
  const expected = stableStringify({type:String(type || ''), payload:payload || {}});
  return commands.find(command=>stableStringify(command) === expected) || null;
}

export class FateAuthoritativeV3SinglePlayerAdapter {
  constructor({
    state,
    session = null,
    humanPlayerId,
    aiPlayerId,
    render,
    onEvents,
    aiPolicy = chooseStrategicV3AiCommand
  }){
    this.humanPlayerId = String(humanPlayerId || '');
    this.aiPlayerId = String(aiPlayerId || '');
    if(!this.humanPlayerId || !this.aiPlayerId || this.humanPlayerId === this.aiPlayerId){
      throw new Error('single-player adapter requires distinct human and AI player IDs');
    }
    this.session = session || new FateAuthoritativeV3LocalSession({
      state,
      perspectivePlayerId:this.humanPlayerId
    });
    if(this.session.playerIndex(this.aiPlayerId) < 0){
      throw new Error('single-player AI must occupy the other match seat');
    }
    this.render = typeof render === 'function' ? render : ()=>{};
    this.onEvents = typeof onEvents === 'function' ? onEvents : ()=>{};
    this.aiPolicy = aiPolicy;
    this.aiRunning = false;
    this.lastView = null;
    this.session.subscribe(change=>{
      this.onEvents(change.events, {
        command:change.command,
        playerId:change.playerId,
        revision:change.revision
      });
      this.publish(change.type);
    });
    this.publish('SESSION_CREATED');
  }

  view(){
    const state = this.session.projectionFor(this.humanPlayerId);
    return {
      mode:MODE,
      authority:'shared-engine-local-session',
      playerId:this.humanPlayerId,
      playerIndex:this.session.playerIndex(this.humanPlayerId),
      aiPlayerId:this.aiPlayerId,
      aiPlayerIndex:this.session.playerIndex(this.aiPlayerId),
      state,
      legalCommands:this.session.legalCommandsFor(this.humanPlayerId)
    };
  }

  publish(reason = 'STATE_CHANGED'){
    this.lastView = this.view();
    this.render(this.lastView, {reason});
    return this.lastView;
  }

  dispatchHuman(type, payload = {}, commandId = ''){
    const template = matchingTemplate(
      this.session.legalCommandsFor(this.humanPlayerId),
      type,
      payload
    );
    if(!template){
      if(String(type || '') === 'DISCARD_TO_HAND_LIMIT' && Array.isArray(payload?.discardedIids)){
        // Voluntary over-discard batches are reducer-validated even though the
        // compact legal projection enumerates only minimum-size combinations.
        return this.session.dispatchForPlayer(
          this.humanPlayerId,
          'DISCARD_TO_HAND_LIMIT',
          {discardedIids:payload.discardedIids.map(String)},
          commandId
        );
      }
      return rejection('ILLEGAL_UI_COMMAND', 'UI action is not present in the engine legal-command projection');
    }
    return this.session.dispatchForPlayer(
      this.humanPlayerId,
      template.type,
      template.payload,
      commandId
    );
  }

  dispatchLegalCommand(command, commandId = ''){
    return this.dispatchHuman(command?.type, command?.payload || {}, commandId);
  }

  setCard(cardIid, destination, commandId = ''){
    return this.dispatchHuman('SET_CARD', {cardIid:String(cardIid || ''), destination}, commandId);
  }

  consolidateCard(cardIid, tributeIids, destination, options = {}){
    return this.dispatchHuman('CONSOLIDATE_CARD', {
      cardIid:String(cardIid || ''),
      tributeIids:(tributeIids || []).map(String),
      destination,
      ...(options.faceDown === true ? {faceDown:true} : {})
    }, options.commandId || '');
  }

  answerPrompt(payload, commandId = ''){
    return this.dispatchHuman('ANSWER_PROMPT', payload, commandId);
  }

  moveCard(cardIid, destination, commandId = ''){
    return this.dispatchHuman('MOVE_CARD', {cardIid:String(cardIid || ''), destination}, commandId);
  }

  flipCard(cardIid, commandId = ''){
    return this.dispatchHuman('FLIP_CARD', {cardIid:String(cardIid || '')}, commandId);
  }

  activateEffect(sourceIid, commandId = ''){
    return this.dispatchHuman('ACTIVATE_EFFECT', {sourceIid:String(sourceIid || '')}, commandId);
  }

  activateLandscape(payload, commandId = ''){
    return this.dispatchHuman('ACTIVATE_LANDSCAPE', payload || {}, commandId);
  }

  discardToHandLimit(discardedIids, commandId = ''){
    return this.dispatchHuman('DISCARD_TO_HAND_LIMIT', {
      discardedIids:(discardedIids || []).map(String)
    }, commandId);
  }

  endTurn(commandId = ''){
    return this.dispatchHuman('END_TURN', {}, commandId);
  }

  runAiTurn({maxCommands = 128} = {}){
    if(this.aiRunning) return rejection('AI_ALREADY_RUNNING', 'authoritative v3 AI loop is already running');
    const limit = Math.max(1, Math.min(1024, Number(maxCommands) || 128));
    this.aiRunning = true;
    const results = [];
    try{
      for(let index = 0; index < limit; index += 1){
        const canonical = this.session.state;
        const aiIndex = this.session.playerIndex(this.aiPlayerId);
        const ownsPrompt = Number(canonical.pendingPrompt?.playerIndex) === aiIndex;
        const ownsHandLimit = Number(canonical.pendingHandLimit?.playerIndex) === aiIndex;
        if(canonical.outcome || (!ownsPrompt && !ownsHandLimit && canonical.activePlayer !== aiIndex)){
          return {ok:true, results, state:this.session.projectionFor(this.humanPlayerId)};
        }
        const legal = this.session.legalCommandsFor(this.aiPlayerId);
        const selected = this.aiPolicy(
          legal,
          this.session.projectionFor(this.aiPlayerId),
          {
            playerId:this.aiPlayerId,
            playerIndex:aiIndex,
            humanPlayerId:this.humanPlayerId,
            humanPlayerIndex:this.session.playerIndex(this.humanPlayerId)
          }
        );
        if(!selected){
          return rejection('AI_NO_LEGAL_COMMAND', 'authoritative v3 AI could not choose a legal command');
        }
        const template = matchingTemplate(legal, selected.type, selected.payload);
        if(!template){
          return rejection('AI_POLICY_ILLEGAL_COMMAND', 'authoritative v3 AI policy returned a non-legal command');
        }
        const result = this.session.dispatchForPlayer(
          this.aiPlayerId,
          template.type,
          template.payload
        );
        results.push(result);
        if(!result.ok) return result;
      }
      return rejection('AI_COMMAND_LIMIT', `authoritative v3 AI exceeded ${limit} commands`);
    }finally{
      this.aiRunning = false;
    }
  }

  exportReplay(){
    return this.session.exportReplay();
  }

  static recover({
    initialState,
    replay,
    humanPlayerId,
    aiPlayerId,
    render,
    onEvents,
    aiPolicy
  }){
    const session = FateAuthoritativeV3LocalSession.recover({
      initialState,
      replay,
      perspectivePlayerId:humanPlayerId
    });
    return new FateAuthoritativeV3SinglePlayerAdapter({
      session,
      humanPlayerId,
      aiPlayerId,
      render,
      onEvents,
      aiPolicy
    });
  }
}

function compactCardDefinition(card){
  return {
    id:String(card?.id || ''),
    name:String(card?.name || card?.id || ''),
    ability:String(card?.ability || ''),
    type:String(card?.type || 'Supporter'),
    aff:String(card?.aff || card?.affiliation || ''),
    rarity:String(card?.rarity || ''),
    fate:Number(card?.fate || 0),
    cost:Number(card?.cost || 0)
  };
}

export function createFateV3SinglePlayerState(input = {}){
  const players = Array.isArray(input.players) ? input.players : [];
  if(players.length !== 2) throw new Error('single-player v3 match requires exactly two players');
  const eligibleCards = new Set(multiplayerEligibleCardIds());
  for(const player of players){
    const deckIds = Array.isArray(player?.deckIds) ? player.deckIds.map(String) : [];
    if(deckIds.length !== 40) throw new Error('single-player v3 decks must contain exactly 40 cards');
    const unsupported = deckIds.find(id=>!eligibleCards.has(id));
    if(unsupported) throw new Error(`card ${unsupported} is not eligible for single-player v3`);
  }
  const landscapeId = String(input.landscapeId || 'igb1');
  if(!multiplayerEligibleLandscapeIds().includes(landscapeId)){
    throw new Error(`landscape ${landscapeId || '(missing)'} is not eligible for single-player v3`);
  }
  return createInitialState({
    matchId:String(input.matchId || `LOCALV3-${Date.now()}`),
    seed:String(input.seed || input.matchId || 'fate-v3-local'),
    players,
    cardDefinitions:(input.cardDefinitions || []).map(compactCardDefinition),
    handSize:input.handSize,
    maxTurns:input.maxTurns,
    activePlayer:input.activePlayer,
    landscapeId
  });
}

export function installFateV3SinglePlayerBrowserAdapter(windowRef = globalThis.window){
  if(!windowRef || !isFateV3SinglePlayerExplicitlyEnabled(windowRef.location?.search || '')) return null;
  const params = new URLSearchParams(windowRef.location?.search || '');
  if(params.get(RECORDER_QUERY_FLAG) === '1'){
    throw new Error('fateV3SinglePlayer and fateV3Recorder are mutually exclusive authority modes');
  }
  if(windowRef.FateAuthorityV3SinglePlayer) return windowRef.FateAuthorityV3SinglePlayer;
  let activeAdapter = null;
  let activeScreen = null;
  function requireActiveAdapter(){
    if(!activeAdapter) throw new Error('authoritative v3 single-player match has not been created');
    return activeAdapter;
  }
  function eventCallback(type){
    return (value, metadata)=>{
      windowRef.dispatchEvent?.(new windowRef.CustomEvent(type, {
        detail:type.endsWith('-state')
          ? {view:value, metadata}
          : {events:value, metadata}
      }));
    };
  }
  function stopActiveMatch({showTitle = false} = {}){
    activeScreen?.destroy();
    activeScreen = null;
    activeAdapter = null;
    if(showTitle) windowRef.showScreen?.('s-title');
    return true;
  }
  function mountActiveScreen(adapter, definitions){
    activeScreen?.destroy();
    activeScreen = new FateAuthoritativeV3SinglePlayerScreen({
      windowRef,
      adapter,
      cardDefinitions:definitions,
      onExit(){
        stopActiveMatch({showTitle:true});
      }
    }).mount();
    return activeScreen;
  }
  const api = Object.freeze({
    enabled:true,
    mode:MODE,
    queryFlag:FATE_V3_SINGLE_PLAYER_QUERY_FLAG,
    legacyGameplayAuthorityChanged:false,
    createMatch(input, callbacks = {}){
      const state = createFateV3SinglePlayerState(input);
      activeAdapter = new FateAuthoritativeV3SinglePlayerAdapter({
        state,
        humanPlayerId:String(input.players[0].id),
        aiPlayerId:String(input.players[1].id),
        render:callbacks.render || eventCallback('fate-authority-v3-single-player-state'),
        onEvents:callbacks.onEvents || eventCallback('fate-authority-v3-single-player-events'),
        aiPolicy:callbacks.aiPolicy
      });
      return activeAdapter;
    },
    recoverMatch(input, callbacks = {}){
      activeAdapter = FateAuthoritativeV3SinglePlayerAdapter.recover({
        initialState:input.initialState,
        replay:input.replay,
        humanPlayerId:String(input.humanPlayerId || ''),
        aiPlayerId:String(input.aiPlayerId || ''),
        render:callbacks.render || eventCallback('fate-authority-v3-single-player-state'),
        onEvents:callbacks.onEvents || eventCallback('fate-authority-v3-single-player-events'),
        aiPolicy:callbacks.aiPolicy
      });
      return activeAdapter;
    },
    createFromLegacySelection(options = {}, callbacks = {}){
      const game = windowRef.getFateGameState?.();
      if(!game) throw new Error('legacy deck-selection state is unavailable');
      if(game._onlineRoomCode || game._onlineMatchId || game.online === true || game._isOnline === true){
        throw new Error('authoritative v3 local session cannot start from an online match');
      }
      const definitions = windowRef.getFateCardDefinitions?.();
      if(!Array.isArray(definitions)) throw new Error('card definition bridge is unavailable');
      return api.createMatch({
        matchId:options.matchId,
        seed:options.seed,
        landscapeId:options.landscapeId || game.landscapeId || 'igb1',
        handSize:options.handSize,
        maxTurns:options.maxTurns || game.maxTurns,
        activePlayer:options.activePlayer,
        cardDefinitions:definitions,
        players:[
          {
            id:String(options.humanPlayerId || 'local-human'),
            name:String(options.humanName || game.players?.[0]?.name || 'Player 1'),
            deckIds:[...(game.p1Deck || [])]
          },
          {
            id:String(options.aiPlayerId || 'local-ai'),
            name:String(options.aiName || game.players?.[1]?.name || 'AI'),
            deckIds:[...(game.p2Deck || [])]
          }
        ]
      }, callbacks);
    },
    startFromLegacyUi(options = {}){
      if(options.vsAI !== true) throw new Error('authoritative v3 single-player requires an AI match');
      const definitions = windowRef.getFateCardDefinitions?.();
      if(!Array.isArray(definitions)) throw new Error('card definition bridge is unavailable');
      activeScreen?.destroy();
      activeScreen = null;
      const adapter = api.createFromLegacySelection({
        matchId:options.matchId,
        seed:options.seed,
        landscapeId:options.landscapeId,
        activePlayer:options.activePlayer ?? 0
      }, {
        render(view){
          activeScreen?.render(view);
        },
        onEvents(events, metadata){
          windowRef.dispatchEvent?.(new windowRef.CustomEvent('fate-authority-v3-single-player-events', {
            detail:{events, metadata}
          }));
        }
      });
      mountActiveScreen(adapter, definitions);
      return adapter;
    },
    resumeOnGameScreen(input, callbacks = {}){
      const definitions = windowRef.getFateCardDefinitions?.();
      if(!Array.isArray(definitions)) throw new Error('card definition bridge is unavailable');
      activeScreen?.destroy();
      activeScreen = null;
      const adapter = api.recoverMatch(input, {
        ...callbacks,
        render(view){
          activeScreen?.render(view);
          callbacks.render?.(view);
        },
        onEvents:callbacks.onEvents
      });
      mountActiveScreen(adapter, definitions);
      return adapter;
    },
    dispatch(command, commandId = ''){
      return requireActiveAdapter().dispatchLegalCommand(command, commandId);
    },
    runAiTurn(options){
      return requireActiveAdapter().runAiTurn(options);
    },
    view(){
      return requireActiveAdapter().view();
    },
    current(){
      return activeAdapter;
    },
    currentScreen(){
      return activeScreen;
    },
    stopMatch(options){
      return stopActiveMatch(options);
    }
  });
  windowRef.FateAuthorityV3SinglePlayer = api;
  windowRef.dispatchEvent?.(new windowRef.CustomEvent('fate-authority-v3-single-player-ready', {
    detail:{
      mode:MODE,
      queryFlag:FATE_V3_SINGLE_PLAYER_QUERY_FLAG,
      legacyGameplayAuthorityChanged:false
    }
  }));
  return api;
}

if(typeof window !== 'undefined'){
  installFateV3SinglePlayerBrowserAdapter(window);
}
