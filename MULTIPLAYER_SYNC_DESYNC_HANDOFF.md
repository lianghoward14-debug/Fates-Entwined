# Multiplayer Sync / Desync Handoff

Last updated: 2026-07-14

This note explains what was changed to reduce multiplayer desyncs, what failed along the way, what finally worked, and what to be careful about when touching sync code again.

## Current Shape

The current multiplayer gameplay model is **client-resolved with server validation**.

That means:

1. The acting client runs the normal game logic locally.
2. After the local action resolves, the client captures a compact canonical `postState`.
3. The action is sent to the Fly WebSocket authority with:
   - action type, such as `PLACE_CARD`, `SELECT_CONSOLIDATION_TRIBUTE`, `SELECT_PENDING_MOVE_CELL`, `HAND_ACTION`, `BOARD_ACTION`, `END_TURN`, etc.
   - `postState`
   - `stateHash`
   - usually `baseStateHash`
4. The server validates the posted state.
5. If accepted, the server stores/broadcasts that state as canonical.
6. Other clients apply the authoritative postState.

The server does **not** fully replay every card rule. That was the important correction. It only validates broad state shape plus a few sensitive invariants.

Important files:

- `src/scripts/18-online-rooms.js`
  - Captures canonical client state.
  - Sends optimistic/client-resolved actions.
  - Applies authoritative postStates.
  - Handles more-board-card protection, movement protection, local selection restore, reaction prompts, and rejected-action resync.
- `server/fate-authority-reducer.js`
  - Validates client-resolved transitions.
  - Handles a small number of server-reduced actions like `CHOOSE_TURN`, `REACTION_CHOICE`, and disconnect/forfeit style outcomes.
  - Validates placement, movement, and consolidation postStates.
- `server/fate-ws-authority.js`
  - WebSocket authority transport, room persistence, action acknowledgement, replay, and accepted-state broadcast.
- `server/fate-fly-test-readiness-static-smoke-test.js`
  - Static guardrail test that locks in the intended sync architecture and rejects stale server-authoritative paths.

## What Eventually Worked

### 1. Client-resolved gameplay authority

The working approach was to let the client continue using the mature local gameplay implementation, then send the full resolved state to the server.

The decisive pieces are:

- `window.FATE_GAMEPLAY_AUTHORITY = 'client-resolved'`
- Fly env uses:
  - `FATE_WS_REDUCER_MODE = 'client-resolved'`
  - `FATE_WS_GAMEPLAY_AUTHORITY = 'client-resolved'`
- `attachOnlinePostState(payload)` captures state before send.
- `validateProposedTransition(...)` on the server requires a valid `postState`.
- Accepted WebSocket actions broadcast the exact canonical state.

This avoids the previous trap where the server tried to infer or replay game rules that only the client really understood.

### 2. Action-specific validation instead of full rule recreation

The server now validates only the risky shape of some actions:

- Placement:
  - Result card must exist at the target square.
  - Special placement-only constraints can be checked narrowly, such as Maja safe-row placement.
- Movement:
  - Moved card must exist at destination.
  - Moved card must not remain in its source square.
- Consolidation:
  - Result card must exist at target square.
  - Consumed supporters must not remain on the board.
  - Consumed supporters with instance ids must be in discard.

This is the right compromise. It catches the known desync-producing failures without rebuilding every card effect on the server.

### 3. Consolidation tribute cleanup became atomic

The client-side root fix for consolidation leaving supporters behind was to stop discarding tributes one at a time through the old board discard path.

Current pattern:

- `findLiveConsolidationTributeEntry(...)`
- `sendConsolidationTributeToDiscard(...)`
- `spendConsolidationTributesAtomically(...)`

The important property is that all selected supporters are resolved against the live board first, then removed and discarded together before the result card is finalized.

Do not go back to the old `discardBoardCard(t.card, t.z, t.r, t.c)` per-tribute path for consolidation. That path was one source of supporters disappearing and then reviving.

### 4. More-board-card protection is narrow and intentional

The useful repair was not "always prefer whichever board has more cards." That broke consolidation and intentional discard effects.

The current protection is narrower:

- It can prefer/protect local board cards during desync recovery when the local board is likely newer.
- It excludes intentional board removals.
- It has special handling for movement layouts where both boards have the same card identities but different positions.
- It schedules an authority sync after protecting local state so the server can converge.

Key functions:

- `preferMoreOnlineBoardCards(...)`
- `shouldProtectLocalMoreBoardDuringDesync(...)`
- `isOnlineIntentionalBoardRemovalEntry(...)`
- `scheduleMoreBoardCardsAuthoritySync(...)`
- movement board preference/protection helpers

This is useful as a recovery tool, but it must not override known-removal actions like consolidation tribute spending, Minae/Santiago-style discards, or other deliberate board removals.

### 5. Local acknowledgements do not replay stale snapshots

For client-resolved actions, the local actor already applied the state before sending. When the server accepts the same state, the local client should mark the action as applied and avoid replaying stale snapshots over newer local UI/picker state.

This helped with:

- hand order changes being undone
- modal/picker state flickering
- local consolidation selection getting blown away by acknowledgement timing

### 6. Pending Improvisor/reaction state remains server-gated

Most gameplay is client-resolved, but Improvisor-style first-set reactions need server coordination because the opponent can interrupt a set effect.

The server can arm `_serverPendingReaction`, then block generic commits until `REACTION_CHOICE` resolves. This is intentional.

Important rule: this pending reaction gate must not be generalized into a broad "resolving effect" gate that blocks unrelated local effect buttons or `END_TURN`.

## What Failed

### 1. Full server-authoritative set/move/consolidate

Trying to make the server authoritatively reduce set cards, movement, and consolidation caused slow and brittle gameplay.

Why it failed:

- The card rules live in the client.
- Recreating only some rules on the server created partial truth.
- Effects that depend on UI selections, local pending prompts, animations, or card-specific branches became easy to desync.
- Turn flow and effect activation slowed down because ordinary actions waited on server interpretation.

The stale direction to avoid is any code path that tries to reintroduce dedicated server reducers for normal gameplay actions.

The static smoke test explicitly guards against stale language/code such as dedicated server reducers and server-authoritative set/move/consolidate paths.

### 2. Broad "resolving effect" blocking

The resolving-effect banner/gate became too broad at one point and blocked:

- activate effect buttons
- consolidations
- `END_TURN`
- unused optional effects

That was harmful because unactivated optional effects are not unresolved network transactions. They should not block turn progress or unrelated actions.

Keep network/action gates specific:

- protect board commits while a board commit is actually in flight
- protect reaction prompts while `_serverPendingReaction` is active
- do not block `END_TURN` just because an optional effect button exists

### 3. "Prefer more board cards" everywhere

The naive more-board repair restored cards that were supposed to be gone.

It caused or contributed to:

- consolidation supporters reappearing
- discard effects briefly removing a card and then reviving it
- movement/consolidation conflicts where the repair chose the wrong side

The lesson: more-board repair is a recovery heuristic, not a rule of the game. It must be disabled or filtered for intentional removals.

### 4. Server rejection as the primary consolidation fix

Server validation is good as a guardrail, but it is not the root fix for consolidation.

The actual root fix is client-side: make consolidation spend every selected supporter cleanly and atomically before the result is published.

The server left-behind validation should catch bad postStates, but if it rejects too often while the board looks correct, check the client commit payload and tribute refs first.

### 5. Letting stale failed code accumulate

Several failed attempts left old paths around and made later fixes harder to reason about.

Going forward, when a sync fix fails:

- remove or revert the failed path
- keep only one active path per responsibility
- add or update a smoke/static assertion for the behavior that should remain

Do not layer a second workaround over a failed first workaround.

## Current Action Flow

### Normal client-resolved action

1. User performs a local action.
2. Client local code mutates `gameState`.
3. `sendOptimisticAction(...)` / online wrappers prepare payload.
4. `attachOnlinePostState(...)` captures compact canonical state.
5. Client sends action to WebSocket authority.
6. Server validates via `validateProposedTransition(...)`.
7. Server accepts and broadcasts state/action seq.
8. Local client usually treats matching acknowledgement as already applied.
9. Remote client applies `payload.postState` through `applyOnlineCanonicalState(...)`.

### Placement

Placement is sent as `PLACE_CARD` or placement-shaped `CLICK_CELL`.

Server validation checks that the selected card exists at the destination in `postState`.

If eligible first-set reactions exist, the server may arm `_serverPendingReaction` from the post-placement state. That preserves the placed card while letting the opponent allow/negate/suppress the effect.

### Movement

Movement is sent as `SELECT_PENDING_MOVE_CELL` or an equivalent movement action.

Server validation checks that the moved card exists at destination and no longer exists at source.

Movement repair is identity/layout-aware: if the same cards exist but positions differ, movement protection can keep the likely-newer local layout and schedule a sync.

### Consolidation

Consolidation is sent as `SELECT_CONSOLIDATION_TRIBUTE` with a `consolidationPresentation` payload and a full `postState`.

Client responsibilities:

- preserve local selection visuals while choosing supporters
- atomically spend all selected supporters
- put the resulting character on board
- include tribute refs/presentation info so remote clients can animate it

Server responsibilities:

- verify result card exists at target
- verify selected supporters are not still on board
- verify iid-backed consumed supporters moved to discard
- optionally arm first-set reactions from the resulting character, not from the clicked tribute

### End Turn

`END_TURN` should be sent and accepted through authority, but it should not be blocked by optional unactivated effects.

Do not bring back a turn-blocking "syncing board" banner that prevents turns from progressing indefinitely. If a turn-boundary protection is needed, keep it short, bounded, and diagnostic.

### End Game / Forfeit

End-game actions are terminal. If one client ends the room, the other client should receive room-ended state and leave the match runtime instead of staying in a dead room.

Room-ended authority rejections should be treated as terminal, not as a reason to start repeated optimistic resync loops.

## Sync-Sensitive Rules For Future Changes

1. Do not recreate arbitrary card effects on the server.

   The server can validate invariants, coordinate opponent reactions, and reduce very small universal actions. The client owns normal card effect resolution.

2. Every accepted gameplay action must carry a `postState`.

   If a normal action has no postState, it is likely not safely synchronizing.

3. Preserve `baseStateHash` checks, but handle stale-base carefully.

   A stale base should trigger a bounded recovery or a clear rejection path. It should not silently overwrite a more recent local board with an older smaller board.

4. More-board preference is not a universal law.

   It should never restore intentionally consumed, discarded, or moved-away cards.

5. Consolidation must stay atomic.

   Never remove selected supporters one at a time through ordinary discard UI/gameplay paths during consolidation.

6. Movement protection must compare identity and layout, not just card count.

   A movement desync can have the same number of cards on both boards.

7. Do not block `END_TURN` for optional local effects.

   Pending server reaction prompts can block. Unused activate-effect buttons should not.

8. Keep local UI-only selection local.

   Consolidation hover/selection visuals should not require server round trips. Only the final resolved action needs to publish the postState.

9. Local acknowledgements should not replay over newer local state.

   If the local client already committed the action and the accepted state hash matches, mark it applied and avoid destructive reapplication.

10. Remove stale failed code.

   If a sync attempt fails, delete the failed path before adding the next attempt. Keep the codebase with one clear owner for each sync responsibility.

## Tests / Guardrails To Run

Useful checks after touching sync code:

```powershell
node --check src/scripts/18-online-rooms.js
node --check server/fate-authority-reducer.js
npm.cmd run smoke:fly-test-readiness
npm.cmd run smoke:client-resolved-action-result
npm.cmd run smoke:client-resolved-ws
npm.cmd run smoke:fly-cutover
```

The static readiness smoke is especially important because it catches accidental reintroduction of stale server-authoritative reducers, stale sync gates, and missing cache busts.

## Mental Model

The current system works when there is one source of truth per layer:

- Client gameplay code decides what the game action does.
- Server validates that the submitted result is structurally sane and does not violate known sensitive invariants.
- Server coordinates opponent reaction windows.
- Server broadcasts the accepted canonical state.
- Clients apply accepted canonical state, while protecting narrowly against known stale/smaller-board recovery cases.

Most previous desync pain came from mixing those responsibilities: server trying to become the gameplay engine, repair heuristics acting like rules, or UI/action gates blocking unrelated gameplay.

When in doubt, prefer a narrow invariant check over a broad reducer, and prefer deleting stale sync workarounds over stacking another one.
