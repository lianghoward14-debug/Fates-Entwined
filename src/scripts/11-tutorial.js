// Tutorial Mode - Free World guided lesson

let _tutorialActive = false;
let _tutorialStep = 0;
let _tutorialTurnsSeen = {};
let _tutorialHintEl = null;
let _tutorialArrowEls = [];
let _tutorialActionLog = [];
let _tutorialPaused = false;

const TUTORIAL_FREE_WORLD_FALLBACK = [
  '77','77','77','29','29','29','13','13','13','01','01',
  '22','22','06','06','18','18','18','37','37','37',
  '42','42','42','59','59','59','28','28','09','09','09',
  '63','63','32','32','32','60','60','60'
];

const TUTORIAL_AI_DECK = [
  '25','25','25','31','31','31','37','37','37','49','49','49',
  '53','53','53','59','59','59','70','70','70','68','68','68',
  '33','33','33','47','47','47','25','25','31','31','37','37',
  '49','49','53','53'
];

const TUTORIAL_OPENING_HAND = ['59','37','18','28','13','77'];
const TUTORIAL_DRAW_ORDER = ['42','29','09','63','01','42','59','28','18','37'];

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
  const def = CARDS.find(c => c.id === id);
  return def ? createCardInstance(def, owner) : null;
}

function tutorialCards(ids, owner) {
  return ids.map(id => tutorialCard(id, owner)).filter(Boolean);
}

function applyTutorialScriptedCards() {
  const freeWorld = getTutorialFreeWorldDeckIds();
  const handIds = TUTORIAL_OPENING_HAND.slice();
  const drawIds = TUTORIAL_DRAW_ORDER.slice();
  const remaining = tutorialRemoveIdsOnce(freeWorld, handIds.concat(drawIds));

  G.p1Deck = freeWorld.slice();
  G.players[0].hand = tutorialCards(handIds, 0);
  G.players[0].deck = tutorialCards(drawIds.concat(remaining), 0);

  G.p2Deck = TUTORIAL_AI_DECK.slice();
  G.players[1].hand = tutorialCards(['25','31','37','49','53','59'], 1);
  G.players[1].deck = tutorialCards(tutorialRemoveIdsOnce(TUTORIAL_AI_DECK, ['25','31','37','49','53','59']), 1);
}

const TUTORIAL_SCRIPT = {
  gameStart: {
    title: 'Tutorial: The Free World',
    text: `
      <p>This lesson teaches the normal rules through the starter deck <b>The Free World</b>.</p>
      <p>Card basics: the number in the top-right is <b>Fate</b>, which decides zone control. The label under the art tells you the card's <b>type</b>: Supporter, Initiator, Coordinator, Dauntless, or Improvisor.</p>
      <p>The text box explains what the card does. Small icons and colors show affiliation or rarity, which matter for effects like Third Great War bonuses.</p>
      <p>The game is shortened to <b>10 turns</b>. At the end, whoever controls at least <b>2 of the 3 zones</b> wins.</p>
      <p>The Free World plan is simple: fill the board with <b>Third Great War</b> Supporters, then use Characters like <b>Duncan Heyward</b> and <b>Dylan Kirby</b> to turn that army into a zone-winning push.</p>
    `,
    highlight: null
  },
  boardBasics: {
    title: 'The Board',
    text: `
      <p>There are <b>3 zones</b>. Each zone has your side and your opponent's side.</p>
      <p>The numbers at the top compare total Fate in that zone. Higher Fate controls the zone.</p>
      <p>You do not need all three zones. Pick two zones and make those two hard to beat.</p>
    `,
    highlight: 'board'
  },
  handBasics: {
    title: 'Your Hand',
    text: `
      <p>Your cards are at the bottom of the screen.</p>
      <p><b>Supporters</b> are free. You can usually place <b>2 Supporters each turn</b>.</p>
      <p><b>Characters</b> are stronger, but they need Reinforcement. Reinforcement comes from Supporters already on your board.</p>
    `,
    highlight: 'hand'
  },
  firstAction: {
    title: 'First Action',
    text: `
      <p>Start with a Supporter. Click a Supporter in your hand, then click an empty cell on your side of the board.</p>
      <p>For this deck, try to build one main zone with Third Great War cards. The Maroon Knights are a good early anchor because they help Supporters in their zone.</p>
    `,
    highlight: 'hand'
  },
  firstSupporterPlaced: {
    title: 'Supporters Build The Lane',
    text: `
      <p>Good. That Supporter added Fate to its zone.</p>
      <p>Place one more Supporter this turn. Putting it in the same zone teaches the Free World plan clearly: stack a lane first, then cash in with a Character later.</p>
    `,
    highlight: 'hand'
  },
  secondSupporterPlaced: {
    title: 'End The Turn',
    text: `
      <p>You used your normal Supporter plays for the turn.</p>
      <p>Click <b>End Turn</b>. Your opponent will answer, then you draw and continue.</p>
    `,
    highlight: 'endturn'
  },
  opponentAnswer: {
    title: 'Reading The Opponent',
    text: `
      <p>After the opponent acts, check the zone scores.</p>
      <p>If the opponent heavily wins one zone, you can often ignore it. Winning two zones cleanly is better than fighting everywhere.</p>
      <p>On your next turns, keep building your two best zones with Supporters.</p>
    `,
    highlight: 'zones'
  },
  consolidationIntro: {
    title: 'How Consolidation Works',
    text: `
      <p>Consolidation is how you place a Character.</p>
      <p><b>Step 1:</b> click a Character in your hand.</p>
      <p><b>Step 2:</b> click <b>Set</b> or <b>Consolidate</b> in the card detail panel.</p>
      <p><b>Step 3:</b> select Supporters on your board until the gold count reaches the Character cost.</p>
      <p><b>Step 4:</b> click one of the highlighted cells to place the Character. The selected Supporters are expended and move to discard.</p>
    `,
    highlight: 'hand'
  },
  consolidatePractice: {
    title: 'Try A Small Character',
    text: `
      <p><b>Johnathan Kirby</b> costs 1 Reinforcement, so he only needs one Supporter to be expended.</p>
      <p>Use him as your first consolidation if you can. His effect searches more Supporters, which is exactly what The Free World wants.</p>
    `,
    highlight: 'hand'
  },
  characterPlaced: {
    title: 'Character Placed',
    text: `
      <p>That is a consolidation. The Character entered the board, and the selected Supporter was expended.</p>
      <p>Characters usually create a tempo swing: they add Fate, trigger an effect, or boost nearby cards.</p>
    `,
    highlight: null
  },
  duncanPlan: {
    title: 'Duncan Is The Payoff',
    text: `
      <p><b>Duncan Heyward</b> costs 3 Reinforcement, so he needs three Supporters.</p>
      <p>When Duncan is placed, declare <b>Third Great War</b>. Then cards you control in his zone with that affiliation gain a major Fate bonus.</p>
      <p>This is the deck's main lesson: build a Third Great War lane first, then consolidate Duncan into that lane to make it explode.</p>
    `,
    highlight: 'hand'
  },
  dylanPlan: {
    title: 'Dylan Refills The Plan',
    text: `
      <p><b>Dylan Kirby</b> is another key Free World card. He finds Third Great War cards from your deck or discard pile.</p>
      <p>If you run low on Supporters, Dylan helps reload the same plan instead of forcing you into random plays.</p>
    `,
    highlight: 'hand'
  },
  zonePlan: {
    title: 'Generic Rule, Free World Habit',
    text: `
      <p>Every turn, ask three quick questions:</p>
      <p><b>1.</b> Which two zones can I realistically win?</p>
      <p><b>2.</b> Do I need more Supporters, or is it time to consolidate?</p>
      <p><b>3.</b> Will this Character matter in the zone where I place it?</p>
      <p>If the answer is unclear, play Supporters into your two chosen zones and keep your options open.</p>
    `,
    highlight: 'zones'
  },
  finalTurns: {
    title: 'Final Turns',
    text: `
      <p>The tutorial ends on turn 10, so do not wait forever.</p>
      <p>In the last turns, count the scores and commit. Spend your best Characters in the two zones that can actually win.</p>
    `,
    highlight: 'zones'
  },
  gameEnd: {
    title: 'Tutorial Complete',
    text: `
      <p>You finished the Free World tutorial.</p>
      <p>You learned the core rules: zone control, Supporter placement, Character consolidation, expending Supporters for Reinforcement, and the 2-out-of-3 win condition.</p>
      <p>You also learned the Free World style: build Third Great War lanes, use Dylan to refill, and use Duncan to declare Third Great War for the big zone swing.</p>
    `,
    highlight: null
  }
};

function showTutorialHint(text) {
  if(!_tutorialActive) return;
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
  if(region === 'hand') targets = [];
  else if(region === 'board') targets = document.querySelectorAll('.zone, .zone-panel');
  else if(region === 'endturn') targets = document.querySelectorAll('.end-turn-btn, #end-turn-btn, [onclick*="endTurn"], button.btn.pri');
  else if(region === 'zones') targets = document.querySelectorAll('.zone-header, .zone-score, .zone-bar, .zone-panel');

  targets.forEach(t => {
    if(t) {
      t.style.outline = '2px solid rgba(201,168,76,.72)';
      t.style.outlineOffset = '2px';
      t.dataset.tutHighlight = '1';
    }
  });
}

function clearTutorialHighlights() {
  document.querySelectorAll('[data-tut-highlight]').forEach(el => {
    el.style.outline = '';
    el.style.outlineOffset = '';
    delete el.dataset.tutHighlight;
  });
}

function startTutorial() {
  _tutorialActive = true;
  if(document.body) document.body.classList.add('tutorial-active');
  _tutorialStep = 0;
  _tutorialTurnsSeen = {};
  _tutorialActionLog = [];
  _tutorialPaused = false;

  G.p1Deck = getTutorialFreeWorldDeckIds();
  G.p2Deck = TUTORIAL_AI_DECK.slice();
  G.aiEnabled = true;
  G.aiPlayer = 1;
  G.aiDifficulty = 'easy';
  G._selectedAI = { name:'Tutorial Guide', elo:500, img:null, rank:'Footman' };
  G._aiOpponentElo = 500;
  G._tutorialTurnLimit = 10;
  G.maxTurns = 10;
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
  G.players[0].name = USER_PROFILE.username || 'Player';
  G.players[1].name = 'Tutorial Guide';

  showScreen('s-game');
  if(typeof applyGameBackground === 'function') applyGameBackground('board1');
  renderGame();
  renderHand();
  if(typeof updateTopBar === 'function') updateTopBar();

  injectTutorialCSS();

  setTimeout(() => {
    showTutorialDialogue('gameStart', () => {
      showTutorialDialogue('boardBasics', () => {
        showTutorialDialogue('handBasics', () => {
          showTutorialDialogue('firstAction', () => {
            showTutorialHint('Place a Supporter: click a Supporter in hand, then click an empty cell on your side of the board.');
          });
        });
      });
    });
  }, 500);
}

function injectTutorialCSS() {
  if(document.getElementById('tutorial-extra-css')) return;
  const style = document.createElement('style');
  style.id = 'tutorial-extra-css';
  style.textContent = `
    @keyframes tutDialogueIn { from { opacity:0; transform:translate(-50%, -46%) scale(.98); } to { opacity:1; transform:translate(-50%, -50%) scale(1); } }
    @keyframes tutHintIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    #tutorial-dialogue.tutorial-dialogue-card {
      position:fixed;
      left:50%;
      top:50%;
      width:min(720px, calc(100vw - 56px));
      max-height:min(72vh, 620px);
      z-index:10050;
      padding:1.35rem 1.45rem 1.1rem;
      box-sizing:border-box;
      display:flex;
      flex-direction:column;
      border:1px solid rgba(236,205,105,.8);
      border-radius:8px;
      background:linear-gradient(180deg,rgba(10,13,21,.98),rgba(3,5,10,.98));
      box-shadow:0 24px 70px rgba(0,0,0,.62), inset 0 0 0 1px rgba(255,255,255,.045);
      color:#f4ecd0;
      animation:tutDialogueIn .18s ease-out;
      overflow:hidden;
      scrollbar-width:thin;
      scrollbar-color:rgba(236,205,105,.42) transparent;
    }
    #tutorial-dialogue::-webkit-scrollbar {
      width:6px;
      height:6px;
    }
    #tutorial-dialogue::-webkit-scrollbar-thumb {
      background:rgba(236,205,105,.42);
      border-radius:999px;
    }
    #tutorial-dialogue .tutorial-dialogue-head {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:1rem;
      margin-bottom:.65rem;
    }
    #tutorial-dialogue .tutorial-dialogue-title {
      font-family:'Cinzel',serif;
      color:#fff0a8;
      font-size:clamp(1.45rem,2.2vw,2rem);
      letter-spacing:.04em;
      line-height:1.05;
    }
    #tutorial-dialogue .tutorial-dialogue-count {
      font-family:'Cinzel',serif;
      color:rgba(236,224,190,.58);
      font-size:.72rem;
      white-space:nowrap;
    }
    #tutorial-dialogue .tutorial-dialogue-progress {
      height:4px;
      border-radius:999px;
      background:rgba(255,255,255,.08);
      overflow:hidden;
      margin-bottom:1rem;
    }
    #tutorial-dialogue .tutorial-dialogue-progress div {
      height:100%;
      background:linear-gradient(90deg,#c9a84c,#fff0a8);
    }
    #tutorial-dialogue .tutorial-dialogue-text {
      font-family:'Crimson Pro',serif;
      font-size:1.14rem;
      line-height:1.38;
      flex:1 1 auto;
      min-height:0;
      overflow-y:auto;
      overflow-x:hidden;
      padding-right:.45rem;
      scrollbar-width:thin;
      scrollbar-color:rgba(236,205,105,.42) transparent;
    }
    #tutorial-dialogue .tutorial-dialogue-text::-webkit-scrollbar { width:6px; }
    #tutorial-dialogue .tutorial-dialogue-text::-webkit-scrollbar-thumb {
      background:rgba(236,205,105,.42);
      border-radius:999px;
    }
    #tutorial-dialogue .tutorial-dialogue-text p {
      margin:.45rem 0;
    }
    #tutorial-dialogue .tutorial-dialogue-actions {
      display:flex;
      justify-content:flex-end;
      gap:.65rem;
      margin-top:1.15rem;
      flex:0 0 auto;
      position:relative;
      z-index:2;
      padding-top:.15rem;
    }
    #tutorial-hint-bar.tutorial-hint-bar {
      position:fixed !important;
      left:auto !important;
      right:1.05rem !important;
      top:auto !important;
      bottom:5.1rem !important;
      transform:none !important;
      z-index:10040 !important;
      width:min(340px, calc(100vw - 2rem)) !important;
      max-width:min(340px, calc(100vw - 2rem)) !important;
      min-height:0 !important;
      display:grid !important;
      grid-template-columns:auto minmax(0,1fr) !important;
      align-items:start !important;
      gap:.62rem !important;
      padding:.72rem .82rem !important;
      border:1px solid rgba(236,205,105,.62) !important;
      border-radius:8px !important;
      background:linear-gradient(180deg,rgba(9,12,20,.95),rgba(3,5,10,.96)) !important;
      box-shadow:0 12px 34px rgba(0,0,0,.42), inset 0 0 0 1px rgba(255,255,255,.04) !important;
      color:#f4ecd0 !important;
      font-family:'Crimson Pro',serif !important;
      font-size:.95rem !important;
      line-height:1.25 !important;
      backdrop-filter:blur(6px);
      animation:tutHintIn .18s ease-out;
      pointer-events:none !important;
    }
    #tutorial-hint-bar .tutorial-hint-mark {
      display:inline-flex !important;
      align-items:center !important;
      justify-content:center !important;
      width:1.15rem !important;
      height:1.15rem !important;
      border-radius:999px !important;
      background:rgba(236,205,105,.18) !important;
      border:1px solid rgba(236,205,105,.56) !important;
      color:#fff0a8 !important;
      font-family:'Cinzel',serif !important;
      font-size:.72rem !important;
      line-height:1 !important;
    }
    #tutorial-hint-bar span:last-child {
      min-width:0 !important;
    }
    @media(max-width:760px) {
      #tutorial-dialogue.tutorial-dialogue-card {
        width:calc(100vw - 1.5rem);
        max-height:70vh;
        padding:1rem 1rem .88rem;
      }
      #tutorial-dialogue .tutorial-dialogue-text {
        font-size:1rem;
        line-height:1.3;
      }
      #tutorial-hint-bar.tutorial-hint-bar {
        right:.75rem !important;
        bottom:4.8rem !important;
        width:min(310px, calc(100vw - 1.5rem)) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function showTutorialDialogue(key, onDismiss) {
  if(!_tutorialActive) return;
  const script = TUTORIAL_SCRIPT[key];
  if(!script) return;

  if(_tutorialTurnsSeen[key]) { if(onDismiss) onDismiss(); return; }
  _tutorialTurnsSeen[key] = true;

  const existing = document.getElementById('tutorial-dialogue');
  if(existing) existing.remove();

  if(script.highlight) tutorialHighlight(script.highlight);

  const el = document.createElement('div');
  el.id = 'tutorial-dialogue';
  el.className = 'tutorial-dialogue-card';

  const totalSteps = Object.keys(TUTORIAL_SCRIPT).length;
  const currentStep = Object.keys(_tutorialTurnsSeen).length;
  const progressPct = Math.round((currentStep / totalSteps) * 100);

  el.innerHTML = `
    <div class="tutorial-dialogue-head">
      <div class="tutorial-dialogue-title">${script.title}</div>
      <div class="tutorial-dialogue-count">${currentStep}/${totalSteps}</div>
    </div>
    <div class="tutorial-dialogue-progress">
      <div style="width:${progressPct}%;"></div>
    </div>
    <div class="tutorial-dialogue-text">${script.text}</div>
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
    toast('Tutorial skipped. You can replay it from the main menu anytime.');
  };
}

function tutorialEvent(event) {
  if(!_tutorialActive) return;

  _tutorialActionLog.push(event);

  if(event === 'placeSupporter') {
    removeTutorialHint();
    const supportersPlaced = _tutorialActionLog.filter(e => e === 'placeSupporter').length;
    if(supportersPlaced === 1) {
      showTutorialDialogue('firstSupporterPlaced', () => {
        showTutorialHint('Place one more Supporter this turn, ideally in the same zone or in the second zone you want to win.');
      });
    } else if(supportersPlaced === 2) {
      showTutorialDialogue('secondSupporterPlaced', () => {
        showTutorialHint('Click End Turn when you are ready.');
      });
    } else if(supportersPlaced === 4) {
      showTutorialDialogue('consolidationIntro', () => {
        showTutorialDialogue('consolidatePractice', () => {
          showTutorialHint('Try consolidating Johnathan Kirby: click him in hand, click Set, pick one Supporter, then click the highlighted cell.');
        });
      });
    } else if(supportersPlaced === 6) {
      showTutorialDialogue('duncanPlan', () => {
        showTutorialHint('Build three Supporters in one zone so Duncan can be consolidated there later.');
      });
    } else {
      showTutorialHint('Good. Keep building the two zones you plan to win.');
    }
  }
  else if(event === 'placeCharacter') {
    removeTutorialHint();
    const charactersPlaced = _tutorialActionLog.filter(e => e === 'placeCharacter').length;
    if(charactersPlaced === 1) {
      showTutorialDialogue('characterPlaced', () => {
        showTutorialDialogue('dylanPlan', () => {
          showTutorialHint('End your turn when ready. Keep looking for two zones you can win.');
        });
      });
    } else {
      showTutorialDialogue('zonePlan', () => {
        showTutorialHint('Nice. Count the zone scores before ending the turn.');
      });
    }
  }
  else if(event === 'endTurn') {
    removeTutorialHint();
    const playerTurnsEnded = _tutorialActionLog.filter(e => e === 'endTurn').length;
    if(playerTurnsEnded === 1) {
      showTutorialDialogue('opponentAnswer', () => {
        showTutorialHint('Your turn again. Place Supporters into your two best zones.');
      });
    } else if(playerTurnsEnded === 2) {
      showTutorialDialogue('consolidationIntro', () => {
        showTutorialHint('You are close to consolidating. Characters need Supporters on the board for Reinforcement.');
      });
    } else if(playerTurnsEnded === 4) {
      showTutorialDialogue('zonePlan', () => {
        showTutorialHint('Pick two zones and commit your best cards there.');
      });
    } else if(playerTurnsEnded >= 7) {
      showTutorialDialogue('finalTurns', () => {
        showTutorialHint('Final stretch: count the scores and spend cards only where they can win a zone.');
      });
    } else {
      showTutorialHint('New turn. Place Supporters first, then decide whether a Character is worth consolidating.');
    }
  }
  else if(event === 'gameEnd') {
    removeTutorialHint();
    clearTutorialHighlights();
    showTutorialDialogue('gameEnd');
    _tutorialActive = false;
    if(document.body) document.body.classList.remove('tutorial-active');
    USER_PROFILE._tutorialCompleted = true;
    if(typeof saveProfile === 'function') saveProfile();
  }
  else if(event === 'selectCard') {
    showTutorialHint('Card selected. If it is a Supporter, click an empty cell. If it is a Character, use Set/Consolidate when you have enough Reinforcement.');
  }
}

function dismissTutorial() {
  _tutorialActive = false;
  if(document.body) document.body.classList.remove('tutorial-active');
  removeTutorialHint();
  clearTutorialHighlights();
  const el = document.getElementById('tutorial-dialogue');
  if(el) el.remove();
}

window.startTutorial = startTutorial;
window.dismissTutorial = dismissTutorial;
