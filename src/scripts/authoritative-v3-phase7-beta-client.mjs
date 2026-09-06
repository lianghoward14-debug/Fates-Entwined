// The established authoritative service owns the shared live queue.  Keep
// the release client on this protocol until a coordinated server migration
// can preserve one queue for every installed client.
const CLIENT_VERSION = '1.39.0-phase7-beta.1';
const params = new URLSearchParams(globalThis.location?.search || '');
const ISOLATED_LOCAL_AUTHORITY_TEST = params.get('electron') === '1'
  && params.get('fateV3BetaTestAuth') === '1'
  && params.get('e2eOrganicCardCampaign') === '1'
  && params.get('e2eStrictCardCertification') === '1'
  && ((params.get('fateV3FullUiE2E') === '1') !== (params.get('fateV3PresentationE2E') === '1'));
const requestedTestApiUrl = String(params.get('fateV3BetaTestApiUrl') || '').replace(/\/$/, '');
const LOCAL_TEST_API_URL = ISOLATED_LOCAL_AUTHORITY_TEST && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(requestedTestApiUrl)
  ? requestedTestApiUrl
  : '';
const API_URL = LOCAL_TEST_API_URL || 'https://fates-entwined-main.fly.dev';
const WS_URL = LOCAL_TEST_API_URL
  ? `${LOCAL_TEST_API_URL.replace(/^http:/, 'ws:')}/v3/beta/socket`
  : 'wss://fates-entwined-main.fly.dev/v3/beta/socket';
const CREDENTIAL_KEY = 'fateAuthorityV3Phase7BetaCredential';

if(globalThis.FATE_PHASE7_UNRANKED_BETA !== true
  || globalThis.FATE_PHASE7_UNRANKED_BETA_BLOCKED === true
  || globalThis.FATE_AUTHORITY_ROUTE_BLOCKED === true){
  throw new Error('Phase 7 beta client requires its exact, conflict-free route');
}
const TEST_AUTH_ENABLED = params.get('electron') === '1'
  && params.get('fateV3BetaTestAuth') === '1';
const ORGANIC_TEST_IDENTITY_ENABLED = TEST_AUTH_ENABLED
  && params.get('e2eOrganicCardCampaign') === '1'
  && params.get('e2eStrictCardCertification') === '1'
  && ((params.get('fateV3FullUiE2E') === '1') !== (params.get('fateV3PresentationE2E') === '1'));
globalThis.FATE_PHASE7_TEST_IDENTITY_MODE = TEST_AUTH_ENABLED
  ? 'local-test-session'
  : 'authoritative-client-session';
const FULL_UI_E2E_RESET_KEY = 'fateAuthorityV3Phase7FullUiE2ERun';

function organicTestPool(){
  return String(params.get('e2eRunId') || 'organic-local')
    .replace(/[^A-Za-z0-9_.:@-]/g, '-')
    .slice(0, 80);
}

function resetInheritedFullUiE2ECredential(){
  const exactUiTest = (params.get('fateV3FullUiE2E') === '1') !== (params.get('fateV3PresentationE2E') === '1');
  if(!TEST_AUTH_ENABLED || !exactUiTest || params.get('e2eFresh') !== '1') return;
  const marker = [
    String(params.get('e2eRunId') || 'local'),
    String(params.get('e2eSeat') || ''),
    String(params.get('uiRev') || '')
  ].join(':');
  try{
    if(sessionStorage.getItem(FULL_UI_E2E_RESET_KEY) === marker) return;
    sessionStorage.removeItem(CREDENTIAL_KEY);
    sessionStorage.setItem(FULL_UI_E2E_RESET_KEY, marker);
  }catch(_){ }
}

resetInheritedFullUiE2ECredential();

let socket = null;
let credential = null;
let state = null;
let revision = 0;
let stateHash = '';
let playerIndex = null;
let legalCommands = [];
let privateActionCards = [];
let presentationBatch = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let intentionallyClosed = false;
let fatalError = '';
let matchmakingCancelled = false;
let matchmakingGeneration = 0;
let activeScreen = null;
let spectatorPollTimer = null;
let spectatingMatchId = '';
let spectatorPerspective = 0;
const listeners = new Set();
const inflight = new Map();

function clone(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function containsForbiddenPostState(value, seen = new Set()){
  if(!value || typeof value !== 'object') return false;
  if(seen.has(value)) return false;
  seen.add(value);
  for(const [key, child] of Object.entries(value)){
    if(String(key).toLowerCase() === 'poststate') return true;
    if(containsForbiddenPostState(child, seen)) return true;
  }
  return false;
}

function emit(message){
  const detail = clone(message);
  listeners.forEach(listener=>{
    try{ listener(detail); }catch(error){ console.error('[Fate Phase 7 Beta] listener failed', error); }
  });
  try{
    globalThis.dispatchEvent(new CustomEvent('fate-v3-beta-message', {detail}));
  }catch(_){}
}

function validateCredential(value){
  const next = value && typeof value === 'object' ? value : {};
  const matchId = String(next.matchId || '');
  const playerId = String(next.playerId || '');
  const token = String(next.token || '');
  if(!/^[A-Za-z0-9_-]{3,80}$/.test(matchId)) throw new Error('invalid Phase 7 matchId');
  if(!/^[A-Za-z0-9_.:@-]{1,128}$/.test(playerId)) throw new Error('invalid Phase 7 playerId');
  if(!token) throw new Error('Phase 7 match token is required');
  const queueMode = ['ranked','warfront'].includes(String(next.queueMode || '')) ? String(next.queueMode) : 'freeplay';
  return {matchId, playerId, token, queueMode};
}

function loadCredential(){
  try{
    const raw = sessionStorage.getItem(CREDENTIAL_KEY);
    return raw ? validateCredential(JSON.parse(raw)) : null;
  }catch(_){
    return null;
  }
}

function saveCredential(next){
  try{ sessionStorage.setItem(CREDENTIAL_KEY, JSON.stringify(next)); }catch(_){}
}

function clearCredential(){
  try{ sessionStorage.removeItem(CREDENTIAL_KEY); }catch(_){}
}

let fallbackMatchmakingSession='';
function matchmakingClientSession(){
  // Profile labels such as "default" or "player1" are shared by unrelated
  // installations. They must never identify a player in the global queue.
  const key = 'fateAuthorityV3MatchmakingClientSessionV2';
  try{
    let value = String(sessionStorage.getItem(key) || '');
    if(!value){
      value = `web:${Date.now().toString(36)}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(key, value);
    }
    return value.replace(/[^A-Za-z0-9_.:@-]/g, '-').slice(0, 80);
  }catch(_){
    if(!fallbackMatchmakingSession)fallbackMatchmakingSession=`web:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return fallbackMatchmakingSession;
  }
}

async function matchmakingIdentityToken(){
  if(LOCAL_TEST_API_URL){
    return `test:local-${organicTestPool()}-${String(params.get('e2eSeat') || 'seat').replace(/[^A-Za-z0-9_.:@-]/g, '-')}`;
  }
  return `session:${matchmakingClientSession()}`;
}

async function matchmakingRequest(route, {method = 'GET', body} = {}){
  const response = await fetch(API_URL + route, {
      signal:AbortSignal.timeout(12000),
      method,
      headers:{
        authorization:`Bearer ${await matchmakingIdentityToken()}`,
        'content-type':'application/json',
        'x-fate-client-version':CLIENT_VERSION,
        'x-fate-client-session':matchmakingClientSession(),
        ...(ORGANIC_TEST_IDENTITY_ENABLED ? {'x-fate-organic-fixture':'1'} : {})
      },
      body:body === undefined ? undefined : JSON.stringify(body)
    });
  const text = await response.text();
  let result = null;
  try{ result = text ? JSON.parse(text) : null; }catch(_){}
  if(!response.ok || result?.ok === false){
    throw Object.assign(
      new Error(String(result?.error || text || `Phase 7 matchmaking failed ${response.status}`)),
      {status:Number(response.status) || 0}
    );
  }
  return result || {};
}

function rejectInflight(reason){
  const error = reason instanceof Error ? reason : new Error(String(reason || 'Phase 7 connection closed'));
  for(const pending of inflight.values()){
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  inflight.clear();
}

function resetForNextMatch(nextCredential){
  const nextMatchId = String(nextCredential?.matchId || '');
  const currentMatchId = String(credential?.matchId || state?.matchId || '');
  if(!currentMatchId || currentMatchId === nextMatchId) return false;
  intentionallyClosed = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnectAttempts = 0;
  rejectInflight(new Error('Phase 7 match changed'));
  const previousSocket = socket;
  socket = null;
  try{ previousSocket?.close(); }catch(_){ }
  state = null;
  revision = 0;
  stateHash = '';
  playerIndex = null;
  legalCommands = [];
  privateActionCards = [];
  presentationBatch = null;
  return true;
}

function scheduleReconnect(){
  if(intentionallyClosed || fatalError || !credential || reconnectTimer) return;
  const delay = Math.min(5000, 250 * (2 ** Math.min(5, reconnectAttempts)));
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(()=>{
    reconnectTimer = null;
    connect().catch(error=>{
      console.warn('[Fate Phase 7 Beta] reconnect failed', error);
      scheduleReconnect();
    });
  }, delay);
}

let takeoverNoticeKey = '';
let takeoverNoticeTimer = null;
function updateTakeoverNotice(state, playerIndex){
  if(!globalThis.document) return;
  const key=state?.aiTakeoverSeats?.length&&!state.outcome
    ? `${state.matchId}:${state.aiTakeoverSeats.join(',')}` : '';
  if(key===takeoverNoticeKey) return;
  takeoverNoticeKey=key;
  clearTimeout(takeoverNoticeTimer);
  document.getElementById('warfront-ai-takeover-notice')?.remove();
  if(!key) return;
  const notice=document.createElement('div');
  notice.id='warfront-ai-takeover-notice';notice.setAttribute('role','status');
  notice.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100000;background:#241707;color:#ffe29a;border:2px solid #e8b64c;padding:12px 22px;font-weight:bold;text-align:center;pointer-events:none';
  notice.textContent=state.aiTakeoverSeats.includes(playerIndex)
    ? 'YOU FORFEITED — AI CONTROLS YOUR SEAT'
    : 'ZONE WON 5–0 — Continue against AI for commendations';
  document.getElementById('s-game')?.appendChild(notice);
  takeoverNoticeTimer=setTimeout(()=>notice.remove(),5000);
  globalThis.refreshFateWarfrontState?.();
}
function applyServerMessage(message){
  if(message.kind === 'hello-ok'){
    playerIndex = Number(message.playerIndex);
  }
  // A rejection is also an authoritative resynchronization message.  In
  // particular, a prompt that immediately follows an activated draw can race
  // the client's previous revision.  Consume the server's current projection
  // before the UI is allowed to offer that prompt again.
  if(message.kind === 'snapshot' || message.kind === 'accepted' || message.kind === 'rejected'){
    if(message.state) state = clone(message.state);
    if(message.state) updateTakeoverNotice(state,playerIndex);
    if(Array.isArray(message.legalCommands)) legalCommands = clone(message.legalCommands);
    if(Array.isArray(message.privateActionCards)) privateActionCards = clone(message.privateActionCards);
    revision = Math.max(revision, Number(message.revision || 0) || 0);
    if(message.stateHash) stateHash = String(message.stateHash);
    if(message.kind === 'accepted' && Array.isArray(message.events) && message.events.length){
      presentationBatch = {
        id:`${Number(message.revision || revision) || 0}:${String(message.commandId || '')}`,
        revision:Number(message.revision || revision) || 0,
        commandId:String(message.commandId || ''),
        events:clone(message.events)
      };
    }
  }
  const commandId = String(message.commandId || '');
  if(commandId && inflight.has(commandId)
    && (message.kind === 'accepted' || message.kind === 'rejected')){
    const pending = inflight.get(commandId);
    inflight.delete(commandId);
    clearTimeout(pending.timer);
    if(message.kind === 'accepted') pending.resolve(clone(message));
    else pending.reject(Object.assign(
      new Error(String(message.rejection?.reason || message.rejection?.message || 'command rejected')),
      {rejection:clone(message.rejection || null)}
    ));
  }
  if(message.kind === 'error' && /compatible Phase 7 client version/i.test(String(message.reason || ''))){
    fatalError = String(message.reason);
    intentionallyClosed = true;
    rejectInflight(new Error(fatalError));
    try{ socket?.close(); }catch(_){}
  }
  emit(message);
  if(activeScreen && state && Number.isInteger(playerIndex)){
    activeScreen.render(networkAdapter.view());
  }
}

async function connect(nextCredential = credential || loadCredential()){
  if(fatalError) throw new Error(fatalError);
  const validatedCredential = validateCredential(nextCredential);
  resetForNextMatch(validatedCredential);
  credential = validatedCredential;
  saveCredential(credential);
  intentionallyClosed = false;
  if(socket && socket.readyState === WebSocket.OPEN) return report();
  if(socket && socket.readyState === WebSocket.CONNECTING){
    await new Promise((resolve, reject)=>{
      socket.addEventListener('open', resolve, {once:true});
      socket.addEventListener('error', reject, {once:true});
    });
    return report();
  }
  const connectedSocket = new WebSocket(WS_URL);
  socket = connectedSocket;
  connectedSocket.addEventListener('message', event=>{
    if(socket !== connectedSocket) return;
    try{ applyServerMessage(JSON.parse(String(event.data || '{}'))); }
    catch(error){ console.error('[Fate Phase 7 Beta] invalid server message', error); }
  });
  connectedSocket.addEventListener('close', ()=>{
    if(socket !== connectedSocket) return;
    rejectInflight(new Error('Phase 7 beta socket closed before acknowledgement'));
    scheduleReconnect();
  });
  await new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>reject(new Error('Phase 7 beta socket open timed out')), 20_000);
    connectedSocket.addEventListener('open', ()=>{
      clearTimeout(timer);
      reconnectAttempts = 0;
      connectedSocket.send(JSON.stringify({
        kind:'hello',
        protocolVersion:3,
        clientVersion:CLIENT_VERSION,
        matchId:credential.matchId,
        playerId:credential.playerId,
        token:credential.token
      }));
      resolve();
    }, {once:true});
    connectedSocket.addEventListener('error', ()=>{
      clearTimeout(timer);
      reject(new Error('Phase 7 beta socket failed to open'));
    }, {once:true});
  });
  return report();
}

function disconnect({forget = false} = {}){
  intentionallyClosed = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  rejectInflight(new Error('Phase 7 beta client disconnected'));
  try{ socket?.close(); }catch(_){}
  socket = null;
  if(forget){
    credential = null;
    state = null;
    revision = 0;
    stateHash = '';
    playerIndex = null;
    legalCommands = [];
    privateActionCards = [];
    presentationBatch = null;
    clearCredential();
  }
}

async function sendCommand(type, payload = {}){
  if(containsForbiddenPostState(payload)){
    throw new Error('Phase 7 commands cannot contain client postState');
  }
  await connect();
  if(socket?.readyState !== WebSocket.OPEN) throw new Error('Phase 7 beta socket is not open');
  const commandId = `${credential.playerId}:${Date.now()}:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  const command = {
    commandId,
    matchId:credential.matchId,
    expectedRevision:revision,
    type:String(type || '').toUpperCase(),
    payload:clone(payload || {})
  };
  const promise = new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>{
      inflight.delete(commandId);
      reject(new Error('Phase 7 command acknowledgement timed out'));
    }, 20_000);
    inflight.set(commandId, {resolve, reject, timer});
  });
  socket.send(JSON.stringify({kind:'command', protocolVersion:3, command}));
  return promise;
}

function subscribe(listener){
  if(typeof listener !== 'function') throw new Error('Phase 7 listener must be a function');
  listeners.add(listener);
  return ()=>listeners.delete(listener);
}

async function waitForInitialView(timeoutMs = 20_000){
  if(networkAdapter.view()) return networkAdapter.view();
  return await new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>{
      unsubscribe();
      reject(new Error('Phase 7 initial server snapshot timed out'));
    }, timeoutMs);
    const unsubscribe = subscribe(message=>{
      if(!['snapshot','accepted'].includes(String(message?.kind || ''))) return;
      const view = networkAdapter.view();
      if(!view) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(view);
    });
  });
}

function report(){
  return {
    enabled:true,
    exactFlag:'fateV3UnrankedBeta=1',
    clientVersion:CLIENT_VERSION,
    protocolVersion:3,
    endpoint:WS_URL,
    matchmakingEndpoint:API_URL + '/v3/beta/matchmaking/enter',
    legacyFallback:false,
    connected:socket?.readyState === WebSocket.OPEN,
    reconnectAttempts,
    matchId:credential?.matchId || '',
    playerId:credential?.playerId || '',
    playerIndex,
    revision,
    stateHash,
    legalCommands:clone(legalCommands),
    privateActionCards:clone(privateActionCards),
    presentationBatch:clone(presentationBatch),
    state:clone(state),
    fatalError
  };
}

async function startUnrankedMatchmaking({deckIds, name = '', photoURL = '', rankElo = 600, queueMode = 'freeplay', matchmakingKey = '', landscapeId = '', gameSettings = null, testOpeningCardIds = [], testDeckCardIds = [], testDeckTopCardIds = [], testRules = null, onStatus} = {}){
  const normalizedDeck = Array.isArray(deckIds) ? deckIds.map(String) : [];
  if(normalizedDeck.length !== 40) throw new Error('Authoritative matchmaking requires exactly 40 cards');
  const normalizedQueueMode = ['ranked','warfront'].includes(String(queueMode)) ? String(queueMode) : 'freeplay';
  matchmakingCancelled = false;
  const generation = ++matchmakingGeneration;
  const cancelled = ()=>matchmakingCancelled || generation !== matchmakingGeneration;
  const matchmakingPayload = {
      deckIds:normalizedDeck,
      name:String(name || '').slice(0, 80),
      photoURL:String(photoURL || '').slice(0, 2048),
      rankElo:Math.max(0, Math.round(Number(rankElo) || 600)),
      queueMode:normalizedQueueMode,
      matchmakingKey:normalizedQueueMode === 'warfront' ? String(matchmakingKey || '').slice(0, 180) : '',
      // `landscapeId` remains for deterministic fixture callers. Production
      // Free Play sends the complete settings object so "Random" is not
      // accidentally converted to its picker fallback (igb1/Pacifica).
      landscapeId:String(landscapeId || ''),
      gameSettings:gameSettings && typeof gameSettings === 'object' ? {
        landscapeMode:gameSettings.landscapeMode === 'selected' ? 'selected' : 'random',
        landscapeId:String(gameSettings.landscapeId || 'igb1'),
        turnTimerMinutes:Math.max(1, Math.min(10, Math.round(Number(gameSettings.turnTimerMinutes) || 3))),
        healthPressureSeals:gameSettings.healthPressureSeals === true,
        pressureCardReworks:gameSettings.healthPressureSeals === true
          && gameSettings.pressureCardReworks === true,
        zoneControlRework:gameSettings.zoneControlRework !== false,
        expandedContestedRow:gameSettings.zoneControlRework !== false
          && gameSettings.expandedContestedRow !== false,
        zoneLayout444:gameSettings.zoneControlRework !== false
          && gameSettings.expandedContestedRow !== false
          && gameSettings.zoneLayout444 !== false
      } : null,
      testOpeningCardIds:Array.isArray(testOpeningCardIds) ? testOpeningCardIds.map(String).filter(id=>normalizedDeck.includes(id)).slice(0, 4) : [],
      testDeckCardIds:Array.isArray(testDeckCardIds) ? testDeckCardIds.map(String).filter(id=>normalizedDeck.includes(id)).slice(0, 2) : [],
      testDeckTopCardIds:Array.isArray(testDeckTopCardIds) ? testDeckTopCardIds.map(String).filter(id=>normalizedDeck.includes(id)).slice(0, 2) : [],
      testRules:ORGANIC_TEST_IDENTITY_ENABLED && testRules?.zeroReinforcementCost === true
        ? {zeroReinforcementCost:true}
        : null,
      testPool:ORGANIC_TEST_IDENTITY_ENABLED ? organicTestPool() : ''
  };
  const enterQueue = ()=>matchmakingRequest('/v3/beta/matchmaking/enter', {
    method:'POST',
    body:matchmakingPayload
  });
  const recoverableRequest = async request=>{
    let attempt = 0;
    while(!cancelled()){
      try{ return await request(); }
      catch(error){
        if([400, 403, 426].includes(Number(error?.status))) throw error;
        attempt += 1;
        if(typeof onStatus === 'function'){
          onStatus({status:'waiting', reconnecting:true, message:'Reconnecting to the authoritative queue...'});
        }
        await new Promise(resolve=>setTimeout(resolve, Math.min(4000, 500 * attempt)));
      }
    }
    return {status:'cancelled'};
  };
  let result = await recoverableRequest(enterQueue);
  while(!cancelled() && result.status === 'waiting'){
    if(typeof onStatus === 'function') onStatus({status:'waiting'});
    await new Promise(resolve=>setTimeout(resolve, 900));
    result = await recoverableRequest(()=>matchmakingRequest('/v3/beta/matchmaking/status'));
    // A rolling deployment or recovery can briefly return idle between the
    // durable queue being restored and this poll. Keep the player in the same
    // pool until they explicitly cancel instead of abandoning matchmaking.
    if(result.status === 'idle'){
      if(typeof onStatus === 'function') onStatus({status:'waiting', recovered:true});
      result = await recoverableRequest(enterQueue);
    }
  }
  if(cancelled()) return {ok:false, status:'cancelled'};
  if(result.status !== 'matched' || !result.credential){
    throw new Error(`Phase 7 matchmaking ended in unexpected status ${result.status || '(missing)'}`);
  }
  const matchedCredential = validateCredential(result.credential);
  if(queueMode==='warfront'){
    const req=globalThis.FATE_PENDING_WAR_MATCH;
    if(!req || !globalThis.FateOnline?.flyApiRequest) throw new Error('Warfront account binding is unavailable');
    await globalThis.FateOnline.flyApiRequest('/api/warfront/bind-match',{method:'POST',body:{
      mapCode:req.mapCode,zoneId:req.zoneId,credential:matchedCredential
    }});
  }
  if(cancelled()) return {ok:false, status:'cancelled'};
  if(typeof onStatus === 'function') onStatus({status:'matched', matchId:matchedCredential.matchId});
  await connect(matchedCredential);
  if(cancelled()){
    disconnect({forget:true});
    return {ok:false, status:'cancelled'};
  }
  await waitForInitialView();
  if(cancelled()){
    disconnect({forget:true});
    return {ok:false, status:'cancelled'};
  }
  await mountGameScreen();
  return {ok:true, status:'matched', credential:clone(credential), connection:report()};
}

async function leaveMatchmaking(){
  matchmakingCancelled = true;
  matchmakingGeneration += 1;
  try{ return await matchmakingRequest('/v3/beta/matchmaking/leave', {method:'POST', body:{}}); }
  catch(error){ return {ok:false, error:String(error?.message || error)}; }
}

const networkAdapter = Object.freeze({
  view(){
    if(!state || !Number.isInteger(playerIndex)) return null;
    const spectatorMode=!!spectatingMatchId;
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    return {
      mode:spectatorMode ? 'server-authoritative-v3-phase7-warfront-spectator' : credential?.queueMode === 'ranked'
        ? 'server-authoritative-v3-phase7-challenger'
        : credential?.queueMode === 'warfront' ? 'server-authoritative-v3-phase7-warfront' : 'server-authoritative-v3-phase7-freeplay',
      queueMode:spectatorMode ? 'warfront' : credential?.queueMode,
      playerId:spectatorMode ? '' : credential?.playerId,
      playerIndex,
      aiPlayerId:String(state.players?.[opponentIndex]?.id || ''),
      aiPlayerIndex:opponentIndex,
      state:clone(state),
      legalCommands:clone(legalCommands),
      privateActionCards:clone(privateActionCards),
      presentationBatch:clone(presentationBatch)
    };
  },
  async dispatchLegalCommand(command){
    if(spectatingMatchId)return {ok:false,rejection:{code:'SPECTATOR_READ_ONLY',reason:'Spectators cannot issue match commands'}};
    if(!command || typeof command !== 'object'){
      return {ok:false, rejection:{code:'INVALID_COMMAND', reason:'A server-issued legal command is required'}};
    }
    try{
      const accepted = await sendCommand(command.type, command.payload || {});
      return {ok:true, ...accepted};
    }catch(error){
      return {
        ok:false,
        rejection:error?.rejection || {code:'COMMAND_FAILED', reason:String(error?.message || error)}
      };
    }
  },
  runAiTurn(){
    return {ok:true, status:'REMOTE_OPPONENT'};
  }
});

function unmountGameScreen(){
  activeScreen?.unmount?.();
  activeScreen = null;
}

async function waitForCurrentUiBridge(timeoutMs = 20_000){
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 20_000);
  while(Date.now() < deadline){
    const currentUi = globalThis.FatePhase7CurrentMultiplayerUi;
    if(currentUi && typeof currentUi.mount === 'function') return currentUi;
    await new Promise(resolve=>setTimeout(resolve, 50));
  }
  throw new Error('The current multiplayer UI bridge did not finish loading');
}

async function mountGameScreen(options = {}){
  if(!globalThis.document) return null;
  unmountGameScreen();
  const currentUi = await waitForCurrentUiBridge();
  activeScreen = currentUi.mount({
    adapter:networkAdapter,
    onExit(){
      unmountGameScreen();
      if(typeof options.onExit === 'function') options.onExit();
      else{
        disconnect();
        globalThis.showScreen?.('s-title');
      }
    }
  });
  return activeScreen;
}

function stopSpectating({showWarfront = true} = {}){
  if(spectatorPollTimer) clearTimeout(spectatorPollTimer);
  spectatorPollTimer = null;
  spectatingMatchId = '';
  unmountGameScreen();
  globalThis.document?.getElementById('s-game')?.classList.remove('spectator-mode','warfront-team-spectator');
  globalThis.document?.getElementById('warfront-spectator-panel')?.remove();
  const game=globalThis.getFateGameState?.();
  if(game?._onlineRole==='spectator'){
    game._isSpectator=false;game._onlineRole=null;game._onlinePlayerIndex=null;
    game.localPlayerIndex=null;game.viewerPlayerIndex=null;game._onlineRoomCode=null;
    game._onlineActionLogMode=false;game._phase7CurrentMultiplayer=false;
  }
  state = null;revision = 0;stateHash = '';playerIndex = null;legalCommands = [];privateActionCards = [];presentationBatch = null;
  if(showWarfront){
    globalThis.showScreen?.('s-challenger');
    globalThis.renderChWarEventTab?.(globalThis.document?.querySelector('#ch-content > .ch-tab-pane[data-tab="war"]'));
  }
}

function enforceWarfrontSpectatorState(){
  const game=globalThis.getFateGameState?.();
  if(game){
    game._isSpectator=true;game._onlineRole='spectator';game._onlinePlayerIndex=spectatorPerspective;
    game.localPlayerIndex=spectatorPerspective;game.viewerPlayerIndex=spectatorPerspective;
  }
  globalThis.document?.getElementById('s-game')?.classList.add('spectator-mode','warfront-team-spectator');
  if(globalThis.document){
    let panel=globalThis.document.getElementById('warfront-spectator-panel');
    if(!panel){
      panel=globalThis.document.createElement('aside');
      panel.id='warfront-spectator-panel';
      panel.innerHTML='<span><i></i>LIVE WARFRONT FEED</span><b></b><em>Team perspective locked · read-only broadcast</em><button type="button">EXIT</button>';
      panel.querySelector('button')?.addEventListener('click',()=>stopSpectating());
      globalThis.document.body.appendChild(panel);
    }
    const watched=state?.players?.[spectatorPerspective]?.name || `Teammate ${spectatorPerspective+1}`;
    const label=panel.querySelector('b');if(label)label.textContent=`Watching ${watched}`;
  }
}

async function startSpectating({matchId, playerIndex:requestedPerspective = 0} = {}){
  const id=String(matchId || '');
  if(!/^[A-Za-z0-9_-]{3,80}$/.test(id)) throw new Error('Invalid live Warfront match');
  stopSpectating({showWarfront:false});
  disconnect({forget:false});
  spectatingMatchId=id;spectatorPerspective=Number(requestedPerspective)===1?1:0;playerIndex=spectatorPerspective;
  const poll=async()=>{
    if(spectatingMatchId!==id)return;
    try{
      const snapshot=await matchmakingRequest(`/v3/beta/matches/${encodeURIComponent(id)}/spectator-snapshot?perspective=${spectatorPerspective}`);
      if(spectatingMatchId!==id)return;
      const projected=clone(snapshot.state || {});
      spectatorPerspective=Number(snapshot.playerIndex)===1?1:0;playerIndex=spectatorPerspective;
      if(Array.isArray(projected.players))projected.players=projected.players.map((player,index)=>({...player,hand:index===spectatorPerspective?(player.hand||[]):[],deck:[]}));
      applyServerMessage({...snapshot,kind:'snapshot',state:projected,legalCommands:[],privateActionCards:[]});
      enforceWarfrontSpectatorState();
      if(projected.outcome){setTimeout(()=>stopSpectating(),1800);return;}
    }catch(error){
      if(Number(error?.status)===404){globalThis.toast?.('That Warfront match has ended.');stopSpectating();return;}
      if(Number(error?.status)===403){globalThis.toast?.('Only deployed teammates may spectate this match.');stopSpectating();return;}
      console.warn('[Fate Phase 7 Beta] spectator refresh failed',error);
    }
    spectatorPollTimer=setTimeout(poll,1100);
  };
  await poll();
  if(!spectatingMatchId)return false;
  await mountGameScreen({onExit:()=>stopSpectating()});
  enforceWarfrontSpectatorState();
  activeScreen?.render(networkAdapter.view());
  return true;
}

globalThis.fateAuthorityV3Beta = Object.freeze({
  apiBaseUrl:API_URL,
  connect,
  disconnect,
  sendCommand,
  startUnrankedMatchmaking,
  leaveMatchmaking,
  startSpectating,
  stopSpectating,
  mountGameScreen,
  unmountGameScreen,
  subscribe,
  replayView:()=>networkAdapter.view(),
  report,
  acceptMatchCredential(next){
    credential = validateCredential(next);
    saveCredential(credential);
    return report();
  }
});

credential = loadCredential();
if(credential) connect(credential)
  .then(()=>waitForInitialView())
  .then(()=>mountGameScreen())
  .catch(error=>console.warn('[Fate Phase 7 Beta] resume pending', error));
