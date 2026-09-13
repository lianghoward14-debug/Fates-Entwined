import {boardEntries, controllerOf} from '../engine/selectors.mjs';
import {zoneScore} from '../engine/scoring.mjs';
import {canUseAsConsolidationTribute,runtimeRuleId,isEffectSourceSuppressed} from '../engine/modifiers.mjs';
import {resolveMoralePressureCycle} from '../engine/morale-pressure.mjs';
import {personalityFor} from './personality.mjs';
import {cardRule} from '../engine/cards/registry.mjs';
import {resourcePotential} from './resources.mjs';
import {majaResponsePotential} from './maja-heuristics.mjs';
import {contestedSpaceValue} from './contested-space.mjs';

// This forecasts a calculation on the current board, not the opponent's next
// turn. Callers must not interpret it as forced lethal. Uses the real rules,
// including changed Duelist, prevention and recovery implementations.
export function forecastCalculation(state) {
  if(state.gameSettings?.healthPressureSeals !== true || !state.moralePressure?.morale)return null;
  const copy = structuredClone(state);
  const before = copy.moralePressure?.morale?.slice() || null;
  if (!before || copy.gameSettings?.healthPressureSeals !== true) return null;
  const events = [];
  resolveMoralePressureCycle({state:copy, events, ruleEvents:[]});
  return {due:Number(state.turn) >= 4 && Number(state.turn)%2 === 0,
    before, after:copy.moralePressure.morale.slice(), events};
}

export function inspectPosition(state, player) {
  if (![0,1].includes(player)) throw new RangeError('Invalid player');
  const opponent = 1-player;
  const scores = [0,1].map(p=>[0,1,2].map(z=>zoneScore(state,z,p)));
  const resources = [0,1].map(p=>{
    const tributes = boardEntries(state).filter(e=>controllerOf(e.card) === p)
      .map(e=>({entry:e, eligibility:canUseAsConsolidationTribute(state,e,p)}))
      .filter(x=>x.eligibility.ok);
    const used = Number(state.supportersSetThisTurn?.[p] || 0);
    return {reinforcement:tributes.reduce((sum,x)=>sum+x.eligibility.reinforcement,0),
      tributeIids:tributes.map(x=>x.entry.card.iid),
      ordinaryPlacements:Math.max(0,Math.min(5,Number(state.baseSupportersPerTurn || 2)+Number(state.extraSupportersThisTurn?.[p] || 0))-used),
      globalPlacements:Math.max(0,5-Number(state.supportersSetForCapThisTurn?.[p] || 0))};
  });
  const margins = scores[player].map((v,z)=>v-scores[opponent][z]);
  return {player, scores, margins, resources, calculation:forecastCalculation(state),
    turnsRemaining:Math.max(0,state.maxTurns-state.turn), outcome:state.outcome || null};
}

// A static removal sensitivity measure, not a claim that removal is legal.
// Includes lost aura contributions and reductions on surviving cards.
export function boardDependencyImpact(state, iid) {
  const copy = structuredClone(state);
  const entry = boardEntries(copy).find(e=>e.card.iid === iid);
  if (!entry) return null;
  const before = [0,1].map(p=>[0,1,2].map(z=>zoneScore(copy,z,p)));
  copy.board[entry.z][entry.r][entry.c] = null;
  return {iid, scoreLoss:before.map((zones,p)=>zones.map((v,z)=>v-zoneScore(copy,z,p)))};
}

export function evaluatePosition(state, player, preferences=personalityFor()) {
  if (state.outcome) return state.outcome.winner == null ? 0 : state.outcome.winner === player ? 1e6 : -1e6;
  const report = inspectPosition(state,player), opponent = 1-player;
  const late = report.turnsRemaining <= 2;
  // Excess Fate has diminishing territorial value. Actual Morale damage is
  // evaluated separately below, so a large lead still matters when damaging.
  let score = territorialValue(report.margins,late);
  score += contestedSpaceValue(state,player)*preferences.zones;
  const wins = report.margins.filter(v=>v>0).length;
  const losses = report.margins.filter(v=>v<0).length;
  score += (wins-losses)*(late ? 80 : 8)*preferences.zones;
  if (late) score += wins>=2 ? 250 : losses>=2 ? -250 : 0;
  const morale = report.calculation?.after || state.moralePressure?.morale;
  if (morale && state.gameSettings?.healthPressureSeals === true) {
    const burden = value=>(value<=160?12:0)+(value<=120?18:0)+(value<=80?25:0)+(value<=40?35:0);
    score += ((morale[player]-200)*preferences.preservation-(morale[opponent]-200)*preferences.pressure)*1.5
      +burden(morale[opponent])-burden(morale[player]);
    // Forecasts influence ranking but never masquerade as terminal outcomes.
    if (morale[player]<=0) score-=2000;
    if (morale[opponent]<=0) score+=2000;
  }
  score += (report.resources[player].reinforcement-report.resources[opponent].reinforcement)*2*preferences.resources;
  score += ((state.players[player].hand?.length || 0)-(state.players[opponent].hand?.length || 0))*2*preferences.resources;
  const ownAccess=resourcePotential(state,player),enemyAccess=resourcePotential(state,opponent);
  score+=(ownAccess.access-enemyAccess.access)*preferences.development;
  score-=(ownAccess.stranded-enemyAccess.stranded)*preferences.resources;
  score+=(ownAccess.interaction-enemyAccess.interaction)*preferences.disruption;
  score+=(ownAccess.readiness-enemyAccess.readiness)*preferences.development;
  score-=(ownAccess.congestion-enemyAccess.congestion)*preferences.resources;
  const entries=boardEntries(state);
  score+=(majaResponsePotential(state,player,entries)-majaResponsePotential(state,opponent,entries))*preferences.disruption;
  for(const entry of entries){
    const {card}=entry;
    const sign=controllerOf(card)===player?1:-1;
    if(card.faceDown || isEffectSourceSuppressed(state,entry))continue;
    const rule=cardRule(runtimeRuleId(card),state);
    const available=(!rule?.maxUses || Number(card.counters?.effectUses || 0)<rule.maxUses)
      && !(rule?.oncePerTurn && Number(card.counters?.lastEffectTurn)===state.turn)
      && !(rule?.blockedWhileStatus && card.statuses?.includes(rule.blockedWhileStatus));
    if(rule?.timings?.includes('ACTIVATE') && available)score+=sign*preferences.development;
    // Public, reusable interaction is a resource even before it fires.
  }
  return score;
}

export function territorialValue(margins,late=false){
  const utility=v=>Math.sign(v)*(Math.min(Math.abs(v),12)+Math.max(0,Math.abs(v)-12)*(late?.08:.25));
  const sorted=[...margins].sort((a,b)=>b-a);
  // The second-best front determines a two-zone victory; develop it well
  // before the final turn rather than only rewarding majority control late.
  return margins.reduce((n,v)=>n+utility(v),0)+utility(sorted[1] || 0)*(late?2:1.2);
}
