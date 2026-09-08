import {boardEntries,controllerOf} from '../engine/selectors.mjs';
import {zoneScore} from '../engine/scoring.mjs';
import {cardRule} from '../engine/cards/registry.mjs';

// Build shared indexes once per position, not once per legal placement.
export function createCommandOrderer(state,player){
  const entries=boardEntries(state);
  const cards=new Map([...entries.map(e=>e.card),...state.players.flatMap(p=>[...(p.hand || []),...(p.deck || []),...(p.discard || [])])].map(card=>[card.iid,card]));
  const margins=[0,1,2].map(z=>zoneScore(state,z,player)-zoneScore(state,z,1-player));
  const values=new Map();
  const dependencyValues=new Map();
  function departureValue(iids){
    const key=[...iids].sort().join('|');
    if(dependencyValues.has(key))return dependencyValues.get(key);
    const removed=new Set(iids);
    const board=state.board.map(zone=>zone.map(row=>row.map(card=>removed.has(card?.iid)?null:card)));
    const hypothetical={...state,board};
    const after=[0,1,2].map(z=>zoneScore(hypothetical,z,player)-zoneScore(hypothetical,z,1-player));
    const loss=margins.reduce((sum,margin,z)=>sum+margin-after[z],0);
    dependencyValues.set(key,loss);
    return loss;
  }
  function value(card){
    if(!card)return 0;
    if(values.has(card.iid))return values.get(card.iid);
    const operations=cardRule(card.id,state)?.operations || [];
    let score=Number(card.currentFate ?? card.fate ?? card.baseFate ?? 0)*.3;
    score+=operations.includes('DRAW_CARDS')?5:0;
    score+=operations.includes('TRANSFER_CARDS')?4:0;
    score+=operations.includes('SET_CARD')?5:0;
    score+=operations.some(op=>op==='DISCARD_CARD' || op==='DISCARD_CARDS')?5:0;
    score+=operations.includes('CHANGE_CONTROL')?8:0;
    score+=operations.includes('CHANGE_PLAYER_COUNTER')?4:0;
    if(card.type!=='Supporter')score-=Number(card.cost || 0)*1.2;
    values.set(card.iid,score);return score;
  }
  return command=>{
    const p=command.payload || {};
    const card=cards.get(p.cardIid || p.sourceIid || p.reactionIid || p.selectedIid || p.targetIid);
    if(command.type==='END_TURN')return -5;
    if(command.type==='ANSWER_PROMPT' && p.choice==='DECLINE')return -2;
    if(p.cancel===true)return -4;
    if(command.type==='DISCARD_CARD' && p.reason==='MANUAL_DISCARD'){
      // Voluntary disposal is a cost, not another activation of the printed
      // ability. Keep it available for unusual plans without promoting it
      // merely because the discarded card has powerful operation tags.
      return -8-departureValue([p.targetIid || p.sourceIid]);
    }
    let score=value(card);
    if(p.reactionIid)score+=8;
    if(card && controllerOf(card)!==player && (p.targetIid || p.selectedIid)){
      // A low-Fate aura or combo enabler can matter more than the largest body.
      score+=Math.max(0,-departureValue([card.iid]))*.6;
    }
    if(p.selectedIids)score+=p.selectedIids.reduce((sum,iid)=>sum+2+value(cards.get(iid)),0);
    if(p.discardedIids)score-=p.discardedIids.reduce((sum,iid)=>sum+value(cards.get(iid)),0);
    if(p.destination){
      const margin=margins[Number(p.destination.z)] || 0;
      const gain=Number(card?.currentFate ?? card?.baseFate ?? 1);
      if(margin<=0 && margin+gain>0)score+=4;
      score-=Math.max(0,margin)*.08;
      if(Number(p.destination.r)===1)score-=.3;
    }
    if(p.tributeIids?.length)score-=departureValue(p.tributeIids)*.6;
    return score;
  };
}
// Priors only order exploration. Actual reducer outcomes decide the move.
export function commandPriority(command,state,player){return createCommandOrderer(state,player)(command);}
