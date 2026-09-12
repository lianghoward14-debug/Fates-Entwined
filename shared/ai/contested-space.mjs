import {controllerOf} from '../engine/selectors.mjs';

// A contested square is development space denied to the opponent, even
// when its occupant contributes little Fate. Scale down near the finish,
// when immediate zone/Morale results matter more than future deployment.
export function contestedSpaceValue(state,player){
  let value=0;
  for(const zone of state.board || []){
    const row=zone?.[1] || [];
    let own=0,enemy=0;
    for(const card of row){
      if(!card)continue;
      if(controllerOf(card)===player)own++;
      else enemy++;
    }
    const occupied=own+enemy;
    value+=(own-enemy)*(6+occupied*1.5);
  }
  const remaining=Math.max(0,Number(state.maxTurns || 24)-Number(state.turn || 0));
  return value*(remaining<=2?.3:1);
}

// Order candidates by net occupancy, not merely their destination: a
// consolidation that replaces its tribute retains the square; consuming
// additional contested tributes opens space for the opponent.
export function contestedCommandDelta(state,player,command,cards){
  const q=command.payload || {},d=q.destination;
  const placement=['SET_CARD','SET_CARD_FROM_DECK','SET_ADAPTIVE_TOKEN','CONSOLIDATE_CARD'].includes(command.type);
  const movement=command.type==='MOVE_CARD';
  const manual=command.type==='DISCARD_CARD' && q.reason==='MANUAL_DISCARD';
  if(!placement && !movement && !manual)return 0;
  const card=cards.get(q.cardIid || q.sourceIid || q.targetIid);
  const removed=new Set(q.tributeIids || []);
  if(movement && card)removed.add(card.iid);
  if(manual)removed.add(q.targetIid || q.sourceIid);
  const board=state.board.map(zone=>zone.map(row=>row.map(c=>c && removed.has(c.iid)?null:c)));
  if(d && card && (placement || movement) && board[d.z]?.[d.r])board[d.z][d.r][d.c]=card;
  return contestedSpaceValue({...state,board},player)-contestedSpaceValue(state,player);
}
