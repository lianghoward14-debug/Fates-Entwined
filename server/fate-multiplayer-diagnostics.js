'use strict';

const MAX_TIMELINE = 120;
const MAX_CLIENT_REPORTS = 40;

function now(){
  return Date.now();
}

function safeString(value, fallback = ''){
  return String(value ?? fallback).slice(0, 500);
}

function classifyIssue(input = {}){
  const event = safeString(input.event).toLowerCase();
  const reason = safeString(input.reason).toLowerCase();
  const text = `${event} ${reason}`;
  if(/turn|not this player|currentturn/.test(text)){
    return {
      code:'turn-mismatch',
      severity:'warn',
      fix:'Compare currentTurnUid, playerIndex, and the client action author before accepting the action.'
    };
  }
  if(/hash|basestatehash|state hash/.test(text)){
    return {
      code:'state-hash-mismatch',
      severity:'warn',
      fix:'Force a room resume?includeState=1 resync before accepting more client actions.'
    };
  }
  if(/pendinginteraction|pending interaction|card-picker|zone-picker|modal|prompt/.test(text)){
    return {
      code:'pending-interaction-block',
      severity:'warn',
      fix:'Resolve or replay the pending server prompt before accepting unrelated actions.'
    };
  }
  if(/unsupported|reducer-gap|not implemented/.test(text)){
    return {
      code:'reducer-gap',
      severity:'error',
      fix:'Mirror the singleplayer mechanic in the authority reducer or server prompt bridge.'
    };
  }
  if(/disconnect|socket/.test(text)){
    return {
      code:'disconnect',
      severity:'info',
      fix:'Persist connected=false and rearm disconnect timers across restarts.'
    };
  }
  return {
    code:'unknown',
    severity:'info',
    fix:'Inspect the room timeline, rejected reason, and latest client diagnostics.'
  };
}

function createRoomDiagnostics(room, createdAt = now()){
  return {
    roomCode:safeString(room?.code).slice(0, 12),
    createdAt,
    updatedAt:createdAt,
    counters:{accepted:0, rejected:0, clientReports:0},
    issueCounts:{},
    timeline:[],
    clientReports:[],
    lastRejected:null,
    lastAccepted:null,
    lastClientReport:null
  };
}

function ensureDiagnostics(room){
  if(!room) return null;
  if(!room.diagnostics || typeof room.diagnostics !== 'object'){
    room.diagnostics = createRoomDiagnostics(room, room.createdAt || now());
  }
  return room.diagnostics;
}

function pushTimeline(diagnostics, entry){
  diagnostics.timeline.push(entry);
  if(diagnostics.timeline.length > MAX_TIMELINE){
    diagnostics.timeline.splice(0, diagnostics.timeline.length - MAX_TIMELINE);
  }
}

function publicAction(action){
  if(!action || typeof action !== 'object') return null;
  return {
    seq:Number(action.seq || 0) || 0,
    uid:safeString(action.uid).slice(0, 128),
    type:safeString(action.type).slice(0, 64),
    playerIndex:Number.isInteger(action.payload?.playerIndex) ? action.payload.playerIndex : null,
    baseStateHash:safeString(action.payload?.baseStateHash || action.baseStateHash).slice(0, 80)
  };
}

function recordRoomDiagnostic(room, event, details = {}){
  const diagnostics = ensureDiagnostics(room);
  if(!diagnostics) return null;
  const issue = classifyIssue({event, reason:details.reason});
  const severity = safeString(details.severity || issue.severity || 'info').slice(0, 24);
  const entry = {
    at:now(),
    event:safeString(event).slice(0, 96),
    severity,
    issue:issue.code,
    fix:issue.fix,
    source:safeString(details.source || 'server').slice(0, 64),
    uid:safeString(details.uid || details.action?.uid).slice(0, 128),
    reason:safeString(details.reason).slice(0, 300),
    action:publicAction(details.action),
    extra:details.extra && typeof details.extra === 'object' ? Object.assign({}, details.extra) : undefined
  };
  diagnostics.updatedAt = entry.at;
  pushTimeline(diagnostics, entry);
  if(issue.code !== 'unknown'){
    diagnostics.issueCounts[issue.code] = (Number(diagnostics.issueCounts[issue.code] || 0) || 0) + 1;
  }
  if(entry.event === 'action-rejected'){
    diagnostics.counters.rejected += 1;
    diagnostics.lastRejected = entry;
  }else if(entry.event === 'action-accepted'){
    diagnostics.counters.accepted += 1;
    diagnostics.lastAccepted = entry;
  }
  return entry;
}

function recordClientReport(room, report = {}, uid = ''){
  const diagnostics = ensureDiagnostics(room);
  if(!diagnostics) return null;
  const entry = {
    at:now(),
    uid:safeString(uid || report.uid).slice(0, 128),
    room:safeString(report.room || room.code).slice(0, 12),
    localPlayer:Number.isInteger(report.localPlayer) ? report.localPlayer : null,
    currentPlayer:Number.isInteger(report.currentPlayer) ? report.currentPlayer : null,
    turn:Number(report.turn || 0) || 0,
    actionSeq:Number(report.actionSeq || 0) || 0,
    appliedSeq:Number(report.appliedSeq || 0) || 0,
    hash:safeString(report.hash).slice(0, 80),
    boardCount:Number(report.boardCount || 0) || 0,
    authorityStatus:report.authorityStatus && typeof report.authorityStatus === 'object' ? Object.assign({}, report.authorityStatus) : {},
    render:report.render && typeof report.render === 'object' ? Object.assign({}, report.render) : {}
  };
  diagnostics.updatedAt = entry.at;
  diagnostics.counters.clientReports += 1;
  diagnostics.clientReports.push(entry);
  if(diagnostics.clientReports.length > MAX_CLIENT_REPORTS){
    diagnostics.clientReports.splice(0, diagnostics.clientReports.length - MAX_CLIENT_REPORTS);
  }
  diagnostics.lastClientReport = entry;
  pushTimeline(diagnostics, {
    at:entry.at,
    event:'client-report',
    severity:'info',
    issue:'client-report',
    source:'client',
    uid:entry.uid,
    reason:safeString(entry.render.renderMismatchReason || entry.authorityStatus.lastRejectedResyncReason).slice(0, 300)
  });
  return entry;
}

function diagnoseRoom(room){
  const problems = [];
  const recommendations = [];
  const diagnostics = room?.diagnostics || {};
  const report = diagnostics.lastClientReport || {};
  const latestHash = safeString(room?.canonicalHash || room?.lastStateHash);
  if(report.hash && latestHash && report.hash !== latestHash){
    problems.push({code:'client-server-hash-diverged', severity:'warn'});
    recommendations.push('Have the client call resume?includeState=1 and replace local canonical state before sending more actions.');
  }
  if(Number(report.appliedSeq || 0) < Number(room?.lastSeq || 0)){
    problems.push({code:'client-action-replay-behind', severity:'warn'});
    recommendations.push('Replay missing accepted events from the room resume endpoint before accepting input.');
  }
  if(report.render?.renderedBoardMatchesCanonical === false){
    problems.push({code:'client-render-mismatch', severity:'warn'});
    recommendations.push('Compare render-v2 board output against the canonical board from resume?includeState=1.');
  }
  if(diagnostics.lastRejected?.issue){
    problems.push({code:diagnostics.lastRejected.issue, severity:diagnostics.lastRejected.severity || 'warn'});
  }
  return {problems, recommendations};
}

function publicRoomDiagnostics(room, opts = {}){
  const diagnostics = ensureDiagnostics(room);
  const limit = Math.max(1, Math.min(200, Number(opts.limit || 80) || 80));
  return {
    roomCode:safeString(room?.code).slice(0, 12),
    status:safeString(room?.status).slice(0, 32),
    phase:safeString(room?.phase).slice(0, 32),
    lastSeq:Number(room?.lastSeq || 0) || 0,
    canonicalHash:safeString(room?.canonicalHash || room?.lastStateHash).slice(0, 80),
    currentTurnUid:safeString(room?.currentTurnUid).slice(0, 128),
    counters:Object.assign({}, diagnostics.counters),
    issueCounts:Object.assign({}, diagnostics.issueCounts),
    lastRejected:diagnostics.lastRejected,
    lastAccepted:diagnostics.lastAccepted,
    lastClientReport:diagnostics.lastClientReport,
    timeline:diagnostics.timeline.slice(-limit),
    diagnosis:diagnoseRoom(room)
  };
}

function publicSystemDiagnostics(rooms, matchmaking, opts = {}){
  const limit = Math.max(1, Math.min(200, Number(opts.limit || 40) || 40));
  const roomList = rooms instanceof Map ? [...rooms.values()] : [];
  const reports = roomList.map(room=>publicRoomDiagnostics(room, {limit:5}));
  const withProblems = reports.filter(report=>report.diagnosis.problems.length || report.lastRejected);
  const recentFailures = reports
    .flatMap(report=>report.timeline.filter(item=>item.severity === 'warn' || item.severity === 'error').map(item=>Object.assign({roomCode:report.roomCode}, item)))
    .sort((a, b)=>(Number(b.at || 0) || 0) - (Number(a.at || 0) || 0))
    .slice(0, limit);
  return {
    rooms:roomList.length,
    activeRooms:roomList.filter(room=>room.status !== 'ended').length,
    matchmakingEntries:matchmaking instanceof Map ? matchmaking.size : 0,
    recentFailures,
    roomsWithProblems:withProblems.slice(0, limit)
  };
}

module.exports = {
  classifyIssue,
  createRoomDiagnostics,
  recordRoomDiagnostic,
  recordClientReport,
  publicRoomDiagnostics,
  publicSystemDiagnostics
};
