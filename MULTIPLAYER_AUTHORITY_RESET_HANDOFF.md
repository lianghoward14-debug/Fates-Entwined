# Multiplayer Authority Reset Handoff

## Purpose

This handoff is for a fresh conversation or engineer to fix the multiplayer architecture without continuing the current patch spiral.

The core problem is not one card, one button, or one profile display. The current Fly multiplayer code is still a hybrid of server authority and legacy client replay. That hybrid is why even the base flow can fail:

- player A places a card
- server accepts
- player B does not reliably see the card
- client/server pending interaction state drifts
- UI still allows actions the server will reject

The correct architecture is:

> In Fly multiplayer, the server canonical state is the game. The browser sends intents, receives canonical state, applies it directly, and renders. The browser must not re-simulate accepted gameplay actions as authority.

## Current State

Important files:

- `src/scripts/18-online-rooms.js`
  - Owns room flow, WebSocket authority, optimistic actions, action buffering, remote replay, and canonical state application.
  - Still contains legacy replay paths using `withRemoteAction(...)` and local functions such as `clickCell(...)`.
  - Has `applyOnlineCanonicalState(...)`.
  - Has `applyAuthoritativePostState(...)`, recently added to apply strict Fly `postState` directly.
  - Has `isStrictCompactAuthorityAction(...)`.

- `server/fate-ws-authority.js`
  - Owns Fly WebSocket rooms, accepted action broadcast, canonical hash, profiles, chat, reconnect, and result ledger.
  - Accepted strict actions can include `action.payload.postState` and `action.payload.stateHash`.

- `server/fate-authority-reducer.js`
  - Owns server-side strict gameplay reducer.
  - Uses canonical state, base-hash validation, and pending server fields.
  - Pending fields include `_serverPendingModalAction`, `_serverPendingZonePick`, `_serverPendingMove`, `_serverPendingCardPick`, and `_serverPendingReaction`.

Existing useful tests:

- `npm run smoke:authority-reducer`
- `npm run smoke:authority-state-gate`
- `npm run smoke:authority-strict-reducer`
- `npm run smoke:ws-authority`
- `npm run smoke:fly-cutover`

These are not enough. A new two-client placement convergence smoke is required.

## Non-Negotiable Architecture

1. Fly multiplayer has exactly one gameplay authority: the server.
2. Firebase/RTDB is not used for multiplayer gameplay actions.
3. The browser does not replay accepted server actions through local gameplay functions.
4. Every accepted strict authority action must provide enough canonical state for clients to converge.
5. Every browser applies the server canonical state directly after accepted actions.
6. Pending interactions are explicit server state, not inferred from scattered local flags.
7. Completion requires a deployed or local two-client proof, not code inspection.

Allowed legacy usage:

- Firebase Auth can remain if currently needed.
- Singleplayer can continue using existing local gameplay functions.
- Old UI helpers may remain only if they render from canonical state and do not decide multiplayer truth.

Not allowed in Fly multiplayer:

- Firebase gameplay fallback.
- Remote action replay through `clickCell`, `endTurn`, local modal callbacks, or local card-effect functions.
- Client-side accepted-action simulation as a correctness mechanism.
- Hidden sync fallbacks that mask divergence.

## Implementation Plan

### 1. Add The Failing Proof First

Create a new automated two-client smoke test before further architecture changes.

Recommended file:

```txt
server/fate-authority-two-client-placement-smoke-test.js
```

Add package script:

```json
"smoke:authority-two-client-placement": "node server/fate-authority-two-client-placement-smoke-test.js"
```

The smoke must prove:

- host and guest join the same room
- match starts from server canonical state
- turn chooser resolves if needed
- player 0 places a plain character
- server accepts and broadcasts canonical state
- player 1 receives state where that board cell contains the card
- player 1 places a plain character
- player 0 receives state where both cards exist
- both clients report the same `stateHash`
- no Firebase gameplay fallback is used

Only add this smoke to `smoke:fly-cutover` after it is stable.

### 2. Make Server State The Only Strict Fly Apply Path

In `src/scripts/18-online-rooms.js`, formalize this rule:

```js
function shouldApplyServerStateDirectly(actionType, payload) {
  return isStrictCompactAuthorityAction(actionType)
    && payload
    && payload.postState
    && payload.stateHash
    && !firebaseActionFallbackAllowed();
}
```

For every accepted action matching that rule:

- update last seen action seq
- update last authority hash
- call `applyOnlineCanonicalState(payload.postState, reason)`
- mark the action as applied
- render from canonical state
- return immediately
- do not call local gameplay functions

This must apply to local acknowledgements and remote accepted actions.

### 3. Remove Remote Gameplay Replay In Strict Fly

In `applyOnlineAction(...)`, split behavior into two explicit paths:

- Strict Fly path:
  - apply server canonical state directly
  - never call local gameplay mutation functions
  - optional SFX/animations may run only from server-provided effect metadata

- Legacy/non-strict path:
  - may temporarily keep old replay behavior
  - must be unreachable when hosted Fly, `FATE_FLY_AUTHORITY_ONLY`, `FATE_RTDB_DISABLED`, or Fly rooms are active

Strict Fly must bypass these as gameplay mutation mechanisms:

- `withRemoteAction(...)`
- `window.clickCell(...)`
- `window.endTurn(...)`
- `window.chooseTurn(...)`
- local board action functions
- local hand action functions
- local modal callbacks
- local picker callbacks

### 4. Normalize Intent Names

Long term, stop using `CLICK_CELL` as a catch-all. It currently means too many things.

Introduce clearer server intents:

```txt
PLACE_CARD
SELECT_CONSOLIDATION_TRIBUTE
SELECT_PENDING_MOVE_CELL
SELECT_BOARD_TARGET
RESOLVE_MODAL
RESOLVE_CARD_PICK
RESOLVE_ZONE_PICK
RESOLVE_AFFILIATION_PICK
CHOOSE_TURN
END_TURN
FORFEIT
```

Bridge old names only inside one translation function:

```js
function toAuthorityIntent(localActionType, payload) { ... }
```

Do not let reducer or UI code guess intent from generic click state.

### 5. Normalize Pending Interaction State

Expose one normalized pending object to the browser:

```js
pendingInteraction: {
  kind,
  playerIndex,
  promptId,
  message,
  legalTargets,
  sourceCard,
  min,
  max
}
```

It can initially be derived from existing `_serverPending*` fields.

Client behavior:

- if `pendingInteraction.playerIndex !== localPlayerIndex`, show waiting state
- if pending exists for local player, show only that prompt's legal controls
- if pending exists, disable unrelated placement/end-turn controls unless server says they are legal
- never infer pending state from local-only flags such as `_boardTargeting`, `_consolidating`, or `placing`

### 6. Rendering Contract

After every direct server-state apply:

- `G` is updated from canonical state
- render-v2 caches are invalidated
- board, hands, piles, scores, topbar, and pending UI render from `G`
- rendered board card count must match canonical board card count

Add a browser diagnostic:

```js
window.fateAuthorityRenderReport()
```

It should return:

```js
{
  build,
  room,
  seq,
  stateHash,
  canonicalBoardCount,
  renderedBoardCount,
  currentPlayer,
  phase,
  pendingInteractionKind,
  localPlayerIndex
}
```

The two-client smoke should assert board/state convergence through this report where possible.

### 7. Quarantine Old Systems

After the two-client placement smoke passes:

- keep singleplayer gameplay functions
- prevent Fly strict multiplayer from using them for remote replay
- rename legacy online replay helpers with a `legacy` prefix or put them behind a strict guard
- add static tests proving strict Fly actions with `postState` cannot fall into local replay

Example static checks:

```js
assert.match(roomsText, /shouldApplyServerStateDirectly/);
assert.match(roomsText, /applyOnlineCanonicalState/);
```

Also add a targeted negative/static check around strict path once the code is refactored enough to make it reliable.

### 8. Reducer Hardening

Before expanding card effects, server reducer must support and test:

- place plain character
- place plain supporter
- reject occupied cell
- reject wrong turn
- reject wrong phase
- reject stale base hash
- reject action when unrelated pending interaction exists
- allow only the matching pending-resolution intent when pending exists
- clear pending state after resolution
- emit canonical state and hash after every accepted action

Error messages must include pending type.

Bad:

```txt
CLICK_CELL has an unsupported pending interaction
```

Good:

```txt
PLACE_CARD blocked by pendingInteraction=zonePick promptId=abc123
```

### 9. Deployment Gate

Do not claim fixed unless all pass:

```bash
node --check src/scripts/18-online-rooms.js
node --check server/fate-ws-authority.js
node --check server/fate-authority-reducer.js
npm run smoke:authority-reducer
npm run smoke:authority-state-gate
npm run smoke:authority-strict-reducer
npm run smoke:ws-authority
npm run smoke:authority-two-client-placement
npm run smoke:fly-test-readiness
```

For hosted deployment:

```bash
npm run deploy:fly-authority
```

Then verify live:

- `/health` returns `ok:true`
- `/health` returns `reducerMode:"strict"`
- `/health` returns `firebaseRtdbDisabled:true`
- hosted index has the new build token
- live `18-online-rooms.js` contains the direct authoritative apply path
- two real browsers can place cards in both directions and report the same state hash

## Acceptance Criteria

The architecture is not complete until this exact scenario passes repeatedly:

1. Open two separate browser sessions with two different users.
2. Queue or join a room.
3. Start match.
4. Player 0 places a card.
5. Player 1 sees the card without refresh.
6. Player 1 places a card.
7. Player 0 sees both cards without refresh.
8. Both clients report the same server state hash.
9. Refreshing either client restores the same board.
10. Closing one client ends the match for both clients.

No exceptions. No "probably fixed." No "local replay worked." The state hash and board must converge.

## Defaults For Implementation

- No Firebase gameplay fallback.
- No remote local replay in Fly strict mode.
- Full canonical state broadcast after every accepted action for now.
- Optimize bandwidth only after correctness is proven.
- Keep singleplayer untouched unless shared render-only helpers are needed.
- Prefer one clean authority client path over incremental patches to old wrappers.
- Treat profile/chat polish as separate from gameplay authority until the placement convergence gate passes.

## First Task For The Next Conversation

Start with only this:

> Make strict Fly accepted actions apply `payload.postState` directly on both local acknowledgement and remote receipt, bypassing local gameplay replay, and prove it with a two-client placement smoke.

Do not touch card effects, profile pictures, chat, cosmetics, or broad reducer expansion until that passes.
