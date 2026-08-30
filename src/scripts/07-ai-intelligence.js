(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.FateAIIntelligence = api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  'use strict';

  const PERFECT_HAND_AI_NAMES = new Set([
    'mastermind duncan heyward',
    'field marshall achille laurent',
    'commander maja kaminska'
  ]);

  const MORALE_THRESHOLDS = Object.freeze([
    {percent:0.80, key:'consolidation', weight:7},
    {percent:0.60, key:'alternatingDraw', weight:18},
    {percent:0.40, key:'supporterExpiry', weight:25},
    {percent:0.20, key:'randomHandDiscard', weight:30},
    {percent:0, key:'defeat', weight:600}
  ]);

  function clamp(value, min, max){
    const n = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  }

  function normalizeName(value){
    return String(value || '')
      .replace(/^\d{4}-Q\d+:/i, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function hasPerfectHandKnowledge(ai){
    if(!ai) return false;
    const name = normalizeName(ai.name || ai.username);
    return ai.handKnowledge === 'perfect' && PERFECT_HAND_AI_NAMES.has(name);
  }

  function textIncludes(text, patterns){
    return patterns.some(pattern => text.includes(pattern));
  }

  function profileCard(card){
    const source = card || {};
    const text = String(source.effect || source.ability || '').toLowerCase();
    const fate = Math.max(0, Number(source.currentFate ?? source.fate) || 0);
    const cost = Math.max(0, Number(source.cost) || 0);
    const isSupporter = source.type === 'Supporter';
    const draw = textIncludes(text, ['draw ', 'add it to your hand', 'add up to', 'search the deck', 'search your deck']) ? 1 : 0;
    const disruption = textIncludes(text, [
      "opponent's", 'your opponent', 'discard it', 'loses ', 'lose ', 'cannot ', 'suppress', 'blocked', 'reveal', 'steal', 'move any'
    ]) ? 1 : 0;
    const scaling = textIncludes(text, ['all cards', 'all supporters', 'all coordinators', 'while this card', 'for each', 'permanently']) ? 1 : 0;
    const protection = textIncludes(text, ['immune', 'cannot be', 'protect', 'shield']) ? 1 : 0;
    const reaction = source.type === 'Improvisor' || textIncludes(text, ['whenever your opponent', 'at any time', 'would consolidate']) ? 1 : 0;
    const moraleHealMatch = text.match(/(?:recover|restore|heal|gain)\s+(\d+)\s+morale/i);
    const moraleDamageMatch = text.match(/(?:inflict|deal)\s+(\d+)\s+morale\s+damage/i);
    const moraleCostMatch = text.match(/(?:pay|lose)\s+(\d+)\s+morale/i);
    const moraleHeal = moraleHealMatch ? Math.max(0, Number(moraleHealMatch[1]) || 0) : Math.max(0, Number(source.moraleHeal) || 0);
    const moraleDamage = moraleDamageMatch ? Math.max(0, Number(moraleDamageMatch[1]) || 0) : Math.max(0, Number(source.moraleDamage) || 0);
    const moraleCost = moraleCostMatch ? Math.max(0, Number(moraleCostMatch[1]) || 0) : Math.max(0, Number(source.moraleCost) || 0);
    const moraleShield = textIncludes(text, ['take no morale damage', 'prevent the next morale damage']) || source.moraleShield ? 1 : 0;
    const moraleDouble = textIncludes(text, ['double the amount of morale damage', 'double your next morale damage']) || source.moraleDouble ? 1 : 0;
    const reinforcement = isSupporter ? Math.max(1, Number(source.reinforcement) || (source.id === '09' ? 2 : 1)) : 0;
    const responsePower = fate + draw * 2.2 + disruption * 3.4 + scaling * 2.4 + protection * 1.2 + reaction * 2.8 - cost * 0.45;
    return {
      id:String(source.id || ''),
      iid:source.iid || null,
      name:String(source.name || 'Unknown card'),
      type:String(source.type || ''),
      aff:String(source.aff || ''),
      fate,
      cost,
      reinforcement,
      draw,
      disruption,
      scaling,
      protection,
      reaction,
      moraleHeal,
      moraleDamage,
      moraleCost,
      moraleShield,
      moraleDouble,
      responsePower,
      source:source.source || 'known'
    };
  }

  function moraleStyleProfile(style){
    const key = String(style || '').trim().toLowerCase();
    const cautious = new Set(['cautious','defensive','turtle','hoarder','methodical','disciplined','calculating']);
    const aggressive = new Set(['reckless','relentless','overwhelming','aggro','blitz','bully','sacrificial']);
    const disruptive = new Set(['control','lockdown','disruptive','sniper','opportunist']);
    const chaotic = new Set(['gambler','chaotic','distracted']);
    if(cautious.has(key)) return {preservation:1.34, aggression:0.88, thresholdAwareness:1.22, supporterPatience:1.18};
    if(aggressive.has(key)) return {preservation:0.82, aggression:1.36, thresholdAwareness:0.94, supporterPatience:0.78};
    if(disruptive.has(key)) return {preservation:1.02, aggression:1.22, thresholdAwareness:1.15, supporterPatience:0.94};
    if(chaotic.has(key)) return {preservation:0.88, aggression:1.08, thresholdAwareness:0.78, supporterPatience:0.82};
    return {preservation:1, aggression:1, thresholdAwareness:1, supporterPatience:1};
  }

  function normalizeMoraleSystem(system){
    if(!system || !Array.isArray(system.morale)) return null;
    const maxMorale = Math.max(1, Number(system.maxMorale) || 200);
    return {
      maxMorale,
      morale:[0,1].map(player=>clamp(system.morale[player], 0, maxMorale)),
      shields:[0,1].map(player=>Math.max(0, Number(system.shields && system.shields[player]) || 0)),
      pressure:[0,1].map(player=>Math.max(0, Number(system.pressure && system.pressure[player]) || 0))
    };
  }

  function moraleCycleDamage(ownScores, enemyScores){
    const mine = (ownScores || [0,0,0]).slice(0,3);
    const theirs = (enemyScores || [0,0,0]).slice(0,3);
    let incoming = 0;
    let outgoing = 0;
    const zones = [];
    for(let z=0; z<3; z++){
      const own = Math.max(0, Number(mine[z]) || 0);
      const enemy = Math.max(0, Number(theirs[z]) || 0);
      const margin = own-enemy;
      if(margin < 0) incoming += Math.floor(Math.abs(margin)/2);
      else if(margin > 0) outgoing += Math.floor(margin/2);
      zones.push({zone:z, own, enemy, margin});
    }
    return {incoming, outgoing, zones};
  }

  function moraleThresholdBurden(morale, maxMorale){
    const value = Math.max(0, Number(morale) || 0);
    const max = Math.max(1, Number(maxMorale) || 200);
    let burden = 0;
    const active = [];
    for(const threshold of MORALE_THRESHOLDS){
      const reached = threshold.percent === 0 ? value <= 0 : value / max <= threshold.percent;
      if(reached){
        burden += threshold.weight;
        active.push(threshold.key);
      }
    }
    return {burden, active, percent:value/max};
  }

  function moraleCycleWeight(turn, landscapeId){
    if(String(landscapeId || '') === 'igb1') return 0;
    const currentTurn = Math.max(1, Number(turn) || 1);
    if(currentTurn < 6) return 0.34;
    return currentTurn % 2 === 0 ? 1.42 : 0.72;
  }

  // Scores the next morale calculation from one player's perspective. This is
  // deliberately nonlinear: avoiding a new penalty band or dealing lethal is
  // worth substantially more than padding a comfortable morale lead.
  function evaluateMoralePosition(options){
    const opts = options || {};
    const system = normalizeMoraleSystem(opts.system);
    if(!system) return {score:0, incoming:0, outgoing:0, ownAfter:null, opponentAfter:null, active:false};
    const player = Number(opts.playerIndex) === 1 ? 1 : 0;
    const opponent = 1-player;
    const style = moraleStyleProfile(opts.style);
    const cycle = moraleCycleDamage(opts.ownScores, opts.enemyScores);
    const cycleWeight = moraleCycleWeight(opts.turn, opts.landscapeId);
    const incoming = Math.max(0, cycle.incoming - system.shields[player]);
    const outgoing = Math.max(0, cycle.outgoing - system.shields[opponent]);
    const ownAfter = Math.max(0, system.morale[player] - incoming);
    const opponentAfter = Math.max(0, system.morale[opponent] - outgoing);
    const ownBurden = moraleThresholdBurden(ownAfter, system.maxMorale);
    const opponentBurden = moraleThresholdBurden(opponentAfter, system.maxMorale);
    const score = cycleWeight * (
      outgoing * 1.8 * style.aggression
      - incoming * 1.9 * style.preservation
      + (opponentBurden.burden * style.aggression - ownBurden.burden * style.preservation) * style.thresholdAwareness
    );
    return {
      active:true,
      score,
      incoming,
      outgoing,
      ownAfter,
      opponentAfter,
      ownBurden,
      opponentBurden,
      cycleWeight,
      zones:cycle.zones,
      style
    };
  }

  function scoreMoralePositionDelta(options){
    const opts = options || {};
    const before = evaluateMoralePosition(opts);
    if(!before.active) return 0;
    const after = evaluateMoralePosition({
      ...opts,
      ownScores:opts.afterOwnScores || opts.ownScores,
      enemyScores:opts.afterEnemyScores || opts.enemyScores
    });
    return after.score-before.score;
  }

  function scoreMoraleCard(card, options){
    const opts = options || {};
    const system = normalizeMoraleSystem(opts.system);
    if(!system || !card) return 0;
    const profile = profileCard(card);
    const player = Number(opts.playerIndex) === 1 ? 1 : 0;
    const opponent = 1-player;
    const style = moraleStyleProfile(opts.style);
    const missing = Math.max(0, system.maxMorale-system.morale[player]);
    const directHeal = Math.min(missing, profile.moraleHeal);
    const directDamage = Math.min(system.morale[opponent], profile.moraleDamage);
    const cycle = moraleCycleDamage(opts.ownScores, opts.enemyScores);
    const cycleWeight = moraleCycleWeight(opts.turn, opts.landscapeId);
    const ownBurdenBefore = moraleThresholdBurden(system.morale[player], system.maxMorale).burden;
    const ownBurdenAfterHeal = moraleThresholdBurden(system.morale[player]+directHeal, system.maxMorale).burden;
    const opponentBurdenBefore = moraleThresholdBurden(system.morale[opponent], system.maxMorale).burden;
    const opponentBurdenAfterDamage = moraleThresholdBurden(system.morale[opponent]-directDamage, system.maxMorale).burden;
    let value = directHeal * 1.45 * style.preservation + directDamage * 1.55 * style.aggression;
    value += Math.max(0, ownBurdenBefore-ownBurdenAfterHeal) * style.preservation * style.thresholdAwareness;
    value += Math.max(0, opponentBurdenAfterDamage-opponentBurdenBefore) * style.aggression * style.thresholdAwareness;
    if(profile.moraleShield) value += Math.min(system.morale[player], cycle.incoming) * 1.9 * style.preservation * Math.max(.5, cycleWeight);
    if(profile.moraleDouble) value += cycle.outgoing * 1.45 * style.aggression * Math.max(.5, cycleWeight);
    if(profile.moraleCost){
      value -= profile.moraleCost * 1.35 * style.preservation;
      if(system.morale[player] <= profile.moraleCost) value -= 700;
      else {
        const before = moraleThresholdBurden(system.morale[player], system.maxMorale).burden;
        const after = moraleThresholdBurden(system.morale[player]-profile.moraleCost, system.maxMorale).burden;
        value -= Math.max(0, after-before) * style.preservation * style.thresholdAwareness;
      }
    }
    return value;
  }

  function stableHash(value){
    let hash = 2166136261;
    const text = String(value || '');
    for(let i=0; i<text.length; i++){
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function observedAffinities(cards){
    const counts = Object.create(null);
    let total = 0;
    for(const card of cards || []){
      if(!card || !card.aff) continue;
      counts[card.aff] = (counts[card.aff] || 0) + 1;
      total++;
    }
    return {counts, total};
  }

  // Fair opponents never receive hiddenCards here. Their model is derived only
  // from hand size, the public card catalogue, and cards already shown in play.
  function buildHandModel(options){
    const opts = options || {};
    const perfect = !!opts.allowPerfect && hasPerfectHandKnowledge(opts.ai);
    const handSize = Math.max(0, Math.round(Number(opts.handSize) || 0));
    if(perfect){
      const cards = (opts.hiddenCards || []).map(profileCard);
      return summarizeHandModel('perfect', cards, handSize);
    }

    const publicCards = Array.isArray(opts.observedCards) ? opts.observedCards : [];
    const catalogue = Array.isArray(opts.catalogue) ? opts.catalogue : [];
    const affinities = observedAffinities(publicCards);
    const seed = stableHash((opts.seed || '') + ':' + handSize + ':' + publicCards.map(c=>c && c.id).join(','));
    const ranked = catalogue.map((card, index) => {
      const profile = profileCard(card);
      const affSeen = affinities.counts[profile.aff] || 0;
      const affWeight = affinities.total ? affSeen / affinities.total : 0.25;
      const supporterPrior = profile.type === 'Supporter' ? 1.25 : 0;
      const playablePrior = profile.cost <= 2 ? 0.8 : -0.35 * profile.cost;
      const jitter = (stableHash(seed + ':' + profile.id + ':' + index) % 1000) / 1000;
      return {profile, likelihood:affWeight * 5 + supporterPrior + playablePrior + profile.responsePower * 0.08 + jitter};
    }).sort((a,b)=>b.likelihood-a.likelihood);

    const desired = Math.min(12, handSize);
    const cards = [];
    if(ranked.length){
      const stride = Math.max(1, Math.floor(ranked.length / Math.max(1, desired)));
      const offset = seed % Math.min(stride, ranked.length);
      for(let i=0; cards.length<desired && i<ranked.length*2; i++){
        const entry = ranked[(offset + i * stride) % ranked.length];
        cards.push({...entry.profile, iid:null, source:'belief'});
      }
    }
    while(cards.length < desired){
      cards.push({id:'belief',iid:null,name:'Estimated card',type:'Supporter',aff:'',fate:2,cost:0,reinforcement:1,draw:0,disruption:0,scaling:0,protection:0,reaction:0,responsePower:2,source:'belief'});
    }
    return summarizeHandModel('belief', cards, handSize);
  }

  function summarizeHandModel(mode, cards, handSize){
    const list = Array.isArray(cards) ? cards : [];
    const divisor = Math.max(1, list.length);
    return {
      mode,
      handSize,
      cards:list,
      expectedFate:list.reduce((sum, card)=>sum + card.fate, 0) / divisor,
      expectedThreat:list.reduce((sum, card)=>sum + card.responsePower, 0) / divisor,
      disruptionChance:list.reduce((sum, card)=>sum + card.disruption, 0) / divisor
    };
  }

  function createOpponentMemory(){
    return {
      observations:0,
      contestedPreference:0.5,
      concentration:0.5,
      spendRate:0.5,
      aggression:0.5,
      hoarding:0.5,
      zonePreference:[1/3,1/3,1/3],
      lastSnapshot:null
    };
  }

  function smooth(previous, next, weight){
    return previous * (1-weight) + next * weight;
  }

  function updateOpponentMemory(memory, snapshot){
    const mem = memory || createOpponentMemory();
    const snap = snapshot || {};
    const counts = [0,1,2].map(z=>Math.max(0, Number(snap.zoneCounts && snap.zoneCounts[z]) || 0));
    const total = counts.reduce((sum, value)=>sum+value, 0);
    const concentration = total ? Math.max(...counts) / total : 0.5;
    const zoneShare = total ? counts.map(value=>value/total) : [1/3,1/3,1/3];
    const contested = total ? clamp((Number(snap.contestedCount) || 0) / total, 0, 1) : mem.contestedPreference;
    const last = mem.lastSnapshot;
    let spendRate = mem.spendRate;
    if(last){
      const priorHand = Math.max(0, Number(last.handSize) || 0);
      const currentHand = Math.max(0, Number(snap.handSize) || 0);
      spendRate = clamp(0.5 + (priorHand-currentHand) * 0.12, 0, 1);
    }
    mem.contestedPreference = smooth(mem.contestedPreference, contested, 0.32);
    mem.concentration = smooth(mem.concentration, concentration, 0.28);
    mem.spendRate = smooth(mem.spendRate, spendRate, 0.25);
    mem.hoarding = smooth(mem.hoarding, clamp((Number(snap.handSize) || 0) / 9, 0, 1), 0.22);
    mem.aggression = smooth(mem.aggression, clamp(contested * 0.65 + concentration * 0.35, 0, 1), 0.3);
    mem.zonePreference = mem.zonePreference.map((value,z)=>smooth(value, zoneShare[z], 0.3));
    mem.observations++;
    mem.lastSnapshot = {
      turn:Number(snap.turn) || 0,
      handSize:Number(snap.handSize) || 0,
      zoneCounts:counts,
      contestedCount:Number(snap.contestedCount) || 0,
      discardCount:Number(snap.discardCount) || 0
    };
    return mem;
  }

  function chooseProjectedAction(options){
    const opts = options || {};
    const cards = Array.isArray(opts.cards) && opts.cards.length ? opts.cards : [profileCard({fate:2,type:'Supporter'})];
    const ownScores = (opts.ownScores || [0,0,0]).slice(0,3);
    const enemyScores = (opts.enemyScores || [0,0,0]).slice(0,3);
    const memory = opts.memory || createOpponentMemory();
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const actions = [];
    cards.forEach((card, cardIndex)=>{
      for(let z=0; z<3; z++){
        const diff = ownScores[z] - enemyScores[z];
        const flip = diff <= 0 && diff + Math.max(1, card.fate) > 0 ? 9 : 0;
        const contest = Math.max(0, 6-Math.abs(diff));
        const preferred = (memory.zonePreference && memory.zonePreference[z] || 1/3) * 4;
        const disruptValue = card.disruption * Math.min(5, Math.max(1, enemyScores[z] * 0.2));
        const scalingValue = card.scaling * (1 + ownScores[z] * 0.08);
        const playability = card.type === 'Supporter' ? 2 : Math.max(-3, 2-card.cost*0.75);
        actions.push({card,cardIndex,zone:z,score:card.responsePower+flip+contest+preferred+disruptValue+scalingValue+playability});
      }
    });
    actions.sort((a,b)=>b.score-a.score);
    const poolSize = opts.mode === 'perfect' ? Math.min(1, actions.length) : Math.min(5, actions.length);
    const pick = actions[Math.floor(rng() * Math.max(1,poolSize))] || actions[0];
    const reduceEnemy = pick.card.disruption ? Math.min(5, Math.max(1, pick.card.responsePower * 0.3)) : 0;
    const addFate = Math.max(1, pick.card.fate) + pick.card.draw * 0.7 + pick.card.scaling * 0.8;
    return {...pick, addFate, reduceEnemy};
  }

  function makeTurnPlan(options){
    const opts = options || {};
    const mine = (opts.myScores || [0,0,0]).slice(0,3);
    const theirs = (opts.oppScores || [0,0,0]).slice(0,3);
    const memory = opts.memory || createOpponentMemory();
    const style = String(opts.style || '');
    const moraleBaseline = evaluateMoralePosition({
      system:opts.moraleSystem,
      playerIndex:opts.playerIndex,
      ownScores:mine,
      enemyScores:theirs,
      turn:opts.turn,
      landscapeId:opts.landscapeId,
      style
    });
    const ranked = [0,1,2].map(z=>{
      const diff = mine[z]-theirs[z];
      let priority = diff <= 0 ? 13-Math.min(9,Math.abs(diff)) : Math.max(1,8-diff);
      priority += (memory.zonePreference && memory.zonePreference[z] || 1/3) * 4;
      if(style === 'relentless' || style === 'overwhelming') priority += mine[z] > 0 ? 1.5 : 0;
      if(style === 'cautious' || style === 'defensive') priority += Math.abs(diff) <= 3 ? 2 : 0;
      if(moraleBaseline.active){
        const afterMine = mine.slice();
        afterMine[z] += 1;
        priority += clamp(scoreMoralePositionDelta({
          system:opts.moraleSystem,
          playerIndex:opts.playerIndex,
          ownScores:mine,
          enemyScores:theirs,
          afterOwnScores:afterMine,
          afterEnemyScores:theirs,
          turn:opts.turn,
          landscapeId:opts.landscapeId,
          style
        }), -8, 12);
      }
      return {z,priority,diff};
    }).sort((a,b)=>b.priority-a.priority);
    return {
      focusZones:ranked.slice(0,2).map(entry=>entry.z),
      abandonZone:ranked[2].z,
      priorities:ranked.reduce((all,entry)=>(all[entry.z]=entry.priority,all),[0,0,0]),
      createdTurn:Number(opts.turn) || 0,
      handModelMode:opts.handModelMode || 'belief',
      moraleAware:moraleBaseline.active,
      projectedMorale:moraleBaseline.active ? {
        ownAfter:moraleBaseline.ownAfter,
        opponentAfter:moraleBaseline.opponentAfter,
        incoming:moraleBaseline.incoming,
        outgoing:moraleBaseline.outgoing
      } : null
    };
  }

  function scoreMoveForPlan(plan, move, myScores, oppScores){
    if(!plan || !move || typeof move.z !== 'number') return 0;
    const z = move.z;
    const mine = Number(myScores && myScores[z]) || 0;
    const theirs = Number(oppScores && oppScores[z]) || 0;
    let bonus = plan.focusZones && plan.focusZones[0] === z ? 5.5 : (plan.focusZones && plan.focusZones[1] === z ? 2.5 : -3.5);
    if(mine <= theirs && mine + Math.max(1, Number(move.projectedFate) || 1) > theirs) bonus += 5;
    if(z === plan.abandonZone && mine-theirs >= 6) bonus -= 4;
    return bonus;
  }

  function selectCandidate(candidates, options){
    const list = (candidates || []).filter(item=>item && Number.isFinite(Number(item.finalScore))).sort((a,b)=>b.finalScore-a.finalScore);
    if(!list.length) return null;
    const opts = options || {};
    if(opts.perfect || (Number(opts.mistakeChance) || 0) <= 0) return list[0];
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const mistakeChance = clamp(opts.mistakeChance, 0, 0.5);
    const viable = list.filter(item=>item.finalScore >= list[0].finalScore-(5+mistakeChance*22)).slice(0,5);
    if(viable.length === 1 || rng() > mistakeChance * 1.35) return viable[0];
    const temperature = 1.5 + mistakeChance * 18;
    const weights = viable.map(item=>Math.exp((item.finalScore-viable[0].finalScore)/temperature));
    let roll = rng() * weights.reduce((sum,value)=>sum+value,0);
    for(let i=0;i<viable.length;i++){
      roll -= weights[i];
      if(roll <= 0) return viable[i];
    }
    return viable[viable.length-1];
  }

  return {
    PERFECT_HAND_AI_NAMES,
    normalizeName,
    hasPerfectHandKnowledge,
    profileCard,
    buildHandModel,
    createOpponentMemory,
    updateOpponentMemory,
    MORALE_THRESHOLDS,
    moraleStyleProfile,
    moraleCycleDamage,
    moraleThresholdBurden,
    evaluateMoralePosition,
    scoreMoralePositionDelta,
    scoreMoraleCard,
    chooseProjectedAction,
    makeTurnPlan,
    scoreMoveForPlan,
    selectCandidate
  };
});
