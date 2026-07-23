'use strict';

const Learning = require('../src/scripts/07-ai-learning.js');
const Intelligence = require('../src/scripts/07-ai-intelligence.js');
const {getCardCatalog} = require('./fate-card-catalog');
const {getDeckCatalog} = require('./fate-deck-catalog');

const LANDSCAPE_IDS = Object.freeze(Array.from({length:16}, (_,i)=>`igb${i+1}`));
const NUMBER_WORDS = Object.freeze({one:1,two:2,three:3,four:4,five:5});

function clamp(value, min, max){
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function shuffle(list, rng){
  for(let i=list.length-1; i>0; i--){
    const j = Math.floor(rng() * (i+1));
    [list[i],list[j]] = [list[j],list[i]];
  }
  return list;
}

function parseCount(text, fallback=1){
  const match = String(text || '').toLowerCase().match(/(?:draw|add|search(?: the deck)? for)(?: up to)?\s+(\d+|one|two|three|four|five)/);
  if(!match) return fallback;
  return Math.max(1, Number(match[1]) || NUMBER_WORDS[match[1]] || fallback);
}

function cardValue(card){
  if(!card) return 0;
  const profile = Intelligence.profileCard(card);
  return (Number(card.currentFate ?? card.fate) || 0) + profile.responsePower * 0.35;
}

function instantiateCard(state, card, owner){
  return Object.assign({}, card, {
    iid:`fg-${state.nextIid++}`,
    owner,
    currentFate:Math.max(0, Number(card.fate) || 0),
    immune:/immune to (?:all|your opponent)/i.test(String(card.effect || '')),
    suppressed:false,
    row:'safe'
  });
}

function playerCards(state, player, type){
  const cards = [];
  state.zones.forEach((zone,z)=>zone.cards.forEach(card=>{
    if(card.owner === player && (!type || card.type === type)) cards.push({card,z});
  }));
  return cards;
}

function zoneCards(state, z, player){
  const cards = state.zones[z].cards;
  return player === undefined ? cards : cards.filter(card=>card.owner === player);
}

function effectiveCardFate(state, card, z){
  let fate = Math.max(0, Number(card.currentFate ?? card.fate) || 0);
  const allies = zoneCards(state,z,card.owner);
  const coordinators = allies.filter(item=>item.type === 'Coordinator').length;
  const jeremiah = allies.some(item=>item.id === '57' && !item.suppressed) ? 1 : 0;
  allies.forEach(aura=>{
    if(aura.suppressed || aura.iid === card.iid) return;
    if(aura.id === '01') fate += 1.5 + jeremiah * 0.5;
    if(aura.id === '11' && card.type === 'Supporter') fate += 3 + jeremiah;
    if(aura.id === '19' && card.type === 'Coordinator') fate += 3 + jeremiah;
    if(aura.id === '23' && card.type !== 'Supporter') fate += 2 + jeremiah;
    if(aura.id === '59' && card.type === 'Supporter') fate += 1;
    if(aura.id === '63' && card.type === 'Supporter') fate += 0.5;
  });
  return Math.max(0, fate);
}

function zoneScore(state, z, player){
  return zoneCards(state,z,player).reduce((sum,card)=>sum+effectiveCardFate(state,card,z),0);
}

function totalScore(state, player){
  return [0,1,2].reduce((sum,z)=>sum+zoneScore(state,z,player),0);
}

function drawOne(state, player, outsideDrawPhase=false){
  const p = state.players[player];
  if(!p.deck.length && p.discard.length){
    p.deck = shuffle(p.discard.splice(0), state.rng);
  }
  const card = p.deck.shift();
  if(!card) return null;
  p.hand.push(card);
  if(outsideDrawPhase && state.landscape === 'igb9'){
    const targets = playerCards(state,player).sort((a,b)=>effectiveCardFate(state,b.card,b.z)-effectiveCardFate(state,a.card,a.z));
    if(targets[0]) targets[0].card.currentFate += 3;
  }
  return card;
}

function drawCards(state, player, count, outsideDrawPhase=false){
  let drawn = 0;
  for(let i=0;i<count;i++) if(drawOne(state,player,outsideDrawPhase)) drawn++;
  return drawn;
}

function takeBestFromDeck(state, player, predicate){
  const deck = state.players[player].deck;
  let bestIndex = -1;
  let bestValue = -Infinity;
  deck.forEach((card,index)=>{
    if(predicate && !predicate(card)) return;
    const value = cardValue(card);
    if(value > bestValue){ bestValue=value; bestIndex=index; }
  });
  if(bestIndex < 0) return null;
  const [card] = deck.splice(bestIndex,1);
  state.players[player].hand.push(card);
  return card;
}

function discardBoardCard(state, target){
  if(!target || target.immune) return false;
  for(const zone of state.zones){
    const index = zone.cards.indexOf(target);
    if(index < 0) continue;
    zone.cards.splice(index,1);
    state.players[target.owner].discard.push(target);
    return true;
  }
  return false;
}

function bestTarget(state, z, player, predicate){
  return zoneCards(state,z,player).filter(card=>!card.immune && (!predicate || predicate(card)))
    .sort((a,b)=>cardValue(b)-cardValue(a))[0] || null;
}

function applyPlacementLandscape(state, card, z){
  if(state.landscape === 'igb6' && card.aff === 'reality') card.currentFate += 3;
  if(state.landscape === 'igb11' && card.type === 'Initiator') card.currentFate += 3;
  if(state.landscape === 'igb5'){
    const mine = totalScore(state,card.owner);
    const theirs = totalScore(state,1-card.owner);
    if(mine > theirs) card.currentFate += 2;
  }
  if(state.landscape === 'igb3' && z === state.landscapeTargetZone && state.turn < 10 && card.type !== 'Supporter') card.currentFate += 4;
}

function applyDrawOrSearch(state, player, card, text){
  if(!/(draw|search|add .*hand)/i.test(text)) return 0;
  const count = Math.min(3,parseCount(text,1));
  let added = 0;
  const wantsSupporter = /supporter/i.test(text);
  const wantsAff = /reality/i.test(text) ? 'reality' : '';
  if(/search|add .*hand/i.test(text)){
    for(let i=0;i<count;i++){
      const found = takeBestFromDeck(state,player,candidate=>(!wantsSupporter || candidate.type === 'Supporter') && (!wantsAff || candidate.aff === wantsAff));
      if(!found) break;
      added++;
      if(state.landscape === 'igb9'){
        const targets = playerCards(state,player).sort((a,b)=>cardValue(b.card)-cardValue(a.card));
        if(targets[0]) targets[0].card.currentFate += 3;
      }
    }
  }else added = drawCards(state,player,count,true);
  return added;
}

function applyCardEffect(state, player, card, z, options={}){
  if(!card || card.suppressed) return;
  const opponent = 1-player;
  const text = String(card.effect || '');
  const lower = text.toLowerCase();
  const isSupporter = card.type === 'Supporter';
  if(isSupporter){
    if(state.supporterSuppressedThrough[player] >= state.turn) return;
    if(state.landscape === 'igb15' && state.supporterEffectsThisTurn[player] >= 1) return;
    state.supporterEffectsThisTurn[player]++;
  }

  if(card.id === '76'){
    card.currentFate = Math.max(card.currentFate,5);
    card.immune = true;
    return;
  }
  if(card.id === '58'){
    if(state.landscape !== 'igb4'){
      const discard = state.players[player].discard;
      const optionsInDiscard = discard.filter(item=>item.type === 'Supporter').sort((a,b)=>cardValue(b)-cardValue(a));
      if(optionsInDiscard[0]){
        discard.splice(discard.indexOf(optionsInDiscard[0]),1);
        state.players[player].hand.push(optionsInDiscard[0]);
      }
    }
    return;
  }
  if(card.id === '60'){
    takeBestFromDeck(state,player,candidate=>candidate.type === 'Supporter');
    return;
  }
  if(card.id === '16'){
    discardBoardCard(state,bestTarget(state,z,opponent,candidate=>candidate.type === 'Supporter'));
    return;
  }
  if(card.id === '18'){
    state.supporterSuppressedThrough[opponent] = Math.max(state.supporterSuppressedThrough[opponent], state.turn + 2);
    return;
  }
  if(card.id === '05'){
    const target = zoneCards(state,z,player).sort((a,b)=>cardValue(b)-cardValue(a))[0];
    if(target) target.currentFate += 3;
    return;
  }
  if(card.id === '03' && options.activation){
    const target = zoneCards(state,z,player).sort((a,b)=>effectiveCardFate(state,b,z)-effectiveCardFate(state,a,z))[0];
    if(target) target.currentFate = target.currentFate * 2 + 5;
    return;
  }
  if(card.id === '25' && !state.copySetUsedThisTurn[player]){
    const copyIndex = state.players[player].deck.findIndex(item=>item.id === '25');
    const safeCount = zoneCards(state,z,player).filter(item=>item.row === 'safe').length;
    if(copyIndex >= 0 && safeCount < state.safeCaps[player][z]){
      const [copy] = state.players[player].deck.splice(copyIndex,1);
      copy.row = 'safe';
      applyPlacementLandscape(state,copy,z);
      state.zones[z].cards.push(copy);
      state.copySetUsedThisTurn[player] = true;
    }
  }

  applyDrawOrSearch(state,player,card,text);

  const loseMatch = lower.match(/los(?:e|es)\s+(\d+)\s+fate/);
  if(loseMatch){
    const target = bestTarget(state,z,opponent);
    if(target) target.currentFate = Math.max(0,target.currentFate-Number(loseMatch[1]));
  }
  if(/discard an opponent|discard one of your opponent/i.test(text)){
    discardBoardCard(state,bestTarget(state,z,opponent));
  }
  const gainMatch = lower.match(/gain(?:s)?\s+(\d+)\s+fate/);
  if(gainMatch && !/opponent.*gain/i.test(lower)){
    const amount = Number(gainMatch[1]);
    if(/all (?:cards|supporters|coordinators)/i.test(text)){
      zoneCards(state,z,player).forEach(target=>{ target.currentFate += amount; });
    }else{
      const target = zoneCards(state,z,player).sort((a,b)=>cardValue(b)-cardValue(a))[0];
      if(target) target.currentFate += amount;
    }
  }
  if(/suppress/i.test(text)){
    const target = bestTarget(state,z,opponent,candidate=>candidate.type !== 'Supporter');
    if(target) target.suppressed = true;
  }
}

function supporterReinforcement(state, entry){
  const card = entry.card;
  let value = card.id === '09' ? 2 : 1;
  if(state.landscape === 'igb10' && card.aff === 'third_great_war') value++;
  if(zoneCards(state,entry.z,card.owner).some(item=>item.id === '24' && !item.suppressed)) value++;
  return value;
}

function selectTributes(state, player, anchor, cost){
  const candidates = playerCards(state,player,'Supporter');
  const anchorEntry = candidates.find(entry=>entry.card.iid === anchor.card.iid);
  if(!anchorEntry) return null;
  const rest = candidates.filter(entry=>entry.card.iid !== anchor.card.iid).sort((a,b)=>{
    const ar = supporterReinforcement(state,a), br = supporterReinforcement(state,b);
    const av = effectiveCardFate(state,a.card,a.z), bv = effectiveCardFate(state,b.card,b.z);
    return (bv/br)-(av/ar);
  });
  const chosen = [anchorEntry];
  let reinforcement = supporterReinforcement(state,anchorEntry);
  for(const entry of rest){
    if(reinforcement >= cost) break;
    chosen.push(entry);
    reinforcement += supporterReinforcement(state,entry);
  }
  return reinforcement >= cost ? chosen : null;
}

function featureForCandidate(state, player, candidate){
  const z = candidate.z;
  const ownCount = zoneCards(state,z,player).length;
  const profile = Intelligence.profileCard(candidate.card);
  return {
    type:candidate.kind === 'consolidate' ? 'consolidate' : 'place',
    contested:candidate.row === 'contested',
    tempo:clamp(1-state.turn/20,0,1),
    disruption:!!profile.disruption,
    scaling:!!profile.scaling,
    margin:zoneScore(state,z,player)-zoneScore(state,z,1-player),
    ownCount,
    fate:Number(candidate.card.currentFate ?? candidate.card.fate) || 0,
    tributeCount:Array.isArray(candidate.tributes) ? candidate.tributes.length : 0
  };
}

function generateCandidates(state, player){
  const p = state.players[player];
  const candidates = [];
  if(state.supportersPlacedThisTurn[player] < 2){
    p.hand.forEach((card,handIndex)=>{
      if(card.type !== 'Supporter') return;
      for(let z=0;z<3;z++){
        const ownSafe = zoneCards(state,z,player).filter(item=>item.row === 'safe').length;
        const contested = zoneCards(state,z).filter(item=>item.row === 'contested').length;
        if(ownSafe < state.safeCaps[player][z]) candidates.push({kind:'place',card,handIndex,z,row:'safe'});
        if(contested < state.contestedCaps[z]) candidates.push({kind:'place',card,handIndex,z,row:'contested'});
      }
    });
  }
  p.hand.forEach((card,handIndex)=>{
    if(card.type === 'Supporter') return;
    const cost = Math.max(1,Number(card.cost) || 1);
    playerCards(state,player,'Supporter').forEach(anchor=>{
      const tributes = selectTributes(state,player,anchor,cost);
      if(!tributes) return;
      candidates.push({kind:'consolidate',card,handIndex,z:anchor.z,row:anchor.card.row,tributes});
    });
  });
  return candidates;
}

function heuristicScore(state, player, candidate, policyName, policy){
  const z = candidate.z;
  const mine = zoneScore(state,z,player);
  const theirs = zoneScore(state,z,1-player);
  const projected = Number(candidate.card.currentFate ?? candidate.card.fate) || 0;
  const profile = Intelligence.profileCard(candidate.card);
  let score = projected + profile.responsePower * 0.42;
  if(mine <= theirs) score += 4.5;
  if(mine <= theirs && mine + projected > theirs) score += 6;
  if(candidate.row === 'contested') score += 3.5;
  if(mine-theirs >= 8) score -= 6;
  if(candidate.kind === 'consolidate'){
    const tributeFate = candidate.tributes.reduce((sum,entry)=>sum+effectiveCardFate(state,entry.card,entry.z),0);
    score += projected * 0.55 - tributeFate * 0.38 + 3;
  }
  const features = featureForCandidate(state,player,candidate);
  score += Learning.scoreMove(policy,features);
  const perfectKnowledge = Learning.SPECIALIST_POLICY_NAMES.includes(policyName) || state.landscape === 'igb12';
  if(perfectKnowledge){
    const opponentThreat = state.players[1-player].hand.reduce((sum,card)=>sum+Intelligence.profileCard(card).responsePower,0) / Math.max(1,state.players[1-player].hand.length);
    if(profile.disruption) score += opponentThreat * 0.12;
  }
  return {score,features};
}

function chooseCandidate(state, player, policySet, policyName, exploration){
  const policy = Learning.policyForAI(policySet,policyName);
  const ranked = generateCandidates(state,player).map(candidate=>{
    const evaluated = heuristicScore(state,player,candidate,policyName,policy);
    return Object.assign(candidate,evaluated);
  }).sort((a,b)=>b.score-a.score);
  if(!ranked.length || ranked[0].score < -4) return null;
  if(ranked.length > 1 && state.rng() < exploration){
    return ranked[Math.min(ranked.length-1,1+Math.floor(state.rng()*Math.min(3,ranked.length-1)))];
  }
  return ranked[0];
}

function removeTributes(state, tributes){
  tributes.forEach(entry=>{
    const zone = state.zones[entry.z];
    const index = zone.cards.findIndex(card=>card.iid === entry.card.iid);
    if(index >= 0){
      const [removed] = zone.cards.splice(index,1);
      state.players[removed.owner].discard.push(removed);
    }
  });
}

function executeCandidate(state, player, candidate){
  const p = state.players[player];
  const index = p.hand.findIndex(card=>card.iid === candidate.card.iid);
  if(index < 0) return false;
  const [card] = p.hand.splice(index,1);
  if(candidate.kind === 'consolidate'){
    const greatOakCount = candidate.tributes.filter(entry=>entry.card.id === '47').length;
    removeTributes(state,candidate.tributes);
    card.currentFate += greatOakCount * 3;
    state.consolidations[player]++;
  }else state.supportersPlacedThisTurn[player]++;
  card.row = candidate.row;
  applyPlacementLandscape(state,card,candidate.z);
  state.zones[candidate.z].cards.push(card);
  applyCardEffect(state,player,card,candidate.z,{activation:false});
  return true;
}

function activateCharacterEffects(state,player){
  playerCards(state,player).forEach(entry=>{
    const card = entry.card;
    if(card.type === 'Supporter' || card.suppressed) return;
    const profile = Intelligence.profileCard(card);
    const text = String(card.effect || '').toLowerCase();
    if(profile.draw || profile.disruption || /select|draw|search|discard|loses? \d+ fate/.test(text)){
      applyCardEffect(state,player,card,entry.z,{activation:true});
    }
  });
}

function resolveLandscapeMilestone(state){
  if(state.turn === 10 && state.landscape === 'igb8'){
    const z = state.landscapeTargetZone;
    const a = zoneScore(state,z,0), b = zoneScore(state,z,1);
    if(a !== b) state.safeCaps[a>b?0:1][z]++;
  }
  if(state.turn === 14 && state.landscape === 'igb2'){
    const [a,b] = state.consolidations;
    if(a !== b){
      const player = a>b?0:1;
      const target = playerCards(state,player).sort((x,y)=>cardValue(y.card)-cardValue(x.card))[0];
      if(target) target.card.currentFate += 12;
    }
  }
}

function finishTurn(state,player){
  if(state.landscape === 'igb16' && state.players[player].hand.length > 7){
    state.players[player].hand.sort((a,b)=>cardValue(a)-cardValue(b));
    const [discarded] = state.players[player].hand.splice(0,1);
    state.players[player].discard.push(discarded);
    const target = playerCards(state,player).sort((a,b)=>cardValue(b.card)-cardValue(a.card))[0];
    if(target) target.card.currentFate += 3;
  }
  while(state.players[player].hand.length > 12){
    state.players[player].hand.sort((a,b)=>cardValue(a)-cardValue(b));
    state.players[player].discard.push(state.players[player].hand.shift());
  }
}

function createMatch(options={}){
  const rng = Learning.seededRng(options.seed || 'full-game-self-play');
  const cardsById = getCardCatalog().byId;
  const decks = getDeckCatalog().decks;
  if(decks.length < 2) throw new Error('full-game self-play requires at least two valid 40-card decks');
  const selectedDecks = [0,1].map(player=>{
    const explicit = options.decks && options.decks[player];
    return explicit || decks[Math.floor(rng()*decks.length)];
  });
  const state = {
    rng,
    seed:String(options.seed || ''),
    turn:1,
    maxTurns:20,
    nextIid:1,
    landscape:options.landscape || LANDSCAPE_IDS[Math.floor(rng()*LANDSCAPE_IDS.length)],
    landscapeTargetZone:Math.floor(rng()*3),
    zones:[0,1,2].map(()=>({cards:[]})),
    safeCaps:[[3,3,3],[3,3,3]],
    contestedCaps:[3,3,3],
    consolidations:[0,0],
    supportersPlacedThisTurn:[0,0],
    supporterEffectsThisTurn:[0,0],
    supporterSuppressedThrough:[0,0],
    copySetUsedThisTurn:[false,false],
    traces:[[],[]],
    players:[0,1].map(player=>({
      deck:[],hand:[],discard:[],deckId:selectedDecks[player].id
    }))
  };
  [0,1].forEach(player=>{
    state.players[player].deck = shuffle(selectedDecks[player].ids.map(id=>instantiateCard(state,cardsById.get(id),player)),rng);
    drawCards(state,player,5,false);
  });
  return state;
}

function matchResult(state){
  const zoneWinners = [0,1,2].map(z=>{
    const a=zoneScore(state,z,0), b=zoneScore(state,z,1);
    return a===b?-1:(a>b?0:1);
  });
  const zonesWon = [zoneWinners.filter(v=>v===0).length,zoneWinners.filter(v=>v===1).length];
  const totals = [totalScore(state,0),totalScore(state,1)];
  let winner = zonesWon[0]===zonesWon[1] ? (totals[0]===totals[1]?-1:(totals[0]>totals[1]?0:1)) : (zonesWon[0]>zonesWon[1]?0:1);
  return {winner,zoneWinners,zonesWon,totals};
}

function playFullGame(options={}){
  const state = createMatch(options);
  const policyNames = options.policyNames || [Learning.GLOBAL_POLICY_NAME,Learning.SPECIALIST_POLICY_NAMES[0]];
  const policySets = options.policySets || [options.policies || Learning.createBasePolicies(),options.policies || Learning.createBasePolicies()];
  const exploration = clamp(options.exploration ?? 0.08,0,0.35);
  for(state.turn=1;state.turn<=state.maxTurns;state.turn++){
    const player = (state.turn-1)%2;
    state.supportersPlacedThisTurn[player]=0;
    state.supporterEffectsThisTurn[player]=0;
    state.copySetUsedThisTurn[player]=false;
    const skipDraw = state.landscape === 'igb13' && Math.floor((state.turn-1)/2)%2 === 1;
    if(!skipDraw) drawCards(state,player,1,false);
    activateCharacterEffects(state,player);
    for(let action=0;action<6;action++){
      const candidate = chooseCandidate(state,player,policySets[player],policyNames[player],exploration);
      if(!candidate) break;
      if(!executeCandidate(state,player,candidate)) break;
      state.traces[player].push({features:candidate.features,cardId:candidate.card.id,kind:candidate.kind,z:candidate.z,row:candidate.row});
    }
    finishTurn(state,player);
    resolveLandscapeMilestone(state);
  }
  state.turn=state.maxTurns;
  return {state,result:matchResult(state),policyNames};
}

function trainFullGamePolicies(policiesValue, options={}){
  const base = Learning.sanitizePolicySet(policiesValue);
  const policies = Learning.sanitizePolicySet(base);
  const games = Math.max(1,Math.min(100000,Math.round(Number(options.games)||1000)));
  const learningRate = clamp(options.learningRate ?? 0.04,0.001,0.12);
  const names = Learning.POLICY_NAMES.slice();
  const totals = Object.fromEntries(names.map(name=>[name,Object.fromEntries(Learning.FEATURE_KEYS.map(key=>[key,0]))]));
  const counts = Object.fromEntries(names.map(name=>[name,0]));
  const appearances = Object.fromEntries(names.map(name=>[name,0]));
  const outcomes = {wins:[0,0],draws:0};
  const started = Date.now();
  for(let game=0;game<games;game++){
    const aName = names[game%names.length];
    let bName = names[(game*3+1)%names.length];
    if(bName===aName) bName=names[(names.indexOf(aName)+1)%names.length];
    const match = playFullGame({
      seed:`${options.seed||'full-train'}:${game}`,
      policies,
      policyNames:[aName,bName],
      exploration:options.exploration ?? 0.1
    });
    const winner = match.result.winner;
    if(winner < 0) outcomes.draws++; else outcomes.wins[winner]++;
    [aName,bName].forEach((name,player)=>{
      appearances[name]++;
      const reward = winner<0?0.05:(winner===player?1:-0.72);
      match.state.traces[player].forEach(trace=>{
        const features = Learning.moveFeatures(trace.features);
        Learning.FEATURE_KEYS.forEach(key=>{ totals[name][key] += reward*(Number(features[key])||0); });
        counts[name]++;
      });
    });
  }
  names.forEach(name=>{
    if(counts[name]) Learning.FEATURE_KEYS.forEach(key=>{
      const adjustment = clamp(totals[name][key]/counts[name]*learningRate,-0.035,0.035);
      policies[name].weights[key]=clamp(policies[name].weights[key]+adjustment,-1.5,1.5);
    });
    policies[name].fullGameEpisodes=(Number(policies[name].fullGameEpisodes)||0)+appearances[name];
    policies[name].updatedAt=Number(options.updatedAt)||Date.now();
  });
  return {policies,games,elapsedMs:Date.now()-started,outcomes,appearances};
}

function validateFullGamePolicies(baseValue, candidateValue, options={}){
  const base = Learning.sanitizePolicySet(baseValue);
  const candidate = Learning.sanitizePolicySet(candidateValue);
  const games = Math.max(4,Math.min(20000,Math.round(Number(options.games)||400)));
  const names = Learning.POLICY_NAMES.slice();
  let candidateWins=0,baselineWins=0,draws=0;
  for(let game=0;game<games;game++){
    const name=names[game%names.length];
    const candidateSeat=game%2;
    const policySets=candidateSeat===0?[candidate,base]:[base,candidate];
    const match=playFullGame({
      seed:`${options.seed||'full-validation'}:${Math.floor(game/2)}`,
      policySets,
      policyNames:[name,name],
      exploration:0
    });
    if(match.result.winner<0) draws++;
    else if(match.result.winner===candidateSeat) candidateWins++;
    else baselineWins++;
  }
  const score=(candidateWins+draws*0.5)/games;
  return {games,candidateWins,baselineWins,draws,score,promoted:score>=clamp(options.minimumScore??0.505,0.5,0.65)};
}

function trainAndValidateFullGamePolicies(policiesValue, options={}){
  const base=Learning.sanitizePolicySet(policiesValue);
  const training=trainFullGamePolicies(base,options);
  const validation=validateFullGamePolicies(base,training.policies,{
    games:options.validationGames,
    seed:`${options.seed||'full-train'}:validation`,
    minimumScore:options.minimumScore
  });
  return {policies:validation.promoted?training.policies:base,training,validation};
}

module.exports={
  LANDSCAPE_IDS,
  createMatch,
  zoneScore,
  totalScore,
  generateCandidates,
  playFullGame,
  trainFullGamePolicies,
  validateFullGamePolicies,
  trainAndValidateFullGamePolicies
};
