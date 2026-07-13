# Client-Resolved Multiplayer Handoff

Date: 2026-06-27

## Why This Document Exists

The current Fly multiplayer migration has been trying to make gameplay fully server-authoritative. That means the server must understand every card rule, every target picker, every pending modal, every passive, every copied effect, every consolidation rule, and every weird interaction that already exists in the singleplayer browser engine.

That is the main reason multiplayer has been so hard to stabilize. The browser already has the complete rules engine. The server reducer only has partial coverage. Every unsupported card or picker can become a rejection, rollback, stale turn, unresponsive end turn, or state mismatch.

The recommended reset is:

**Keep Fly for live multiplayer, but downgrade gameplay authority to server-ordered, client-resolved state sync.**

In plain English: make multiplayer behave like singleplayer over the network. The active player's browser runs the existing local game logic, then sends the resulting canonical game state to Fly. Fly validates basic safety and broadcasts that state to both players.

This is not tournament-grade anti-cheat. It is the fastest path to playable multiplayer.

## Current Repo Context

Workspace:

`C:\Users\liang\OneDrive\Desktop\Fates Entwined main`

Important files:

- `src/scripts/18-online-rooms.js`
  - Client online room logic.
  - WebSocket authority connection.
  - Optimistic action send path.
  - Post-state capture/apply helpers.
  - Current strict compact action behavior.

- `server/fate-ws-authority.js`
  - Fly WebSocket/HTTP authority server.
  - Room creation, queue, lobby, start, events, diagnostics, result ledger.
  - Calls the reducer for gameplay actions.

- `server/fate-authority-reducer.js`
  - Current strict reducer.
  - It implements some server-side card logic but not enough for the whole game.
  - This should stop being the primary way ordinary gameplay works in the new system.

- `fly.toml`
  - Live Fly app runs `node server/fate-ws-authority.js`.
  - Current environment has `FATE_WS_REDUCER_MODE = 'strict'`.
  - Firebase RTDB gameplay fallback is disabled with `FATE_WS_DISABLE_FIREBASE_RTDB = '1'` and `FATE_RTDB_DISABLED = '1'`.

- `MULTIPLAYER_DIAGNOSTICS.md`
  - Existing diagnostics context.

- `MULTIPLAYER_AUTHORITY_RESET_HANDOFF.md`
  - Older strict-authority/reset context. Useful historically, but this new plan intentionally changes direction.

Useful smoke scripts from `package.json`:

- `npm.cmd run smoke:fly-test-readiness`
- `npm.cmd run smoke:ws-authority`
- `npm.cmd run smoke:multiplayer-diagnostics`
- `npm.cmd run smoke:authority-reducer`
- `npm.cmd run smoke:fly-store`
- `npm.cmd run smoke:fly-live-readiness`

Recent deployed cache-bust marker at the time this handoff was written:

- `index.html` loads `./src/scripts/18-online-rooms.js?v=1782607200`

## Target Architecture

### What Fly Should Own

Fly should remain the live multiplayer backend.

Fly owns:

- matchmaking queue
- room creation/join/resume
- WebSocket connections
- player identity and room roles
- whose turn it is
- action ordering
- base-state hash checks
- canonical state storage
- canonical state broadcast
- disconnect handling
- surrender/forfeit
- match result ledger
- diagnostics

### What The Browser Should Own

The active player's browser owns gameplay resolution.

Browser resolves:

- card placement behavior
- effect activation
- when-set effects
- target pickers
- modals
- consolidations
- passives
- copied effects
- landscape effects
- hand/discard/deck movement
- animation-side local UX

The browser already does this in singleplayer. The new multiplayer path should reuse that.

### What Firebase Should Own

Firebase can still be used for account/login or long-lived player/profile data if the repo still needs it.

Firebase should not be used for live match gameplay actions.

Do not revive RTDB room/action fallback for live games. The project has repeatedly suffered from hybrid behavior where multiple sync paths compete.

## New Action Model

Introduce a new gameplay action type. Suggested name:

`ACTION_RESULT`

Alternative acceptable names:

- `CLIENT_RESOLVED_ACTION`
- `COMMIT_CLIENT_STATE`
- `GAMEPLAY_STATE_COMMIT`

Use one name consistently. `ACTION_RESULT` is shortest and clear enough.

### Client Sends

The active player's browser sends:

```js
{
  type: 'ACTION_RESULT',
  payload: {
    playerIndex,
    turn,
    actionKind,          // e.g. CLICK_CELL, END_TURN, BOARD_ACTION, PICK_ZONE
    clientActionId,
    baseStateHash,
    postState,
    stateHash,
    summary: {
      cardId,
      cardName,
      source,
      target
    }
  }
}
```

`summary` is for diagnostics only. The server should not depend on it for correctness.

### Server Checks

Fly should validate:

- room exists
- sender is a player in that room
- sender maps to `payload.playerIndex`
- player is allowed to act right now
- `baseStateHash` equals current canonical hash
- `stateHash` equals a stable hash of `postState`
- `postState` has a valid game-state shape
- `postState.currentPlayer`, `turn`, and phase are sane for the action kind
- optional: no impossible player-count/board-size/hand-shape corruption

Fly should not try to re-run the card effect.

### Server Accepts

If valid:

- set room canonical state to `postState`
- set canonical hash to `stateHash`
- append accepted event with sequence number
- broadcast accepted event to both WebSocket clients immediately
- persist/store on the existing Fly durability path

### Server Rejects

If invalid:

- reject the action with a specific reason
- send current canonical state/hash back to the client
- client applies canonical state immediately
- do not leave the client in lag-pause purgatory

## Why This Should Feel Like Singleplayer

The local browser should run the exact same code path as singleplayer first.

For example:

1. Player clicks a card effect.
2. Local game opens the normal singleplayer picker/modal if needed.
3. Player confirms.
4. Local game mutates `G` exactly like singleplayer.
5. Client captures canonical state.
6. Client sends `ACTION_RESULT`.
7. Fly broadcasts the resulting state.
8. Opponent applies the canonical state directly.

The opponent should not have to replay the effect. They should just receive the resulting board/hand/discard/deck state.

## Implementation Plan

### Phase 1: Add A New Compatibility Mode

Add an explicit mode instead of overloading `strict`.

Suggested env flag:

```txt
FATE_WS_GAMEPLAY_AUTHORITY=client-resolved
```

Keep `FATE_WS_REDUCER_MODE='strict'` temporarily if too many tests depend on it, but add the new flag so the code can clearly branch:

- strict reducer path: server reduces card rules
- client-resolved path: server validates and commits postState

Server helper:

```js
function gameplayAuthorityMode(){
  return String(process.env.FATE_WS_GAMEPLAY_AUTHORITY || '').toLowerCase();
}

function clientResolvedGameplayEnabled(){
  return gameplayAuthorityMode() === 'client-resolved';
}
```

Client helper:

```js
function clientResolvedGameplayEnabled(){
  return String(window.FATE_GAMEPLAY_AUTHORITY || '').toLowerCase() === 'client-resolved'
    || localStorageFlag('fateClientResolvedGameplay');
}
```

Acceptance:

- static smoke confirms the flag exists
- health endpoint exposes `gameplayAuthority: 'client-resolved'`

### Phase 2: Server Supports `ACTION_RESULT`

In `server/fate-ws-authority.js`:

- allow `ACTION_RESULT` in the accepted action type list
- route it through room action queue
- call a new reducer/helper in `server/fate-authority-reducer.js`

In `server/fate-authority-reducer.js`:

Add:

```js
function reduceActionResult(room, msg, options){
  return validateProposedTransition(room, msg, options);
}
```

But add action-specific sanity checks that are broader than current strict reducer checks:

- player index valid
- current player valid unless action kind is turn-agnostic
- postState shape valid
- base hash valid
- state hash valid
- no missing players/board arrays

Do not require card-specific reducer support.

Acceptance:

- `ACTION_RESULT` without `postState` rejects
- wrong player rejects
- stale `baseStateHash` rejects
- bad `stateHash` rejects
- valid postState accepts and broadcasts

### Phase 3: Client Sends `ACTION_RESULT` For Gameplay

In `src/scripts/18-online-rooms.js`, stop trying to send lots of specialized gameplay intents as the normal path.

Replace ordinary gameplay sends with:

- run original local action first
- wait a small settle window
- capture canonical state
- send `ACTION_RESULT`

This should cover:

- `END_TURN`
- `CLICK_CELL`
- `START_CONSOLIDATE`
- `BOARD_ACTION`
- `HAND_ACTION`
- `MODAL_ACTION`
- `PICK_CARDS_VISUAL`
- `PICK_ZONE`
- `PICK_AFFILIATION`
- `PICK_LANDSCAPE_ZONE`
- `REACTION_CHOICE`

Keep dedicated server actions for:

- `MATCH_START`
- `FORFEIT`
- `MATCH_RESULT`
- chat
- lobby/queue/heartbeat
- diagnostics

Important: normal card placement should also use `ACTION_RESULT` in this simplified system. Do not keep a separate strict-placement reducer path unless it is proven not to delay or desync.

Acceptance:

- one wrapper path handles all gameplay results
- no board/effect wrapper can run local-only without sending state
- opponent receives canonical state immediately via WebSocket accepted event

### Phase 4: Turn Handling

This is the part most likely to keep feeling bad if half-done.

New rule:

- client runs local `endTurn`
- sends `ACTION_RESULT`
- postState contains the next `currentPlayer`
- Fly accepts if pre-action player had priority and base hash matches
- Fly updates room current turn from `postState.currentPlayer`
- both clients apply the same postState

Do not separately mutate turn on Fly before or after state commit unless it comes from the accepted canonical state.

Acceptance:

- end turn changes ownership on both clients within one WebSocket round trip
- no "not your turn" after an accepted end turn
- repeated click on end turn is idempotent or rejected with immediate resync

### Phase 5: Remove Multiplayer-Only Gameplay UI

The user explicitly wants multiplayer to feel like singleplayer.

Remove or suppress normal gameplay banners like:

- "Resolve X character's effect"
- server prompt labels
- multiplayer-only action prompts
- "waiting for opponent to resolve" during the active player's own local resolution

Keep only:

- queue/matchmaking messages
- reconnect/sync failure diagnostics
- actual error toasts

Acceptance:

- effect activation UI is the same picker/modal flow as singleplayer
- no server-only prompt banner appears in normal play

### Phase 6: Opponent Apply Path

Opponent should not replay the action. They should apply the canonical state.

In `applyOnlineAction` or equivalent:

- if action type is `ACTION_RESULT`
- require `payload.postState` and `payload.stateHash`
- call existing canonical apply path
- mark action seq applied
- update render immediately

Do not call local original functions for opponent gameplay actions in this mode.

Acceptance:

- opponent sees placed card/effect result as soon as accepted event arrives
- no delayed 10-second replay poll required
- no duplicate animations from local replay

### Phase 7: Diagnostics

Extend diagnostics to make this new system debuggable.

Record for each `ACTION_RESULT`:

- `clientActionId`
- action kind
- base hash
- state hash
- accepted/rejected
- latency from click to local commit
- latency from send to accepted
- latency from accepted to render apply
- player index and current player before/after

Expose in:

- `window.fateOnlineDiagnosticsReport()`
- server room diagnostics
- `/health` high-level mode fields

Acceptance:

- when a user says "card did not sync", diagnostics can tell whether the action was never sent, rejected, accepted but not applied, or applied but not rendered.

### Phase 8: Tests

Add or update tests:

Server reducer:

- valid `ACTION_RESULT` accepts
- missing postState rejects
- stale base hash rejects
- wrong player rejects
- malformed board rejects

WebSocket smoke:

- two clients join local room
- host sends card placement as `ACTION_RESULT`
- guest receives canonical board immediately
- host ends turn as `ACTION_RESULT`
- guest can act immediately
- guest activates a fake/unsupported effect as `ACTION_RESULT`
- host receives canonical state

Static smoke:

- no RTDB gameplay fallback
- `ACTION_RESULT` is allowed by WebSocket authority
- client-resolved mode is exposed by health/status
- normal gameplay wrappers use `ACTION_RESULT`
- opponent path applies postState directly

Browser/Electron smoke if feasible:

- create local two-client match
- place card
- end turn
- activate effect with picker
- consolidate

### Phase 9: Deploy Plan

Local verification:

```powershell
node --check src/scripts/18-online-rooms.js
node --check server/fate-ws-authority.js
node --check server/fate-authority-reducer.js
npm.cmd run smoke:fly-test-readiness
npm.cmd run smoke:ws-authority
npm.cmd run smoke:multiplayer-diagnostics
npm.cmd run smoke:authority-reducer
```

Deploy:

```powershell
fly deploy --config fly.toml
```

Live verification:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'https://fates-entwined-main.fly.dev/health'
```

Confirm:

- health returns 200
- `gameplayAuthority` or equivalent reports `client-resolved`
- live `index.html` has the updated cache-bust for `18-online-rooms.js`

After updates, launch Electron because the user wants the game launched after game updates:

```powershell
Start-Process -WindowStyle Hidden -FilePath npm.cmd -ArgumentList @('start') -WorkingDirectory (Get-Location)
```

## What Not To Do

Do not switch live gameplay back to Firebase RTDB.

Do not keep adding one-off card reducers as the main path for playable multiplayer.

Do not claim "server authoritative is fixed" unless there is two-client proof with card placement, effect activation, consolidation, and end turn.

Do not leave both systems active without a clear mode flag. Hybrid behavior is what caused much of the confusion.

Do not let opponent browsers replay active-player local functions in client-resolved mode. They should apply canonical postState.

Do not preserve multiplayer-only effect banners if singleplayer does not show them.

## Risks And Tradeoffs

This architecture is less cheat-proof.

The active client can propose the resulting state. The server can reject stale, malformed, wrong-player, or wrong-turn states, but it will not know every card rule.

That is acceptable for the current goal: playable, fun multiplayer.

Later, high-risk actions can be promoted to real server reducers one at a time. That should be an optimization/security hardening step, not a blocker for the whole game.

## Definition Of Done

The new system is successful when:

- two browsers enter the same match reliably
- match start takes seconds, not minutes
- placing a card appears for the other player almost immediately
- end turn responds quickly and cleanly transfers turn ownership
- effects activate through the same UI as singleplayer
- card pickers/modals resolve and sync
- consolidation works and syncs
- no server-only gameplay banners appear
- diagnostics explain any rejected action clearly
- Fly health and local smoke tests pass

## Recommended First Implementation Slice

Do this first:

1. Add `ACTION_RESULT` support server-side.
2. Add a local smoke where a fake unsupported board effect is accepted only through `ACTION_RESULT`.
3. Change only one client wrapper, preferably `END_TURN`, to use `ACTION_RESULT`.
4. Verify turn transfer is instant in local WebSocket smoke.
5. Change `CLICK_CELL` card placement to `ACTION_RESULT`.
6. Verify two-client placement.
7. Then broaden wrappers to effects, pickers, and consolidation.

This avoids another giant rewrite with no proof until the end.

