import {boardEntries,controllerOf,rowOwner} from '../engine/selectors.mjs';
import {canUseAsConsolidationTribute,isEffectSourceSuppressed} from '../engine/modifiers.mjs';
import {zoneScore} from '../engine/scoring.mjs';
import {activeHandLimit} from '../engine/hand-limits.mjs';
import {cardRule} from '../engine/cards/registry.mjs';
import {comboPlan} from './combo-plan.mjs';

export function recruitmentContext(state,player,style='balanced',report=null){
  const entries=boardEntries(state),own=entries.filter(e=>controllerOf(e.card)===player);
  const enemy=entries.filter(e=>controllerOf(e.card)!==player && !e.card.faceDown);
  const owner=state.players[player];
  const margins=report?.margins || [0,1,2].map(z=>zoneScore(state,z,player)-zoneScore(state,z,1-player));
  const reinforcement=report?.resources?.[player]?.reinforcement ?? own.reduce((n,e)=>{
    const t=canUseAsConsolidationTribute(state,e,player);return n+(t.ok?t.reinforcement:0);
  },0);
  const placements=Math.max(0,Math.min(5-Number(state.supportersSetForCapThisTurn?.[player] || 0),
    Number(state.baseSupportersPerTurn ?? 2)+Number(state.extraSupportersThisTurn?.[player] || 0)-Number(state.supportersSetThisTurn?.[player] || 0)));
  let open=0;
  state.board.forEach((zone,z)=>zone.forEach((row,r)=>{if(rowOwner(state,z,r)!==1-player)open+=row.filter(c=>!c).length;}));
  const drawAvailable=own.some(e=>{
    if(e.card.faceDown || isEffectSourceSuppressed(state,e))return false;
    const rule=cardRule(e.card.id,state);
    return rule?.timings?.includes('ACTIVATE') && rule.operations?.some(op=>['DRAW_CARD','DRAW_CARDS','TRANSFER_CARDS'].includes(op))
      && (!rule.maxUses || Number(e.card.counters?.effectUses || 0)<rule.maxUses)
      && !(rule.oncePerTurn && Number(e.card.counters?.lastEffectTurn)===state.turn);
  }) && (owner.deck || []).length>0;
  const enabled=state.gameSettings?.healthPressureSeals===true;
  const morale=enabled?Number(state.moralePressure?.morale?.[player] ?? 200):200;
  // Without a rules forecast this is only a pressure estimate, never lethal proof.
  const incoming=enabled?(report?.calculation?Math.max(0,morale-report.calculation.after[player]):margins.reduce((n,m)=>n+Math.max(0,-m),0)):0;
  return {...owner,ownBoard:own.map(e=>e.card),enemyBoard:enemy.map(e=>e.card),margins,reinforcement,
    placements,open,drawAvailable,handLimit:activeHandLimit(state,player),morale,incoming,
    maxMorale:Number(state.moralePressure?.maxMorale || 200),turn:state.turn,maxTurns:state.maxTurns,style,
    missingComboIds:comboPlan(state,player)?.missing || []};
}
