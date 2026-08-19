import {
  canonicalHash,
  landscapeRule,
  legalCommandTemplates,
  projectEvents,
  projectStateForPlayer,
  projectStateForSpectator,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {cloneSerializable, stableStringify} from '../../shared/engine/serialization.mjs';

export function privateActionCardsForLegalCommands(state, playerIndex, legalCommands){
  const player = state?.players?.[Number(playerIndex)];
  if(!player) return [];
  const eligibleIids = new Set(
    (legalCommands || [])
      .filter(command=>String(command?.type || '') === 'SET_CARD_FROM_DECK')
      .map(command=>String(command?.payload?.cardIid || ''))
      .filter(Boolean)
  );
  return (player.deck || [])
    .filter(card=>eligibleIids.has(String(card?.iid || '')))
    .map(cloneSerializable)
    .sort((left, right)=>String(left.iid || '').localeCompare(String(right.iid || '')));
}

function privateViewFields(state, playerIndex){
  const legalCommands = legalCommandTemplates(state, playerIndex);
  return {
    legalCommands,
    privateActionCards:privateActionCardsForLegalCommands(state, playerIndex, legalCommands),
    state:projectStateForPlayer(state, playerIndex)
  };
}

export class AuthoritativeRoomActor {
  constructor({state, store, snapshotInterval = 20}){
    this.state = state;
    this.store = store;
    this.snapshotInterval = Math.max(1, Number(snapshotInterval) || 20);
    this.queue = Promise.resolve();
  }

  static recover({matchId, store, snapshotInterval = 20}){
    const recovery = store.loadRecovery(matchId);
    if(!recovery) return null;
    let state = recovery.snapshot.state;
    const snapshotHash = canonicalHash(state);
    if(snapshotHash !== recovery.snapshot.stateHash){
      throw new Error(`snapshot hash mismatch for ${matchId} revision ${recovery.snapshot.revision}`);
    }
    for(const item of recovery.commands){
      const result = reduceCommand(state, item.command, {playerId:item.playerId});
      if(!result.ok){
        throw new Error(`replay rejected ${item.commandId}: ${result.rejection.reason}`);
      }
      if(result.revision !== item.revision || result.stateHash !== item.stateHash){
        throw new Error(`replay hash mismatch for ${item.commandId}`);
      }
      state = result.state;
    }
    if(state.revision !== Number(recovery.metadata.currentRevision)
      || canonicalHash(state) !== recovery.metadata.currentHash){
      throw new Error(`recovered state does not match match metadata for ${matchId}`);
    }
    return new AuthoritativeRoomActor({state, store, snapshotInterval});
  }

  dispatch(playerId, command){
    const task = this.queue.then(()=>this.#dispatchNow(playerId, command));
    this.queue = task.catch(()=>{});
    return task;
  }

  snapshotForPlayer(playerIndex){
    return {
      kind:'snapshot',
      protocolVersion:3,
      matchId:this.state.matchId,
      revision:this.state.revision,
      stateHash:canonicalHash(this.state),
      ...privateViewFields(this.state, playerIndex)
    };
  }

  snapshotForSpectator(){
    return {
      kind:'snapshot',
      protocolVersion:3,
      matchId:this.state.matchId,
      revision:this.state.revision,
      stateHash:canonicalHash(this.state),
      state:projectStateForSpectator(this.state)
    };
  }

  promptTimeoutCommand(){
    const prompt = this.state.pendingPrompt;
    if(!prompt) return null;
    const player = this.state.players[Number(prompt.playerIndex)];
    if(!player) throw new Error('pending prompt owner is invalid');
    const payload = {
      promptId:prompt.promptId
    };
    if(prompt.type === 'REACTION'){
      payload.choice = String(prompt.defaultChoice || 'DECLINE');
    }else if(prompt.type === 'MODAL_CHOICE'){
      payload.choice = String(prompt.defaultChoice || prompt.options?.[0]?.value || '');
    }else if(['BOARD_TARGET', 'CARD_SELECTION', 'HAND_SELECTION'].includes(prompt.type)){
      if(prompt.timeoutPolicy === 'CANCEL'){
        payload.cancel = true;
      }else{
        const count = Math.max(1, Number(prompt.min || 1));
        const selected = (prompt.eligibleIids || []).slice(0, count);
        if(Number(prompt.max || 1) === 1) payload.selectedIid = String(selected[0] || '');
        else payload.selectedIids = selected;
      }
    }else if(prompt.type === 'BOARD_DESTINATION'){
      if(prompt.timeoutPolicy === 'CANCEL') payload.cancel = true;
      else payload.destination = prompt.eligible?.[0] || null;
    }else if(prompt.type === 'ZONE_SELECTION'){
      if(prompt.timeoutPolicy === 'CANCEL') payload.cancel = true;
      else payload.zone = prompt.eligibleZones?.[0];
    }else{
      throw new Error(`pending prompt ${prompt.type} has no deterministic timeout policy`);
    }
    return {
      playerId:player.id,
      command:{
        commandId:`server-timeout:${prompt.promptId}`,
        matchId:this.state.matchId,
        expectedRevision:this.state.revision,
        type:'ANSWER_PROMPT',
        payload
      }
    };
  }

  turnTimeoutCommand(){
    if(this.state.phase !== 'main'
      || this.state.outcome
      || this.state.pendingPrompt
      || this.state.pendingHandLimit){
      return null;
    }
    const player = this.state.players[this.state.activePlayer];
    if(!player) throw new Error('active turn owner is invalid');
    const activeLandscapeRule = landscapeRule(this.state.landscapeId);
    const timeoutMs = activeLandscapeRule?.kind === 'SERVER_TURN_TIMER'
      ? Number(activeLandscapeRule.milliseconds)
      : Math.round(Number(this.state.turnTimerSeconds) || 180) * 1000;
    return {
      playerId:player.id,
      turnSignature:`${this.state.matchId}:${this.state.turn}:${this.state.activePlayer}`,
      timeoutMs:Math.max(30000, Math.min(600000, timeoutMs)),
      command:{
        commandId:`server-turn-timeout:${this.state.turn}:${this.state.activePlayer}`,
        matchId:this.state.matchId,
        expectedRevision:this.state.revision,
        type:'END_TURN',
        payload:{}
      }
    };
  }

  async #dispatchNow(playerId, command){
    const previous = this.store.commandResponse(this.state.matchId, command?.commandId);
    if(previous){
      const samePlayer = previous.playerId === String(playerId || '');
      const sameCommand = stableStringify(previous.command) === stableStringify(command);
      if(samePlayer && sameCommand){
        return {response:previous.response, broadcasts:[], idempotentReplay:true};
      }
      return {
        response:{
          kind:'rejected',
          protocolVersion:3,
          commandId:String(command?.commandId || ''),
          matchId:this.state.matchId,
          revision:this.state.revision,
          stateHash:canonicalHash(this.state),
          rejection:{
            code:'COMMAND_ID_COLLISION',
            reason:'commandId was already used by a different command or player'
          }
        },
        broadcasts:[],
        idempotentReplay:false
      };
    }
    const actorIndex = this.state.players.findIndex(player=>player.id === String(playerId || ''));
    if(actorIndex < 0){
      return {
        response:{
          kind:'rejected',
          protocolVersion:3,
          commandId:String(command?.commandId || ''),
          matchId:this.state.matchId,
          revision:this.state.revision,
          rejection:{code:'UNAUTHORIZED_PLAYER', reason:'player is not seated in this match'}
        },
        broadcasts:[]
      };
    }
    const previousTurn = this.state.turn;
    const result = reduceCommand(this.state, command, {playerId});
    if(!result.ok){
      return {
        response:{
          kind:'rejected',
          protocolVersion:3,
          commandId:String(command?.commandId || ''),
          matchId:this.state.matchId,
          revision:this.state.revision,
          stateHash:canonicalHash(this.state),
          rejection:result.rejection,
          ...privateViewFields(this.state, actorIndex)
        },
        broadcasts:[]
      };
    }
    const actorResponse = this.#acceptedMessage(result, actorIndex);
    const takeSnapshot = result.state.turn !== previousTurn
      || result.state.revision % this.snapshotInterval === 0
      || !!result.state.outcome;
    this.store.appendAccepted({
      state:result.state,
      stateHash:result.stateHash,
      command:result.command,
      playerId,
      response:actorResponse,
      snapshot:takeSnapshot
    });
    this.state = result.state;
    const broadcasts = this.state.players.map((_player, playerIndex)=>({
      playerId:this.state.players[playerIndex].id,
      message:this.#acceptedMessage(result, playerIndex)
    }));
    return {response:actorResponse, broadcasts, idempotentReplay:false};
  }

  #acceptedMessage(result, playerIndex){
    return {
      kind:'accepted',
      protocolVersion:3,
      commandId:result.command.commandId,
      matchId:this.state.matchId,
      revision:result.revision,
      stateHash:result.stateHash,
      status:result.status,
      prompt:Number(result.prompt?.playerIndex) === playerIndex ? result.prompt : null,
      handLimit:Number(result.handLimit?.playerIndex) === playerIndex ? result.handLimit : null,
      events:projectEvents(result.events, playerIndex),
      ...privateViewFields(result.state, playerIndex)
    };
  }
}
