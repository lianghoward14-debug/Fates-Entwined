import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FIREBASE_PROJECT_ID = String(process.env.FATE_FIREBASE_PROJECT_ID || 'fates-entwined-41491');
const DATA_DIR = path.resolve(process.env.FATE_FLY_DATA_API_DIR || path.join(process.cwd(), '.tmp', 'fate-authority'));
const SNAPSHOT_PATH = path.join(DATA_DIR, 'rooms.json');

function cleanId(value, max = 160){ return String(value || '').trim().slice(0, max); }
function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function mapBy(list, key){ return new Map((Array.isArray(list) ? list : []).filter(Boolean).map(item=>[cleanId(item[key]), clone(item)]).filter(row=>row[0])); }
function objectFromSet(set){ return Object.fromEntries([...set].map(uid=>[uid, {uid, createdAt:Date.now()}])); }

export function createFlyDataApi({readBody, writeJson, resolveMatchState = ()=>null, authenticateMatch = ()=>null}){
  fs.mkdirSync(DATA_DIR, {recursive:true});
  let snapshot = {};
  try{ snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) || {}; }catch(error){
    if(error?.code !== 'ENOENT') console.warn('Fly data snapshot could not be read:', error.message);
  }
  const profiles = mapBy(snapshot.playerStats, 'uid');
  const warfrontBindings = mapBy(snapshot.warfrontBindings, 'matchId');
  const challengerResultReceipts = mapBy(snapshot.challengerResultReceipts, 'receiptId');
  const aiRecords = mapBy(snapshot.aiRecords, 'aiId');
  let aiMatches = Array.isArray(snapshot.aiMatches) ? snapshot.aiMatches.map(clone) : [];
  let aiSimulationSchedule = snapshot.aiSimulationSchedule && typeof snapshot.aiSimulationSchedule === 'object'
    ? clone(snapshot.aiSimulationSchedule)
    : {};
  const saves = mapBy(snapshot.playerSaves, 'uid');
  const decks = mapBy(snapshot.publicDecks, 'deckId');
  const listings = mapBy(snapshot.marketplaceListings, 'listingId');
  const friends = new Map((snapshot.friends || []).map(row=>[
    cleanId(row.uid,128),
    new Set((row.friends || []).map(value=>cleanId(value,128)).filter(Boolean))
  ]).filter(row=>row[0]));
  const requests = Array.isArray(snapshot.friendRequests) ? snapshot.friendRequests.map(clone) : [];
  const parties = mapBy(snapshot.parties, 'partyId');
  const partyInvites = Array.isArray(snapshot.partyInvites) ? snapshot.partyInvites.map(clone) : [];
  let worldChat = Array.isArray(snapshot.worldChat) ? snapshot.worldChat.map(clone) : [];
  let privateMessages = (Array.isArray(snapshot.privateMessages) ? snapshot.privateMessages : []).flatMap(row=>
    Array.isArray(row?.messages) ? row.messages.map(clone) : [clone(row)]
  ).filter(Boolean);
  let marketplaceTransactions = Array.isArray(snapshot.marketplaceTransactions)
    ? snapshot.marketplaceTransactions.map(clone)
    : [...listings.values()].filter(row=>row.status && row.status !== 'active').map(clone);
  let warfrontEvent = sanitizeWarfrontState(snapshot.warfrontEvent);
  const warfrontAuthorityBaseline='20260904-server-authority-1';
  const resetWarfrontForAuthorityUpgrade=process.env.FATE_WARFRONT_AUTHORITY_BASELINE_RESET==='1'&&!!warfrontEvent&&snapshot.warfrontAuthorityBaseline!==warfrontAuthorityBaseline;
  let worldSeq = Number(snapshot.worldChatSeq || 0) || 0;
  let dmSeq = Number(snapshot.privateMessageSeq || 0) || 0;
  let saveTimer = null;
  const tokenCache = new Map();
  const presence = new Map();
  let certCache = {certs:null, expiresAt:0};

  function serialize(){
    return Object.assign({}, snapshot, {
      playerStats:[...profiles.values()], warfrontBindings:[...warfrontBindings.values()], challengerResultReceipts:[...challengerResultReceipts.values()].sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0)).slice(-2000),
      aiRecords:[...aiRecords.values()], playerSaves:[...saves.values()], publicDecks:[...decks.values()],
      aiMatches:aiMatches.slice(-500), aiSimulationSchedule:clone(aiSimulationSchedule),
      marketplaceListings:[...listings.values()], marketplaceTransactions:marketplaceTransactions.slice(-500),
      friends:[...friends.entries()].map(([uid,set])=>({uid,friends:[...set]})), friendRequests:requests,
      parties:[...parties.values()], partyInvites, worldChatSeq:worldSeq, worldChat:worldChat.slice(-200),
      privateMessageSeq:dmSeq,
      warfrontEvent:clone(warfrontEvent),
      privateMessages:[...privateMessages.slice(-1000).reduce((groups,message)=>{
        const key=[cleanId(message.fromUid,128),cleanId(message.toUid,128)].sort().join(':');
        if(!groups.has(key)) groups.set(key,[]);
        groups.get(key).push(message);
        return groups;
      },new Map()).entries()].map(([conversationKey,messages])=>({conversationKey,messages}))
    });
  }
  function flush(){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    const temp = SNAPSHOT_PATH + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(serialize()), 'utf8');
    fs.renameSync(temp, SNAPSHOT_PATH);
  }
  function persist(){ if(!saveTimer) saveTimer = setTimeout(()=>{ try{ flush(); }catch(error){ console.error('Fly data snapshot write failed:', error); } }, 80); }
  function sanitizeWarfrontState(value){
    if(!value || typeof value !== 'object') return null;
    let next;
    try{ next=clone(value); }catch(_){ return null; }
    if(!Array.isArray(next.zones) || next.zones.length !== 5) return null;
    next.version=2;
    next.sequence=Math.max(1,Math.floor(Number(next.sequence)||1));
    next.mapCode=cleanId(next.mapCode,40);
    if(!next.mapCode) return null;
    next.status=['enrollment','active'].includes(String(next.status))?String(next.status):'enrollment';
    next.archives=(Array.isArray(next.archives)?next.archives:[]).slice(0,30);
    const sanitizeReplayMatch=match=>{
      if(!match||typeof match!=='object')return match;
      const replay=match.replay;
      if(!replay||typeof replay!=='object'||!Array.isArray(replay.actions)){delete match.replay;return match;}
      replay.version=Math.max(1,Math.floor(Number(replay.version)||1));
      replay.hands=replay.hands&&typeof replay.hands==='object'?replay.hands:{a:[],b:[]};
      replay.actions=replay.actions.slice(0,500).map(action=>action&&typeof action==='object'?action:{});
      const bytes=Buffer.byteLength(JSON.stringify(replay),'utf8');
      if(bytes>8000000)delete match.replay;
      return match;
    };
    const stripReward=report=>{if(report&&typeof report==='object'){delete report.localReward;(report.zones||[]).forEach(zone=>(zone.matches||[]).forEach(sanitizeReplayMatch));}return report;};
    next.lastResult=stripReward(next.lastResult||null);
    next.archives.forEach(stripReward);
    next.zones=next.zones.map(zone=>{
      const clean=zone&&typeof zone==='object'?zone:{};
      clean.id=cleanId(clean.id,40);
      clean.matches=(Array.isArray(clean.matches)?clean.matches:[]).filter(Boolean).slice(0,5).map(sanitizeReplayMatch);
      clean.bans=clean.bans&&typeof clean.bans==='object'?clean.bans:{a:[],b:[]};
      clean.bansLocked=clean.bansLocked&&typeof clean.bansLocked==='object'?clean.bansLocked:{a:false,b:false};
      return clean;
    });
    return next;
  }
  function mergeWarfrontState(current,incoming){
    if(!current) return incoming;
    if(incoming.mapCode!==current.mapCode){
      if(current.zones.some(z=>z.activeMatch?.matchId && resolveMatchState(z.activeMatch.matchId)?.warfrontForfeit && !resolveMatchState(z.activeMatch.matchId)?.outcome)) return current;
      return Number(incoming.sequence)>Number(current.sequence)?incoming:current;
    }
    const merged=clone(current),statusRank={enrollment:0,active:1};
    if(statusRank[incoming.status]>statusRank[merged.status])merged.status=incoming.status;
    merged.startedAt=Number(merged.startedAt||incoming.startedAt||0);
    merged.endsAt=Math.max(Number(merged.endsAt||0),Number(incoming.endsAt||0));
    merged.nextTeam=incoming.nextTeam||merged.nextTeam||null;
    merged.teams=Object.assign({},merged.teams||{},incoming.teams||{});
    const incomingZones=new Map(incoming.zones.map(zone=>[zone.id,zone]));
    merged.zones=merged.zones.map(zone=>{
      const other=incomingZones.get(zone.id);if(!other)return zone;
      const out=clone(zone);out.a=out.a||clone(other.a)||null;out.b=out.b||clone(other.b)||null;
      // Active seats are bound via server-issued match credentials, never via
      // client snapshot fields. A completed normal match releases its queue.
      if(out.activeMatch?.matchId && resolveMatchState(out.activeMatch.matchId)?.outcome) out.activeMatch=null;
      const byId=new Map((out.matches||[]).map(match=>[cleanId(match?.id,160),match]));
      for(const match of other.matches||[]){const id=cleanId(match?.id,160);if(!id)continue;if(!byId.has(id))byId.set(id,clone(match));else if(!byId.get(id)?.replay&&match?.replay)byId.get(id).replay=clone(match.replay);}
      const oldCount=(out.matches||[]).length;out.matches=[...byId.values()].sort((a,b)=>Number(a.completedAt||0)-Number(b.completedAt||0)).slice(0,5);
      if(out.matches.length>oldCount){out.bans=clone(other.bans);out.bansLocked=clone(other.bansLocked);}
      else for(const team of ['a','b'])if(other.bansLocked?.[team]){out.bansLocked[team]=true;out.bans[team]=clone(other.bans?.[team]||[]);}
      return out;
    });
    const reports=[...(incoming.archives||[]),...(merged.archives||[])],seen=new Set();
    merged.archives=reports.filter(report=>{const id=cleanId(report?.mapCode,40);if(!id||seen.has(id))return false;seen.add(id);return true;}).slice(0,30);
    merged.lastResult=incoming.lastResult||merged.lastResult||null;
    merged._syncRevision=Math.max(Number(current._syncRevision||0),Number(incoming._syncRevision||0))+1;
    merged._updatedAt=Date.now();
    return sanitizeWarfrontState(merged);
  }
  function settleWarfrontForfeit(match, clock={}){
    const lock=match?.warfrontForfeit;
    if(!match?.warfrontMatch || !lock || !warfrontEvent) return false;
    const id=String(match.matchId),recordId=id+'-forfeit';
    const binding=warfrontBindings.get(id);
    if(!binding || binding.mapCode!==warfrontEvent.mapCode || !binding.uids?.[0] || !binding.uids?.[1]) return false;
    const zone=warfrontEvent.zones.find(z=>z.id===binding.zoneId);
    if(!zone || !zone.a || !zone.b) return false;
    const before=JSON.stringify(zone);
    let record=zone.matches.find(m=>m.id===recordId);
    const teamASeat=binding.uids.indexOf(zone.a.uid);
    if(teamASeat!==0 && teamASeat!==1) return false;
    if(binding.uids[1-teamASeat]!==zone.b.uid) return false;
    const winnerTeam=lock.winner===teamASeat?'a':'b',loserTeam=winnerTeam==='a'?'b':'a';
    if(!record){
      // A zone sweep replaces earlier battle results, but not their earned stats.
      zone.matches.forEach(m=>{m.voidedByForfeit=true;});
      record={id:recordId,winnerTeam,teamASeat,completedAt:Date.now(),forfeitSweep:true,
        starValue:5,commendationExcluded:true,playerStats:{a:{},b:{}}};
      zone.matches.push(record);
    }
    // Never trust a client-authored match record to decide the sweep or ELO.
    zone.matches.forEach(m=>{if(m.id!==recordId)m.voidedByForfeit=true;});
    Object.assign(record,{winnerTeam,teamASeat,starValue:5,forfeitSweep:true,voidedByForfeit:false});
    if(!match.outcome){record.commendationExcluded=true;record.continuationCompleted=false;record.playerStats={a:{},b:{}};}
    if(!binding.ratingsSettled){
      const winnerElo=profile(zone[winnerTeam].uid).challengerElo;
      const loserElo=profile(zone[loserTeam].uid).challengerElo;
      applyChallengerResult(zone[winnerTeam].uid,{didWin:true,source:'warfront',roomCode:id,opponentElo:loserElo,eloGainMultiplier:3});
      applyChallengerResult(zone[loserTeam].uid,{didWin:false,source:'warfront',roomCode:id,opponentElo:winnerElo});
      binding.ratingsSettled=true;
    }
    if(match.outcome){
      zone.activeMatch=null;
      record.commendationExcluded=match.outcome.commendationsEligible!==true;
      record.continuationCompleted=match.outcome.commendationsEligible===true;
      // Only a completed continuation contributes; leaving wipes its credit.
      const totals=match.outcome.totalFate || [0,0];
      const winnerStats=record.playerStats[winnerTeam] || {};
      record.playerStats={a:{},b:{}};
      if(record.continuationCompleted) record.playerStats[winnerTeam]={...winnerStats,
        totalFateGenerated:Math.max(0,Number(totals[lock.winner])||0),
        fateDifferential:Math.max(0,(Number(totals[lock.winner])||0)-(Number(totals[lock.loser])||0)),
        consolidations:Number(match.warfrontConsolidations?.[lock.winner])||0,
        durationMs:Number(clock.consumedMs?.[lock.winner])||Number(winnerStats.durationMs)||0};
    }
    if(before===JSON.stringify(zone)) return true;
    warfrontEvent._syncRevision=Number(warfrontEvent._syncRevision||0)+1;
    persist();
    return true;
  }
  function refreshWarfrontForfeits(){
    for(const binding of warfrontBindings.values()){
      if(binding.mapCode===warfrontEvent?.mapCode) settleWarfrontForfeit(resolveMatchState(binding.matchId));
    }
  }
  // Seat ratings are enrollment snapshots, not a source of current ratings.
  // Project live server profiles on every response without changing archives.
  function warfrontStateForClient(){
    refreshWarfrontForfeits();
    if(warfrontEvent?.status==='active'&&(((Number(warfrontEvent.endsAt)||0)>0&&Number(warfrontEvent.endsAt)<=Date.now())||warfrontEvent.zones.every(zone=>{let played=0;for(const match of zone.matches||[])if(!match?.voidedByForfeit)played+=Math.max(1,Math.min(5,Number(match.starValue)||1));return played>=5;}))) return finishWarfrontEvent();
    const current = clone(warfrontEvent);
    for(const zone of current?.zones || []) for(const team of ['a','b']){
      const player = zone[team];
      if(!player) continue;
      const stored = profiles.get(cleanId(player.uid,128));
      const rating = stored?.challengerElo ?? stored?.elo;
      player.elo = rating != null && Number.isFinite(Number(rating))
        ? Math.max(0,Number(rating)) : null;
    }
    return current;
  }
  function newWarfrontDeployment(){
    const current=warfrontEvent;
    if(!current) throw new Error('Warfront event is not initialized');
    const sequence=Math.max(1,Number(current.sequence)||1)+1;
    warfrontEvent={...clone(current),sequence,mapCode:`WF-${String(sequence).padStart(2,'0')}-${crypto.randomBytes(2).toString('hex').slice(0,3).toUpperCase()}`,status:'enrollment',createdAt:Date.now(),startedAt:0,endsAt:0,nextTeam:null,lastResult:null,postWarUntil:0,zones:current.zones.map(zone=>({id:zone.id,a:null,b:null,matches:[],landscape:clone(zone.landscape||null),bans:{a:[],b:[]},bansLocked:{a:false,b:false}})),archives:(current.archives||[]).slice(0,30),_syncRevision:Number(current._syncRevision||0)+1,_updatedAt:Date.now()};
    warfrontBindings.clear();persist();return warfrontStateForClient();
  }
  function finishWarfrontEvent(){
    const completed=clone(warfrontEvent),zoneScore=zone=>{let a=0,b=0;for(const match of zone.matches||[]){if(match?.voidedByForfeit)continue;const value=Math.max(1,Math.min(5,Number(match.starValue)||1));if(match.winnerTeam==='a')a+=value;if(match.winnerTeam==='b')b+=value;}return{a,b,played:a+b,bonus:a>=3?'a':b>=3?'b':null};};
    const score={a:0,b:0,match:{a:0,b:0},award:{a:0,b:0}};
    for(const zone of completed.zones){const z=zoneScore(zone);for(const team of ['a','b']){score[team]+=z[team]+(z.bonus===team?1:0);score.match[team]+=z[team]+(z.bonus===team?1:0);}}
    const players=[];for(const zone of completed.zones)for(const team of ['a','b'])if(zone[team])players.push({...clone(zone[team]),team,zoneId:zone.id,matches:zoneScore(zone).played,wins:zoneScore(zone)[team],losses:zoneScore(zone)[team==='a'?'b':'a']});
    const report={mapCode:completed.mapCode,sequence:completed.sequence,startedAt:completed.startedAt,completedAt:Date.now(),reason:'command',teams:clone(completed.teams),score,winner:score.a===score.b?'draw':score.a>score.b?'a':'b',players,zones:clone(completed.zones),achievements:[],matches:completed.zones.reduce((sum,zone)=>sum+zoneScore(zone).played,0)};
    const sequence=Math.max(1,Number(completed.sequence)||1)+1;
    warfrontEvent={...completed,sequence,mapCode:`WF-${String(sequence).padStart(2,'0')}-${crypto.randomBytes(2).toString('hex').slice(0,3).toUpperCase()}`,status:'enrollment',createdAt:Date.now(),startedAt:0,endsAt:0,nextTeam:null,lastResult:report,postWarUntil:report.completedAt+24*60*60*1000,zones:completed.zones.map(zone=>({id:zone.id,a:null,b:null,matches:[],landscape:clone(zone.landscape||null),bans:{a:[],b:[]},bansLocked:{a:false,b:false}})),archives:[report,...(completed.archives||[])].slice(0,30),_syncRevision:Number(completed._syncRevision||0)+1,_updatedAt:Date.now()};
    warfrontBindings.clear();persist();return warfrontStateForClient();
  }
  function applyWarfrontCommand(action){
    if(action==='deployment') return newWarfrontDeployment();
    if(!warfrontEvent) throw new Error('Warfront event is not initialized');
    if(action==='start'){
      if(warfrontEvent.status!=='enrollment') throw new Error('Warfront is not in deployment');
      if(!warfrontEvent.zones.some(zone=>zone.a||zone.b)) throw new Error('At least one deployment is required');
      warfrontEvent.status='active';warfrontEvent.startedAt=Date.now();warfrontEvent.endsAt=warfrontEvent.startedAt+48*60*60*1000;warfrontEvent.lastResult=null;
    }else if(action==='end'){
      if(warfrontEvent.status!=='active') throw new Error('Warfront is not active');
      return finishWarfrontEvent();
    }else throw new Error('Unknown Warfront command');
    warfrontEvent._syncRevision=Number(warfrontEvent._syncRevision||0)+1;warfrontEvent._updatedAt=Date.now();persist();return warfrontStateForClient();
  }
  function profile(uid){
    const key = cleanId(uid, 128);
    const value = profiles.get(key) || {uid:key, displayName:'Player', chosenUsername:'Player', username:'Player', challengerElo:600, rank:'Footman'};
    return clone(value);
  }
  function mergeProfile(uid, incoming = {}){
    const key = cleanId(uid, 128);
    const current = profile(key);
    const cosmetic = ['baseCode','baseUsername','chosenUsername','displayName','username','usernameLower','photoURL','profileImg','level','bio','profileCropFocusX','profileCropFocusY','profileCropY','profileCropZoom','schemaVersion'];
    for(const field of cosmetic) if(incoming[field] !== undefined) current[field] = clone(incoming[field]);
    current.uid = key;
    current.challengerElo = Number(current.challengerElo ?? current.elo ?? 600) || 600;
    current.rank = current.rank || 'Footman';
    current.updatedAt = Date.now();
    profiles.set(key, current); persist(); return clone(current);
  }
  function challengerReceiptId(uid, body = {}){
    const roomCode=cleanId(body.roomCode,200);
    if(!roomCode) return '';
    const source=cleanId(body.source||'client',40)||'client';
    return crypto.createHash('sha256').update(`${cleanId(uid,128)}\n${source}\n${roomCode}`).digest('hex');
  }
  function applyChallengerResult(uid, body = {}){
    if(body.profile) mergeProfile(uid,body.profile);
    const receiptId=challengerReceiptId(uid,body),prior=receiptId&&challengerResultReceipts.get(receiptId);
    if(prior) return {ok:true,profile:profile(uid),result:clone(prior.result),idempotent:true};
    const current=profile(uid),didWin=body.didWin===true,isDraw=body.isDraw===true,didLose=!isDraw&&!didWin;
    const oldElo=Math.max(0,Number(current.challengerElo??current.elo??600)||600),opponentElo=Math.max(0,Number(body.opponentElo)||1000);
    const eloGainMultiplier=didWin&&String(body.source||'')==='warfront'?Math.max(1,Math.min(3,Number(body.eloGainMultiplier)||1)):1;
    let delta=0;
    if(!isDraw){
      const expected=1/(1+Math.pow(10,(opponentElo-oldElo)/400));
      delta=Math.round((didWin?32:40)*((didWin?1:0)-expected));
      if(didWin) delta=Math.max(1,Math.round(delta*eloGainMultiplier));
      if(didLose&&delta>=0) delta=-1;
    }
    const newElo=Math.max(0,oldElo+delta);
    current.challengerElo=newElo;current.elo=newElo;
    current.challengerWins=Number(current.challengerWins??current.wins??0)+(didWin?1:0);
    current.challengerLosses=Number(current.challengerLosses??current.losses??0)+(didLose?1:0);
    current.wins=current.challengerWins;current.losses=current.challengerLosses;
    current.matchesPlayed=Number(current.matchesPlayed||0)+1;
    if(String(body.source||'client')!=='ai'){
      current.humanWins=Number(current.humanWins||0)+(didWin?1:0);
      current.humanLosses=Number(current.humanLosses||0)+(didLose?1:0);
      current.challengerHumanWins=Number(current.challengerHumanWins??current.humanWins-(didWin?1:0))+(didWin?1:0);
      current.challengerHumanLosses=Number(current.challengerHumanLosses??current.humanLosses-(didLose?1:0))+(didLose?1:0);
    }else{
      current.challengerAIWins=Number(current.challengerAIWins||0)+(didWin?1:0);
      current.challengerAILosses=Number(current.challengerAILosses||0)+(didLose?1:0);
    }
    current.updatedAt=Date.now();profiles.set(uid,current);
    const result={oldElo,newElo,delta,didWin,didLose,isDraw,eloGainMultiplier};
    if(receiptId){
      challengerResultReceipts.set(receiptId,{receiptId,uid:cleanId(uid,128),source:cleanId(body.source||'client',40),roomCode:cleanId(body.roomCode,200),result:clone(result),createdAt:Date.now()});
      if(challengerResultReceipts.size>2200){
        const oldest=[...challengerResultReceipts.values()].sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0)).slice(0,challengerResultReceipts.size-2000);
        oldest.forEach(row=>challengerResultReceipts.delete(row.receiptId));
      }
    }
    persist();
    return {ok:true,profile:clone(current),result,idempotent:false};
  }
  function authHeader(req){ return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); }
  function decodePart(value){
    const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    return Buffer.from(normalized+'='.repeat((4-normalized.length%4)%4),'base64');
  }
  async function firebaseCertificates(){
    if(certCache.certs && certCache.expiresAt>Date.now()+60000) return certCache.certs;
    const response=await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if(!response.ok) throw Object.assign(new Error('account certificate fetch failed'),{status:503});
    const maxAge=Number((response.headers.get('cache-control')||'').match(/max-age=(\d+)/i)?.[1]||3600);
    certCache={certs:await response.json(),expiresAt:Date.now()+maxAge*1000};
    return certCache.certs;
  }
  async function verifyFirebaseToken(token){
    const parts=String(token||'').split('.');
    if(parts.length!==3) throw Object.assign(new Error('invalid account token'),{status:401});
    let header,payload;
    try{header=JSON.parse(decodePart(parts[0]).toString('utf8'));payload=JSON.parse(decodePart(parts[1]).toString('utf8'));}catch(_){throw Object.assign(new Error('invalid account token'),{status:401});}
    const cert=(await firebaseCertificates())[header?.kid];
    if(!cert) throw Object.assign(new Error('unknown account token key'),{status:401});
    const verifier=crypto.createVerify('RSA-SHA256');verifier.update(parts[0]+'.'+parts[1]);verifier.end();
    const now=Math.floor(Date.now()/1000);
    if(!verifier.verify(cert,decodePart(parts[2]))||payload.aud!==FIREBASE_PROJECT_ID||payload.iss!==`https://securetoken.google.com/${FIREBASE_PROJECT_ID}`||!payload.sub||Number(payload.exp||0)<=now){
      throw Object.assign(new Error('invalid account token'),{status:401});
    }
    return cleanId(payload.sub,128);
  }
  async function verifiedUid(req){
    const token = authHeader(req);
    if(!token) throw Object.assign(new Error('sign-in required'), {status:401});
    const cached = tokenCache.get(token);
    if(cached && cached.expires > Date.now()){
      presence.set(cached.uid, Date.now());
      return cached.uid;
    }
    const uid = await verifyFirebaseToken(token);
    tokenCache.set(token, {uid, expires:Date.now()+300000});
    presence.set(uid, Date.now());
    return uid;
  }
  async function requireSelf(req, claimed){
    const uid = await verifiedUid(req);
    if(cleanId(claimed,128) && cleanId(claimed,128) !== uid) throw Object.assign(new Error('account mismatch'), {status:403});
    return uid;
  }
  function stateFor(uid){
    const ownFriends = friends.get(uid) || new Set();
    const incoming = requests.filter(item=>item.toUid === uid && item.status !== 'declined');
    const ownParty = [...parties.values()].find(item=>item?.members?.[uid]);
    const invites = partyInvites.filter(item=>item.toUid === uid);
    const online = [...presence.entries()].filter(([,at])=>Date.now()-at<60000).map(([onlineUid])=>onlineUid);
    const peerIds = new Set([uid, ...online, ...ownFriends, ...incoming.map(x=>x.fromUid), ...invites.map(x=>x.fromUid), ...Object.keys(ownParty?.members || {})]);
    const threadRows = privateMessages.filter(m=>m.fromUid === uid || m.toUid === uid);
    const threads = {};
    for(const message of threadRows){
      const peer = message.fromUid === uid ? message.toUid : message.fromUid;
      if(!threads[peer] || Number(threads[peer].timestamp || 0) < Number(message.timestamp || 0)) threads[peer] = {peerUid:peer,lastText:message.text,timestamp:message.timestamp,unread:0};
      peerIds.add(peer);
    }
    return {
      friends:objectFromSet(ownFriends), requests:Object.fromEntries(incoming.map(item=>[item.fromUid,item])), threads,
      onlineUids:online, partyInvites:Object.fromEntries(invites.map(item=>[item.fromUid,item])),
      profiles:Object.fromEntries([...peerIds].filter(Boolean).map(key=>[key,profile(key)])), party:ownParty ? clone(ownParty) : null
    };
  }
  function deckPublic(deck){
    const ratings = Array.isArray(deck.ratings) ? deck.ratings : [];
    const publicDeck = clone(deck);
    for(const key of ['ownerPhotoURL','photoURL','profileImg']){
      if(/^data:/i.test(String(publicDeck[key] || '')) || String(publicDeck[key] || '').length > 2048) publicDeck[key] = '';
    }
    return Object.assign({}, publicDeck, {id:deck.deckId, ratingCount:ratings.length, ratingAvg:ratings.length ? ratings.reduce((n,r)=>n+Number(r.stars||0),0)/ratings.length : 0, commentCount:(deck.comments||[]).length});
  }
  function runChallengerAiSimulation(monthKey, requestedCount, claimedBy){
    const season = cleanId(monthKey,24);
    const now = Date.now();
    const cadenceMs = 60 * 60 * 1000;
    const scheduleKey = season || 'current';
    const previous = aiSimulationSchedule[scheduleKey] || {};
    if(Number(previous.lastRunAt || 0) && now - Number(previous.lastRunAt) < cadenceMs){
      return {ran:0, matches:[], nextAt:Number(previous.lastRunAt) + cadenceMs};
    }
    const roster = [...aiRecords.values()].filter(record=>!season || !record.monthKey || cleanId(record.monthKey,24) === season);
    if(roster.length < 2) return {ran:0, matches:[], nextAt:now};
    const shuffled = roster.slice();
    for(let i=shuffled.length-1;i>0;i--){
      const j = crypto.randomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const maximumPairs = Math.floor(shuffled.length / 2);
    const count = Math.max(1, Math.min(maximumPairs, 200, Math.round(Number(requestedCount) || maximumPairs)));
    const matches = [];
    for(let i=0;i<count;i++){
      const a = clone(shuffled[i * 2]);
      const b = clone(shuffled[i * 2 + 1]);
      if(!a || !b) continue;
      const aId = cleanId(a.aiId || a.id || a.name,128);
      const bId = cleanId(b.aiId || b.id || b.name,128);
      if(!aId || !bId || aId === bId) continue;
      const aElo = Math.max(100,Number(a.elo ?? a.challengerElo ?? 600)||600);
      const bElo = Math.max(100,Number(b.elo ?? b.challengerElo ?? 600)||600);
      const aStrength = Math.max(100,Number(a.trueElo ?? aElo)||aElo);
      const bStrength = Math.max(100,Number(b.trueElo ?? bElo)||bElo);
      const aChance = 1/(1+Math.pow(10,(bStrength-aStrength)/400));
      const aWins = crypto.randomInt(1000000) < Math.round(aChance * 1000000);
      const expectedA = 1/(1+Math.pow(10,(bElo-aElo)/400));
      let aDelta = Math.round(24*((aWins?1:0)-expectedA));
      if(aWins && aDelta <= 0) aDelta = 1;
      if(!aWins && aDelta >= 0) aDelta = -1;
      const bDelta = -aDelta;
      a.elo = a.challengerElo = Math.max(100,Math.round(aElo+aDelta));
      b.elo = b.challengerElo = Math.max(100,Math.round(bElo+bDelta));
      a.wins = a.challengerWins = Number(a.wins ?? a.challengerWins ?? 0)+(aWins?1:0);
      a.losses = a.challengerLosses = Number(a.losses ?? a.challengerLosses ?? 0)+(aWins?0:1);
      b.wins = b.challengerWins = Number(b.wins ?? b.challengerWins ?? 0)+(aWins?0:1);
      b.losses = b.challengerLosses = Number(b.losses ?? b.challengerLosses ?? 0)+(aWins?1:0);
      a.matchesPlayed = Math.max(Number(a.matchesPlayed||0)+1,a.wins+a.losses);
      b.matchesPlayed = Math.max(Number(b.matchesPlayed||0)+1,b.wins+b.losses);
      a.updatedAt = b.updatedAt = now;
      aiRecords.set(aId,a);
      aiRecords.set(bId,b);
      const aName = cleanId(a.name || a.username || aId,120);
      const bName = cleanId(b.name || b.username || bId,120);
      matches.push({
        matchId:['ai',season||'season',now,i,aId,bId].join('_'),
        p1:aName,p2:bName,winner:aWins?aName:bName,
        p1AiId:aId,p2AiId:bId,winnerAiId:aWins?aId:bId,
        p1Change:aDelta,p2Change:bDelta,p1Elo:a.elo,p2Elo:b.elo,
        p1Img:a.photoURL||a.profileImg||null,p2Img:b.photoURL||b.profileImg||null,
        isSimulated:true,simulated:true,createdAt:now,timestamp:now
      });
    }
    if(matches.length){
      aiMatches = aiMatches.concat(matches).slice(-500);
      aiSimulationSchedule[scheduleKey] = {lastRunAt:now,claimedBy:cleanId(claimedBy,128),count:matches.length};
      persist();
    }
    return {ran:matches.length,matches,nextAt:now+cadenceMs};
  }
  function routeParts(url){ return url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
  async function handle(req, res, url){
    if(!url.pathname.startsWith('/api/')) return false;
    const p = routeParts(url);
    try{
      const profileMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
      if(profileMatch && req.method === 'GET'){
        await verifiedUid(req); writeJson(res,200,{ok:true,profile:profile(decodeURIComponent(profileMatch[1]))}); return true;
      }
      if(profileMatch && req.method === 'POST'){
        const body=await readBody(req), uid=await requireSelf(req,body.uid||decodeURIComponent(profileMatch[1]));
        writeJson(res,200,{ok:true,profile:mergeProfile(uid,body.profile||body)}); return true;
      }
      if(req.method==='GET' && url.pathname==='/api/leaderboards/challenger'){
        await verifiedUid(req); const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||100)));
        const leaderboard=[...profiles.values()].filter(entry=>{
          const identity=[entry?.uid,entry?.id,entry?.aiId,entry?.username,entry?.name,entry?.displayName,entry?.chosenUsername,entry?.baseCode]
            .filter(Boolean).join(' ').toLowerCase();
          return !/(codex|smoke|diagnostic|client[-_\s]*resolved|authority|fly[-_\s]*(?:random[-_\s]*)?queue|queue[-_\s]*bot|(^|[^a-z0-9])test([^a-z0-9]|$))/i.test(identity);
        }).sort((a,b)=>Number(b.challengerElo||600)-Number(a.challengerElo||600)).slice(0,limit).map(clone);
        writeJson(res,200,{ok:true,leaderboard}); return true;
      }
      if(req.method==='POST' && url.pathname==='/api/challenger-results'){
        const body=await readBody(req),uid=await requireSelf(req,body.uid);
        writeJson(res,200,applyChallengerResult(uid,body));return true;
      }
      if(req.method==='POST' && p[1]==='challenger-ai' && ['seed','simulate'].includes(p[2])){
        const body=await readBody(req);const uid=await requireSelf(req,body.uid);
        if(p[2]==='seed') for(const incoming of (Array.isArray(body.roster)?body.roster:[])){
          const aiId=cleanId(incoming.aiId||incoming.id||incoming.name,128);if(!aiId)continue;
          aiRecords.set(aiId,Object.assign({},clone(incoming),aiRecords.get(aiId)||{},{aiId,monthKey:cleanId(body.monthKey,24),updatedAt:Date.now()}));
        }
        if(p[2]==='simulate'){
          const result=runChallengerAiSimulation(body.monthKey,body.count,uid);
          writeJson(res,200,{ok:true,ran:result.ran,nextAt:result.nextAt,roster:[...aiRecords.values()].map(clone),matches:result.matches.map(clone)});return true;
        }
        persist();writeJson(res,200,{ok:true,ran:0,roster:[...aiRecords.values()].map(clone),matches:[]});return true;
      }
      if(req.method==='GET' && url.pathname==='/api/challenger-ai/matches'){
        await verifiedUid(req);
        const limit=Math.min(75,Math.max(1,Number(url.searchParams.get('limit')||25)));
        const monthKey=cleanId(url.searchParams.get('monthKey'),24);
        const matches=aiMatches.filter(match=>!monthKey || String(match?.matchId||'').includes(`ai_${monthKey}_`)).slice(-limit).map(clone);
        writeJson(res,200,{ok:true,matches});return true;
      }
      if(req.method==='GET' && url.pathname==='/api/social/state'){
        const uid=await requireSelf(req,url.searchParams.get('uid'));writeJson(res,200,Object.assign({ok:true},stateFor(uid)));return true;
      }
      if(req.method==='POST' && url.pathname==='/api/warfront/bind-match'){
        const body=await readBody(req),uid=await verifiedUid(req),c=body.credential || {};
        const auth=authenticateMatch(c.matchId,c.playerId,c.token);
        const match=auth && resolveMatchState(c.matchId);
        const zone=warfrontEvent?.zones.find(z=>z.id===body.zoneId);
        const team=zone?.a?.uid===uid?'a':zone?.b?.uid===uid?'b':null;
        if(!auth || !match?.warfrontMatch || !team || body.mapCode!==warfrontEvent?.mapCode){
          throw Object.assign(new Error('Warfront seat ownership required'),{status:403});
        }
        const expected=[body.mapCode,body.zoneId,...[zone.a?.uid,zone.b?.uid].map(String).sort()].join('|');
        if(match.warfrontMatchmakingKey!==expected) throw Object.assign(new Error('Warfront match does not belong to this zone'),{status:403});
        const binding=warfrontBindings.get(c.matchId) || {matchId:c.matchId,mapCode:body.mapCode,zoneId:body.zoneId,uids:[null,null]};
        const seat=Number(auth.seat);
        if(![0,1].includes(seat) || (binding.uids[seat] && binding.uids[seat]!==uid) || binding.uids[1-seat]===uid){
          throw Object.assign(new Error('Warfront account already bound to another seat'),{status:403});
        }
        binding.uids[seat]=uid;warfrontBindings.set(c.matchId,binding);
        zone.activeMatch={matchId:c.matchId,teamASeat:team==='a'?seat:1-seat,startedAt:zone.activeMatch?.startedAt||Date.now()};
        persist();settleWarfrontForfeit(match);
        writeJson(res,200,{ok:true});return true;
      }
      if(req.method==='GET' && url.pathname==='/api/social/lookup'){
        await verifiedUid(req);const term=cleanId(url.searchParams.get('term')).toLowerCase();
        const found=[...profiles.values()].filter(x=>[x.uid,x.baseCode,x.username,x.chosenUsername,x.displayName].some(v=>String(v||'').toLowerCase()===term)).slice(0,5).map(clone);
        writeJson(res,200,{ok:true,profiles:found});return true;
      }
      if(p[1]==='warfront'&&p[2]==='state'){
        if(req.method==='GET'){await verifiedUid(req);writeJson(res,200,{ok:true,state:warfrontStateForClient()});return true;}
        const body=await readBody(req);await requireSelf(req,body.uid);const incoming=sanitizeWarfrontState(body.state);
        if(!incoming)throw new Error('invalid Warfront event state');
        if(warfrontEvent){incoming.mapCode=warfrontEvent.mapCode;incoming.sequence=warfrontEvent.sequence;incoming.status=warfrontEvent.status;incoming.startedAt=warfrontEvent.startedAt;incoming.endsAt=warfrontEvent.endsAt;incoming.lastResult=clone(warfrontEvent.lastResult);incoming.postWarUntil=warfrontEvent.postWarUntil;incoming.archives=clone(warfrontEvent.archives);for(const zone of incoming.zones){const serverZone=warfrontEvent.zones.find(row=>row.id===zone.id);zone.a=clone(serverZone?.a||null);zone.b=clone(serverZone?.b||null);}}
        warfrontEvent=mergeWarfrontState(warfrontEvent,incoming);persist();writeJson(res,200,{ok:true,state:warfrontStateForClient()});return true;
      }
      if(req.method==='POST'&&p[1]==='warfront'&&p[2]==='command'){
        const body=await readBody(req);await requireSelf(req,body.uid);writeJson(res,200,{ok:true,state:applyWarfrontCommand(cleanId(body.action,30))});return true;
      }
      if(req.method==='POST'&&p[1]==='warfront'&&p[2]==='deploy'){
        const body=await readBody(req),uid=await requireSelf(req,body.uid),team=body.team==='a'||body.team==='b'?body.team:null,zone=warfrontEvent?.zones.find(row=>row.id===cleanId(body.zoneId,40));
        if(!team||!zone||warfrontEvent.status!=='enrollment')throw new Error('Warfront is not accepting deployments');
        if(warfrontEvent.zones.some(row=>row.a?.uid===uid||row.b?.uid===uid))throw new Error('Player is already deployed');
        if(zone[team])throw new Error('That command post is occupied');
        if(body.profile)mergeProfile(uid,body.profile);const stored=profile(uid);
        zone[team]={uid,name:cleanId(stored.chosenUsername||stored.displayName||stored.username||body.profile?.name||'Player',80),photo:stored.photoURL||stored.profileImg||body.profile?.photo||'blank.png',elo:Number(stored.challengerElo??stored.elo??body.profile?.elo??600),joinedAt:Date.now()};
        warfrontEvent._syncRevision=Number(warfrontEvent._syncRevision||0)+1;warfrontEvent._updatedAt=Date.now();persist();writeJson(res,200,{ok:true,state:warfrontStateForClient()});return true;
      }
      if(req.method==='POST' && p[1]==='friends'){
        const body=await readBody(req),uid=await requireSelf(req,body.uid),action=p[2];
        if(action==='request'){ const toUid=cleanId(body.toUid,128); if(body.profile) mergeProfile(uid,body.profile); if(toUid&&!requests.some(x=>x.fromUid===uid&&x.toUid===toUid)) requests.push({fromUid:uid,toUid,status:'pending',createdAt:Date.now()}); }
        if(action==='accept'){ const from=cleanId(body.fromUid,128); if(!friends.has(uid))friends.set(uid,new Set());if(!friends.has(from))friends.set(from,new Set());friends.get(uid).add(from);friends.get(from).add(uid);for(let i=requests.length-1;i>=0;i--)if(requests[i].fromUid===from&&requests[i].toUid===uid)requests.splice(i,1); }
        if(action==='decline'){ for(let i=requests.length-1;i>=0;i--)if(requests[i].fromUid===cleanId(body.fromUid,128)&&requests[i].toUid===uid)requests.splice(i,1); }
        if(action==='remove'){ const peer=cleanId(body.friendUid,128);friends.get(uid)?.delete(peer);friends.get(peer)?.delete(uid); }
        persist();writeJson(res,200,{ok:true,state:stateFor(uid)});return true;
      }
      if(req.method==='POST' && p[1]==='parties'){
        const body=await readBody(req),uid=await requireSelf(req,body.uid);
        if(p.length===2){ const partyId='party_'+uid;const party={partyId,leaderUid:uid,members:{[uid]:{uid,status:'Leader',joinedAt:Date.now()}},createdAt:Date.now(),updatedAt:Date.now()};parties.set(partyId,party);persist();writeJson(res,200,{ok:true,party,state:stateFor(uid)});return true; }
        const partyId=cleanId(p[2]),action=p[3],party=parties.get(partyId);
        if(!party) throw Object.assign(new Error('party not found'),{status:404});
        if(action==='invite'){ const toUid=cleanId(body.toUid,128);partyInvites.push({partyId,fromUid:uid,toUid,status:'pending',createdAt:Date.now()}); }
        if(action==='accept'){ if(Object.keys(party.members||{}).length>=2&&!party.members[uid])throw new Error('party is full');party.members[uid]={uid,status:'Ready',joinedAt:Date.now()};for(let i=partyInvites.length-1;i>=0;i--)if(partyInvites[i].partyId===partyId&&partyInvites[i].toUid===uid)partyInvites.splice(i,1); }
        if(action==='decline'){ for(let i=partyInvites.length-1;i>=0;i--)if(partyInvites[i].partyId===partyId&&partyInvites[i].toUid===uid)partyInvites.splice(i,1); }
        if(action==='leave') parties.delete(partyId);
        party.updatedAt=Date.now();persist();writeJson(res,200,{ok:true,party:parties.get(partyId)||null,state:stateFor(uid)});return true;
      }
      if(p[1]==='world-chat'){
        if(req.method==='GET'){await verifiedUid(req);const after=Number(url.searchParams.get('after')||0),limit=Math.min(80,Number(url.searchParams.get('limit')||40));writeJson(res,200,{ok:true,messages:worldChat.filter(m=>Number(m.seq)>after).slice(-limit)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid);if(body.profile)mergeProfile(uid,body.profile);const pr=profile(uid);const message={id:'world_'+(++worldSeq),seq:worldSeq,uid,from:pr.chosenUsername||pr.displayName||pr.username||'Player',photoURL:pr.photoURL||pr.profileImg||null,text:cleanId(body.text,240),timestamp:Date.now()};worldChat.push(message);worldChat=worldChat.slice(-200);persist();writeJson(res,200,{ok:true,message,messages:[message]});return true;
      }
      if(p[1]==='direct-messages'&&p[2]){
        const peer=cleanId(p[2],128);if(req.method==='GET'){const uid=await requireSelf(req,url.searchParams.get('uid'));const after=Number(url.searchParams.get('after')||0),limit=Math.min(80,Number(url.searchParams.get('limit')||50));const rows=privateMessages.filter(m=>(m.fromUid===uid&&m.toUid===peer)||(m.fromUid===peer&&m.toUid===uid)).filter(m=>Number(m.seq)>after).slice(-limit);writeJson(res,200,{ok:true,messages:rows,peerProfile:profile(peer),state:stateFor(uid)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid);if(body.profile)mergeProfile(uid,body.profile);const message={id:'dm_'+(++dmSeq),seq:dmSeq,fromUid:uid,toUid:peer,text:cleanId(body.text,240),timestamp:Date.now()};privateMessages.push(message);privateMessages=privateMessages.slice(-1000);persist();writeJson(res,200,{ok:true,message,messages:[message],state:stateFor(uid)});return true;
      }
      if(p[1]==='player-save'&&p[2]){
        const target=cleanId(p[2],128);if(req.method==='GET'){await requireSelf(req,target);writeJson(res,200,{ok:true,save:clone(saves.get(target)||null),data:clone(saves.get(target)?.data||null)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid||target),existing=saves.get(uid)||{uid,data:{}};existing.data=Object.assign({},existing.data||{},clone(body.data||{}));existing.updatedAt=Date.now();saves.set(uid,existing);persist();writeJson(res,200,{ok:true,save:clone(existing),data:clone(existing.data)});return true;
      }
      if(p[1]==='public-decks'){
        // Public deck browsing is deliberately readable without an account.
        // Mutating routes below still verify Firebase identity and ownership.
        // Requiring a token here made the library and every deck preview fail
        // while Electron was still restoring the persisted Google session.
        if(req.method==='GET'&&!p[2]){const limit=Math.min(80,Number(url.searchParams.get('limit')||40));writeJson(res,200,{ok:true,decks:[...decks.values()].sort((a,b)=>Number(b.updatedAt||b.createdAt)-Number(a.updatedAt||a.createdAt)).slice(0,limit).map(deckPublic)});return true;}
        if(req.method==='POST'&&!p[2]){const body=await readBody(req),uid=await requireSelf(req,body.uid);if(body.profile)mergeProfile(uid,body.profile);const input=clone(body.deck||body);for(const key of ['ownerPhotoURL','photoURL','profileImg']){if(/^data:/i.test(String(input[key]||''))||String(input[key]||'').length>2048)input[key]='';}const deckId=cleanId(input.deckId||input.id)||('deck_'+Date.now()+'_'+uid.slice(0,8));const deck=Object.assign({},decks.get(deckId)||{},input,{deckId,id:deckId,ownerUid:uid,uid,updatedAt:Date.now(),createdAt:decks.get(deckId)?.createdAt||Date.now()});decks.set(deckId,deck);persist();writeJson(res,200,{ok:true,deck:deckPublic(deck)});return true;}
        const id=cleanId(p[2]),deck=decks.get(id);if(!deck)throw Object.assign(new Error('deck not found'),{status:404});
        if(req.method==='GET'){writeJson(res,200,{ok:true,deck:deckPublic(deck)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid);
        if(p[3]==='delete'){if(cleanId(deck.ownerUid||deck.uid,128)!==uid)throw Object.assign(new Error('not deck owner'),{status:403});decks.delete(id);persist();writeJson(res,200,{ok:true,deck:deckPublic(deck)});return true;}
        if(p[3]==='rating'){deck.ratings=(deck.ratings||[]).filter(r=>r.uid!==uid);deck.ratings.push({uid,username:cleanId(body.username,80),stars:Math.max(1,Math.min(5,Number(body.stars)||1)),createdAt:Date.now()});deck.updatedAt=Date.now();decks.set(id,deck);persist();writeJson(res,200,{ok:true,deck:deckPublic(deck)});return true;}
        if(p[3]==='comments'){const comment={id:'comment_'+Date.now(),uid,username:cleanId(body.username,80),text:cleanId(body.text,240),createdAt:Date.now()};deck.comments=(deck.comments||[]).concat(comment).slice(-80);deck.updatedAt=Date.now();decks.set(id,deck);persist();writeJson(res,200,{ok:true,deck:deckPublic(deck),comment});return true;}
      }
      if(p[1]==='marketplace'){
        if(req.method==='GET'&&p[2]==='listings'){await verifiedUid(req);const active=[...listings.values()].filter(x=>x.status==='active').sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));writeJson(res,200,{ok:true,listings:active.map(clone),transactions:marketplaceTransactions.slice(-80).map(clone)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid);
        if(req.method==='POST'&&p[2]==='listings'&&!p[3]){if(body.profile)mergeProfile(uid,body.profile);const pr=profile(uid),listingId='listing_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);const listing={listingId,type:body.type==='pfp'?'pfp':'card',cardId:cleanId(body.cardId),pfpId:Number(body.pfpId)||0,sellerUid:uid,seller:pr.chosenUsername||pr.displayName||'Player',sellerPhotoURL:pr.photoURL||pr.profileImg||null,price:Math.max(10,Number(body.price)||100),status:'active',createdAt:Date.now()};listings.set(listingId,listing);persist();writeJson(res,200,{ok:true,listing:clone(listing)});return true;}
        if(req.method==='POST'&&p[2]==='listings'&&p[3]){const listing=listings.get(cleanId(p[3]));if(!listing)throw Object.assign(new Error('listing not found'),{status:404});if(p[4]==='buy'){if(listing.sellerUid===uid)throw new Error('cannot buy own listing');listing.status='sold';listing.buyerUid=uid;listing.soldAt=Date.now();marketplaceTransactions.push(clone(listing));listings.set(listing.listingId,listing);}if(p[4]==='cancel'){if(listing.sellerUid!==uid)throw Object.assign(new Error('not listing owner'),{status:403});listing.status='cancelled';listings.set(listing.listingId,listing);}persist();writeJson(res,200,{ok:true,listing:clone(listing)});return true;}
        if(req.method==='POST'&&p[2]==='redeem'){const redeemed=marketplaceTransactions.filter(x=>x.sellerUid===uid&&x.status==='sold'&&!x.sellerRedeemed);for(const row of redeemed){row.sellerRedeemed=true;row.redeemedAt=Date.now();}persist();writeJson(res,200,{ok:true,redeemedStarlight:redeemed.reduce((n,x)=>n+Number(x.price||0),0),listings:clone(redeemed)});return true;}
      }
      return false;
    }catch(error){ writeJson(res,Number(error?.status)||400,{ok:false,error:String(error?.message||error)});return true; }
  }
  if(resetWarfrontForAuthorityUpgrade){snapshot.warfrontAuthorityBaseline=warfrontAuthorityBaseline;newWarfrontDeployment();flush();}
  return {
    handle,
    settleWarfrontForfeit,
    warfrontSpectatorSeat(matchId, uid){
      const binding=warfrontBindings.get(String(matchId));
      if(!uid || !binding || binding.mapCode!==warfrontEvent?.mapCode) return null;
      const team=['a','b'].find(t=>warfrontEvent.zones.some(z=>z[t]?.uid===uid));
      const zone=warfrontEvent.zones.find(z=>z.id===binding.zoneId);
      if(!team || !zone?.[team]?.uid) return null;
      const seat=binding.uids.indexOf(zone[team].uid);
      return seat===0 || seat===1 ? seat : null;
    },
    flush,
    counts:()=>({profiles:profiles.size,challengerResultReceipts:challengerResultReceipts.size,saves:saves.size,decks:decks.size,listings:listings.size,warfrontEvent:!!warfrontEvent}),
    testSanitizeWarfrontState:value=>sanitizeWarfrontState(value),
    testMergeWarfrontState:(current,incoming)=>mergeWarfrontState(sanitizeWarfrontState(current),sanitizeWarfrontState(incoming)),
    testApplyChallengerResult:(uid,body)=>applyChallengerResult(cleanId(uid,128),clone(body||{}))
  };
}
