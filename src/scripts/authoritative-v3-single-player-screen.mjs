import {stableStringify, zoneScore, zoneScoreBreakdown} from '../../shared/engine/index.mjs';

const ACTIVE_CLASS = 'fate-authority-v3-single-player-active';
const STYLE_ID = 'fate-authority-v3-single-player-style';
const DIRECT_DESTINATION_COMMANDS = new Set([
  'SET_CARD',
  'SET_CARD_FROM_DECK',
  'CONSOLIDATE_CARD',
  'MOVE_CARD',
  'SET_ADAPTIVE_TOKEN'
]);

function coordinateKey(destination){
  return `${Number(destination?.z)}:${Number(destination?.r)}:${Number(destination?.c)}`;
}

function sameStringSet(left = [], right = []){
  return stableStringify([...left].map(String).sort()) === stableStringify([...right].map(String).sort());
}

function sameDestinationSet(left = [], right = []){
  return stableStringify([...left].map(coordinateKey).sort()) === stableStringify([...right].map(coordinateKey).sort());
}

function zoneBreakdownText(breakdown, label){
  const lines = [label, `Card Fate: ${breakdown.cardFate}`];
  const grouped = new Map();
  for(const modifier of breakdown.modifiers || []){
    const name = String(modifier.reason || 'ZONE_FATE_EFFECT')
      .replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char=>char.toUpperCase());
    grouped.set(name, Number(grouped.get(name) || 0) + Number(modifier.value || 0));
  }
  for(const [name, value] of grouped){
    lines.push(`${name}: ${value > 0 ? '+' : ''}${value}`);
  }
  const penalty = breakdown.moralePenalty || {};
  if(Number(penalty.percent) > 0){
    const reason = penalty.reason === 'MORALE_DEPLETED'
      ? 'Morale depleted'
      : (penalty.reason === 'MORALE_CRITICAL' ? 'Morale at 25% or lower' : 'Lower Morale than opponent');
    lines.push(`${reason}: -${penalty.percent}% (-${penalty.amount} Fate)`);
  }
  lines.push(`Zone Fate: ${breakdown.score}`);
  return lines.join('\n');
}

export function fateV3CommandsForCard(commands, cardIid){
  const iid = String(cardIid || '');
  return (commands || []).filter(command=>{
    const payload = command?.payload || {};
    return String(payload.cardIid || payload.sourceIid || payload.targetIid || payload.reactionIid || '') === iid
      || (payload.tributeIids || []).map(String).includes(iid)
      || (payload.discardIids || []).map(String).includes(iid)
      || (payload.discardedIids || []).map(String).includes(iid)
      || String(payload.selectedIid || '') === iid
      || (payload.selectedIids || []).map(String).includes(iid);
  });
}

export function fateV3ScreenCommandLabel(command){
  const payload = command?.payload || {};
  const destination = payload.destination;
  const suffix = destination
    ? ` — Zone ${Number(destination.z) + 1}, Row ${Number(destination.r) + 1}, Square ${Number(destination.c) + 1}`
    : '';
  if(command?.type === 'SET_CARD') return `Set card${suffix}`;
  if(command?.type === 'SET_CARD_FROM_DECK') return `Set eligible card from deck${suffix}`;
  if(command?.type === 'SET_ADAPTIVE_TOKEN'){
    return `Set as ${payload.declaredRarity} ${payload.declaredAffiliation} ${payload.declaredType} (${payload.placementType})${suffix}`;
  }
  if(command?.type === 'CONSOLIDATE_CARD'){
    return `Consolidate with ${(payload.tributeIids || []).length} tribute(s)${suffix}${payload.faceDown ? ' face-down' : ''}`;
  }
  if(command?.type === 'MOVE_CARD') return `Move card${suffix}`;
  if(command?.type === 'FLIP_CARD') return 'Flip card';
  if(command?.type === 'ACTIVATE_EFFECT') return 'Activate effect';
  if(command?.type === 'ACTIVATE_LANDSCAPE'){
    const discards = (payload.discardIids || []).length;
    return `Activate landscape${discards ? ` by discarding ${discards} card(s)` : ''}`;
  }
  if(command?.type === 'DISCARD_TO_HAND_LIMIT') return `Discard ${(payload.discardedIids || []).length} card(s)`;
  if(command?.type === 'ANSWER_PROMPT'){
    if(payload.cancel) return 'Cancel';
    if(payload.destination) return `Choose destination${suffix}`;
    if(payload.destinations) return `Choose ${payload.destinations.length} square(s)`;
    if(payload.selectedIid) return `Choose ${payload.selectedIid}`;
    if(payload.selectedIids) return `Choose ${payload.selectedIids.length} card(s)`;
    if(Number.isInteger(Number(payload.zone))) return `Choose Zone ${Number(payload.zone) + 1}`;
    return `Choose ${String(payload.choice || 'option')}`;
  }
  if(command?.type === 'END_TURN') return 'End turn';
  if(command?.type === 'CONCEDE') return 'Concede match';
  return String(command?.type || 'Command').replaceAll('_', ' ').toLowerCase();
}

function makeElement(documentRef, tag, className, text){
  const element = documentRef.createElement(tag);
  if(className) element.className = className;
  if(text !== undefined) element.textContent = text;
  return element;
}

function playerById(view, playerId){
  return view?.state?.players?.find(player=>String(player.id) === String(playerId)) || null;
}

export class FateAuthoritativeV3SinglePlayerScreen {
  constructor({windowRef, adapter, cardDefinitions = [], onExit, turnTimeLimit = 180}){
    this.window = windowRef;
    this.document = windowRef?.document;
    this.adapter = adapter;
    this.onExit = typeof onExit === 'function' ? onExit : ()=>{};
    this.cardDefinitions = new Map((cardDefinitions || []).map(card=>[String(card.id), card]));
    this.view = null;
    this.selectedCardIid = '';
    this.selectedDestinationKey = '';
    this.selectedPromptIids = new Set();
    this.selectedPromptDestinations = new Map();
    this.activePromptKey = '';
    this.visualPromptKey = '';
    this.visualPromptGuardTimer = null;
    this.visibleActions = [];
    this.bound = false;
    this.aiQueued = false;
    this.endTurnElement = null;
    this.endTurnOnclick = null;
    this.endTurnHandler = null;
    const querySeconds = Number(new URLSearchParams(this.window?.location?.search || '').get('fateV3TurnSeconds'));
    const configuredSeconds = Number(turnTimeLimit);
    this.turnTimeLimit = Math.max(1, Math.min(600, Math.round(
      Number.isFinite(querySeconds) && querySeconds > 0
        ? querySeconds
        : (Number.isFinite(configuredSeconds) && configuredSeconds > 0 ? configuredSeconds : 180)
    )));
    this.turnTimerKey = '';
    this.turnTimerDeadline = 0;
    this.turnTimerInterval = null;
    this.turnTimerAutoEnd = false;
    this.turnTimerPaused = false;
    this.turnTimerPausedRemaining = 0;
  }

  mount(){
    if(!this.document) throw new Error('single-player v3 screen requires a document');
    this.installStyle();
    this.document.documentElement?.classList.add(ACTIVE_CLASS);
    this.document.body?.classList.add(ACTIVE_CLASS);
    this.window.showScreen?.('s-game');
    this.window.FateMatchRendererAdapter?.teardownScene?.('authoritative-v3-single-player');
    this.bindInputs();
    this.render(this.adapter.view());
    return this;
  }

  destroy(){
    this.stopTurnTimer();
    if(this.endTurnElement && this.endTurnHandler){
      this.endTurnElement.removeEventListener('click', this.endTurnHandler, true);
      if(this.endTurnOnclick === null) this.endTurnElement.removeAttribute('onclick');
      else this.endTurnElement.setAttribute('onclick', this.endTurnOnclick);
    }
    this.document?.getElementById('fate-v3-local-actions')?.remove();
    if(this.visualPromptGuardTimer) this.window.clearTimeout?.(this.visualPromptGuardTimer);
    this.visualPromptGuardTimer = null;
    this.visualPromptKey = '';
    this.document?.documentElement?.classList.remove(ACTIVE_CLASS);
    this.document?.body?.classList.remove(ACTIVE_CLASS);
    this.bound = false;
    this.view = null;
  }

  stopTurnTimer(){
    if(this.turnTimerInterval){
      this.window.clearInterval?.(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
    this.turnTimerKey = '';
    this.turnTimerDeadline = 0;
    this.turnTimerAutoEnd = false;
    this.turnTimerPaused = false;
    this.turnTimerPausedRemaining = 0;
  }

  setTurnTimerText(seconds){
    const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;
    const text = `${minutes}:${remainder < 10 ? '0' : ''}${remainder}`;
    const timer = this.document.getElementById('tp-timer');
    if(timer) timer.textContent = text;
    const legacyTimer = this.document.getElementById('turn-hud-timer');
    if(legacyTimer) legacyTimer.textContent = text;
  }

  autoEndTimedOutTurn(){
    if(this.turnTimerAutoEnd || !this.view || this.view.state.outcome) return;
    if(this.view.state.activePlayer !== this.view.playerIndex) return;
    const command = this.view.legalCommands?.find(item=>item.type === 'END_TURN');
    if(!command) return;
    this.turnTimerAutoEnd = true;
    this.window.toast?.("Time's up! Turn auto-ended.");
    const result = this.submit(command);
    Promise.resolve(result).finally(()=>{this.turnTimerAutoEnd = false;});
  }

  syncTurnTimer(view){
    const state = view?.state;
    const humanTurn = state && !state.outcome && state.activePlayer === view.playerIndex;
    const paused = !!state?.pendingPrompt || !!state?.pendingHandLimit;
    if(!humanTurn){
      this.stopTurnTimer();
      return;
    }
    const key = `${state.turn}:${state.activePlayer}`;
    if(this.turnTimerKey !== key){
      if(this.turnTimerInterval){
        this.window.clearInterval?.(this.turnTimerInterval);
        this.turnTimerInterval = null;
      }
      this.turnTimerKey = key;
      this.turnTimerDeadline = Date.now() + this.turnTimeLimit * 1000;
      this.turnTimerAutoEnd = false;
      this.turnTimerPaused = false;
      this.turnTimerPausedRemaining = 0;
    }
    if(paused){
      if(!this.turnTimerPaused){
        this.turnTimerPaused = true;
        this.turnTimerPausedRemaining = Math.max(0, (this.turnTimerDeadline - Date.now()) / 1000);
      }
      if(this.turnTimerInterval){
        this.window.clearInterval?.(this.turnTimerInterval);
        this.turnTimerInterval = null;
      }
      this.setTurnTimerText(this.turnTimerPausedRemaining);
      return;
    }
    if(this.turnTimerPaused){
      this.turnTimerDeadline = Date.now() + this.turnTimerPausedRemaining * 1000;
      this.turnTimerPaused = false;
    }
    const tick = ()=>{
      if(!this.turnTimerDeadline) return;
      const remaining = Math.max(0, (this.turnTimerDeadline - Date.now()) / 1000);
      this.setTurnTimerText(remaining);
      if(remaining <= 0){
        if(this.turnTimerInterval){
          this.window.clearInterval?.(this.turnTimerInterval);
          this.turnTimerInterval = null;
        }
        this.autoEndTimedOutTurn();
      }
    };
    tick();
    if(paused || this.turnTimerInterval) return;
    this.turnTimerInterval = this.window.setInterval(tick, 250);
  }

  installStyle(){
    if(this.document.getElementById(STYLE_ID)) return;
    const style = makeElement(this.document, 'style');
    style.id = STYLE_ID;
    style.textContent = `
      .${ACTIVE_CLASS} #board .fate-v3-cell{min-height:74px;cursor:pointer}
      .${ACTIVE_CLASS} #board .fate-v3-cell.is-legal{outline:2px solid #e9c968;box-shadow:inset 0 0 18px rgba(233,201,104,.24)}
      .${ACTIVE_CLASS} #board .fate-v3-cell.is-chosen{outline:3px solid #7fd4ff}
      .${ACTIVE_CLASS} #board .fate-v3-cell.is-unplayable{opacity:.3;cursor:not-allowed;background:rgba(0,0,0,.35)}
      .${ACTIVE_CLASS} .fate-v3-card{border:1px solid rgba(233,201,104,.45);border-radius:7px;background:#171b28;color:#f5edd0;padding:6px;cursor:pointer;text-align:left}
      .${ACTIVE_CLASS} .fate-v3-card.is-selected,.${ACTIVE_CLASS} .fate-v3-choice.is-selected{outline:2px solid #f0d778}
      .${ACTIVE_CLASS} .fate-v3-card-name{font:600 12px/1.2 "Crimson Pro",serif}
      .${ACTIVE_CLASS} .fate-v3-card-meta{font:10px/1.2 system-ui,sans-serif;color:#c9bfa2;margin-top:3px}
      .${ACTIVE_CLASS} .fate-v3-card-tracker{display:block;margin-top:4px;padding:2px 4px;border:1px solid rgba(233,201,104,.5);border-radius:4px;color:#f3d77b;font:700 9px/1.2 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em}
      .${ACTIVE_CLASS} .fate-card-effect-suppressed{filter:saturate(.45);box-shadow:inset 0 0 0 2px rgba(171,86,255,.55)}
      .${ACTIVE_CLASS} .fate-v3-board-card{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center}
      html.${ACTIVE_CLASS} body.${ACTIVE_CLASS} #s-game .hand-strip,
      html.${ACTIVE_CLASS} body.${ACTIVE_CLASS} #s-game #actbar{left:0!important}
      html.${ACTIVE_CLASS} body.${ACTIVE_CLASS} #s-game .hand-strip{position:relative!important;z-index:60!important}
      html.${ACTIVE_CLASS} body.${ACTIVE_CLASS} #s-game #hand-cards{position:relative!important;z-index:61!important;box-sizing:border-box!important}
      html.${ACTIVE_CLASS} body.${ACTIVE_CLASS} #s-game #hand-cards .fate-v3-hand-card{position:relative!important;z-index:62!important;pointer-events:auto!important}
      .${ACTIVE_CLASS} .fate-v3-actions{display:flex;gap:6px;flex-wrap:wrap;max-height:156px;overflow:auto}
      .${ACTIVE_CLASS} .fate-v3-actions .btn{font-size:11px;padding:5px 8px}
      .${ACTIVE_CLASS} .fate-v3-outcome{width:100%;padding:8px;border:1px solid rgba(233,201,104,.55);border-radius:8px;text-align:center}
      .${ACTIVE_CLASS} #cancel-consolidate-btn{display:none!important}
      .${ACTIVE_CLASS} #actbar>button:not(#btn-end-turn){display:none}
      .${ACTIVE_CLASS} .fate-v3-opponent-card{display:inline-block;width:22px;height:34px;border-radius:4px;background:linear-gradient(135deg,#151b2b,#5f4630);border:1px solid #ac8f55;margin:2px}
    `;
    this.document.head?.appendChild(style);
  }

  bindInputs(){
    if(this.bound) return;
    this.bound = true;
    const endTurn = this.document.getElementById('btn-end-turn');
    if(endTurn){
      this.endTurnElement = endTurn;
      this.endTurnOnclick = endTurn.getAttribute('onclick');
       this.endTurnHandler = event=>{
         event.preventDefault();
         event.stopImmediatePropagation();
         const command = this.view?.legalCommands?.find(item=>item.type === 'END_TURN');
         if(command){
           const turn = Number(this.view?.state?.turn || 0);
           if(typeof this.window?.playFateEndTurnInputCue === 'function') this.window.playFateEndTurnInputCue('end-turn:authority-input:' + turn);
           else if(typeof this.window?.playSfx === 'function') this.window.playSfx('endTurn');
           else if(typeof this.window?.playEndTurnSfxOnce === 'function') this.window.playEndTurnSfxOnce('end-turn:authority-input:' + turn);
           else if(typeof this.window?.playFateSfxOnce === 'function') this.window.playFateSfxOnce('endTurn', 'end-turn:authority-input:' + turn, 0);
           this.submit(command);
         }
       };
      endTurn.removeAttribute('onclick');
      endTurn.addEventListener('click', this.endTurnHandler, true);
    }
  }

  selectCard(cardIid){
    const iid = String(cardIid || '');
    if(this.hasSelectionPrompt()){
      this.selectPromptIid(iid);
      return;
    }
    this.selectedCardIid = iid;
    this.selectedDestinationKey = '';
    this.render(this.view);
  }

  hasSelectionPrompt(){
    return ['BOARD_TARGET', 'CARD_SELECTION', 'HAND_SELECTION'].includes(this.view?.state?.pendingPrompt?.type)
      || (this.view?.state?.pendingPrompt?.type === 'BOARD_DESTINATION'
        && this.view.state.pendingPrompt.multi === true)
      || !!this.view?.state?.pendingHandLimit;
  }

  selectPromptIid(cardIid){
    const iid = String(cardIid || '');
    const legal = this.view?.legalCommands || [];
    const direct = legal.find(command=>
      String(command.payload?.selectedIid || '') === iid
      || ((command.payload?.discardedIids || []).length === 1
        && String(command.payload.discardedIids[0]) === iid)
    );
    const prompt = this.view?.state?.pendingPrompt;
    const max = this.view?.state?.pendingHandLimit
      ? this.promptEligibleIids().length
      : Number(prompt?.max || 1);
    if(max === 1 && direct){
      this.submit(direct);
      return;
    }
    if(this.selectedPromptIids.has(iid)) this.selectedPromptIids.delete(iid);
    else if(this.selectedPromptIids.size < max) this.selectedPromptIids.add(iid);
    this.render(this.view);
  }

  selectBoardCell(destination, cardIid = ''){
    const key = coordinateKey(destination);
    const legal = this.view?.legalCommands || [];
    const prompt = this.view?.state?.pendingPrompt;
    if(prompt?.type === 'BOARD_DESTINATION'){
      const direct = legal.find(command=>coordinateKey(command.payload?.destination) === key);
      if(!prompt.multi && direct){
        this.submit(direct);
        return;
      }
      if(prompt.multi){
        if(this.selectedPromptDestinations.has(key)) this.selectedPromptDestinations.delete(key);
        else if(this.selectedPromptDestinations.size < Number(prompt.max || 1)){
          this.selectedPromptDestinations.set(key, destination);
        }
        this.render(this.view);
      }
      return;
    }
    if(cardIid){
      this.selectCard(cardIid);
      return;
    }
    const matches = this.commandsForSelection().filter(item=>
      DIRECT_DESTINATION_COMMANDS.has(item.type)
      && coordinateKey(item.payload?.destination) === key
    );
    if(matches.length === 1){
      this.submit(matches[0]);
      return;
    }
    if(matches.length > 1){
      this.selectedDestinationKey = key;
      this.render(this.view);
    }
  }

  commandsForSelection(){
    const legal = this.view?.legalCommands || [];
    if(this.view?.state?.pendingPrompt || this.view?.state?.pendingHandLimit){
      return legal.filter(command=>['ANSWER_PROMPT', 'DISCARD_TO_HAND_LIMIT'].includes(command.type));
    }
    let commands;
    if(this.selectedCardIid){
      commands = fateV3CommandsForCard(legal, this.selectedCardIid);
    }else{
      commands = legal.filter(command=>
        command.type === 'SET_CARD_FROM_DECK'
        || command.type === 'ACTIVATE_LANDSCAPE'
        || command.type === 'CONCEDE'
      );
    }
    if(this.selectedDestinationKey){
      commands = commands.filter(command=>
        !command.payload?.destination
        || coordinateKey(command.payload.destination) === this.selectedDestinationKey
      );
    }
    return commands;
  }

  matchingPromptSelectionCommand(){
    const legal = this.view?.legalCommands || [];
    const iids = [...this.selectedPromptIids];
    const destinations = [...this.selectedPromptDestinations.values()];
    const exact = legal.find(command=>{
      const payload = command.payload || {};
      if(payload.selectedIids) return sameStringSet(payload.selectedIids, iids);
      if(payload.discardedIids) return sameStringSet(payload.discardedIids, iids);
      if(payload.destinations) return sameDestinationSet(payload.destinations, destinations);
      return false;
    }) || null;
    if(exact) return exact;
    const minimum = Math.max(1, Number(this.view?.state?.pendingHandLimit?.required) || 1);
    const handLimitTemplate = legal.find(command=>command.type === 'DISCARD_TO_HAND_LIMIT');
    const eligible = new Set(this.promptEligibleIids());
    if(handLimitTemplate && iids.length >= minimum && iids.every(iid=>eligible.has(String(iid)))){
      return {
        ...handLimitTemplate,
        payload:{...(handLimitTemplate.payload || {}), discardedIids:iids}
      };
    }
    return null;
  }

  submit(command){
    const result = this.adapter.dispatchLegalCommand(command);
    if(result && typeof result.then === 'function'){
      return result.then(resolved=>this.finishSubmit(resolved)).catch(error=>{
        const rejection = error?.rejection || {reason:String(error?.message || error || 'That action failed')};
        this.window.toast?.(rejection.reason);
        return {ok:false, rejection};
      });
    }
    return this.finishSubmit(result);
  }

  finishSubmit(result){
    if(!result.ok){
      this.window.toast?.(result.rejection?.reason || 'That action is not legal');
      return result;
    }
    this.selectedCardIid = '';
    this.selectedDestinationKey = '';
    this.selectedPromptIids.clear();
    this.selectedPromptDestinations.clear();
    this.queueAiIfNeeded();
    return result;
  }

  queueAiIfNeeded(){
    if(this.aiQueued || !this.view || this.view.state.outcome) return;
    const aiIndex = Number(this.view.aiPlayerIndex);
    const promptOwner = Number(this.view.state.pendingPrompt?.playerIndex);
    const handLimitOwner = Number(this.view.state.pendingHandLimit?.playerIndex);
    const aiMustAct = this.view.state.activePlayer === aiIndex
      || promptOwner === aiIndex
      || handLimitOwner === aiIndex;
    if(!aiMustAct) return;
    this.aiQueued = true;
    const enqueue = this.window.queueMicrotask || (callback=>this.window.setTimeout(callback, 0));
    enqueue(()=>{
      try{
        const result = this.adapter.runAiTurn();
        if(!result.ok) this.window.toast?.(result.rejection?.reason || 'Authoritative v3 AI stopped');
      }finally{
        this.aiQueued = false;
      }
    });
  }

  resetPromptSelectionIfChanged(view){
    const key = view.state.pendingPrompt?.promptId
      || (view.state.pendingHandLimit ? `hand-limit:${view.state.revision}` : '');
    if(key === this.activePromptKey) return;
    this.activePromptKey = key;
    this.selectedPromptIids.clear();
    this.selectedPromptDestinations.clear();
  }

  presentationCard(card){
    if(!card) return null;
    const definition = this.cardDefinitions.get(String(card.id)) || {};
    const presented = {...definition, ...card, iid:String(card.iid || ''), owner:Number(card.owner)};
    const copiedId = String(card?.counters?.copiedEffectId || card?.counters?.copiedPassiveId || '');
    if(String(card.id || '') === 'bh05' && copiedId){
      const copied = this.cardDefinitions.get(copiedId) || {};
      presented._bh05CopiedCardId = copiedId;
      presented._bh05CopiedCardName = String(copied.name || copiedId);
      presented._bh05CopiedAbility = String(copied.ability || 'Copied Effect');
      presented._bh05CopiedPrintedEffect = String(copied.effect || '');
      presented._bh05CopiedTrackerState = {...copied, ...card, id:copiedId};
    }
    return presented;
  }

  clearVisualPromptGuard(){
    if(this.visualPromptGuardTimer) this.window.clearTimeout?.(this.visualPromptGuardTimer);
    this.visualPromptGuardTimer = null;
  }

  guardVisualCardPrompt(key){
    this.clearVisualPromptGuard();
    const check = ()=>{
      this.visualPromptGuardTimer = null;
      const prompt = this.view?.state?.pendingPrompt;
      const currentKey = `prompt:${String(prompt?.promptId || '')}`;
      if(currentKey !== key || Number(prompt?.playerIndex) !== Number(this.view?.playerIndex)) return;
      const modal = this.document.getElementById('modal');
      const mounted = modal?.classList.contains('on')
        && String(modal.dataset?.fateV3SinglePlayerPromptKey || '') === key
        && !!modal.querySelector('.visual-picker-body');
      if(!mounted){
        this.visualPromptKey = '';
        this.syncVisualCardPrompt(this.view);
        return;
      }
      this.visualPromptGuardTimer = this.window.setTimeout?.(check, 180) || null;
    };
    this.visualPromptGuardTimer = this.window.setTimeout?.(check, 180) || null;
  }

  syncVisualCardPrompt(view){
    const prompt = view?.state?.pendingPrompt;
    const ownsPrompt = Number(prompt?.playerIndex) === Number(view?.playerIndex);
    if(!ownsPrompt || !['CARD_SELECTION', 'HAND_SELECTION'].includes(String(prompt?.type || ''))){
      this.clearVisualPromptGuard();
      this.visualPromptKey = '';
      return false;
    }
    const key = `prompt:${String(prompt.promptId || '')}`;
    const modal = this.document.getElementById('modal');
    const mounted = modal?.classList.contains('on')
      && String(modal.dataset?.fateV3SinglePlayerPromptKey || '') === key
      && !!modal.querySelector('.visual-picker-body');
    if(this.visualPromptKey === key && mounted) return true;
    if(typeof this.window.pickCardsVisual !== 'function') return false;
    const eligible = new Set((prompt.eligibleIids || []).map(String));
    const cards = (prompt.eligibleCards || [])
      .map(card=>this.presentationCard(card))
      .filter(card=>card && eligible.has(String(card.iid || '')));
    if(!cards.length) return false;
    const minimum = Math.max(0, Number(prompt.min) || 0);
    const maximum = Math.max(minimum, Number(prompt.max) || 1);
    const source = this.findCard(prompt.sourceIid);
    const sourceDefinition = this.cardDefinitions.get(String(source?.id || '')) || {};
    this.visualPromptKey = key;
    this.window.pickCardsVisual(cards, {
      title:source?.name ? `Resolve ${source.name}` : 'Resolve Effect',
      subtitle:minimum === maximum ? `Select exactly ${minimum}` : `Select ${minimum} to ${maximum}`,
      minCount:minimum,
      maxCount:maximum,
      confirmLabel:'Confirm',
      immediate:true,
      viewerPlayerIndex:Number(view.playerIndex),
      sourceCardName:String(source?.name || ''),
      sourceCardAbility:String(sourceDefinition.ability || source?.ability || ''),
      onCancel:()=>{
        const cancel = this.view?.legalCommands?.find(command=>command.type === 'ANSWER_PROMPT'
          && String(command.payload?.promptId || '') === String(prompt.promptId || '')
          && command.payload?.cancel === true);
        this.visualPromptKey = '';
        if(cancel) this.submit(cancel);
      }
    }, chosen=>{
      const selectedIids = (chosen || []).map(card=>String(card?.iid || '')).filter(iid=>eligible.has(iid));
      const command = this.view?.legalCommands?.find(candidate=>candidate.type === 'ANSWER_PROMPT'
        && String(candidate.payload?.promptId || '') === String(prompt.promptId || '')
        && sameStringSet(
          Array.isArray(candidate.payload?.selectedIids)
            ? candidate.payload.selectedIids
            : (candidate.payload?.selectedIid ? [candidate.payload.selectedIid] : []),
          selectedIids
        ));
      this.visualPromptKey = '';
      this.clearVisualPromptGuard();
      if(command) this.submit(command);
      else this.submit({
        type:'ANSWER_PROMPT',
        payload:{promptId:String(prompt.promptId || ''), ...(maximum === 1
          ? {selectedIid:String(selectedIids[0] || '')}
          : {selectedIids})}
      });
    });
    if(modal) modal.dataset.fateV3SinglePlayerPromptKey = key;
    this.guardVisualCardPrompt(key);
    return true;
  }

  findCard(iid){
    const wanted = String(iid || '');
    if(!wanted || !this.view?.state) return null;
    for(const card of (this.view.state.board || []).flat(3)) if(card && String(card.iid || '') === wanted) return card;
    for(const player of this.view.state.players || []){
      for(const pile of ['hand', 'discard']){
        const card = (player?.[pile] || []).find(candidate=>String(candidate?.iid || '') === wanted);
        if(card) return card;
      }
    }
    return (this.view.state.pendingPrompt?.eligibleCards || []).find(card=>String(card?.iid || '') === wanted) || null;
  }

  presentEvents(events = [], metadata = {}){
    const batch = Array.isArray(events) ? events : [];
    if(metadata?._afterMoralePresentation !== true && batch.some(event=>String(event?.type || '').toUpperCase() === 'MORALE_CYCLE_RESOLVED')){
      const resume = ()=>this.presentEvents(batch, {...metadata, _afterMoralePresentation:true});
      this.window.setTimeout?.(()=>{
        if(typeof this.window.runAfterMoraleCalculationPresentation === 'function') this.window.runAfterMoraleCalculationPresentation(resume);
        else resume();
      }, 120);
      return;
    }
    for(const event of batch){
      const type = String(event?.type || '').toUpperCase();
      if(type === 'EFFECT_ACTIVATED' || type === 'EFFECT_REACTED'){
        const source = this.findCard(type === 'EFFECT_REACTED' ? event.reactionIid : event.sourceIid);
        if(source && String(source.id || '') !== '66' && typeof this.window.showEffectActivationCinematic === 'function'){
          try{ this.window.showEffectActivationCinematic(this.presentationCard(source), {remote:Number(event.playerIndex) !== Number(this.view?.playerIndex), source:'authoritative-v3-single-player-event', broadcast:false}); }catch(_error){}
        }
      }
      if(type === 'SOVIET_GRENADIERS_TARGET_LINKED'){
        for(const iid of [event.sourceIid, event.targetIid]){
          const card = this.findCard(iid);
          if(card && typeof this.window.flashCardEffect === 'function') this.window.flashCardEffect(card, 'soviet_grenadiers', {label:'The Bears of Russia', onlineRemote:true});
        }
        continue;
      }
      if(type === 'TURN_STARTED' && this.view?.state?.gameSettings?.pressureCardReworks === true){
        for(const card of (this.view.state.board || []).flat(3)){
          if(card && String(card.id || '') === '65' && Number(card.owner) === Number(event.playerIndex) && card.faceDown !== true && typeof this.window.flashCardEffect === 'function'){
            this.window.flashCardEffect(card, 'west_caribbea_marines', {label:'Sea-Men', onlineRemote:true});
          }
        }
      }
      if(!['FATE_CHANGED','CARD_MOVED','EFFECT_ACTIVATED'].includes(type)) continue;
      const target = this.findCard(event.cardIid || event.targetIid || event.sourceIid);
      const source = this.findCard(event.sourceIid);
      const descriptor = this.window.getAuthoritativeEffectOverlayDescriptor?.(event, source, target);
      if(!descriptor || !target) continue;
      if(descriptor.kind === 'snowball' && typeof this.window.markSnowballFightHit === 'function'){
        this.window.markSnowballFightHit(target);
      }else if(typeof this.window.flashCardEffect === 'function'){
        this.window.flashCardEffect(target, descriptor.kind, {label:descriptor.label, onlineRemote:true});
      }
    }
    if(batch.length) this.render(metadata?.view || this.view);
  }

  statusPresentation(status){
    const type = String(status?.statusType || status?.type || '').toUpperCase();
    const remaining = Math.max(0, Number(status?.remainingTargetTurns ?? status?.remainingOwnerTurns ?? status?.remaining ?? status?.deliveryTurnsRemaining) || 0);
    const definitions = {
      MAJA_EXTRA_SUPPORTERS:['07','maja_unlimited','Oblique Order',`+${Number(status?.extraSupports) || 2} Supporter placements this turn.`,'effect-pill-maja'],
      SELVA_EXTRA_SUPPORTER:['74','selva','A New Pacifica',`+${Number(status?.extraSupports) || 1} Supporter placement this turn.`,'effect-pill-selva'],
      SUPPORTERS_AS_CHARACTERS:['99','blame_game','The Blame Game','Supporters are classified as Characters for consolidation.','effect-pill-blame-game'],
      FORT_CALVIN_WATCHER:['71','fort_calvin','All Eyes on the I-15',`Reveals the next ${remaining} eligible opponent draw${remaining === 1 ? '' : 's'}.`,'effect-pill-fort-calvin'],
      SUPPORTER_EFFECTS_BLOCKED:['18','semper','Semper Fidelis','The affected player cannot activate Supporter effects this turn.','effect-pill-semper'],
      ZONE_ACTIONS_BLOCKED:['50','berkeley_lock','Artillery Distance','The selected zone is locked for the affected player.','effect-pill-berkeley'],
      LANDSCAPE_CHANGE_BLOCKED:['91','village_lock','A Snowy Village','The affected player cannot change the current landscape.','effect-pill-house'],
      NEXT_CHARACTER_HAND_ARRIVAL:['33','wci_bonus','The West Caribbea Infantry','The next Character added to hand costs 1 less Reinforcement and gains 2 Fate.','effect-pill-wci'],
      RIVERA_AFFILIATION_BONUS:['51','rivera_aff',"Jorge's Right Hand Man",`Characters set with ${String(status?.affiliation || 'the declared affiliation').replaceAll('_', ' ')} gain ${Number(status?.value) || 4} Fate for ${remaining} more owner turn${remaining === 1 ? '' : 's'}.`,`effect-pill-rivera aff-${String(status?.affiliation || '').replace(/[^a-z0-9_-]/gi, '')}`],
      CONSOLIDATION_FATE_BONUS:['87','ballad','A Noble Effort at a Ballad','Your consolidations gain 3 Fate until you set a Supporter.','effect-pill-music'],
      CONSOLIDATION_COST_MODIFIER:['97','administrative_bloat','Administrative Bloat',`The opponent's next ${remaining || 1} consolidation${remaining === 1 ? '' : 's'} cost 1 extra Reinforcement.`,'effect-pill-administrative-bloat'],
      DELAYED_HAND_DELIVERY:['94','mail_delivery','Mail Delivery',`A scheduled card arrives after ${remaining || 1} owner turn${remaining === 1 ? '' : 's'}.`,'effect-pill-mail'],
      WINE_COUNTRY_GUERILLA_INFILTRATION:['70','guerilla','A Gun Behind Every Grapevine',`Reduces a random eligible opposing hand card by 2 Fate at turn start for ${remaining} more turn${remaining === 1 ? '' : 's'}.`,'effect-pill-guerilla'],
      FACE_DOWN_CONSOLIDATION_PERMISSION:['78','chaparral','Chaparral Ambush','The next consolidation in this zone may be set face down.','effect-pill-chaparral'],
      PERMANENT_FATE_GAIN_POTENCY:['bh19','high_t','High-T','Permanent Fate gain effects have doubled potency for this turn.','effect-pill-high-t']
    };
    const descriptor = definitions[type];
    if(!descriptor) return null;
    const activeWithoutDuration = ['NEXT_CHARACTER_HAND_ARRIVAL','CONSOLIDATION_FATE_BONUS'].includes(type);
    const activeExtraSupport = ['MAJA_EXTRA_SUPPORTERS','SELVA_EXTRA_SUPPORTER'].includes(type)
      && ((Number(status?.extraSupports) || 0) > 0 || remaining > 0)
      && (type !== 'SELVA_EXTRA_SUPPORTER' || status?.activeNow === true);
    if(!activeWithoutDuration && !activeExtraSupport && remaining <= 0) return null;
    const [cardId, iconKind, fallbackAbility, effect, extraClass] = descriptor;
    const definition = this.cardDefinitions.get(cardId) || {};
    const beneficial = ['NEXT_CHARACTER_HAND_ARRIVAL','RIVERA_AFFILIATION_BONUS','CONSOLIDATION_FATE_BONUS','DELAYED_HAND_DELIVERY','SUPPORTERS_AS_CHARACTERS','SELVA_EXTRA_SUPPORTER','MAJA_EXTRA_SUPPORTERS','WINE_COUNTRY_GUERILLA_INFILTRATION','FACE_DOWN_CONSOLIDATION_PERMISSION','PERMANENT_FATE_GAIN_POTENCY','MOVEMENT_GRANT','BUSSER_INITIATOR_MORALE'].includes(type);
    const affected = Number(status?.playerIndex);
    const sourceController = Number(status?.sourceController);
    const owner = sourceController === 0 || sourceController === 1
      ? sourceController
      : (beneficial && (affected === 0 || affected === 1) ? affected : (affected === 0 || affected === 1 ? 1 - affected : this.view.playerIndex));
    return {owner, iconKind, ability:String(definition.ability || fallbackAbility), name:String(definition.name || fallbackAbility), effect, extraClass};
  }

  renderStatusRails(view){
    const left = this.document.getElementById('tp-status-left');
    const right = this.document.getElementById('tp-status-right');
    if(!left || !right) return;
    left.replaceChildren();
    right.replaceChildren();
    for(const status of view?.state?.statuses || []){
      const item = this.statusPresentation(status);
      if(!item) continue;
      const pill = makeElement(this.document, 'div', `effect-pill ${item.extraClass}`);
      pill.dataset.effectAbility = item.ability;
      pill.setAttribute('aria-label', `${item.name}: ${item.ability}. ${item.effect}`);
      const icon = makeElement(this.document, 'span', 'effect-pill-icon');
      icon.innerHTML = typeof this.window.getStatusEffectIcon === 'function'
        ? this.window.getStatusEffectIcon(item.iconKind)
        : '&#9670;';
      pill.appendChild(icon);
      pill.appendChild(makeElement(this.document, 'span', 'effect-pill-label', item.ability));
      const tip = makeElement(this.document, 'span', 'effect-pill-tooltip');
      tip.innerHTML = `<span class="ept-name">${item.name}</span><span class="ept-ability">${item.ability}</span><span class="ept-effect">${item.effect}</span>`;
      pill.appendChild(tip);
      (Number(item.owner) === Number(view.playerIndex) ? left : right).appendChild(pill);
    }
    this.window.FateCodexUi?.update?.();
  }

  render(view){
    if(!view || !this.document) return;
    this.view = view;
    this.resetPromptSelectionIfChanged(view);
    const human = playerById(view, view.playerId);
    const ai = playerById(view, view.aiPlayerId);
    if(!human || !ai) return;
    if(this.selectedCardIid && !human.hand?.some(card=>String(card.iid) === this.selectedCardIid)
      && !view.state.board.flat(3).some(card=>String(card?.iid || '') === this.selectedCardIid)){
      this.selectedCardIid = '';
      this.selectedDestinationKey = '';
    }
    const setText = (id, text)=>{
      const element = this.document.getElementById(id);
      if(element) element.textContent = text;
    };
    setText('tp-cur', `Turn ${view.state.turn}/${view.state.maxTurns}`);
    setText('tp-phase', view.state.outcome
      ? (view.state.outcome.type === 'DRAW' ? 'Draw' : `${view.state.players[view.state.outcome.winner]?.name || 'Player'} wins`)
      : (view.state.activePlayer === view.playerIndex ? 'Your turn' : `${ai.name}'s turn`));
    setText('my-name', human.name);
    setText('opp-name', ai.name);
    setText('my-stat', `Hand ${human.handCount} · Fate ${human.score || 0}`);
    setText('opp-stat', `Hand ${ai.handCount} · Fate ${ai.score || 0}`);
    setText('my-deck-count', human.deckCount);
    setText('my-discard-count', human.discard?.length || 0);
    setText('hand-count', `(${human.handCount})`);
    setText('landscape-panel', view.state.landscapeId || 'No landscape');
    const endTurn = this.document.getElementById('btn-end-turn');
    if(endTurn){
      endTurn.disabled = !!view.state.outcome || !view.legalCommands.some(command=>command.type === 'END_TURN');
      endTurn.hidden = !!view.state.outcome;
    }
    this.renderOpponentHand(ai.handCount);
    this.renderHand(human.hand || []);
    this.renderBoard(view.state.board);
    this.renderStatusRails(view);
    this.renderActions();
    this.renderScores();
    try{
      this.window.renderMoralePressureHud?.(view.state.moralePressure || null);
    }catch(error){
      console.warn('[Fate Phase 5 Single Player] retired morale HUD render failed', error);
    }
    this.syncTurnTimer(view);
    this.syncVisualCardPrompt(view);
  }

  renderOpponentHand(count){
    const root = this.document.getElementById('opp-hand');
    if(!root) return;
    root.replaceChildren();
    for(let index = 0; index < Number(count || 0); index += 1){
      root.appendChild(makeElement(this.document, 'span', 'fate-v3-opponent-card'));
    }
  }

  cardElement(card, className = '', interactive = true){
    const presented = this.presentationCard(card) || card;
    const flash = card?._effectFlash;
    const flashActive = flash && Number(flash.at || 0) + Math.max(1, Number(flash.duration) || 3500) > Date.now();
    const flashKind = String(flash?.kind || '').replace(/[^a-z0-9_-]/gi, '');
    const element = makeElement(this.document, interactive ? 'button' : 'div', `fate-v3-card ${className}${className.includes('fate-v3-board-card') ? ' bc' : ''}${flashActive && flashKind ? ` fate-effect-flash effect-flash-${flashKind}` : ''}`.trim());
    if(interactive) element.type = 'button';
    if(String(card.iid) === this.selectedCardIid || this.selectedPromptIids.has(String(card.iid))){
      element.classList.add('is-selected');
    }
    if(card?.statuses?.includes('EFFECTS_SUPPRESSED')) element.classList.add('fate-card-effect-suppressed');
    const definition = this.cardDefinitions.get(String(card.id)) || {};
    element.appendChild(makeElement(this.document, 'span', 'fate-v3-card-name', card.faceDown ? 'Face-down card' : card.name));
    element.appendChild(makeElement(
      this.document,
      'span',
      'fate-v3-card-meta',
      card.faceDown
        ? 'Hidden'
        : `${card.type} · Fate ${card.currentFate} · ${definition.ability || card.ability || ''}`
    ));
    if(presented._bh05CopiedCardId){
      const tracker = makeElement(
        this.document,
        'span',
        'fate-v3-card-tracker fate-v3-taylor-copy-tracker',
        `Copied: ${presented._bh05CopiedAbility || presented._bh05CopiedCardName}`
      );
      tracker.title = `${presented._bh05CopiedCardName}: ${presented._bh05CopiedPrintedEffect || presented._bh05CopiedAbility}`;
      element.appendChild(tracker);
    }
    return element;
  }

  renderHand(cards){
    const root = this.document.getElementById('hand-cards');
    if(!root) return;
    root.replaceChildren();
    for(const card of cards){
      const element = this.cardElement(card, 'fate-v3-hand-card');
      element.dataset.fateV3HandIid = card.iid;
      element.addEventListener('click', event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        this.selectCard(card.iid);
      }, true);
      root.appendChild(element);
    }
  }

  rowOwner(z, r){
    if(r === 0) return 1;
    if(r === 1) return -1;
    if(r === 2) return 0;
    const owner = this.view?.state?.geometry?.rowOwners?.[z]?.[r];
    return owner === 0 || owner === 1 ? owner : null;
  }

  isPlayableCoordinate(z, r, c){
    if(r < 3) return true;
    return (this.view?.state?.geometry?.playableExtraSquares || []).some(square=>
      Number(square.z) === z && Number(square.r) === r && Number(square.c) === c
    );
  }

  rowPresentation(owner){
    if(owner === -1) return {className:'contested', label:'Contested'};
    if(owner === this.view.playerIndex) return {className:'p1safe', label:'Your Side'};
    if(owner === this.view.aiPlayerIndex) return {className:'p2safe', label:'Opponent'};
    return {className:'contested', label:'Inactive'};
  }

  legalDestinationKeys(){
    const keys = new Set();
    const promptType = this.view?.state?.pendingPrompt?.type;
    if(!this.selectedCardIid
      && !this.selectedDestinationKey
      && promptType !== 'BOARD_DESTINATION'){
      return keys;
    }
    for(const command of this.commandsForSelection()){
      if(command.payload?.destination) keys.add(coordinateKey(command.payload.destination));
      for(const destination of command.payload?.destinations || []) keys.add(coordinateKey(destination));
    }
    return keys;
  }

  renderBoard(board){
    const root = this.document.getElementById('board');
    if(!root) return;
    const expanded = this.window.FATE_ZONE_CONTROL_REWORK_ENABLED !== false
      && this.window.FATE_EXPANDED_CONTESTED_ROW_ENABLED !== false
      && (board || []).some(zone=>Array.isArray(zone?.[1]) && zone[1].length > 3);
    const uniformFour = expanded
      && this.window.FATE_ZONE_444_LAYOUT_ENABLED !== false
      && (board || []).some(zone=>[0,1,2].every(row=>Array.isArray(zone?.[row]) && zone[row].length === 4));
    root.classList.toggle('expanded-contested-row', expanded);
    root.classList.toggle('zone-layout-444', uniformFour);
    this.document.getElementById('s-game')?.classList.toggle(
      'wide-zone-layout-444',
      uniformFour && this.window.FATE_WIDE_444_BOARD_LAYOUT_ENABLED !== false
    );
    root.replaceChildren();
    const legalDestinations = this.legalDestinationKeys();
    for(let z = 0; z < 3; z += 1){
      const zone = makeElement(this.document, 'section', 'zone fate-v3-zone');
      zone.dataset.zone = z;
      zone.appendChild(makeElement(this.document, 'div', 'zone-hdr', `Zone ${z + 1}`));
      const rows = makeElement(this.document, 'div', 'zone-rows');
      const rowCount = Math.max(
        3,
        board?.[z]?.length || 0,
        this.view.state.geometry?.rowOwners?.[z]?.length || 0
      );
      for(let r = 0; r < rowCount; r += 1){
        const presentation = this.rowPresentation(this.rowOwner(z, r));
        const row = makeElement(this.document, 'div', `brow ${presentation.className}`);
        row.appendChild(makeElement(
          this.document,
          'div',
          'rl',
          `${presentation.label}${r >= 3 ? ` +${r - 2}` : ''}`
        ));
        const cells = makeElement(this.document, 'div', 'rcells');
        const columnCount = Math.max(3, board?.[z]?.[r]?.length || 0);
        for(let c = 0; c < columnCount; c += 1){
          const card = board?.[z]?.[r]?.[c] || null;
          const playable = this.isPlayableCoordinate(z, r, c);
          const key = coordinateKey({z, r, c});
          const cell = makeElement(
            this.document,
            'button',
            `cell fate-v3-cell ${card ? 'has-card' : 'cell-empty'}${playable ? '' : ' is-unplayable'}`
          );
          cell.type = 'button';
          cell.disabled = !playable;
          cell.dataset.fateV3Cell = '1';
          cell.dataset.z = z;
          cell.dataset.r = r;
          cell.dataset.c = c;
          if(legalDestinations.has(key)) cell.classList.add('is-legal');
          if(this.selectedDestinationKey === key || this.selectedPromptDestinations.has(key)){
            cell.classList.add('is-chosen');
          }
          if(card){
            cell.dataset.cardIid = card.iid;
            cell.appendChild(this.cardElement(card, 'fate-v3-board-card', false));
          }
          cell.addEventListener('click', event=>{
            event.preventDefault();
            event.stopImmediatePropagation();
            this.selectBoardCell({z, r, c}, card?.iid || '');
          }, true);
          cells.appendChild(cell);
        }
        row.appendChild(cells);
        rows.appendChild(row);
      }
      zone.appendChild(rows);
      root.appendChild(zone);
    }
  }

  cardName(iid){
    const wanted = String(iid || '');
    const playerCards = (this.view?.state?.players || []).flatMap(player=>[
      ...(player.hand || []),
      ...(player.discard || [])
    ]);
    const boardCards = (this.view?.state?.board || []).flat(3).filter(Boolean);
    const card = [...playerCards, ...boardCards].find(item=>String(item.iid) === wanted);
    return card?.faceDown ? 'Face-down card' : (card?.name || wanted);
  }

  friendlyCommandLabel(command){
    const payload = command.payload || {};
    if(command.type === 'ANSWER_PROMPT' && payload.selectedIid){
      return `Choose ${this.cardName(payload.selectedIid)}`;
    }
    if(command.type === 'ANSWER_PROMPT' && payload.reactionIid){
      return `${String(payload.choice || 'Use')} — ${this.cardName(payload.reactionIid)}`;
    }
    if(command.type === 'CONSOLIDATE_CARD'){
      const names = (payload.tributeIids || []).map(iid=>this.cardName(iid)).join(', ');
      return `${fateV3ScreenCommandLabel(command)}${names ? `: ${names}` : ''}`;
    }
    if(command.type === 'ACTIVATE_LANDSCAPE'){
      const source = payload.sourceIid ? ` using ${this.cardName(payload.sourceIid)}` : '';
      const target = payload.targetIid ? ` on ${this.cardName(payload.targetIid)}` : '';
      return `${fateV3ScreenCommandLabel(command)}${source}${target}`;
    }
    return fateV3ScreenCommandLabel(command);
  }

  promptEligibleIids(){
    const prompt = this.view.state.pendingPrompt;
    if(Array.isArray(prompt?.eligibleIids)) return prompt.eligibleIids.map(String);
    if(this.view.state.pendingHandLimit){
      const result = new Set();
      for(const command of this.view.legalCommands){
        for(const iid of command.payload?.discardedIids || []) result.add(String(iid));
      }
      return [...result];
    }
    return [];
  }

  appendPromptChoiceButtons(actions){
    for(const iid of this.promptEligibleIids()){
      const button = makeElement(this.document, 'button', 'btn sm fate-v3-choice', this.cardName(iid));
      button.type = 'button';
      if(this.selectedPromptIids.has(iid)) button.classList.add('is-selected');
      button.addEventListener('click', event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        this.selectPromptIid(iid);
      });
      actions.appendChild(button);
    }
    const selectedCommand = this.matchingPromptSelectionCommand();
    if(selectedCommand){
      const button = makeElement(this.document, 'button', 'btn sm gold', fateV3ScreenCommandLabel(selectedCommand));
      button.type = 'button';
      button.addEventListener('click', event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        this.submit(selectedCommand);
      });
      actions.appendChild(button);
    }
  }

  renderOutcome(actions, hint){
    const outcome = this.view.state.outcome;
    const human = playerById(this.view, this.view.playerId);
    const winnerName = outcome.type === 'DRAW'
      ? 'Draw'
      : `${this.view.state.players[outcome.winner]?.name || 'Player'} wins`;
    if(hint) hint.textContent = `${winnerName} — ${String(outcome.reason || 'match complete').replaceAll('_', ' ')}`;
    const panel = makeElement(this.document, 'div', 'fate-v3-outcome');
    panel.appendChild(makeElement(
      this.document,
      'div',
      'fate-v3-card-name',
      Array.isArray(outcome.seals)
        ? `${winnerName}. Final Seals: ${outcome.seals[this.view.playerIndex] || 0}–${outcome.seals[this.view.aiPlayerIndex] || 0}`
        : `${winnerName}. Final fate: ${human?.score || 0}–${playerById(this.view, this.view.aiPlayerId)?.score || 0}`
    ));
    const exit = makeElement(this.document, 'button', 'btn sm', 'Return to menu');
    exit.type = 'button';
    exit.addEventListener('click', event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      this.onExit();
    });
    panel.appendChild(exit);
    actions.appendChild(panel);
  }

  renderActions(){
    const bar = this.document.getElementById('actbar');
    const hint = this.document.getElementById('act-hint');
    if(!bar) return;
    let actions = this.document.getElementById('fate-v3-local-actions');
    if(!actions){
      actions = makeElement(this.document, 'div', 'fate-v3-actions');
      actions.id = 'fate-v3-local-actions';
      bar.appendChild(actions);
    }
    actions.replaceChildren();
    if(this.view.state.outcome){
      this.visibleActions = [];
      this.renderOutcome(actions, hint);
      return;
    }
    if(this.hasSelectionPrompt()) this.appendPromptChoiceButtons(actions);
    const prompt = this.view.state.pendingPrompt;
    const selectionCommand = this.matchingPromptSelectionCommand();
    this.visibleActions = this.commandsForSelection()
      .filter(command=>{
        if(command.type === 'SET_CARD') return false;
        if(command === selectionCommand) return false;
        if(!prompt) return true;
        const payload = command.payload || {};
        if(payload.selectedIid || payload.selectedIids || payload.destination || payload.destinations) return false;
        return true;
      })
      .sort((left, right)=>stableStringify(left).localeCompare(stableStringify(right)));
    if(hint){
      if(prompt?.waitingForOpponent) hint.textContent = 'Waiting for the AI to answer';
      else if(prompt?.type === 'BOARD_DESTINATION') hint.textContent = prompt.multi
        ? `Choose ${prompt.min || 0}–${prompt.max || 1} highlighted squares`
        : 'Choose a highlighted square';
      else if(prompt) hint.textContent = 'Choose an answer to continue';
      else if(this.view.state.pendingHandLimit) hint.textContent = 'Select cards to discard down to the hand limit';
      else if(this.selectedDestinationKey) hint.textContent = 'Choose the exact legal action for this square';
      else if(this.selectedCardIid) hint.textContent = 'Choose a highlighted square or action';
      else hint.textContent = 'Select a card, deck action, or landscape action';
    }
    const baseLabels = this.visibleActions.map(command=>this.friendlyCommandLabel(command));
    const labelCounts = new Map();
    for(const label of baseLabels) labelCounts.set(label, Number(labelCounts.get(label) || 0) + 1);
    const labelIndexes = new Map();
    this.visibleActions.forEach((command, index)=>{
      const baseLabel = baseLabels[index];
      const nextIndex = Number(labelIndexes.get(baseLabel) || 0) + 1;
      labelIndexes.set(baseLabel, nextIndex);
      const label = Number(labelCounts.get(baseLabel) || 0) > 1
        ? `${baseLabel} — option ${nextIndex}`
        : baseLabel;
      const button = makeElement(this.document, 'button', 'btn sm', label);
      button.type = 'button';
      button.addEventListener('click', event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        this.submit(command);
      });
      actions.appendChild(button);
    });
  }

  renderScores(){
    const root = this.document.getElementById('zscore');
    if(!root) return;
    root.replaceChildren();
    for(let zone = 0; zone < 3; zone += 1){
      const mine = zoneScoreBreakdown(this.view.state, zone, this.view.playerIndex);
      const opponent = zoneScoreBreakdown(this.view.state, zone, this.view.aiPlayerIndex);
      const score = makeElement(
        this.document,
        'div',
        'zs',
        `Zone ${zone + 1}: ${zoneScore(this.view.state, zone, this.view.playerIndex)}–${zoneScore(this.view.state, zone, this.view.aiPlayerIndex)}`
      );
      const tooltip = zoneBreakdownText(mine, 'You') + '\n\n' + zoneBreakdownText(opponent, 'Opponent');
      score.setAttribute('aria-label', tooltip);
      score.dataset.tooltip = tooltip;
      root.appendChild(score);
    }
  }
}
