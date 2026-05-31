# Multiplayer Testing — Same Device, Two Accounts

## Setup

The Electron app supports running a second instance with an isolated session via the `--session=` flag in `electron/main.js`. This gives the second instance its own cookie jar and Firebase auth state so you can sign in with a different Google account.

1. Launch the first instance normally: `npm start` (from the project root)
2. Launch the second instance with: `npx electron . --session=player2` (from the project root)

The first instance binds the static server to port 47891; the second instance auto-falls back to a random port (handled in `main.js` lines 66-80). The `--session=player2` flag creates a separate Electron partition (`persist:player2`) so auth/cookies are isolated.

## How It Works

- `electron/main.js` checks `process.argv` for `--session=<name>` on startup
- If found, the BrowserWindow's `webPreferences.partition` is set to `persist:<name>`
- The `persist:` prefix means the session data (cookies, localStorage, IndexedDB) is saved to disk and survives restarts
- Without the flag, both instances share the default session and can only use one Google account

## Known Issue — Lobby Kick

Players may get kicked from the lobby shortly after joining. The root cause involves the connection heartbeat and disconnect detection flow:

- **Connection heartbeat** (`startConnectionHeartbeat` in `src/scripts/18-online-rooms.js` ~line 1099): Listens to Firebase `.info/connected` and re-asserts `connected: true` when the WebSocket reconnects
- **Disconnect detection** (`maybeHandleOpponentDisconnect` ~line 608): If the opponent's `connected` field is `false` for 10 seconds, calls `endOnlineMatchBecauseOpponentLeft` which shows a forfeit screen and sets the room status to `ended`
- **Previous bug (fixed)**: `watchRoom()` calls `clearRoomWatchers()` which calls `stopConnectionHeartbeat()`, killing the heartbeat immediately after it was started in `createRoom`/`joinRoom`. Fixed by moving `startConnectionHeartbeat` to run after `watchRoom`
- **Remaining issue**: Players still get kicked — further debugging needed in the `onDisconnect` handler behavior when two Electron instances share the same machine. The `onDisconnect` at ~line 1091 sets `connected: false` when the Firebase WebSocket drops; on the same machine with two instances, transient connection events may cause false disconnects

## Key Files

- `electron/main.js` — Session partition logic (lines 93-106)
- `src/scripts/18-online-rooms.js` — All online room/multiplayer logic
  - `startConnectionHeartbeat` (~line 1099) — Reconnection heartbeat
  - `setConnectedOnDisconnect` (~line 1090) — Firebase onDisconnect handler
  - `maybeHandleOpponentDisconnect` (~line 608) — 10s disconnect timer
  - `endOnlineMatchBecauseOpponentLeft` (~line 587) — Forfeit/kick logic
  - `startRoomGame` (~line 1418) — Game bootstrap when room status changes
  - `handleWatchedRoom` (~line 1226) — Room field change handler
