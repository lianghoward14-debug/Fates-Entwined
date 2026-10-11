import {stableStringify} from '../engine/index.mjs';
import {cardRule} from '../engine/cards/registry.mjs';
import {runtimeRuleId} from '../engine/modifiers.mjs';

export function isOktaiConcealed(state, player){
  return (state?.statuses || []).some(status => status.type === 'TIMED_PLAYER_STATUS'
    && status.statusType === 'BH21_FATE_MORALE_CONCEALMENT'
    && Number(status.playerIndex) === Number(player)
    && Number(status.activeFromTurn) <= Number(state.turn)
    && Number(status.remainingTargetTurns) > 0);
}

// Legal commands remain the engine's responsibility. While blinded, select
// development by visible card identity, not live Fate/Morale, status banners,
// enemy hand size, turn count or simulations of concealed outcomes.
export function planConcealedDecision(commands, state, player){
  const ownCards = [...(state.players?.[player]?.hand || []),
    ...(state.board || []).flat(3).filter(c => c && Number(c.controller ?? c.owner) === player)];
  const hash = text => {
    let value = 2166136261;
    for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return (value >>> 0) / 4294967296;
  };
  const priority = command => {
    const card = ownCards.find(c => c.iid === (command.payload?.cardIid || command.payload?.sourceIid));
    const automatic = command.type === 'ACTIVATE_EFFECT' && command.manualOnly !== true && card && !card.faceDown
      && cardRule(runtimeRuleId(card),state)?.manualOnly !== true;
    const base = automatic ? 100 : ({ANSWER_PROMPT:90, DISCARD_TO_HAND_LIMIT:90,
      SET_CARD:60, SET_CARD_FROM_DECK:60, SET_ADAPTIVE_TOKEN:55,
      FLIP_CARD:50, CONSOLIDATE_CARD:45, ACTIVATE_EFFECT:40, END_TURN:10})[command.type] ?? 0;
    // Spread placements without inspecting hidden zone totals. No live RNG
    // is consumed, and identical observable choices always give the same result.
    return base + hash(stableStringify(command));
  };
  const candidates = commands.filter(c => c.type !== 'CONCEDE');
  const command = candidates.slice().sort((a,b) => priority(b)-priority(a)
    || stableStringify(a).localeCompare(stableStringify(b)))[0];
  if (!command) return null;
  return {command, sequence:[command], score:0, principalVariation:[{player,command}],
    actions:command.type === 'END_TURN' ? 0 : 1, depth:0, replySimulations:0,
    trace:{policy:'oktai-concealed', simulations:0, concealed:true}};
}
