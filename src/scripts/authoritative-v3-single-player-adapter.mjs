import {
  createInitialState,
  multiplayerEligibleCardIds,
  multiplayerEligibleLandscapeIds,
  stableStringify,
  zoneScore
} from '../../shared/engine/index.mjs';
import {FateAuthoritativeV3LocalSession} from './authoritative-v3-local-session.mjs';
import {resolveOpeningHandArrivals} from '../../shared/engine/reducer.mjs';
import {chooseStrategicV3AiCommand} from './authoritative-v3-ai-policy.mjs';
import {AiSearchWorker} from './new-ai-worker-client.mjs';
import {FateAuthoritativeV3SinglePlayerScreen} from './authoritative-v3-single-player-screen.mjs?v=2026083101';

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

function commandWithActorActivationIntent(command){
  if(command?.type !== 'ACTIVATE_EFFECT' || command?.manualOnly !== true) return command;
  return {...command, payload:{...(command.payload || {}), userActivated:true}};
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

// The first decision gets the full strategic search. After a command has
// visibly resolved, keep replanning bounded so the final END_TURN decision
// cannot leave the board sitting idle for several seconds.
export function aiSearchContextForStep(context, completedCommands=0){
  if(completedCommands < 1)return context;
  const budgets={easy:100,medium:160,hard:220,extreme:300};
  return {...context,samples:1,nodeBudget:budgets[context.difficulty] || budgets.medium};
}

function matchingTemplate(commands, type, payload){
  const expectedType = String(type || '');
  const expectedPayload = stableStringify(payload || {});
  return commands.find(command=>String(command?.type || '') === expectedType
    && stableStringify(command?.payload || {}) === expectedPayload) || null;
}

export class FateAuthoritativeV3SinglePlayerAdapter {
  constructor({
    state,
    session = null,
    humanPlayerId,
    aiPlayerId,
    render,
    onEvents,
    aiStyle = '',
    aiDifficulty = 'medium',
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
    this.aiStyle = String(aiStyle || '');
    this.aiDifficulty = String(aiDifficulty || 'medium').toLowerCase();
    this.aiPolicy = aiPolicy;
    this.aiPlanCache = {sequence:[]};
    this.aiRunning = false;
    this.lastView = null;
    this.session.subscribe(change=>{
      // Canonical turn state must reach the screen before optional presentation
      // listeners run. Morale resolution is the first event family that fires
      // only on every second turn; letting its retired/hidden HUD listener run
      // first could leave the reducer on Turn 3 while the screen stayed on Turn 2.
      const view = this.publish(change.type);
      try{
        this.onEvents(change.events, {
          command:change.command,
          playerId:change.playerId,
          revision:change.revision,
          view
        });
      }catch(error){
        console.warn('[Fate Phase 5 Single Player] presentation event failed after state advance', error);
      }
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
      if(String(type || '') === 'ACTIVATE_LANDSCAPE'
        && String(this.lastView?.state?.landscapeId || '') === 'igb21'
        && Array.isArray(payload?.cardIds)){
        return this.session.dispatchForPlayer(
          this.humanPlayerId,
          'ACTIVATE_LANDSCAPE',
          {cardIds:payload.cardIds.map(String)},
          commandId
        );
      }
      return rejection('ILLEGAL_UI_COMMAND', 'UI action is not present in the engine legal-command projection');
    }
    const submittedPayload = template.type === 'ACTIVATE_EFFECT' && payload?.userActivated === true
      ? {...template.payload, userActivated:true}
      : template.payload;
    return this.session.dispatchForPlayer(
      this.humanPlayerId,
      template.type,
      submittedPayload,
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
    return this.dispatchHuman('ACTIVATE_EFFECT', {sourceIid:String(sourceIid || ''), userActivated:true}, commandId);
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

  dispose(){
    this.disposed=true;
    this.searchWorker?.dispose();
  }

  async runAiTurnAsync({maxCommands=128}={}){
    if(this.aiRunning)return rejection('AI_ALREADY_RUNNING','AI search already running');
    this.aiRunning=true;
    const results=[];
    try{
      for(let index=0;index<maxCommands && !this.disposed;index++){
        const canonical=this.session.state;
        const aiIndex=this.session.playerIndex(this.aiPlayerId);
        const actor=Number(canonical.pendingPrompt?.playerIndex ?? canonical.pendingHandLimit?.playerIndex ?? canonical.activePlayer);
        if(canonical.outcome || actor!==aiIndex)return {ok:true,results};
        const legal=this.session.legalCommandsFor(this.aiPlayerId);
        const projection=this.session.projectionFor(this.aiPlayerId);
        const context=aiSearchContextForStep({playerId:this.aiPlayerId,playerIndex:aiIndex,difficulty:this.aiDifficulty,style:this.aiStyle,canonicalState:canonical},results.length);
        let selected;
        if(this.aiPolicy!==chooseStrategicV3AiCommand){
          selected=await this.aiPolicy(legal,projection,context);
        }else{
          this.searchWorker ||= new AiSearchWorker();
          try{
            const decision=await this.searchWorker.decide(legal,projection,context);
            selected=decision.command;this.lastDecision=decision.trace;
          }catch(error){
            if(this.disposed)return {ok:true,results,cancelled:true};
            console.warn('[Fate AI] worker unavailable; using bounded rules search',error);
            await new Promise(resolve=>setTimeout(resolve,0));
            selected=this.aiPolicy(legal,projection,{...context,samples:1,nodeBudget:120});
          }
        }
        if(this.disposed)return {ok:true,results,cancelled:true};
        if(this.session.state.revision!==canonical.revision)continue;
        let template=selected && matchingTemplate(legal,selected.type,selected.payload);
        if(!template){
          // Recover with the shared policy and its strategic restrictions,
          // rather than silently abandoning the still-active AI turn.
          const recovered=chooseStrategicV3AiCommand(legal,projection,{...context,samples:1,nodeBudget:120});
          template=recovered && matchingTemplate(legal,recovered.type,recovered.payload);
        }
        if(!template)return rejection('AI_INVALID_COMMAND','AI search returned no legal move');
        const submitted=commandWithActorActivationIntent(template);
        const result=this.session.dispatchForPlayer(this.aiPlayerId,submitted.type,submitted.payload);
        results.push(result);
        if(!result.ok)return result;
        await new Promise(resolve=>setTimeout(resolve,80));
      }
      return this.disposed ? {ok:true,results,cancelled:true} : rejection('AI_COMMAND_LIMIT','AI action limit reached');
    }finally{this.aiRunning=false;}
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
            humanPlayerIndex:this.session.playerIndex(this.humanPlayerId),
            style:this.aiStyle,
            difficulty:this.aiDifficulty,
            canonicalState:canonical,
            planCache:this.aiPlanCache
          }
        );
        if(!selected){
          return rejection('AI_NO_LEGAL_COMMAND', 'authoritative v3 AI could not choose a legal command');
        }
        let template = legal.includes(selected)
          ? selected
          : matchingTemplate(legal, selected.type, selected.payload);
        if(!template){
          // A policy must normally return one of the supplied legal templates,
          // but a malformed policy result must never strand the AI turn. Fall
          // back to the same deterministic ordering used by the safe policy.
          template = chooseDeterministicV3AiCommand(legal);
        }
        if(!template){
          return rejection('AI_NO_LEGAL_COMMAND', 'authoritative v3 AI could not choose a legal command');
        }
        const submitted = commandWithActorActivationIntent(template);
        const result = this.session.dispatchForPlayer(
          this.aiPlayerId,
          submitted.type,
          submitted.payload
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
    aiStyle,
    aiDifficulty,
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
      aiStyle,
      aiDifficulty,
      aiPolicy
    });
  }
}

function compactCardDefinition(card){
  return {
    id:String(card?.id || ''),
    name:String(card?.name || card?.id || ''),
    ability:String(card?.ability || ''),
    effect:String(card?.effect || ''),
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
  const matchId=String(input.matchId || `LOCALV3-${globalThis.crypto?.randomUUID?.() || Date.now()}`);
  return resolveOpeningHandArrivals(createInitialState({
    matchId,
    seed:String(input.seed || matchId),
    players,
    cardDefinitions:(input.cardDefinitions || []).map(compactCardDefinition),
    handSize:input.handSize,
    maxTurns:input.maxTurns,
    activePlayer:input.activePlayer,
    landscapeId,
    gameSettings:{
      healthPressureSeals:input.healthPressureSeals !== false,
      pressureCardReworks:input.healthPressureSeals === true && input.pressureCardReworks === true,
      zoneControlRework:input.zoneControlRework !== false,
      expandedContestedRow:input.zoneControlRework !== false
        && input.expandedContestedRow !== false,
      zoneLayout444:input.zoneControlRework !== false
        && input.expandedContestedRow !== false
        && input.zoneLayout444 !== false
    }
  }));
}

export function installFateV3SinglePlayerBrowserAdapter(windowRef = globalThis.window){
  if(!windowRef) return null;
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
    activeAdapter?.dispose();
    activeScreen?.destroy();
    activeScreen = null;
    activeAdapter = null;
    if(showTitle) windowRef.showScreen?.('s-title');
    return true;
  }
  function mountActiveScreen(adapter, definitions, options = {}){
    activeScreen?.destroy();
    activeScreen = new FateAuthoritativeV3SinglePlayerScreen({
      windowRef,
      adapter,
      cardDefinitions:definitions,
      turnTimeLimit:options.turnTimeLimit,
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
        aiStyle:String(input.aiStyle || ''),
        aiDifficulty:String(input.aiDifficulty || 'medium'),
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
        aiStyle:String(input.aiStyle || ''),
        aiDifficulty:String(input.aiDifficulty || 'medium'),
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
        healthPressureSeals:windowRef.FATE_MORALE_PRESSURE_RULES_ENABLED === true && game._freePlayGameSettings?.healthPressureSeals !== false,
        pressureCardReworks:windowRef.FATE_MORALE_PRESSURE_RULES_ENABLED === true
          && windowRef.FATE_PRESSURE_CARD_REWORKS_ENABLED === true && game._freePlayGameSettings?.pressureCardReworks !== false,
        zoneControlRework:windowRef.FATE_ZONE_CONTROL_REWORK_ENABLED !== false,
        expandedContestedRow:windowRef.FATE_ZONE_CONTROL_REWORK_ENABLED !== false
          && windowRef.FATE_EXPANDED_CONTESTED_ROW_ENABLED !== false,
        zoneLayout444:windowRef.FATE_ZONE_CONTROL_REWORK_ENABLED !== false
          && windowRef.FATE_EXPANDED_CONTESTED_ROW_ENABLED !== false
          && windowRef.FATE_ZONE_444_LAYOUT_ENABLED !== false,
        aiStyle:String(options.aiStyle || game._selectedAI?.style || ''),
        aiDifficulty:String(options.aiDifficulty || game.aiDifficulty || 'medium'),
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
      const game = windowRef.getFateGameState?.();
      const querySeconds = Number(new URLSearchParams(windowRef.location?.search || '').get('fateV3TurnSeconds'));
      const configuredSeconds = Number(game?._turnTimerSeconds);
      let adapterCompletionQueued=false;
      activeAdapter?.dispose();
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
          if(view.state.outcome && typeof options.onComplete === 'function' && !adapterCompletionQueued){
            adapterCompletionQueued=true;
            const completed={...view,finalZoneScores:[0,1,2].map(z=>[0,1].map(p=>zoneScore(view.state,z,p)))};
            queueMicrotask(()=>options.onComplete(completed));
          }
        },
        onEvents(events, metadata){
          activeScreen?.presentEvents?.(events, metadata);
          windowRef.dispatchEvent?.(new windowRef.CustomEvent('fate-authority-v3-single-player-events', {
            detail:{events, metadata}
          }));
        }
      });
      mountActiveScreen(adapter, definitions, {
        turnTimeLimit:Number.isFinite(querySeconds) && querySeconds > 0
          ? querySeconds
          : (Number.isFinite(configuredSeconds) && configuredSeconds > 0 ? configuredSeconds : 180)
      });
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
        onEvents(events, metadata){
          activeScreen?.presentEvents?.(events, metadata);
          callbacks.onEvents?.(events, metadata);
          windowRef.dispatchEvent?.(new windowRef.CustomEvent('fate-authority-v3-single-player-events', {
            detail:{events, metadata}
          }));
        }
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
