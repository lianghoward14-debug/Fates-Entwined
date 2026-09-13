import {warfrontAiProfile,warfrontAiCommand} from './warfront-ai-profile.mjs';
import {chooseWarfrontCommand} from './warfront-ai-decision.mjs';

// Keep the planner's continuation across actions: replanning each action can
// repeatedly select a different opening instead of reaching END_TURN.
export function createWarfrontTakeoverDriver(){
  const plans = new Map();
  return async function step(actor){
    const state = actor.state;
    if(state.outcome){plans.delete(state.matchId);return null;}
    for(const seat of state.aiTakeoverSeats || []){
      const view = actor.snapshotForPlayer(seat);
      const legal = view.legalCommands.filter(command=>command.type !== 'CONCEDE');
      if(!legal.length) continue;
      const key = `${seat}:${state.turn}`;
      let plan = plans.get(state.matchId);
      if(!plan || plan.key !== key){plan={key,sequence:[],actions:0};plans.set(state.matchId,plan);}
      let choice;
      try{
      choice = plan.actions>=24 ? legal.find(c=>c.type==='END_TURN') : null;
      choice ||= await chooseWarfrontCommand(legal,view.state,{
        playerId:state.players[seat].id,
        playerIndex:seat,
        canonicalState:state,
        ...warfrontAiProfile(state.players[seat]),
        samples:1,nodeBudget:({easy:100,medium:160,hard:220,extreme:300})[warfrontAiProfile(state.players[seat]).difficulty],maxNodeBudget:300,width:6,
        planCache:plan
      });
      }catch(error){console.warn('Warfront AI recovering decision',state.matchId,error.message);}
      // A failed search must not retry the identical position forever. Resolve
      // compulsory choices first; pass only when the engine offers END_TURN.
      choice=warfrontAiCommand(choice||legal.find(c=>c.type==='END_TURN')||legal[0]);
      if(!choice || actor.state.revision!==state.revision || actor.state.outcome) return null;
      const result = await actor.dispatch(state.players[seat].id,{
        type:choice.type,payload:choice.payload || {},matchId:state.matchId,
        expectedRevision:state.revision,commandId:`takeover:${state.revision}:${seat}`
      });
      if(result.response?.kind === 'rejected'){
        plan.sequence=[];
        const fallback=warfrontAiCommand(legal.find(c=>c.type==='END_TURN'&&choice.type!=='END_TURN')||legal.find(c=>JSON.stringify(c.payload)!==JSON.stringify(choice.payload)||c.type!==choice.type));
        if(fallback&&actor.state.revision===state.revision){
          const recovered=await actor.dispatch(state.players[seat].id,{type:fallback.type,payload:fallback.payload||{},matchId:state.matchId,expectedRevision:state.revision,commandId:`takeover-recovery:${state.revision}:${seat}`});
          if(recovered.response?.kind!=='rejected'){plan.actions++;return recovered;}
        }
        throw new Error(`AI command rejected: ${result.response.rejection?.code}: ${result.response.rejection?.reason}`);
      }
      plan.actions++;
      return result;
    }
    return null;
  };
}
