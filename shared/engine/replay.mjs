import {canonicalHash} from './serialization.mjs';
import {cloneState} from './state.mjs';
import {reduceCommand} from './reducer.mjs';

export function replayCommands(initialState, entries, options = {}){
  let state = cloneState(initialState);
  const hashes = [canonicalHash(state)];
  const results = [];
  for(const [index, entry] of (entries || []).entries()){
    const command = entry.command || entry;
    const result = reduceCommand(state, command, {
      playerId:entry.playerId,
      playerIndex:entry.playerIndex,
      allowDebugCommands:options.allowDebugCommands === true
    });
    if(!result.ok){
      return {
        ok:false,
        index,
        commandId:command.commandId,
        rejection:result.rejection,
        state,
        hashes,
        results
      };
    }
    if(entry.stateHash && entry.stateHash !== result.stateHash){
      return {
        ok:false,
        index,
        commandId:command.commandId,
        rejection:{
          code:'REPLAY_HASH_MISMATCH',
          reason:`expected ${entry.stateHash} but replay produced ${result.stateHash}`
        },
        state:result.state,
        hashes:[...hashes, result.stateHash],
        results:[...results, result]
      };
    }
    state = result.state;
    hashes.push(result.stateHash);
    results.push(result);
  }
  return {ok:true, state, stateHash:canonicalHash(state), hashes, results};
}

