'use strict';

const DEFAULT_LIMIT = 180;

function nowMs() {
  return Date.now();
}

function safeString(value, max = 240) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function shortHash(value) {
  const s = safeString(value, 160);
  return s ? s.slice(0, 12) : '';
}

function redactUid(uid) {
  const s = safeString(uid, 128);
  if (!s) return '';
  if (s.length <= 10) return s.slice(0, 3) + '...' + s.slice(-2);
  return s.slice(0, 6) + '...' + s.slice(-4);
}

function classifyIssue(input) {
  const text = safeString(input && (input.reason || input.error || input.message || input.event || input.type), 600).toLowerCase();
  const event = safeString(input && input.event, 80).toLowerCase();
  const type = safeString(input && input.actionType, 80).toUpperCase();
  const source = safeString(input && input.source, 80).toLowerCase();

  if (/token|firebase id|auth|uid does not match|missing uid/.test(text)) {
    return {
      code:'auth',
      severity:'error',
      title:'Auth or identity failure',
      fix:'Refresh Firebase auth, confirm the request uid matches the ID token, and retry joining the room.',
      inspect:['client auth state', 'request Authorization header', 'room playerOrder']
    };
  }
  if (/not seated|not in room|player index does not match|coin winner mismatch/.test(text)) {
    return {
      code:'seat-mismatch',
      severity:'error',
      title:'Client is acting as the wrong seat',
      fix:'Rejoin the room and rebuild local playerIndex from the server room playerOrder before sending actions.',
      inspect:['room playerOrder', 'client _onlinePlayerIndex', 'hello-ok playerIndex']
    };
  }
  if (/not this player turn|does not have priority|currentturnuid|turn mismatch/.test(text)) {
    return {
      code:'turn-mismatch',
      severity:'error',
      title:'Client and server disagree about turn ownership',
      fix:'Run action replay catch-up, compare currentTurnUid/currentPlayer, then force apply the server canonical state.',
      inspect:['server currentTurnUid', 'client currentPlayer', 'last accepted seq', 'baseStateHash']
    };
  }
  if (/base.*hash|state.*hash|hash mismatch|canonical|state gate|transition rejected/.test(text)) {
    return {
      code:'state-hash-mismatch',
      severity:'error',
      title:'Client action was based on stale or divergent state',
      fix:'Fetch /resume?includeState=1 for the room, apply canonicalState, then retry the action with the new baseStateHash.',
      inspect:['server canonicalHash', 'client stateHash', 'lastAppliedActionSeq', 'action payload baseStateHash']
    };
  }
  if (/pendinginteraction|pending interaction|pending picker|pending reaction|resolve /.test(text)) {
    return {
      code:'pending-interaction-block',
      severity:'error',
      title:'Server is waiting for a specific modal/picker/reaction',
      fix:'Send the matching RESOLVE_* intent for the pending interaction before any unrelated action.',
      inspect:['pendingInteraction.kind', 'pendingInteraction.playerIndex', 'pendingInteraction.promptId']
    };
  }
  if (/not implemented|unsupported|unknown action type/.test(text)) {
    return {
      code:'reducer-gap',
      severity:'error',
      title:'Strict reducer does not support this action path',
      fix:'Add or repair the server reducer branch for this normalized intent/card effect, then add a reducer smoke for it.',
      inspect:['normalized action type', 'card/effect id', 'pendingInteraction kind']
    };
  }
  if (/deck|40-card|card catalog|invalid card/.test(text)) {
    return {
      code:'deck-validation',
      severity:'error',
      title:'Deck or card catalog validation failed',
      fix:'Validate the selected deck has exactly 40 legal cards and that client/server card catalogs match.',
      inspect:['deckChoice.deckCount', 'invalid card id', 'card catalog smoke']
    };
  }
  if (/queue|matchmaking/.test(text) || event.indexOf('matchmaking') >= 0) {
    return {
      code:'matchmaking',
      severity:/fail|error|rejected/.test(text) ? 'error' : 'info',
      title:'Matchmaking lifecycle issue',
      fix:'Check queue entry, room status, deck readiness, and whether auto-start returned MATCH_START.',
      inspect:['matchmaking entries', 'room.status', 'host/guest deck ready', 'accepted MATCH_START']
    };
  }
  if (/disconnect|forfeit/.test(text) || type === 'DISCONNECT_TIMEOUT' || type === 'FORFEIT') {
    return {
      code:'disconnect',
      severity:'warn',
      title:'Disconnect or forfeit path',
      fix:'Check whether the disconnect timer finalized correctly and whether reward ledger was attached once.',
      inspect:['room endReason', 'resultLedger', 'disconnect timers']
    };
  }
  if (/websocket|socket|hello|connection|disconnected|closed|timeout/.test(text) || source === 'websocket') {
    return {
      code:/timeout/.test(text) ? 'transport-timeout' : 'transport',
      severity:/timeout|failed|closed|disconnected|error/.test(text) ? 'error' : 'warn',
      title:'WebSocket transport problem',
      fix:'Reconnect the authority socket, re-run hello, then resume action replay from the server lastSeq.',
      inspect:['socket readyState', 'hello-ok', 'server room sockets', 'lastSeq']
    };
  }
  if (/durable|firebase|rtdb|persist/.test(text)) {
    return {
      code:'durable-write',
      severity:'warn',
      title:'Durable write or RTDB persistence issue',
      fix:'Verify Fly store/RTDB mode and make sure accepted action replay still exists in room memory.',
      inspect:['FIREBASE_RTDB_DISABLED', 'durableWrite', 'eventLog length']
    };
  }

  return {
    code:'unknown',
    severity:event.indexOf('accepted') >= 0 ? 'info' : 'warn',
    title:'Unclassified multiplayer event',
    fix:'Inspect the timeline entry, compare client/server seq and hashes, then add a classifier for this failure if it repeats.',
    inspect:['timeline entry', 'client report', 'server room summary']
  };
}

function createRoomDiagnostics(room, time = nowMs()) {
  return {
    version:1,
    roomCode:safeString(room && room.code, 16),
    createdAt:time,
    updatedAt:time,
    counters:{
      accepted:0,
      rejected:0,
      errors:0,
      apiErrors:0,
      hello:0,
      disconnects:0,
      matchmaking:0
    },
    issueCounts:{},
    firstFailure:null,
    lastFailure:null,
    lastAccepted:null,
    lastRejected:null,
    lastClientReport:null,
    timeline:[]
  };
}

function ensureRoomDiagnostics(room) {
  if (!room) return null;
  if (!room.diagnostics || typeof room.diagnostics !== 'object') {
    room.diagnostics = createRoomDiagnostics(room);
  }
  if (!Array.isArray(room.diagnostics.timeline)) room.diagnostics.timeline = [];
  if (!room.diagnostics.counters || typeof room.diagnostics.counters !== 'object') room.diagnostics.counters = {};
  if (!room.diagnostics.issueCounts || typeof room.diagnostics.issueCounts !== 'object') room.diagnostics.issueCounts = {};
  return room.diagnostics;
}

function publicActionIdentity(action) {
  const payload = action && action.payload || {};
  return {
    seq:safeNumber(action && action.seq, 0),
    type:safeString(action && action.type, 80),
    uid:redactUid(action && action.uid),
    playerIndex:Number.isInteger(Number(payload.playerIndex)) ? Number(payload.playerIndex) : null,
    clientActionId:safeString(action && (action.clientActionId || payload.clientActionId), 120),
    stateHash:shortHash(payload.stateHash),
    baseStateHash:shortHash(payload.baseStateHash)
  };
}

function recordRoomDiagnostic(room, event, details = {}) {
  const diag = ensureRoomDiagnostics(room);
  if (!diag) return null;
  const time = nowMs();
  const action = details.action || null;
  const actionType = safeString(details.actionType || action && action.type || details.type, 80).toUpperCase();
  const reason = safeString(details.reason || details.error || details.message, 600);
  const classification = classifyIssue({
    event,
    reason,
    actionType,
    source:details.source
  });
  const entry = {
    at:time,
    ageMs:Math.max(0, time - safeNumber(room.createdAt, time)),
    event:safeString(event, 80),
    severity:details.severity || classification.severity,
    issue:classification.code,
    title:classification.title,
    reason,
    fix:classification.fix,
    inspect:classification.inspect,
    room:{
      status:safeString(room.status, 32),
      phase:safeString(room.phase, 32),
      lastSeq:safeNumber(room.lastSeq, 0),
      canonicalHash:shortHash(room.canonicalHash || room.lastStateHash),
      currentTurnUid:redactUid(room.currentTurnUid),
      sockets:room.sockets && room.sockets.size || 0
    },
    action:action ? publicActionIdentity(action) : {
      type:actionType,
      clientActionId:safeString(details.clientActionId, 120),
      playerIndex:Number.isInteger(Number(details.playerIndex)) ? Number(details.playerIndex) : null,
      baseStateHash:shortHash(details.baseStateHash)
    },
    uid:redactUid(details.uid),
    requestId:safeString(details.requestId, 120),
    source:safeString(details.source, 80)
  };
  if (details.extra && typeof details.extra === 'object') {
    entry.extra = {};
    Object.keys(details.extra).slice(0, 16).forEach(key => {
      const value = details.extra[key];
      entry.extra[key] = typeof value === 'number' || typeof value === 'boolean'
        ? value
        : safeString(value, 160);
    });
  }

  diag.updatedAt = time;
  diag.timeline.push(entry);
  const max = Math.max(20, Number(details.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT);
  if (diag.timeline.length > max) diag.timeline.splice(0, diag.timeline.length - max);

  const counters = diag.counters;
  if (entry.event.indexOf('accepted') >= 0) counters.accepted = safeNumber(counters.accepted, 0) + 1;
  else if (entry.event.indexOf('rejected') >= 0) counters.rejected = safeNumber(counters.rejected, 0) + 1;
  else if (entry.event.indexOf('api-error') >= 0) counters.apiErrors = safeNumber(counters.apiErrors, 0) + 1;
  else if (entry.event.indexOf('error') >= 0) counters.errors = safeNumber(counters.errors, 0) + 1;
  else if (entry.event.indexOf('hello') >= 0) counters.hello = safeNumber(counters.hello, 0) + 1;
  else if (entry.event.indexOf('disconnect') >= 0) counters.disconnects = safeNumber(counters.disconnects, 0) + 1;
  else if (entry.event.indexOf('matchmaking') >= 0) counters.matchmaking = safeNumber(counters.matchmaking, 0) + 1;

  if (!(entry.severity === 'info' && entry.issue === 'unknown')) {
    diag.issueCounts[entry.issue] = safeNumber(diag.issueCounts[entry.issue], 0) + 1;
  }
  if (entry.event.indexOf('accepted') >= 0) diag.lastAccepted = entry;
  if (entry.event.indexOf('rejected') >= 0) diag.lastRejected = entry;
  if (entry.severity === 'error' || entry.event.indexOf('error') >= 0 || entry.event.indexOf('rejected') >= 0) {
    if (!diag.firstFailure) diag.firstFailure = entry;
    diag.lastFailure = entry;
  }
  return entry;
}

function recordClientReport(room, report, uid) {
  const diag = ensureRoomDiagnostics(room);
  if (!diag) return null;
  const safe = report && typeof report === 'object' ? report : {};
  diag.lastClientReport = {
    at:nowMs(),
    uid:redactUid(uid),
    room:safeString(safe.room || safe.roomCode, 16),
    localPlayer:Number.isInteger(Number(safe.localPlayer)) ? Number(safe.localPlayer) : null,
    currentPlayer:Number.isInteger(Number(safe.currentPlayer)) ? Number(safe.currentPlayer) : null,
    turn:safeNumber(safe.turn, 0),
    actionSeq:safeNumber(safe.actionSeq, 0),
    appliedSeq:safeNumber(safe.appliedSeq, 0),
    hash:shortHash(safe.hash || safe.stateHash),
    boardCount:Array.isArray(safe.board) ? safe.board.length : safeNumber(safe.boardCount, 0),
    authorityStatus:safe.authorityStatus && typeof safe.authorityStatus === 'object' ? {
      joined:!!safe.authorityStatus.joined,
      readyState:safeNumber(safe.authorityStatus.readyState, -1),
      inflight:safeNumber(safe.authorityStatus.inflight, 0),
      lastRetryReason:safeString(safe.authorityStatus.lastRetryReason, 180),
      lastRejectedResyncReason:safeString(safe.authorityStatus.lastRejectedResyncReason, 180)
    } : null,
    render:safe.render && typeof safe.render === 'object' ? {
      renderedBoardMatchesCanonical:!!safe.render.renderedBoardMatchesCanonical,
      renderMismatchReason:safeString(safe.render.renderMismatchReason, 180),
      canonicalBoardCount:safeNumber(safe.render.canonicalBoardCount, 0),
      renderedBoardCount:safeNumber(safe.render.renderedBoardCount, 0),
      renderedBoardSource:safeString(safe.render.renderedBoardSource, 80)
    } : null
  };
  recordRoomDiagnostic(room, 'client-report', {
    uid,
    reason:diag.lastClientReport.render && !diag.lastClientReport.render.renderedBoardMatchesCanonical
      ? diag.lastClientReport.render.renderMismatchReason
      : 'client diagnostic report received',
    source:'client',
    severity:diag.lastClientReport.render && !diag.lastClientReport.render.renderedBoardMatchesCanonical ? 'warn' : 'info',
    extra:{
      actionSeq:diag.lastClientReport.actionSeq,
      appliedSeq:diag.lastClientReport.appliedSeq,
      hash:diag.lastClientReport.hash,
      boardCount:diag.lastClientReport.boardCount
    }
  });
  return diag.lastClientReport;
}

function diagnoseRoom(room) {
  const diag = ensureRoomDiagnostics(room);
  const issues = Object.entries(diag.issueCounts || {})
    .sort((a, b)=>safeNumber(b[1], 0) - safeNumber(a[1], 0))
    .map(([code, count])=>({code, count}));
  const currentPlayer = Number(room && room.canonicalState && room.canonicalState.currentPlayer);
  const expectedTurnUid = Number.isInteger(currentPlayer) ? room.playerOrder && room.playerOrder[currentPlayer] : '';
  const problems = [];
  if (room && room.status === 'playing' && expectedTurnUid && room.currentTurnUid && expectedTurnUid !== room.currentTurnUid) {
    problems.push({
      code:'current-turn-uid-mismatch',
      severity:'error',
      message:'room.currentTurnUid does not match canonicalState.currentPlayer',
      fix:'Patch room.currentTurnUid from canonicalState/currentPlayer or rebuild room state from canonical postState.'
    });
  }
  if (room && room.status === 'playing' && !room.canonicalState) {
    problems.push({
      code:'missing-canonical-state',
      severity:'error',
      message:'playing room has no canonicalState',
      fix:'Replay from MATCH_START or reject action start until server bootstrap state exists.'
    });
  }
  if (diag.lastClientReport && diag.lastClientReport.hash && room && room.canonicalHash && diag.lastClientReport.hash !== shortHash(room.canonicalHash)) {
    problems.push({
      code:'client-server-hash-diverged',
      severity:'error',
      message:'latest client report hash differs from server canonicalHash',
      fix:'Client should fetch /resume?includeState=1 and apply server canonicalState before sending more actions.'
    });
  }
  if (diag.lastClientReport && room && safeNumber(diag.lastClientReport.appliedSeq, 0) < safeNumber(room.lastSeq, 0)) {
    problems.push({
      code:'client-action-replay-behind',
      severity:'warn',
      message:'latest client report has not applied all server actions',
      fix:'Resume action replay from the reported appliedSeq and compare the first missing action.'
    });
  }
  if (diag.lastClientReport && diag.lastClientReport.render && !diag.lastClientReport.render.renderedBoardMatchesCanonical) {
    problems.push({
      code:'client-render-mismatch',
      severity:'warn',
      message:'latest client report says rendered board does not match canonical board',
      fix:'Force render cache invalidation, inspect render dirty source, and compare rendered/canonical board counts.'
    });
  }
  if (room && room.status === 'playing') {
    const host = room.players && room.players[room.hostUid];
    const guest = room.players && room.players[room.guestUid];
    if (!host || !guest) problems.push({
      code:'missing-player-node',
      severity:'error',
      message:'playing room is missing host or guest player node',
      fix:'Inspect room creation/join path; do not start room until both player nodes exist.'
    });
  }
  return {
    ok:problems.every(item=>item.severity !== 'error') && !diag.lastFailure,
    issueCounts:issues,
    problems,
    lastFailure:diag.lastFailure,
    recommendations:[
      ...(diag.lastFailure ? [diag.lastFailure.fix] : []),
      ...problems.map(item=>item.fix)
    ].filter(Boolean).slice(0, 8)
  };
}

function publicRoomDiagnostics(room, opts = {}) {
  const diag = ensureRoomDiagnostics(room);
  const limit = Math.min(300, Math.max(1, Number(opts.limit || 80) || 80));
  return {
    version:diag.version || 1,
    roomCode:room && room.code || diag.roomCode || '',
    generatedAt:nowMs(),
    room:{
      status:safeString(room && room.status, 32),
      phase:safeString(room && room.phase, 32),
      mode:safeString(room && room.mode, 32),
      lastSeq:safeNumber(room && room.lastSeq, 0),
      canonicalHash:shortHash(room && (room.canonicalHash || room.lastStateHash)),
      currentTurnUid:redactUid(room && room.currentTurnUid),
      playerOrder:{
        0:redactUid(room && room.playerOrder && room.playerOrder[0]),
        1:redactUid(room && room.playerOrder && room.playerOrder[1])
      },
      sockets:room && room.sockets && room.sockets.size || 0,
      eventCount:Array.isArray(room && room.eventLog) ? room.eventLog.length : 0
    },
    counters:diag.counters || {},
    issueCounts:diag.issueCounts || {},
    diagnosis:diagnoseRoom(room),
    firstFailure:diag.firstFailure || null,
    lastFailure:diag.lastFailure || null,
    lastAccepted:diag.lastAccepted || null,
    lastRejected:diag.lastRejected || null,
    lastClientReport:diag.lastClientReport || null,
    timeline:(diag.timeline || []).slice(-limit)
  };
}

function publicSystemDiagnostics(rooms, matchmaking, opts = {}) {
  const list = Array.from(rooms && rooms.values ? rooms.values() : []);
  const roomReports = list
    .map(room => publicRoomDiagnostics(room, {limit:Number(opts.roomLimit || 12) || 12}))
    .sort((a, b)=>safeNumber(b.generatedAt, 0) - safeNumber(a.generatedAt, 0));
  const recentFailures = roomReports
    .map(report=>report.lastFailure)
    .filter(Boolean)
    .sort((a, b)=>safeNumber(b.at, 0) - safeNumber(a.at, 0))
    .slice(0, 20);
  const issueCounts = {};
  roomReports.forEach(report=>{
    Object.entries(report.issueCounts || {}).forEach(([code, count])=>{
      issueCounts[code] = safeNumber(issueCounts[code], 0) + safeNumber(count, 0);
    });
  });
  return {
    ok:recentFailures.length === 0,
    generatedAt:nowMs(),
    rooms:list.length,
    activeRooms:list.filter(room=>room.status && room.status !== 'ended').length,
    matchmakingEntries:matchmaking && matchmaking.size || 0,
    issueCounts,
    recentFailures,
    roomsWithProblems:roomReports
      .filter(report=>report.lastFailure || (report.diagnosis && report.diagnosis.problems && report.diagnosis.problems.length))
      .slice(0, Math.min(50, Math.max(1, Number(opts.limit || 20) || 20)))
  };
}

module.exports = {
  classifyIssue,
  createRoomDiagnostics,
  ensureRoomDiagnostics,
  recordRoomDiagnostic,
  recordClientReport,
  publicRoomDiagnostics,
  publicSystemDiagnostics,
  redactUid,
  shortHash
};
