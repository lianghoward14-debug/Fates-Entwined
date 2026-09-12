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
      if(!plan || plan.key !== key){plan={key,sequence:[]};plans.set(state.matchId,plan);}
      const choice = warfrontAiCommand(await chooseWarfrontCommand(legal,view.state,{
        playerId:state.players[seat].id,
        playerIndex:seat,
        canonicalState:state,
        ...warfrontAiProfile(state.players[seat]),
        samples:1,nodeBudget:120,maxNodeBudget:120,width:6,
        planCache:plan
      }));
      if(!choice || actor.state.revision!==state.revision || actor.state.outcome) return null;
      const result = await actor.dispatch(state.players[seat].id,{
        type:choice.type,payload:choice.payload || {},matchId:state.matchId,
        expectedRevision:state.revision,commandId:`takeover:${state.revision}:${seat}`
      });
      if(result.response?.kind === 'rejected'){
        plan.sequence=[];
        throw new Error(`AI command rejected: ${result.response.rejection?.code}: ${result.response.rejection?.reason}`);
      }
      return result;
    }
    return null;
  };
}
