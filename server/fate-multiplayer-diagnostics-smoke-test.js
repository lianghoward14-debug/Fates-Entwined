#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  classifyIssue,
  createRoomDiagnostics,
  recordRoomDiagnostic,
  recordClientReport,
  publicRoomDiagnostics,
  publicSystemDiagnostics
} = require('./fate-multiplayer-diagnostics');

function makeRoom() {
  const createdAt = Date.now() - 1000;
  const room = {
    code:'DIAG1',
    mode:'ranked',
    status:'playing',
    phase:'main',
    createdAt,
    lastSeq:7,
    canonicalHash:'server-hash-abcdef123456',
    currentTurnUid:'uid-host-123456',
    hostUid:'uid-host-123456',
    guestUid:'uid-guest-654321',
    playerOrder:['uid-host-123456', 'uid-guest-654321'],
    players:{
      'uid-host-123456':{name:'Host'},
      'uid-guest-654321':{name:'Guest'}
    },
    canonicalState:{
      currentPlayer:0,
      turn:3,
      board:[{id:'card-a'}, {id:'card-b'}]
    },
    sockets:new Set([{}]),
    eventLog:[{seq:1}, {seq:2}],
    diagnostics:null
  };
  room.diagnostics = createRoomDiagnostics(room, createdAt);
  return room;
}

assert.strictEqual(classifyIssue({reason:'not this player turn'}).code, 'turn-mismatch');
assert.strictEqual(classifyIssue({reason:'baseStateHash mismatch'}).code, 'state-hash-mismatch');
assert.strictEqual(classifyIssue({reason:'blocked by pendingInteraction=card-picker'}).code, 'pending-interaction-block');
assert.strictEqual(classifyIssue({reason:'unsupported action type RESOLVE_SIDEWAYS'}).code, 'reducer-gap');
assert.strictEqual(classifyIssue({event:'socket-disconnect-timer-scheduled'}).code, 'disconnect');

const room = makeRoom();
recordRoomDiagnostic(room, 'room-created', {source:'server', severity:'info'});
assert.strictEqual(room.diagnostics.issueCounts.unknown, undefined);

const rejected = recordRoomDiagnostic(room, 'action-rejected', {
  action:{seq:8, type:'PLACE_CARD', uid:'uid-guest-654321', payload:{playerIndex:1, baseStateHash:'client-old-hash'}},
  reason:'not this player turn',
  source:'websocket'
});
assert.strictEqual(rejected.issue, 'turn-mismatch');
assert.match(rejected.fix, /currentTurnUid/);

const accepted = recordRoomDiagnostic(room, 'action-accepted', {
  action:{seq:9, type:'END_TURN', uid:'uid-host-123456', payload:{playerIndex:0}},
  source:'websocket',
  severity:'info'
});
assert.strictEqual(accepted.severity, 'info');
assert.strictEqual(room.diagnostics.counters.accepted, 1);
assert.strictEqual(room.diagnostics.counters.rejected, 1);
assert.strictEqual(room.diagnostics.issueCounts['turn-mismatch'], 1);

const clientReport = recordClientReport(room, {
  room:'DIAG1',
  localPlayer:1,
  currentPlayer:0,
  turn:3,
  actionSeq:9,
  appliedSeq:6,
  hash:'client-hash-different',
  boardCount:1,
  authorityStatus:{joined:true, readyState:1, inflight:1, lastRejectedResyncReason:'state hash mismatch'},
  render:{
    renderedBoardMatchesCanonical:false,
    renderMismatchReason:'rendered board count mismatch',
    canonicalBoardCount:2,
    renderedBoardCount:1,
    renderedBoardSource:'render-v2'
  }
}, 'uid-guest-654321');
assert.strictEqual(clientReport.render.renderedBoardMatchesCanonical, false);

const report = publicRoomDiagnostics(room, {limit:20});
assert.strictEqual(report.roomCode, 'DIAG1');
assert.strictEqual(report.lastRejected.issue, 'turn-mismatch');
assert.ok(report.timeline.length >= 3);
assert.ok(report.diagnosis.problems.some(item => item.code === 'client-server-hash-diverged'));
assert.ok(report.diagnosis.problems.some(item => item.code === 'client-action-replay-behind'));
assert.ok(report.diagnosis.problems.some(item => item.code === 'client-render-mismatch'));
assert.ok(report.diagnosis.recommendations.some(text => /resume\?includeState=1/.test(text)));

const system = publicSystemDiagnostics(new Map([[room.code, room]]), new Map([['uid-waiting', {}]]), {limit:10});
assert.strictEqual(system.rooms, 1);
assert.strictEqual(system.activeRooms, 1);
assert.strictEqual(system.matchmakingEntries, 1);
assert.ok(system.recentFailures.length >= 1);
assert.ok(system.roomsWithProblems.length >= 1);

console.log('fate-multiplayer-diagnostics smoke passed');
