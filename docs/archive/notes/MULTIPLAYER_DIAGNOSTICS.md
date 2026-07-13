# Multiplayer Diagnostics

This is the multiplayer failure capture system for Fly-authoritative games. It is meant to answer three questions quickly:

- What went wrong?
- Which client/server state disagreed?
- What should be fixed next?

## Browser Capture

Open DevTools on a player tab and run:

```js
fateOnlineDiagnosticsReport()
```

That returns local room, player, turn, action sequence, state hash, WebSocket authority status, render convergence, and the recent local online diagnostics timeline.

To attach the browser report to the authoritative room on the server:

```js
await fateSubmitOnlineDiagnostics()
```

The submit helper posts to:

```text
POST /api/rooms/:code/diagnostics/client
```

Use this when a browser looks wrong, is stuck on a picker, cannot act, sees a stale board, or accepts/rejects actions differently from the other client.

## Server Endpoints

All diagnostics endpoints require the same Firebase bearer auth as the rest of the room API.

```text
GET /api/diagnostics?limit=20
```

Returns a system-level summary: active room count, matchmaking count, aggregated issue buckets, recent failures, and rooms with problems.

```text
GET /api/rooms/:code/diagnostics?limit=120
```

Returns one room's counters, issue counts, diagnosis, latest client report, last accepted/rejected action, and a redacted timeline.

```text
POST /api/rooms/:code/diagnostics/client
```

Stores a client report from a seated player or spectator and immediately re-runs room diagnosis.

## Failure Buckets

`auth`: Firebase token, uid, or identity mismatch. Refresh auth, confirm the bearer token uid, then rejoin.

`seat-mismatch`: The browser is acting as the wrong player index. Rebuild local player index from server `playerOrder`.

`turn-mismatch`: Client and server disagree about whose turn it is. Compare `currentTurnUid`, `currentPlayer`, and force-apply server canonical state.

`state-hash-mismatch`: Client sent an action from stale/divergent state. Fetch `/resume?includeState=1`, apply `canonicalState`, then retry.

`pending-interaction-block`: Server is waiting for a specific picker/modal/reaction. Send the matching `RESOLVE_*` intent before other actions.

`reducer-gap`: Strict server reducer does not support the action/card effect path. Fix the reducer branch and add a smoke test.

`deck-validation`: Deck or card catalog mismatch. Validate the selected deck and server/client catalog.

`matchmaking`: Queue, join, or auto-start lifecycle failed. Inspect queue entry, room status, ready decks, and `MATCH_START`.

`transport` / `transport-timeout`: WebSocket connect, hello, close, or action timeout. Reconnect, re-run hello, and resume replay from server `lastSeq`.

`disconnect`: Disconnect timer or forfeit path. Check end reason, result ledger, and whether the disconnect finalized once.

`durable-write`: Persistence or RTDB/Fly store mismatch. Confirm mode flags and room event log durability.

## Development Checks

Run the focused diagnostics smoke:

```bash
npm run smoke:multiplayer-diagnostics
```

The Fly cutover preflight also runs this smoke, and the static readiness smoke asserts that the browser helpers and server endpoints remain wired.
