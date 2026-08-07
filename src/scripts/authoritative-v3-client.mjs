function safeClone(value){
  return JSON.parse(JSON.stringify(value));
}

function containsForbiddenSnapshot(value, seen = new Set()){
  if(!value || typeof value !== 'object') return false;
  if(seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(([key, item])=>
    key === 'postState' || key === 'baseStateHash' || containsForbiddenSnapshot(item, seen)
  );
}

export class FateAuthoritativeV3Client {
  constructor({url, matchId, playerId, token, onState, onEvents, onRejected, onConnection}){
    this.url = String(url || '');
    this.matchId = String(matchId || '');
    this.playerId = String(playerId || '');
    this.token = String(token || '');
    this.onState = typeof onState === 'function' ? onState : ()=>{};
    this.onEvents = typeof onEvents === 'function' ? onEvents : ()=>{};
    this.onRejected = typeof onRejected === 'function' ? onRejected : ()=>{};
    this.onConnection = typeof onConnection === 'function' ? onConnection : ()=>{};
    this.socket = null;
    this.revision = null;
    this.stateHash = '';
    this.state = null;
    this.commandCounter = 0;
    this.pendingCommands = new Map();
  }

  connect(){
    if(this.socket) throw new Error('authoritative v3 client is already connected');
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('open', ()=>{
      socket.send(JSON.stringify({
        kind:'hello',
        protocolVersion:3,
        matchId:this.matchId,
        playerId:this.playerId,
        token:this.token
      }));
      this.onConnection({connected:true});
    });
    socket.addEventListener('message', event=>this.#handle(JSON.parse(String(event.data || '{}'))));
    socket.addEventListener('close', ()=>{
      if(this.socket === socket) this.socket = null;
      this.onConnection({connected:false});
    });
    socket.addEventListener('error', ()=>this.onConnection({connected:false, error:true}));
    return this;
  }

  disconnect(){
    this.socket?.close(1000, 'client disconnect');
    this.socket = null;
  }

  command(type, payload = {}, commandId = ''){
    if(!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('authoritative v3 socket is not connected');
    if(!Number.isInteger(this.revision)) throw new Error('wait for the authoritative snapshot before sending commands');
    if(containsForbiddenSnapshot(payload)) throw new Error('v3 commands cannot contain postState or baseStateHash');
    const id = commandId || `${this.playerId}:${++this.commandCounter}`;
    const command = {
      commandId:id,
      matchId:this.matchId,
      expectedRevision:this.revision,
      type:String(type || '').toUpperCase(),
      payload:safeClone(payload)
    };
    this.pendingCommands.set(id, command);
    this.socket.send(JSON.stringify({kind:'command', protocolVersion:3, command}));
    return id;
  }

  answerPrompt(payload = {}){
    if(!this.state?.pendingPrompt) throw new Error('there is no prompt to answer');
    return this.command('ANSWER_PROMPT', {
      promptId:this.state.pendingPrompt.promptId,
      ...safeClone(payload)
    });
  }

  retry(commandId){
    const command = this.pendingCommands.get(String(commandId || ''));
    if(!command) throw new Error('unknown commandId');
    this.socket.send(JSON.stringify({kind:'command', protocolVersion:3, command}));
  }

  #handle(message){
    if(message.kind === 'ping') return;
    if(message.kind === 'snapshot' || message.kind === 'accepted'){
      this.revision = Number(message.revision);
      this.stateHash = String(message.stateHash || '');
      this.state = safeClone(message.state);
      if(message.commandId) this.pendingCommands.delete(message.commandId);
      this.onState(this.state, message);
      if(Array.isArray(message.events) && message.events.length) this.onEvents(message.events, message);
      return;
    }
    if(message.kind === 'rejected'){
      this.revision = Number(message.revision);
      this.stateHash = String(message.stateHash || this.stateHash);
      if(message.state){
        this.state = safeClone(message.state);
        this.onState(this.state, message);
      }
      this.onRejected(message.rejection || {code:'REJECTED', reason:'command rejected'}, message);
      return;
    }
    if(message.kind === 'error') this.onConnection({connected:!!this.socket, error:message.reason || 'server error'});
  }
}

