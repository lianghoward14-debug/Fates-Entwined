// Tutorial Mode - scripted Free World lesson

let _tutorialActive = false;
let _tutorialHintEl = null;
let _tutorialSeenDialogues = {};
let _tutorialArrowEls = [];
let _tutorialActionLog = [];
let _tutorialPaused = false;
let _tutorialBannerTimer = null;

const TUTORIAL_FREE_WORLD_FALLBACK = [
  '77','77','77','29','29','29','13','13','13','01','01',
  '22','22','06','06','18','18','18','37','37','37',
  '42','42','42','59','59','59','28','28','09','09','09',
  '63','63','32','32','32','60','60','60'
];

const TUTORIAL_PLAYER_OPENING_HAND = ['59','37','18','28','13','77'];
const TUTORIAL_PLAYER_DRAW_ORDER = ['42','29','60','63','01','22','37','09','59','28'];

const TUTORIAL_AI_OPENING_HAND = ['49','53','48','47','59','55'];
const TUTORIAL_AI_DRAW_ORDER = ['37','53','49','46','31','47','51','25','53','49'];
const TUTORIAL_AI_DECK = TUTORIAL_AI_OPENING_HAND.concat(TUTORIAL_AI_DRAW_ORDER, [
  '49','53','47','59','37','31','55','48','51','46','49','53','47','59','37','31'
]);

const TUTORIAL_TURN_PLANS = [
  {
    title: 'Turn 1: Build A Lane',
    text: '<p>Your goal is to win more zones than your opponent. Each zone is scored by adding the Fate on the cards there.</p><p>Start by building Zone 2. Supporters are free to set, and they also become Reinforcement for stronger Character cards later.</p>',
    hint: 'Set Czechoslovak Maroon Knights in Zone 2, center safe row.',
    actions: [
      {kind:'place', id:'59', z:1, r:2, c:1, hint:'Set 6th French Fusiliers in Zone 2, left safe row.'},
      {kind:'place', id:'37', z:1, r:2, c:0, hint:'Great. End your turn and watch the scripted opponent answer.'}
    ]
  },
  {
    title: 'Turn 2: Pick Two Zones',
    text: '<p>You usually cannot win every zone. Pick two zones, build them well, and make your opponent answer you.</p><p>This turn finishes your first lane in Zone 2 and starts a second lane in Zone 1. The glowing square shows exactly where the next card should go.</p>',
    hint: 'Set 1st US Marines in Zone 2, right safe row.',
    actions: [
      {kind:'place', id:'18', z:1, r:2, c:2, hint:'Set 2nd Polish-Lithuanian Army in Zone 1, center safe row.'},
      {kind:'place', id:'28', z:0, r:2, c:1, hint:'Good. End your turn.'}
    ]
  },
  {
    title: 'Turn 3: Consolidation',
    text: '<p>Characters are your bigger plays. To set one, you consolidate: choose the Character, press Set, then spend enough Reinforcement from cards already on your board.</p><p>Johnathan Kirby needs 1 Reinforcement. Spend the French Fusiliers, then place Johnathan on that same square.</p>',
    hint: 'Consolidate Johnathan Kirby by selecting the French Fusiliers in Zone 2, then click that same cell again to place him.',
    actions: [
      {kind:'consolidate', id:'13', z:1, r:2, c:0, tributes:[{z:1,r:2,c:0}], hint:'Johnathan is set. End your turn.'}
    ]
  },
  {
    title: 'Turn 4: Purple Borders And Search',
    text: '<p>Some cards have an effect after they enter play. A purple border means there is an effect ready in that card window.</p><p>IB Student searches your deck for a Supporter. This lesson gives you one clear search target so you can focus on how activation works.</p>',
    hint: 'Set IB Student in Zone 1, left safe row.',
    actions: [
      {kind:'place', id:'60', z:0, r:2, c:0, hint:'IB Student has a purple border. Click it on the board, then press Activate Effect.'},
      {kind:'activate', id:'60', z:0, r:2, c:0, forceSearchIds:['09'], hint:'Search resolved. End your turn.'}
    ]
  },
  {
    title: 'Turn 5: A Second Front',
    text: '<p>The search gave you United Nations 5th Army, and your draw gave you Greek Hoplite.</p><p>Use both to build Zone 3. You are setting up another lane now so it can support a Character later.</p>',
    hint: 'Set United Nations 5th Army in Zone 3, center safe row.',
    actions: [
      {kind:'place', id:'09', z:2, r:2, c:1, hint:'Set Greek Hoplite in Zone 3, left safe row.'},
      {kind:'place', id:'63', z:2, r:2, c:0, hint:'Zone 3 is ready for a payoff later. End your turn.'}
    ]
  },
  {
    title: 'Turn 6: Trade Support For Power',
    text: '<p>Consolidation is a trade. You lose a Supporter, but you gain a stronger Character in its place.</p><p>This turn turns the Polish-Lithuanian Army into Dylan Kirby. Use that kind of trade when it helps you win a zone.</p>',
    hint: 'Consolidate Dylan Kirby using the Polish-Lithuanian Army in Zone 1.',
    actions: [
      {kind:'consolidate', id:'29', z:0, r:2, c:1, tributes:[{z:0,r:2,c:1}], hint:'Dylan is in play. End your turn after reading the zone scores.'}
    ]
  },
  {
    title: 'Turn 7: Prepare The Finish',
    text: '<p>You are preparing the final Character now. Maria Lamboure goes into Zone 3 because Duncan Heyward will need that lane next.</p><p>Good turns often set up the following turn. The Supporters you place now can become future Reinforcement.</p>',
    hint: 'Set Maria Lamboure in Zone 3, right safe row.',
    actions: [
      {kind:'place', id:'42', z:2, r:2, c:2, hint:'Zone 3 now has three Supporters. End your turn.'}
    ]
  },
  {
    title: 'Turn 8: Duncan Payoff',
    text: '<p>This is the payoff. Spend the three Zone 3 Supporters to consolidate Duncan Heyward into the center of that lane.</p><p>That is the basic rhythm: build Supporters, choose the zones that matter, then turn Reinforcement into Characters that win those zones.</p>',
    hint: 'Consolidate Duncan Heyward using the three Zone 3 Supporters. Place him in the center.',
    actions: [
      {kind:'consolidate', id:'77', z:2, r:2, c:1, tributes:[{z:2,r:2,c:0},{z:2,r:2,c:1},{z:2,r:2,c:2}], hint:'That is the scripted finish. End turn to complete the lesson.'}
    ]
  }
];

const TUTORIAL_AI_TURNS = [
  [
    {kind:'place', id:'49', z:1, r:0, c:1},
    {kind:'place', id:'53', z:1, r:0, c:0}
  ],
  [
    {kind:'consolidate', id:'48', z:1, r:0, c:1, tributes:[{z:1,r:0,c:1}]}
  ],
  [
    {kind:'place', id:'47', z:0, r:0, c:1},
    {kind:'place', id:'59', z:0, r:0, c:0}
  ],
  [
    {kind:'consolidate', id:'55', z:0, r:0, c:1, tributes:[{z:0,r:0,c:1}]}
  ],
  [
    {kind:'place', id:'37', z:2, r:0, c:1},
    {kind:'place', id:'53', z:2, r:0, c:0},
    {kind:'place', id:'49', z:2, r:0, c:2}
  ],
  [
    {kind:'consolidate', id:'46', z:2, r:0, c:1, tributes:[{z:2,r:0,c:0},{z:2,r:0,c:1},{z:2,r:0,c:2}]}
  ],
  [
    {kind:'place', id:'31', z:1, r:0, c:2},
    {kind:'place', id:'47', z:0, r:0, c:2}
  ],
  [
    {kind:'consolidate', id:'51', z:1, r:0, c:2, tributes:[{z:1,r:0,c:0},{z:1,r:0,c:2}]}
  ]
];

function getTutorialFreeWorldDeckIds() {
  try {
    if(typeof STARTER_DECKS !== 'undefined' && Array.isArray(STARTER_DECKS)) {
      const deck = STARTER_DECKS.find(d => d && d.id === 'starter_freeworld');
      if(deck && Array.isArray(deck.ids) && deck.ids.length) return deck.ids.slice(0, 40);
    }
  } catch(e) {}
  return TUTORIAL_FREE_WORLD_FALLBACK.slice();
}

function tutorialRemoveIdsOnce(ids, toRemove) {
  const pool = ids.slice();
  toRemove.forEach(id => {
    const idx = pool.indexOf(id);
    if(idx >= 0) pool.splice(idx, 1);
  });
  return pool;
}

function tutorialCard(id, owner) {
  const def = CARDS.find(c => String(c.id) === String(id));
  return def ? createCardInstance(def, owner) : null;
}

function tutorialCards(ids, owner) {
  return ids.map(id => tutorialCard(id, owner)).filter(Boolean);
}

function applyTutorialScriptedCards() {
  const freeWorld = getTutorialFreeWorldDeckIds();
  const p1Removed = TUTORIAL_PLAYER_OPENING_HAND.concat(TUTORIAL_PLAYER_DRAW_ORDER);
  const p2Removed = TUTORIAL_AI_OPENING_HAND.concat(TUTORIAL_AI_DRAW_ORDER);

  G.p1Deck = freeWorld.slice();
  G.players[0].hand = tutorialCards(TUTORIAL_PLAYER_OPENING_HAND, 0);
  G.players[0].deck = tutorialCards(TUTORIAL_PLAYER_DRAW_ORDER.concat(tutorialRemoveIdsOnce(freeWorld, p1Removed)), 0);

  G.p2Deck = TUTORIAL_AI_DECK.slice();
  G.players[1].hand = tutorialCards(TUTORIAL_AI_OPENING_HAND, 1);
  G.players[1].deck = tutorialCards(TUTORIAL_AI_DRAW_ORDER.concat(tutorialRemoveIdsOnce(TUTORIAL_AI_DECK, p2Removed)), 1);
}

function tutorialTurnNumber() {
  if(!G || typeof G.turn !== 'number') return 1;
  return Math.max(1, Math.min(8, Math.ceil(G.turn / 2)));
}

function tutorialCurrentPlan() {
  return TUTORIAL_TURN_PLANS[tutorialTurnNumber() - 1] || null;
}

function tutorialCurrentAction() {
  const plan = tutorialCurrentPlan();
  if(!plan) return null;
  const idx = Number(G._tutorialActionIndex || 0);
  return plan.actions[idx] || null;
}

function tutorialActionLabel(action) {
  if(!action) return 'the scripted tutorial action';
  const card = CARDS.find(c => String(c.id) === String(action.id));
  const name = card ? card.name : ('card ' + action.id);
  if(action.kind === 'activate') return 'activate ' + name + '\'s effect';
  if(action.kind === 'consolidate') return 'consolidate ' + name;
  return 'set ' + name;
}

function tutorialSameCell(a, b) {
  return !!a && !!b && a.z === b.z && a.r === b.r && a.c === b.c;
}

function tutorialToastExpected(action) {
  const msg = 'Tutorial script: ' + tutorialActionLabel(action || tutorialCurrentAction()) + ' first.';
  if(typeof toast === 'function') toast(msg);
  showTutorialHint((action || tutorialCurrentAction())?.hint || msg);
}

function tutorialSetActionIndex(idx) {
  G._tutorialActionIndex = Math.max(0, Number(idx) || 0);
}

function tutorialRefreshHandVisualState() {
  try {
    if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
      window.FateMatchRendererAdapter.scheduleRender('tutorial-hand-state');
    }
    if(typeof renderHand === 'function') renderHand();
  } catch(e) {}
}

function tutorialActionComplete(payload) {
  const plan = tutorialCurrentPlan();
  const action = tutorialCurrentAction();
  if(!plan || !action) return;
  _tutorialActionLog.push({turn:tutorialTurnNumber(), action:action.kind, id:action.id, payload:payload || null});
  tutorialSetActionIndex((G._tutorialActionIndex || 0) + 1);
  tutorialRefreshHandVisualState();
  showTutorialTaskBanner(action, payload);
  const next = tutorialCurrentAction();
  if(next) showTutorialHint(action.hint || next.hint || ('Next: ' + tutorialActionLabel(next)));
  else showTutorialHint(action.hint || 'Turn script complete. Click End Turn.');
}

function tutorialActionCompletionText(action) {
  if(!action) return 'Task complete.';
  const card = CARDS.find(c => String(c.id) === String(action.id));
  const name = card ? card.name : ('Card ' + action.id);
  if(action.kind === 'activate') return 'Effect resolved: ' + name + '.';
  if(action.kind === 'consolidate') return 'Consolidated: ' + name + '.';
  return 'Set complete: ' + name + '.';
}

function showTutorialTaskBanner(action, payload) {
  if(!_tutorialActive || typeof document === 'undefined') return;
  const old = document.getElementById('tutorial-task-banner');
  if(old) old.remove();
  if(_tutorialBannerTimer) {
    clearTimeout(_tutorialBannerTimer);
    _tutorialBannerTimer = null;
  }
  const next = tutorialCurrentAction();
  const banner = document.createElement('div');
  banner.id = 'tutorial-task-banner';
  banner.className = 'tutorial-task-banner';
  banner.innerHTML = '<span class="tutorial-task-check">OK</span><span><b>' + tutorialActionCompletionText(action) + '</b><small>' + (next ? 'Next: ' + tutorialActionLabel(next) : 'Turn task complete. End your turn.') + '</small></span>';
  document.body.appendChild(banner);
  _tutorialBannerTimer = setTimeout(function(){
    if(banner && banner.parentNode) banner.remove();
    _tutorialBannerTimer = null;
  }, 3200);
}

function tutorialCurrentTargetSquare() {
  if(!_tutorialActive || !G || G.currentPlayer !== 0) return null;
  const action = tutorialCurrentAction();
  if(!action || !Number.isFinite(Number(action.z)) || !Number.isFinite(Number(action.r)) || !Number.isFinite(Number(action.c))) return null;
  if(action.kind !== 'place' && action.kind !== 'consolidate') return null;
  return {
    z:Number(action.z),
    r:Number(action.r),
    c:Number(action.c),
    kind:action.kind,
    id:String(action.id)
  };
}

function showTutorialHint(text) {
  if(!_tutorialActive || !text) return;
  removeTutorialHint();
  const hint = document.createElement('div');
  hint.id = 'tutorial-hint-bar';
  hint.className = 'tutorial-hint-bar';
  hint.innerHTML = '<span class="tutorial-hint-mark">!</span><span>' + text + '</span>';
  document.body.appendChild(hint);
  _tutorialHintEl = hint;
}

function removeTutorialHint() {
  if(_tutorialHintEl && _tutorialHintEl.parentNode) _tutorialHintEl.remove();
  _tutorialHintEl = null;
}

function tutorialHighlight(region) {
  clearTutorialHighlights();
  if(!region) return;
  let targets = [];
  if(region === 'board') targets = document.querySelectorAll('.zone, .zone-panel');
  else if(region === 'endturn') targets = document.querySelectorAll('.end-turn-btn, #end-turn-btn, [onclick*="endTurn"], button.btn.pri');
  else if(region === 'zones') targets = document.querySelectorAll('.zone-header, .zone-score, .zone-bar, .zone-panel');
  targets.forEach(t => {
    if(!t) return;
    t.style.outline = '2px solid rgba(201,168,76,.72)';
    t.style.outlineOffset = '2px';
    t.dataset.tutHighlight = '1';
  });
}

function clearTutorialHighlights() {
  document.querySelectorAll('[data-tut-highlight]').forEach(el => {
    el.style.outline = '';
    el.style.outlineOffset = '';
    delete el.dataset.tutHighlight;
  });
}

function showTutorialDialogue(keyOrPlan, onDismiss) {
  if(!_tutorialActive) return;
  const script = typeof keyOrPlan === 'string'
    ? (keyOrPlan === 'gameEnd'
      ? {title:'Tutorial Complete', text:'<p>You finished the core lesson: build two zones, set Supporters, consolidate Characters, use ready effects, and search for the card your plan needs.</p><p>In a normal match the choices are open, but the goal stays the same: control more zones than your opponent.</p>'}
      : null)
    : keyOrPlan;
  if(!script) { if(onDismiss) onDismiss(); return; }
  if(typeof keyOrPlan === 'string' && _tutorialSeenDialogues[keyOrPlan]) { if(onDismiss) onDismiss(); return; }
  if(typeof keyOrPlan === 'string') _tutorialSeenDialogues[keyOrPlan] = true;

  clearTutorialHighlights();
  tutorialHighlight(script.highlight);
  const existing = document.getElementById('tutorial-dialogue');
  if(existing) existing.remove();

  const totalSteps = TUTORIAL_TURN_PLANS.length + 2;
  const currentStep = Math.min(totalSteps, Object.keys(_tutorialSeenDialogues).length + tutorialTurnNumber());
  const progressPct = Math.max(8, Math.min(100, (currentStep / totalSteps) * 100));
  const el = document.createElement('div');
  el.id = 'tutorial-dialogue';
  el.className = 'tutorial-dialogue-card tutorial-scripted-dialogue';
  el.innerHTML = `
    <div class="tutorial-dialogue-head">
      <div class="tutorial-dialogue-title">${script.title}</div>
      <div class="tutorial-dialogue-count">${currentStep}/${totalSteps}</div>
    </div>
    <div class="tutorial-dialogue-progress"><div style="width:${progressPct}%;"></div></div>
    <div class="tutorial-dialogue-text">${script.text || ''}</div>
    <div class="tutorial-dialogue-actions">
      <button class="btn sm" id="tutorial-skip-btn">Skip</button>
      <button class="btn sm pri" id="tutorial-dismiss-btn">Continue</button>
    </div>`;
  document.body.appendChild(el);

  document.getElementById('tutorial-dismiss-btn').onclick = () => {
    el.remove();
    clearTutorialHighlights();
    if(onDismiss) onDismiss();
  };
  document.getElementById('tutorial-skip-btn').onclick = () => {
    el.remove();
    clearTutorialHighlights();
    removeTutorialHint();
    dismissTutorial();
    if(typeof toast === 'function') toast('Tutorial skipped. You can replay it from the main menu anytime.');
  };
}

function tutorialOnTurnStart(player) {
  if(!_tutorialActive || player !== 0) return;
  const turnNo = tutorialTurnNumber();
  if(G._tutorialSeenTurn === turnNo) return;
  G._tutorialSeenTurn = turnNo;
  tutorialSetActionIndex(0);
  tutorialRefreshHandVisualState();
  const plan = tutorialCurrentPlan();
  if(!plan) return;
  setTimeout(function(){
    showTutorialDialogue(plan, function(){
      const action = tutorialCurrentAction();
      showTutorialHint(plan.hint || (action ? 'Next: ' + tutorialActionLabel(action) : 'Read the board, then end turn.'));
    });
  }, turnNo === 1 ? 450 : 250);
}

function startTutorial() {
  _tutorialActive = true;
  if(document.body) document.body.classList.add('tutorial-active');
  _tutorialSeenDialogues = {};
  _tutorialActionLog = [];
  _tutorialPaused = false;

  G.p1Deck = getTutorialFreeWorldDeckIds();
  G.p2Deck = TUTORIAL_AI_DECK.slice();
  G.aiEnabled = true;
  G.aiPlayer = 1;
  G.aiDifficulty = 'easy';
  G._selectedAI = { name:'Tutorial Guide', elo:500, img:null, rank:'Footman' };
  G._aiOpponentElo = 500;
  G._tutorialTurnLimit = 16;
  G.maxTurns = 16;
  CURRENT_MODE = 'tutorial';

  initGameState();
  G.landscapeId = 'igb1';
  G.landscape = (typeof LANDSCAPES !== 'undefined' && LANDSCAPES) ? LANDSCAPES.igb1 : null;
  G.landscapeBgNum = 1;
  G._landscapeState = null;
  G._landscapeDrawQueue = [];
  applyTutorialScriptedCards();

  G.currentPlayer = 0;
  G.phase = 'main';
  G.maxSupportsPerTurn = 2;
  G.supportsPlacedThisTurn = 0;
  G.extraSupportsThisTurn = 0;
  G.turnNumber = 1;
  G.turn = 1;
  G._tutorialActionIndex = 0;
  G._tutorialSeenTurn = 0;
  G.players[0].name = USER_PROFILE.username || 'Player';
  G.players[1].name = 'Tutorial Guide';

  showScreen('s-game');
  if(typeof applyGameBackground === 'function') applyGameBackground('board1');
  renderGame();
  renderHand();
  if(typeof updateTopBar === 'function') updateTopBar();
  injectTutorialCSS();

  setTimeout(() => {
    showTutorialDialogue({
      title:'Free World Training',
      text:'<p>Win by controlling more zones than your opponent. A zone is controlled by the player with more Fate there.</p><p>Your basic turn is simple: set Supporters, use them as Reinforcement for Characters, and activate effects when a card offers one.</p><p>Read cards in this order: name, Fate number, type, then rules text. This lesson is scripted so you can learn the flow without guessing the next move.</p>'
    }, function(){
      tutorialOnTurnStart(0);
    });
  }, 350);
}

function injectTutorialCSS() {
  if(document.getElementById('tutorial-extra-css')) return;
  const style = document.createElement('style');
  style.id = 'tutorial-extra-css';
  style.textContent = `
    #tutorial-dialogue.tutorial-dialogue-card{
      z-index:50000!important;
      isolation:isolate!important;
    }
    #tutorial-dialogue.tutorial-dialogue-card::before,
    #tutorial-dialogue.tutorial-dialogue-card::after{
      z-index:0!important;
    }
    #tutorial-dialogue.tutorial-dialogue-card > *{
      position:relative!important;
      z-index:1!important;
    }
    #tutorial-dialogue.tutorial-scripted-dialogue .tutorial-dialogue-title{letter-spacing:.08em;}
    #tutorial-dialogue.tutorial-scripted-dialogue .tutorial-dialogue-text b{color:#ffe28a;}
    #tutorial-hint-bar.tutorial-hint-bar{max-width:min(760px, calc(100vw - 48px));}
    #tutorial-task-banner.tutorial-task-banner{
      position:fixed;
      right:1.05rem;
      top:4.6rem;
      z-index:50001;
      display:flex;
      align-items:center;
      gap:.72rem;
      width:min(390px, calc(100vw - 2rem));
      padding:.76rem .92rem;
      border:1px solid rgba(245,215,126,.58);
      border-radius:8px;
      background:linear-gradient(180deg,rgba(20,23,32,.96),rgba(5,6,10,.98));
      color:#f8edd1;
      box-shadow:0 18px 42px rgba(0,0,0,.55),0 0 24px rgba(201,168,76,.20),inset 0 0 0 1px rgba(255,246,191,.06);
      animation:tutorialTaskBannerIn .2s ease-out;
      pointer-events:none;
      overflow:hidden;
    }
    #tutorial-task-banner .tutorial-task-check{
      display:inline-grid;
      place-items:center;
      width:1.86rem;
      height:1.86rem;
      border-radius:50%;
      border:1px solid rgba(245,215,126,.72);
      color:#ffe18a;
      font-weight:900;
      flex:0 0 auto;
      box-shadow:0 0 16px rgba(201,168,76,.28);
    }
    #tutorial-task-banner b{
      display:block;
      font-family:'Cinzel',serif;
      font-size:.86rem;
      letter-spacing:.05em;
      color:#ffe18a;
      line-height:1.18;
    }
    #tutorial-task-banner small{
      display:block;
      margin-top:.22rem;
      font-size:.76rem;
      color:#d9cfb7;
      line-height:1.25;
    }
    @keyframes tutorialTaskBannerIn{
      from{opacity:0;transform:translateY(-8px);}
      to{opacity:1;transform:translateY(0);}
    }
    #board .cell.tutorial-target-square{
      position:relative;
      box-shadow:0 0 0 2px rgba(255,221,105,.58),0 0 18px rgba(255,213,89,.34),inset 0 0 18px rgba(255,221,105,.10)!important;
    }
    #board .cell.tutorial-target-square::after{
      content:'';
      position:absolute;
      inset:4px;
      border-radius:6px;
      border:1px solid rgba(255,232,142,.55);
      box-shadow:0 0 18px rgba(255,216,96,.42),inset 0 0 16px rgba(255,216,96,.12);
      animation:tutorialGoldSquarePulse 1.45s ease-in-out infinite;
      pointer-events:none;
      z-index:1;
    }
    @keyframes tutorialGoldSquarePulse{
      0%,100%{opacity:.46;transform:scale(.985);}
      50%{opacity:.9;transform:scale(1.015);}
    }
  `;
  document.head.appendChild(style);
}

function tutorialEvent(event, payload) {
  if(!_tutorialActive) return;
  if(event === 'gameEnd') {
    removeTutorialHint();
    clearTutorialHighlights();
    showTutorialDialogue('gameEnd');
    _tutorialActive = false;
    if(document.body) document.body.classList.remove('tutorial-active');
    USER_PROFILE._tutorialCompleted = true;
    if(typeof saveProfile === 'function') saveProfile();
    return;
  }
  if(event === 'endTurn') {
    removeTutorialHint();
    return;
  }

  const expected = tutorialCurrentAction();
  if(!expected) return;
  const id = payload && payload.card ? String(payload.card.id) : String(payload && payload.id || '');
  if((event === 'placeSupporter' || event === 'placeCharacter') && String(expected.id) === id) {
    tutorialActionComplete(payload);
  } else if(event === 'activateEffect' && expected.kind === 'activate' && String(expected.id) === id) {
    tutorialActionComplete(payload);
  }
}

function tutorialCanSelectHandCard(card) {
  if(!_tutorialActive || !card || G.currentPlayer !== 0) return true;
  const action = tutorialCurrentAction();
  if(!action || action.kind === 'activate') return true;
  if(String(card.id) !== String(action.id)) {
    tutorialToastExpected(action);
    return false;
  }
  return true;
}

function tutorialCanPlayHandCardNow(card) {
  if(!_tutorialActive || !card || !G || G.currentPlayer !== 0) return true;
  const action = tutorialCurrentAction();
  if(!action || action.kind === 'activate') return false;
  return String(card.id) === String(action.id);
}

function tutorialHandRenderStateSignature() {
  if(!_tutorialActive || !G) return '';
  const action = tutorialCurrentAction();
  return [
    'tutorial',
    tutorialTurnNumber(),
    Number(G._tutorialActionIndex || 0),
    action ? action.kind : 'done',
    action ? action.id : ''
  ].join(':');
}

function tutorialCanStartHandAction(card, kind) {
  if(!_tutorialActive || !card || G.currentPlayer !== 0) return true;
  const action = tutorialCurrentAction();
  if(!action) return true;
  if(String(card.id) !== String(action.id) || action.kind !== kind) {
    tutorialToastExpected(action);
    return false;
  }
  return true;
}

function tutorialCanPlaceCardAt(card, z, r, c) {
  if(!_tutorialActive || !card || G.currentPlayer !== 0) return true;
  const action = tutorialCurrentAction();
  if(!action || action.kind !== 'place' || String(card.id) !== String(action.id)) {
    tutorialToastExpected(action);
    return false;
  }
  if(action.z !== z || action.r !== r || action.c !== c) {
    if(typeof toast === 'function') toast('Tutorial script: place it in Zone ' + (action.z + 1) + ', your safe row, slot ' + (action.c + 1) + '.');
    showTutorialHint(action.hint || tutorialActionLabel(action));
    return false;
  }
  return true;
}

function tutorialCanSelectConsolidationTribute(con, z, r, c) {
  if(!_tutorialActive || G.currentPlayer !== 0 || !con || !con.card) return true;
  const action = tutorialCurrentAction();
  if(!action || action.kind !== 'consolidate' || String(con.card.id) !== String(action.id)) {
    tutorialToastExpected(action);
    return false;
  }
  const ok = Array.isArray(action.tributes) && action.tributes.some(t => t.z === z && t.r === r && t.c === c);
  if(!ok) {
    if(typeof toast === 'function') toast('Tutorial script: use the highlighted planned reinforcement for this consolidation.');
    showTutorialHint(action.hint || tutorialActionLabel(action));
    return false;
  }
  return true;
}

function tutorialCanPlaceConsolidationAt(con, z, r, c) {
  if(!_tutorialActive || G.currentPlayer !== 0 || !con || !con.card) return true;
  const action = tutorialCurrentAction();
  if(!action || action.kind !== 'consolidate' || String(con.card.id) !== String(action.id)) {
    tutorialToastExpected(action);
    return false;
  }
  if(action.z !== z || action.r !== r || action.c !== c) {
    if(typeof toast === 'function') toast('Tutorial script: place the Character on the planned reinforcement cell.');
    showTutorialHint(action.hint || tutorialActionLabel(action));
    return false;
  }
  return true;
}

function tutorialCanActivateBoardEffect(card, z, r, c) {
  if(!_tutorialActive || !card || G.currentPlayer !== 0) return true;
  const action = tutorialCurrentAction();
  if(!action || action.kind !== 'activate' || String(card.id) !== String(action.id)) {
    tutorialToastExpected(action);
    return false;
  }
  if(action.z !== z || action.r !== r || action.c !== c) {
    tutorialToastExpected(action);
    return false;
  }
  return true;
}

function tutorialCanEndTurn() {
  if(!_tutorialActive || G.currentPlayer !== 0) return true;
  const action = tutorialCurrentAction();
  if(action) {
    tutorialToastExpected(action);
    return false;
  }
  return true;
}

function tutorialFilterCardPickerOptions(cards, opts) {
  if(!_tutorialActive || !Array.isArray(cards) || G.currentPlayer !== 0) return null;
  const action = tutorialCurrentAction();
  if(!action || action.kind !== 'activate' || !Array.isArray(action.forceSearchIds)) return null;
  const forced = action.forceSearchIds.map(id => cards.find(c => String(c.id) === String(id))).filter(Boolean);
  return forced.length ? forced : null;
}

function tutorialTakeCard(playerIdx, id) {
  const player = G.players[playerIdx];
  if(!player) return null;
  const sid = String(id);
  let idx = player.hand.findIndex(c => String(c.id) === sid);
  if(idx >= 0) return player.hand.splice(idx, 1)[0];
  idx = player.deck.findIndex(c => String(c.id) === sid);
  if(idx >= 0) return player.deck.splice(idx, 1)[0];
  return tutorialCard(sid, playerIdx);
}

function tutorialFindOpenCell(playerIdx, desired) {
  if(desired && G.board[desired.z] && G.board[desired.z][desired.r] && !G.board[desired.z][desired.r][desired.c]) return desired;
  const safeRow = playerIdx === 0 ? 2 : 0;
  for(let z=0; z<3; z++) {
    for(let c=0; c<3; c++) {
      if(G.board[z] && G.board[z][safeRow] && !G.board[z][safeRow][c]) return {z,r:safeRow,c};
    }
  }
  return desired || {z:0,r:safeRow,c:0};
}

async function tutorialSleep(ms) {
  await new Promise(resolve => setTimeout(resolve, Math.max(0, ms || 0)));
}

async function tutorialForcePlaceCard(playerIdx, action) {
  const source = tutorialTakeCard(playerIdx, action.id);
  if(!source) return;
  const pos = tutorialFindOpenCell(playerIdx, action);
  const inst = newInstance(source);
  inst.owner = playerIdx;
  inst.currentFate = typeof getPlacedCardFate === 'function' ? getPlacedCardFate(source, {bonusFate:0}) : (source.currentFate || source.fate || 0);
  if(typeof markCardSetTurn === 'function') markCardSetTurn(inst, playerIdx);
  if(typeof consumePendingPlacementFlags === 'function') consumePendingPlacementFlags(source, inst);
  G.board[pos.z][pos.r][pos.c] = inst;
  if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, pos.z, pos.r, pos.c);
  if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);
  if(typeof log === 'function') log(playerIdx === 0 ? 'p1' : 'p2', G.players[playerIdx].name + ' set ' + inst.name + ' in Zone ' + (pos.z + 1) + '.');
  if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
  renderGame({board:true, hand:true, scores:true, piles:true, blocks:true, topbar:true});
  await tutorialSleep(520);
}

async function tutorialForceConsolidateCard(playerIdx, action) {
  const source = tutorialTakeCard(playerIdx, action.id);
  if(!source) return;
  const tributes = (action.tributes || []).map(t => ({
    z:t.z,
    r:t.r,
    c:t.c,
    card:G.board[t.z] && G.board[t.z][t.r] ? G.board[t.z][t.r][t.c] : null
  })).filter(t => t.card);
  tributes.forEach(t => {
    if(typeof discardBoardCard === 'function') discardBoardCard(t.card, t.z, t.r, t.c);
    else G.board[t.z][t.r][t.c] = null;
  });
  const inst = newInstance(source);
  inst.owner = playerIdx;
  inst.currentFate = typeof getPlacedCardFate === 'function'
    ? getPlacedCardFate(source, {bonusFate:0, tributeCount:tributes.length})
    : (source.currentFate || source.fate || 0);
  if(typeof markCardSetTurn === 'function') markCardSetTurn(inst, playerIdx);
  G.board[action.z][action.r][action.c] = inst;
  if(typeof applyLandscapePlacementBonuses === 'function') applyLandscapePlacementBonuses(inst, action.z, action.r, action.c);
  if(typeof applyRiveraBuffToPlacedCard === 'function') applyRiveraBuffToPlacedCard(inst, inst.owner);
  if(typeof log === 'function') log(playerIdx === 0 ? 'p1' : 'p2', G.players[playerIdx].name + ' consolidated ' + inst.name + ' in Zone ' + (action.z + 1) + '.');
  if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
  renderGame({board:true, hand:true, scores:true, piles:true, blocks:true, topbar:true});
  await tutorialSleep(720);
}

async function runTutorialAITurn() {
  if(!_tutorialActive || G.currentPlayer !== G.aiPlayer || G._aiRunning) return;
  G._aiRunning = true;
  G._aiAborted = false;
  const aiTurn = Math.max(1, Math.min(8, Math.ceil(G.turn / 2)));
  const actions = TUTORIAL_AI_TURNS[aiTurn - 1] || [];
  if(typeof log === 'function') log('p2', 'Tutorial Guide follows the scripted turn ' + aiTurn + ' line.');
  try {
    await tutorialSleep(650);
    for(const action of actions) {
      if(G.currentPlayer !== G.aiPlayer) break;
      if(action.kind === 'place') await tutorialForcePlaceCard(G.aiPlayer, action);
      else if(action.kind === 'consolidate') await tutorialForceConsolidateCard(G.aiPlayer, action);
    }
  } finally {
    G._aiRunning = false;
  }
  await tutorialSleep(420);
  if(G.currentPlayer === G.aiPlayer) endTurn({skipEffectWarning:true, skipModalDeferral:true});
}

function dismissTutorial() {
  _tutorialActive = false;
  if(document.body) document.body.classList.remove('tutorial-active');
  removeTutorialHint();
  clearTutorialHighlights();
  if(_tutorialBannerTimer) {
    clearTimeout(_tutorialBannerTimer);
    _tutorialBannerTimer = null;
  }
  const banner = document.getElementById('tutorial-task-banner');
  if(banner) banner.remove();
  const el = document.getElementById('tutorial-dialogue');
  if(el) el.remove();
}

window.startTutorial = startTutorial;
window.dismissTutorial = dismissTutorial;
window.tutorialEvent = tutorialEvent;
window.tutorialOnTurnStart = tutorialOnTurnStart;
window.tutorialCanSelectHandCard = tutorialCanSelectHandCard;
window.tutorialCanPlayHandCardNow = tutorialCanPlayHandCardNow;
window.tutorialHandRenderStateSignature = tutorialHandRenderStateSignature;
window.tutorialCanStartHandAction = tutorialCanStartHandAction;
window.tutorialCanPlaceCardAt = tutorialCanPlaceCardAt;
window.tutorialCanSelectConsolidationTribute = tutorialCanSelectConsolidationTribute;
window.tutorialCanPlaceConsolidationAt = tutorialCanPlaceConsolidationAt;
window.tutorialCanActivateBoardEffect = tutorialCanActivateBoardEffect;
window.tutorialCanEndTurn = tutorialCanEndTurn;
window.tutorialFilterCardPickerOptions = tutorialFilterCardPickerOptions;
window.tutorialCurrentTargetSquare = tutorialCurrentTargetSquare;
window.runTutorialAITurn = runTutorialAITurn;
