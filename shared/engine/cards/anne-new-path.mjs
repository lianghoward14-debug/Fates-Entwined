import {boardEntries, controllerOf, findCard} from '../selectors.mjs';
import {isEffectSourceSuppressed, runtimeRuleId} from '../modifiers.mjs';

// Declarations are independent: spending both uses on the same action arms
// two +8 rewards. Consume matches before emitting Fate events to avoid loops.
export function collectAnneNewPath(state, event){
  const operations=[];
  const sourceIid=event.effectSourceIid || event.sourceIid || event.status?.sourceIid;
  const sourceCard=sourceIid ? findCard(state,sourceIid)?.card : null;
  const sourcePlayer = event.sourceController ?? event.status?.sourceController ?? event.sourcePlayerIndex
    ?? (sourceCard ? controllerOf(sourceCard) : undefined);
  const candidate = sourcePlayer ?? event.playerIndex;
  const actor = Number.isInteger(candidate) && [0,1].includes(candidate) ? candidate : state.activePlayer;
  const categories=new Set();
  const fromEffect=!!(event.sourceIid || event.effectSourceIid || event.semanticSourceCardId || event.status?.sourceIid
    || event.sourceController != null || event.effectCaused === true || event.moraleDamageSources?.length);
  const opponentEffect=fromEffect && Number(actor) === state.activePlayer;
  if(event.type === 'DRAW_EFFECT_ACTIVATED' && Number(actor) === state.activePlayer) categories.add('DRAW');
  if(event.type === 'DECK_SEARCHED' && opponentEffect) categories.add('SEARCH');
  if(event.type === 'CARD_MOVED' && opponentEffect) categories.add('MOVEMENT');
  if(event.type === 'STATUS_CREATED' && event.status?.type !== 'RULE_USE_COUNTER' && opponentEffect) categories.add('STATUS');
  if(['FATE_CHANGED','ANNE_FATE_EFFECT'].includes(event.type) && event.reason !== 'ANNE_NEW_PATH' && opponentEffect) categories.add('FATE');
  if(['MORALE_HEALED','MORALE_DAMAGED'].includes(event.type) && opponentEffect) categories.add('MORALE');
  for(const entry of boardEntries(state)){
    if(runtimeRuleId(entry.card) !== '107' || !entry.card.counters?.anneDeclarations?.length) continue;
    const declarations=entry.card.counters.anneDeclarations;
    entry.card.counters.anneDeclarations=declarations.filter(item=>Number(item.turn) >= state.turn);
    if(isEffectSourceSuppressed(state,entry)) continue;
    const matched=entry.card.counters.anneDeclarations.filter(item=>Number(item.turn) === state.turn
      && Number(item.opponent) === state.activePlayer && controllerOf(entry.card) !== state.activePlayer
      && categories.has(item.action));
    if(!matched.length) continue;
    entry.card.counters.anneDeclarations=entry.card.counters.anneDeclarations.filter(item=>!matched.includes(item));
    for(let index=0;index<matched.length;index++) operations.push({type:'MODIFY_FATE',targetIid:entry.card.iid,
      amount:8,sourceIid:entry.card.iid,sourceController:controllerOf(entry.card),
      semanticSourceCardId:'107',reason:'ANNE_NEW_PATH',bypassReaction:true});
  }
  return operations;
}
