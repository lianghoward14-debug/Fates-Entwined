import {stableStringify, zoneScore} from '../../shared/engine/index.mjs';

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
  constructor({windowRef, adapter, cardDefinitions = [], onExit}){
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
    this.visibleActions = [];
    this.bound = false;
    this.aiQueued = false;
    this.endTurnElement = null;
    this.endTurnOnclick = null;
    this.endTurnHandler = null;
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
    if(this.endTurnElement && this.endTurnHandler){
      this.endTurnElement.removeEventListener('click', this.endTurnHandler, true);
      if(this.endTurnOnclick === null) this.endTurnElement.removeAttribute('onclick');
      else this.endTurnElement.setAttribute('onclick', this.endTurnOnclick);
    }
    this.document?.getElementById('fate-v3-local-actions')?.remove();
    this.document?.documentElement?.classList.remove(ACTIVE_CLASS);
    this.document?.body?.classList.remove(ACTIVE_CLASS);
    this.bound = false;
    this.view = null;
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
        if(command) this.submit(command);
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
    const max = Number(prompt?.max || (this.view?.state?.pendingHandLimit?.required || 1));
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
    return legal.find(command=>{
      const payload = command.payload || {};
      if(payload.selectedIids) return sameStringSet(payload.selectedIids, iids);
      if(payload.discardedIids) return sameStringSet(payload.discardedIids, iids);
      if(payload.destinations) return sameDestinationSet(payload.destinations, destinations);
      return false;
    }) || null;
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
    this.renderActions();
    this.renderScores();
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
    const element = makeElement(this.document, interactive ? 'button' : 'div', `fate-v3-card ${className}`.trim());
    if(interactive) element.type = 'button';
    if(String(card.iid) === this.selectedCardIid || this.selectedPromptIids.has(String(card.iid))){
      element.classList.add('is-selected');
    }
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
      `${winnerName}. Final fate: ${human?.score || 0}–${playerById(this.view, this.view.aiPlayerId)?.score || 0}`
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
      root.appendChild(makeElement(
        this.document,
        'div',
        'zs',
        `Zone ${zone + 1}: ${zoneScore(this.view.state, zone, this.view.playerIndex)}–${zoneScore(this.view.state, zone, this.view.aiPlayerIndex)}`
      ));
    }
  }
}
