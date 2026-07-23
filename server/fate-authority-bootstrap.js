'use strict';

const {canonicalStateHash} = require('./fate-authority-reducer');

function hashSeed(str){
  let h = 2166136261;
  const s = String(str || 'fates');
  for(let i = 0; i < s.length; i += 1){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeSeededRng(seed){
  let a = hashSeed(seed) || 0x9e3779b9;
  return function seededRng(){
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rng){
  for(let i = arr.length - 1; i > 0; i -= 1){
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createEmptyBoard(){
  return Array.from({length:3}, ()=>Array.from({length:3}, ()=>Array.from({length:3}, ()=>null)));
}

function createEmptyExtraCells(){
  return Array.from({length:3}, ()=>[[], []]);
}

function compactStateCard(meta, owner, iid){
  const card = {};
  Object.keys(meta || {}).forEach(key=>{
    if(key === 'effect' || key === 'flavor') return;
    const value = meta[key];
    if(value === undefined || typeof value === 'function') return;
    if(value && typeof value === 'object') return;
    card[key] = value;
  });
  card.iid = iid;
  card.owner = owner;
  if(card.currentFate === undefined) card.currentFate = card.fate;
  if(card.bonusFate === undefined) card.bonusFate = 0;
  if(card.usesLeft === undefined){
    card.usesLeft = card.id === '40' ? 2 : (card.id === '67' ? 1 : null);
  }
  if(card.immuneFlag === undefined) card.immuneFlag = false;
  if(card.cantBeReduced === undefined) card.cantBeReduced = false;
  if(card.cantBeMoved === undefined) card.cantBeMoved = false;
  if(card.faceDown === undefined) card.faceDown = false;
  if(String(card.id || '') === 'bh01'){
    card.immuneFlag = true;
    card.cantBeReduced = true;
  }
  return card;
}

function normalizeBootstrapMode(mode){
  const raw = String(mode || '').trim().toLowerCase();
  return raw === 'freeplay' || raw === 'free' || raw === 'casual' ? 'freeplay' : 'ranked';
}

function validateDeckIds(deckIds, catalog, label, options = {}){
  if(!Array.isArray(deckIds) || deckIds.length !== 40) return `${label} must contain exactly 40 cards`;
  const byId = catalog && catalog.byId;
  if(!byId || typeof byId.get !== 'function') return 'card catalog is unavailable';
  const enforceCopyLimits = options.enforceCopyLimits !== false;
  const counts = new Map();
  for(let i = 0; i < deckIds.length; i += 1){
    const id = String(deckIds[i] || '');
    const meta = byId.get(id);
    if(!id || !meta) return `${label} contains unknown card ${id || '(empty)'}`;
    if(meta.retired || meta.temporarilyDisabled) return `${label} contains unavailable card ${id}`;
    if(!enforceCopyLimits) continue;
    const nextCount = (counts.get(id) || 0) + 1;
    counts.set(id, nextCount);
    const rarity = String(meta.rarity || '').toLowerCase();
    const maxCopies = rarity === 'star' ? 1 : 3;
    if(nextCount > maxCopies) return `${label} contains too many copies of ${id}`;
  }
  return '';
}

function makePlayerState(deckIds, playerIndex, catalog, rng, instanceCounter){
  const deck = deckIds.map(id=>{
    instanceCounter.value += 1;
    return compactStateCard(catalog.byId.get(String(id)), playerIndex, instanceCounter.value);
  });
  shuffleInPlace(deck, rng);
  const avalancheEscapeCards = [];
  for(let i = deck.length - 1; i >= 0; i -= 1){
    if(deck[i] && String(deck[i].id) === '98') avalancheEscapeCards.unshift(deck.splice(i, 1)[0]);
  }
  const hand = deck.splice(0, 6);
  hand.push(...avalancheEscapeCards);
  return {
    player:{
      name:playerIndex === 0 ? 'Player 1' : 'Player 2',
      color:playerIndex === 0 ? 'var(--p1)' : 'var(--p2)',
      deck,
      hand,
      discard:[]
    },
    instanceCounter
  };
}

function transferOpeningHandAliCards(players){
  if(!Array.isArray(players) || players.length !== 2) return;
  const transfers = [[], []];
  players.forEach((player, sourcePlayer)=>{
    if(!player || !Array.isArray(player.hand)) return;
    player.hand = player.hand.filter(card=>{
      if(!card || String(card.id || '') !== 'bh03') return true;
      const recipient = 1 - sourcePlayer;
      card.owner = recipient;
      card._bh03OpponentHand = true;
      card._bh03TransferredFrom = sourcePlayer;
      card.immuneFlag = true;
      card.cantBeReduced = true;
      transfers[recipient].push(card);
      return false;
    });
  });
  transfers.forEach((cards, recipient)=>players[recipient].hand.push(...cards));
}

function queueOpeningHandSelvaBoosts(state){
  if(!state || !Array.isArray(state.players)) return;
  if(!Array.isArray(state._pendingSelvaSupportBoost)) state._pendingSelvaSupportBoost = [0, 0];
  state.players.forEach((player, playerIndex)=>{
    if(!player || !Array.isArray(player.hand)) return;
    player.hand.forEach(card=>{
      if(!card || String(card.id || '') !== '74') return;
      if(card._selvaOpeningQueued) return;
      card._selvaOpeningQueued = true;
      state._pendingSelvaSupportBoost[playerIndex] = (Number(state._pendingSelvaSupportBoost[playerIndex] || 0) || 0) + 1;
    });
  });
}

function landscapeBgNumFromSong(song){
  const match = String(song || 'board1').match(/board\s*(\d+)/i);
  const n = match ? Number(match[1]) : 1;
  return Math.max(1, Math.min(20, Number.isInteger(n) ? n : 1));
}

function makeInitialLandscapeState(id, rng){
  const needsTargetZone = id === 'igb3' || id === 'igb8';
  return {
    id,
    targetZone:needsTargetZone ? Math.floor(rng() * 3) : null,
    consolidations:[0, 0],
    zoneFateBonuses:[[0, 0, 0], [0, 0, 0]],
    resolvedTurns:{},
    eventideMovedIids:{},
    drawPhaseCounts:[0, 0],
    supporterEffectsThisTurn:[0, 0],
    handTurnCounts:[0, 0],
    handLastResolvedGameTurns:[null, null],
    rotationStartedAt:id === 'igb17' ? Date.now() : null,
    igb20FateThresholdClaims:{},
    igb20PendingFateThreshold:null,
    igb20Winner:null,
    igb20ChoiceResolved:false,
    igb20Declined:false,
    igb20DiscardedIid:null
  };
}

function buildInitialAuthorityState(input){
  const catalog = input && input.catalog;
  const decks = input && input.decks || {};
  const seed = String(input && input.seed || 'fates');
  const mode = normalizeBootstrapMode(input && input.mode);
  const enforceCopyLimits = mode !== 'freeplay';
  const hostDeck = Array.isArray(decks[0]) ? decks[0] : decks['0'];
  const guestDeck = Array.isArray(decks[1]) ? decks[1] : decks['1'];
  const hostErr = validateDeckIds(hostDeck, catalog, 'host deck', {enforceCopyLimits});
  if(hostErr) throw new Error(hostErr);
  const guestErr = validateDeckIds(guestDeck, catalog, 'guest deck', {enforceCopyLimits});
  if(guestErr) throw new Error(guestErr);
  const rng = makeSeededRng(seed);
  const landscapeBgNum = landscapeBgNumFromSong(input && input.song);
  const landscapeId = 'igb' + landscapeBgNum;
  const configuredTurnTimerSeconds = Math.max(60, Math.min(600, Math.round(Number(input && input.turnTimerSeconds) || 180)));
  const counter = {value:0};
  const p0 = makePlayerState(hostDeck.map(String), 0, catalog, rng, counter).player;
  const p1 = makePlayerState(guestDeck.map(String), 1, catalog, rng, counter).player;
  transferOpeningHandAliCards([p0, p1]);
  if(landscapeId === 'igb19'){
    [p0, p1].forEach((player, playerIndex)=>{
      player.hand.forEach(card=>{
        const type = String(card && card.type || '');
        if(!card || card.immuneFlag === true || !type || type === 'Supporter' || type === 'Counter' || String(card.id || '') === 'token1') return;
        card._igb19HandTurnsRemaining = 3;
        card._igb19HandOwner = playerIndex;
        card._igb19LastCountedHandTurn = 0;
      });
    });
  }
  const currentPlayer = Number(input && input.currentPlayer);
  const firstPlayer = Number.isInteger(currentPlayer) && currentPlayer >= 0 && currentPlayer <= 1 ? currentPlayer : 0;
  const state = {
    v:2,
    players:[p0, p1],
    board:createEmptyBoard(),
    extraCells:createEmptyExtraCells(),
    extraRows:[0, 0, 0],
    extraRowFullOwners:[null, null, null],
    extraRowOwners:[[], [], []],
    markSafeSquares:[],
    blockedCells:[],
    immuneCards:[],
    shieldWallZones:[],
    fateModifiers:{},
    landscapeId,
    landscapeBgNum,
    _turnTimerSeconds:configuredTurnTimerSeconds,
    _freePlayGameSettings:input && input.gameSettings && typeof input.gameSettings === 'object' ? Object.assign({}, input.gameSettings) : null,
    _landscapeState:makeInitialLandscapeState(landscapeId, rng),
    _landscapeDrawQueue:[],
    currentPlayer:firstPlayer,
    turn:1,
    turnNumber:1,
    maxTurns:20,
    phase:'draw',
    selectedHandCard:null,
    selectedBoardCard:null,
    placing:false,
    blockingCell:false,
    supportsPlacedThisTurn:0,
    maxSupportsPerTurn:2,
    extraSupportsThisTurn:0,
    _pendingSelvaSupportBoost:[0, 0],
    _selvaSupportBoosts:[null, null],
    pendingEffect:null,
    instanceCounter:counter.value,
    damageDoneP:[0, 0],
    supportersSetP:[0, 0],
    supporterReinforcementSetP:[0, 0],
    _supporterEffectsActivatedP:[0, 0],
    _snowyVillageUses:[0, 0],
    _landscapeChangeLocks:[0, 0],
    _balladEffects:[[], []],
    _mailDeliveries:[],
    _blameGameEffects:[null, null],
    _administrativeBloatEffects:[],
    _wojciechTurnPlacementCounts:[0, 0],
    _wojciechLastTurnPlacementCounts:[0, 0],
    _whisperLandscapeUses:[0, 0],
    _serverRngCounter:0,
    usMarinesUses:[0, 0],
    polishArmyUses:[0, 0],
    oppSuppressedNextTurn:false,
    suppressTarget:null,
    erbsActive:[false, false],
    p1Deck:hostDeck.map(String),
    p2Deck:guestDeck.map(String),
    majaEffectThisTurn:false,
    _artilleryLockedZone:null,
    _artilleryLockOwner:null,
    _artilleryLockTurnsLeft:0,
    _artilleryEffectBlockLifted:false,
    _cardFateMap:{},
    _continuousDamageSources:[],
    _fortCalvinActive:[],
    _linaFreeIids:null,
    _serverFreePlacement:null,
    _polishUsedThisTurn:false,
    _revealedCards:{},
    _riveraBuffs:[],
    _riveraActiveEffects:{},
    _skipImprovisorCheck:false,
    _skipReactions:false,
    _westCaribNext:false,
    _zimbabweUsedThisTurn:false,
    _consolidating:null,
    _wolfCreekMoving:null,
    _expMoving:null,
    _berkeleyMoving:null,
    _bh01Moving:null,
    _landscapeMoving:null,
    _busserMoving:null,
    _busserMovingCard:null,
    _markSelecting:null,
    _havanoDeploying:null,
    _boardTargeting:null
  };
  queueOpeningHandSelvaBoosts(state);
  return {state, stateHash:canonicalStateHash(state)};
}

module.exports = {
  buildInitialAuthorityState,
  makeSeededRng,
  validateDeckIds
};
