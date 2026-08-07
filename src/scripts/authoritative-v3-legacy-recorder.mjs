import {canonicalHash, cloneSerializable} from '../../shared/engine/index.mjs';

// The legacy UI may call this only at stable action boundaries. It records data
// but never mutates either engine and is not loaded by the production page.
export class FateLegacyActionRecorderV3 {
  constructor({engineVersion, rulesetVersion, seed} = {}){
    this.metadata = {
      format:'fates-legacy-action-corpus-v2',
      engineVersion:String(engineVersion || ''),
      rulesetVersion:String(rulesetVersion || ''),
      seed:String(seed || '')
    };
    this.actions = [];
  }

  record({
    preState,
    playerId,
    playerIndex,
    command,
    choices = [],
    rng = {},
    context = {},
    expectedMismatch = null,
    expectedPostState,
    visibleOutcomes = []
  }){
    const entry = {
      index:this.actions.length,
      preState:cloneSerializable(preState),
      preStateHash:canonicalHash(preState),
      playerId:String(playerId || ''),
      playerIndex:Number.isInteger(playerIndex) ? playerIndex : null,
      command:cloneSerializable(command),
      choices:cloneSerializable(choices),
      rng:cloneSerializable(rng),
      context:cloneSerializable(context),
      ...(expectedMismatch ? {expectedMismatch:cloneSerializable(expectedMismatch)} : {}),
      expectedPostState:cloneSerializable(expectedPostState),
      expectedPostStateHash:canonicalHash(expectedPostState),
      visibleOutcomes:cloneSerializable(visibleOutcomes)
    };
    this.actions.push(entry);
    return cloneSerializable(entry);
  }

  export(){
    return cloneSerializable({...this.metadata, actions:this.actions});
  }

  clear({seed} = {}){
    this.actions.length = 0;
    if(seed !== undefined) this.metadata.seed = String(seed || '');
  }
}
