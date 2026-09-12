import {reduceCommand} from '../engine/index.mjs';
import {sampleWorld} from './belief.mjs';
import {evaluatePosition} from './position.mjs';
import {createCommandOrderer} from './ordering.mjs';
import {completeContinuation} from './continuation.mjs';
import {personalityFor} from './personality.mjs';

// A short search can prefer passing because deployment is evaluated before
// its search/target picker resolves. Independently verify productive moves
// against the current position on the same turn. The caller supplies only
// candidates that have already passed the deck's strategic restrictions.
export function reviewPass(commands,state,player,context={}){
  if(state.pendingPrompt || state.pendingHandLimit || state.outcome)return null;
  const personality=personalityFor(context.style || context.personality);
  const world=sampleWorld(state,player,0),order=createCommandOrderer(world,player);
  const candidates=commands.filter(c=>['SET_CARD','SET_CARD_FROM_DECK','CONSOLIDATE_CARD','SET_ADAPTIVE_TOKEN','FLIP_CARD','ACTIVATE_EFFECT'].includes(c.type))
    .map(command=>({command,priority:order(command)})).sort((a,b)=>b.priority-a.priority);
  const selected=[],families=new Set();
  for(const {command} of candidates){
    const q=command.payload || {};
    const key=[command.type,q.cardIid || q.sourceIid,q.destination?.z,q.destination?.r].join(':');
    if(families.has(key))continue;
    families.add(key);selected.push(command);
    if(selected.length===12)break;
  }
  const baseline=evaluatePosition(world,player,personality);
  let best=null;
  for(const command of selected){
    const payload=command.manualOnly?{...command.payload,userActivated:true}:command.payload || {};
    const result=reduceCommand(world,{type:command.type,payload,matchId:world.matchId,
      expectedRevision:world.revision,commandId:`pass-review:${world.revision}:${selected.indexOf(command)}`},{playerId:world.players[player].id});
    if(!result.ok)continue;
    let resolved=result.state;
    if(resolved.pendingPrompt || resolved.pendingHandLimit){
      resolved=completeContinuation(resolved,player,{budget:18,maxSteps:12,personality,resolutionOnly:true}).state;
    }
    // Never mistake a partially paid or partially answered effect for gain.
    if(resolved.pendingPrompt || resolved.pendingHandLimit)continue;
    const improvement=evaluatePosition(resolved,player,personality)-baseline;
    if(improvement>2 && (!best || improvement>best.improvement))best={command,improvement};
  }
  if(best)context.onPassReview?.({reason:'productive-development',improvement:best.improvement,command:best.command});
  return best?.command || null;
}
