import {boardEntries, controllerOf} from './selectors.mjs';
import {effectiveFate} from './modifiers.mjs';

export function moraleZoneFatePenalty(state, playerIndex){
  // Compatibility shape retained for UI callers. The former 20% zone-Fate
  // reduction was replaced by an end-of-turn random hand discard.
  void state;
  void playerIndex;
  return {percent:0, multiplier:1, reason:null, flat:0, card:0};
}

export function zoneScoreBreakdown(state, zone, playerIndex){
  const z = Number(zone);
  const player = Number(playerIndex);
  const cardFate = boardEntries(state)
    .filter(entry=>entry.z === z && controllerOf(entry.card) === player)
    .reduce((total, entry)=>total + effectiveFate(state, entry), 0);
  const modifiers = [];
  for(const status of state?.statuses || []){
    if(status?.type !== 'ZONE_FATE_MODIFIER') continue;
    if(Number(status.zone) !== z || Number(status.playerIndex) !== player) continue;
    const value = Number(status.value || 0) || 0;
    modifiers.push({
      value,
      reason:String(status.reason || 'ZONE_FATE_MODIFIER'),
      sourceIid:status.sourceIid == null ? null : String(status.sourceIid)
    });
  }
  const modifierTotal = modifiers.reduce((total, item)=>total + item.value, 0);
  const moralePenalty = moraleZoneFatePenalty(state, player);
  const subtotal = Math.max(0, cardFate + modifierTotal - Number(moralePenalty.flat || 0));
  const penaltyAmount = moralePenalty.percent > 0
    ? Math.ceil(subtotal * moralePenalty.percent / 100)
    : 0;
  return {
    zone:z,
    playerIndex:player,
    cardFate,
    modifiers,
    modifierTotal,
    subtotal,
    moralePenalty:{...moralePenalty, amount:penaltyAmount + Number(moralePenalty.flat || 0)},
    score:Math.max(0, subtotal - penaltyAmount)
  };
}

export function zoneScore(state, zone, playerIndex){
  return zoneScoreBreakdown(state, zone, playerIndex).score;
}

export function calculateOutcome(state){
  const zoneResults = [0, 1, 2].map(zone=>{
    const scores = [zoneScore(state, zone, 0), zoneScore(state, zone, 1)];
    return {
      zone,
      scores,
      controller:scores[0] > scores[1] ? 0 : (scores[1] > scores[0] ? 1 : null)
    };
  });
  const zoneWins = [0, 1].map(player=>
    zoneResults.filter(result=>result.controller === player).length
  );
  const totalFate = [0, 1].map(player=>
    zoneResults.reduce((total, result)=>total + result.scores[player], 0)
  );
  let winner = zoneWins[0] >= 2 ? 0 : (zoneWins[1] >= 2 ? 1 : null);
  let reason = 'ZONES';
  if(winner === null){
    if(totalFate[0] > totalFate[1]) winner = 0;
    else if(totalFate[1] > totalFate[0]) winner = 1;
    reason = winner === null ? 'EXACT_TIE' : 'TOTAL_FATE';
  }
  return {
    type:winner === null ? 'DRAW' : 'VICTORY',
    winner,
    reason,
    turn:state.turn,
    zoneWins,
    totalFate,
    zoneResults
  };
}
