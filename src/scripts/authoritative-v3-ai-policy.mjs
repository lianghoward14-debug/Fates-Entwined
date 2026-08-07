import {stableStringify} from '../../shared/engine/index.mjs';

function controllerOf(card){
  return Number.isInteger(Number(card?.controller)) ? Number(card.controller) : Number(card?.owner);
}

function visibleCards(projection){
  return [
    ...(projection?.board || []).flat(3).filter(Boolean),
    ...(projection?.players || []).flatMap(player=>[
      ...(player.hand || []),
      ...(player.discard || [])
    ])
  ];
}

function cardByIid(projection, iid){
  const wanted = String(iid || '');
  return visibleCards(projection).find(card=>String(card?.iid || '') === wanted) || null;
}

function cardFate(card){
  return Number(card?.currentFate ?? card?.fate ?? 0);
}

function selectedCards(command, projection){
  const payload = command?.payload || {};
  const iids = [
    payload.cardIid,
    payload.sourceIid,
    payload.targetIid,
    payload.reactionIid,
    payload.selectedIid,
    ...(payload.selectedIids || []),
    ...(payload.tributeIids || []),
    ...(payload.discardIids || []),
    ...(payload.discardedIids || [])
  ].filter(Boolean);
  return iids.map(iid=>cardByIid(projection, iid)).filter(Boolean);
}

function zoneBalance(projection, zone, playerIndex){
  const player = Number(playerIndex);
  const opponent = player === 0 ? 1 : 0;
  let own = 0;
  let rival = 0;
  for(const card of projection?.board?.[Number(zone)]?.flat(2).filter(Boolean) || []){
    if(card.faceDown === true) continue;
    if(controllerOf(card) === player) own += cardFate(card);
    if(controllerOf(card) === opponent) rival += cardFate(card);
  }
  return {own, rival, margin:own - rival};
}

function destinationScore(command, projection, playerIndex){
  const destination = command?.payload?.destination;
  if(!destination) return 0;
  const balance = zoneBalance(projection, destination.z, playerIndex);
  const row = Number(destination.r);
  const rowOwner = projection?.geometry?.rowOwners?.[Number(destination.z)]?.[row]
    ?? (row === 0 ? 1 : (row === 1 ? -1 : (row === 2 ? 0 : null)));
  const rowValue = Number(rowOwner) === -1
    ? 18
    : (Number(rowOwner) === Number(playerIndex) ? 10 : -18);
  // Prefer contestable zones that are close enough to swing. Stable command
  // ordering resolves exact ties, so this never introduces nondeterminism.
  const swingValue = 30 - Math.min(30, Math.abs(balance.margin) * 3);
  const behindBonus = balance.margin < 0 ? Math.min(24, Math.abs(balance.margin) * 4) : 0;
  return swingValue + behindBonus + rowValue
    - Number(destination.r || 0) * 0.01
    - Number(destination.c || 0) * 0.001;
}

function declarationScore(payload){
  const rarity = {circle:1, triangle:2, square:3, star:4}[String(payload?.declaredRarity || '')] || 0;
  const type = {
    Supporter:1,
    Initiator:3,
    Improvisor:4,
    Coordinator:5,
    Dauntless:6
  }[String(payload?.declaredType || '')] || 0;
  return rarity + type + (payload?.placementType === 'CONSOLIDATED' ? 2 : 0);
}

function supporterDevelopmentScore(projection, playerIndex){
  const player = Number(playerIndex);
  const capacity = Number(projection?.baseSupportersPerTurn || 0)
    + Number(projection?.extraSupportersThisTurn?.[player] || 0);
  const used = Number(projection?.supportersSetThisTurn?.[player] || 0);
  return Math.max(0, capacity - used) * 50;
}

export function scoreStrategicV3AiCommand(command, projection, context = {}){
  const payload = command?.payload || {};
  const playerIndex = Number(context.playerIndex ?? projection?.activePlayer ?? 0);
  const cards = selectedCards(command, projection);
  const totalFate = cards.reduce((total, card)=>total + cardFate(card), 0);
  const destination = destinationScore(command, projection, playerIndex);
  if(command?.type === 'CONCEDE') return Number.NEGATIVE_INFINITY;
  if(command?.type === 'ANSWER_PROMPT'){
    if(payload.cancel) return 850;
    if(payload.choice === 'DECLINE') return 900;
    return 1000 + totalFate * 0.01;
  }
  if(command?.type === 'DISCARD_TO_HAND_LIMIT') return 980 - totalFate * 10;
  if(command?.type === 'ACTIVATE_EFFECT') return 820 + totalFate;
  if(command?.type === 'ACTIVATE_LANDSCAPE') return 780 - Number(payload.discardIids?.length || 0) * 8 + totalFate * 0.1;
  if(command?.type === 'FLIP_CARD') return 740 + totalFate;
  if(command?.type === 'CONSOLIDATE_CARD'){
    const played = cardByIid(projection, payload.cardIid);
    const tributeFate = (payload.tributeIids || [])
      .map(iid=>cardByIid(projection, iid))
      .reduce((total, card)=>total + cardFate(card), 0);
    return 700 + cardFate(played) * 8 - tributeFate * 2 + destination + (payload.faceDown ? -5 : 0);
  }
  if(command?.type === 'SET_ADAPTIVE_TOKEN'){
    return 660 + declarationScore(payload) + destination;
  }
  // A deck-origin set is useful, but legacy self-play strongly prefers
  // developing a known hand card when both options are otherwise comparable.
  if(command?.type === 'SET_CARD_FROM_DECK') return 590 + destination;
  if(command?.type === 'SET_CARD'){
    return 620
      + cardFate(cardByIid(projection, payload.cardIid)) * 6
      + supporterDevelopmentScore(projection, playerIndex)
      + destination;
  }
  if(command?.type === 'MOVE_CARD') return 560 + destination;
  if(command?.type === 'END_TURN') return 0;
  return 100 + destination;
}

// This v3-only policy reads one player projection and returns one of the exact
// templates it was given. The adapter re-validates that template before the
// local session submits it to the shared reducer.
export function chooseStrategicV3AiCommand(commands = [], projection, context = {}){
  return [...commands]
    .filter(command=>command?.type !== 'CONCEDE')
    .sort((left, right)=>
      scoreStrategicV3AiCommand(right, projection, context)
        - scoreStrategicV3AiCommand(left, projection, context)
      || stableStringify(left).localeCompare(stableStringify(right))
    )[0] || null;
}
