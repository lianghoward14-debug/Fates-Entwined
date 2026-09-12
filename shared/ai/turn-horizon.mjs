// Bound rollout work without treating every four-action turn as complete.
// Count available action families, not hundreds of equivalent placements.
export function turnActionHorizon(commands){
  const sources=new Set();
  for(const command of commands){
    if(['END_TURN','CONCEDE','DISCARD_CARD','ANSWER_PROMPT','DISCARD_TO_HAND_LIMIT'].includes(command.type))continue;
    const p=command.payload || {};
    sources.add(`${command.type}:${p.cardIid || p.sourceIid || ''}`);
  }
  return Math.min(12,Math.max(5,sources.size+2));
}
