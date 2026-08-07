import {
  canonicalHash,
  cloneSerializable,
  cloneState,
  legalCommandTemplates,
  projectEvents,
  projectStateForPlayer,
  replayCommands,
  reduceCommand
} from '../../shared/engine/index.mjs';

// This adapter is intentionally independent of the legacy global game object.
// Single-player and AI can execute the exact reducer used by the v3 room actor.
export class FateAuthoritativeV3LocalSession {
  constructor({state, playerId, perspectivePlayerId}){
    this.state = cloneState(state);
    this.initialState = cloneState(state);
    this.playerId = String(perspectivePlayerId || playerId || '');
    if(this.playerIndex(this.playerId) < 0){
      throw new Error('local-session perspective must be one of the two match players');
    }
    this.commandCounter = 0;
    this.acceptedCommands = [];
    this.listeners = new Set();
    this.listenerErrors = [];
  }

  playerIndex(playerId){
    const id = String(playerId || '');
    return this.state.players.findIndex(player=>String(player.id) === id);
  }

  projectionFor(playerId = this.playerId){
    const playerIndex = this.playerIndex(playerId);
    if(playerIndex < 0) throw new Error('local-session projection requires a match player');
    return projectStateForPlayer(this.state, playerIndex);
  }

  legalCommandsFor(playerId = this.playerId){
    const playerIndex = this.playerIndex(playerId);
    if(playerIndex < 0) return [];
    return legalCommandTemplates(this.state, playerIndex);
  }

  legalCommands(){
    return this.legalCommandsFor(this.playerId);
  }

  subscribe(listener, options = {}){
    if(typeof listener !== 'function') throw new TypeError('local-session listener must be a function');
    this.listeners.add(listener);
    if(options.emitCurrent === true){
      listener({
        type:'SNAPSHOT',
        playerId:this.playerId,
        state:this.projectionFor(this.playerId),
        events:[],
        revision:this.state.revision
      });
    }
    return ()=>this.listeners.delete(listener);
  }

  setPerspective(playerId){
    const id = String(playerId || '');
    if(this.playerIndex(id) < 0) throw new Error('local-session perspective must be a match player');
    this.playerId = id;
    return this.projectionFor(id);
  }

  dispatchForPlayer(playerId, type, payload = {}, commandId = ''){
    const actorId = String(playerId || '');
    const playerIndex = this.playerIndex(actorId);
    if(playerIndex < 0){
      return {
        ok:false,
        rejection:{
          code:'UNAUTHORIZED_PLAYER',
          reason:'local-session command actor is not a match player'
        }
      };
    }
    const command = {
      commandId:commandId || `${actorId}:local:${++this.commandCounter}`,
      matchId:this.state.matchId,
      expectedRevision:this.state.revision,
      type,
      payload
    };
    const result = reduceCommand(this.state, command, {playerId:actorId});
    if(!result.ok) return result;
    this.state = result.state;
    const replayEntry = {
      playerId:actorId,
      playerIndex,
      command:result.command,
      stateHash:result.stateHash
    };
    this.acceptedCommands.push(replayEntry);
    const projectedResult = {
      ...result,
      state:projectStateForPlayer(this.state, playerIndex),
      events:projectEvents(result.events, playerIndex)
    };
    const notification = {
      type:'COMMAND_ACCEPTED',
      playerId:actorId,
      playerIndex,
      command:cloneSerializable(result.command),
      stateHash:result.stateHash,
      revision:result.revision
    };
    for(const listener of this.listeners){
      try{
        listener({
          ...notification,
          state:this.projectionFor(this.playerId),
          events:projectEvents(result.events, this.playerIndex(this.playerId))
        });
      }catch(error){
        // A renderer is downstream of authority. Its failure must never turn an
        // already accepted reducer command into an apparent command failure.
        this.listenerErrors.push({
          revision:result.revision,
          message:String(error?.message || error || 'local-session listener failed')
        });
      }
    }
    return projectedResult;
  }

  dispatch(type, payload = {}, commandId = ''){
    return this.dispatchForPlayer(this.playerId, type, payload, commandId);
  }

  exportReplay(){
    return {
      matchId:this.state.matchId,
      initialStateHash:canonicalHash(this.initialState),
      finalRevision:this.state.revision,
      finalStateHash:canonicalHash(this.state),
      commands:cloneSerializable(this.acceptedCommands)
    };
  }

  static recover({initialState, replay, playerId, perspectivePlayerId}){
    const entries = Array.isArray(replay?.commands) ? replay.commands : [];
    const recovered = replayCommands(initialState, entries);
    if(!recovered.ok){
      const error = new Error(recovered.rejection?.reason || 'local-session replay recovery failed');
      error.code = recovered.rejection?.code || 'REPLAY_RECOVERY_FAILED';
      throw error;
    }
    if(replay?.initialStateHash && replay.initialStateHash !== canonicalHash(initialState)){
      throw Object.assign(new Error('local-session initial state hash does not match replay'), {
        code:'REPLAY_INITIAL_HASH_MISMATCH'
      });
    }
    if(replay?.finalStateHash && replay.finalStateHash !== recovered.stateHash){
      throw Object.assign(new Error('local-session final state hash does not match replay'), {
        code:'REPLAY_FINAL_HASH_MISMATCH'
      });
    }
    const session = new FateAuthoritativeV3LocalSession({
      state:recovered.state,
      playerId:perspectivePlayerId || playerId
    });
    session.initialState = cloneState(initialState);
    session.acceptedCommands = cloneSerializable(entries);
    session.commandCounter = entries.length;
    return session;
  }
}
