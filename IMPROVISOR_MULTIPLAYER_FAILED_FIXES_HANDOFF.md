# Improvisor Multiplayer Failed Fixes Handoff

Last updated: 2026-07-11

## Current user-reported problem

Improvisor reactions still do not work in multiplayer.

The important symptom is not single-player, not discounts, and not a broad consolidation issue. Single-player Improvisors are considered fine by the user. The multiplayer problem is that Improvisor reaction windows/effects do not reliably trigger or open at all when they should.

Specific cards repeatedly mentioned:

- Havano Citizen (`79`) should react/deploy from hand when an opponent effect affects the player/cards.
- Lydia (`56`) should react to opponent effect activations.
- Mr. Secules (`67`) should also be covered, not just Havano/Lydia.
- This should apply across landscapes, not only one landscape or one effect source.

Latest clarification from the user:

- Do not make broad consolidation changes.
- If consolidation is touched, it must be Improvisor-specific.
- The user explicitly rejected a broad fix to normal consolidation click handling because it may break the rest of the game.

## Current critical code state

This repo is in a very dirty working tree. Do not assume the committed baseline is the active game.

The most important current observation:

- `server/fate-authority-reducer.js` is currently only about 276 lines.
- It appears to have been heavily reduced from a much larger server reducer.
- It currently validates client-provided `postState` rather than implementing the old full server-side reducer logic.
- It contains this explicit failure for reaction choices:

```js
if(type === 'REACTION_CHOICE'){
  return {ok:false, reason:'server reaction reducer removed; reactions must be resolved by client postState'};
}
```

That line is probably central. If multiplayer Improvisor windows rely on the authority server creating `_serverPendingReaction`, the current reducer may no longer be capable of producing those windows server-side.

Relevant current client-side surfaces in `src/scripts/18-online-rooms.js`:

- `showOnlineImprovisorChoiceWindow`
- `showOnlineImprovisorWaitingWindow`
- `syncOnlineImprovisorReactionUi`
- `payloadHasServerReactionWindow`
- `forceInstallOnlineImprovisorReactionFromPayload`
- `attachOnlineReactionActionType`
- `attachOnlinePendingEffectSource`
- board action wrapper around `triggerCharacterEffect` / `activatePendingWhenSetEffect`

Current client behavior still seems designed around `_serverPendingReaction` being present in an authoritative `postState`:

```js
function payloadHasServerReactionWindow(payload){
  return !!(payload && payload.postState && payload.postState._serverPendingReaction);
}
```

```js
function forceInstallOnlineImprovisorReactionFromPayload(action, reason){
  const pending = payload?.postState?._serverPendingReaction || null;
  ...
  g._serverPendingReaction = cloneOnlinePlain(pending);
  ...
  forceServerPendingPromptChecks(reason || 'installed improvisor reaction from payload');
}
```

So the client can show a reaction UI only if some accepted authoritative payload already contains `_serverPendingReaction`, or if another path manually installs it.

## Things already tried that did not fix it

### 1. Havano-specific probing/fixes

Several attempts focused on Havano (`79`) and specific trigger cases, including trying to guarantee Havano on Oathbound Noble Fighter.

Result:

- Failed.
- The user confirmed Havano still did not trigger.
- User also clarified the bug is not Havano-only. Fixes must cover all Improvisors.

Lesson:

- Do not tunnel on Havano-specific logic unless it is only used as a diagnostic.

### 2. Landscape-specific theories

Multiple attempts treated the problem as if it might be tied to a specific landscape or landscape effect.

Result:

- Failed.
- User clarified it happens across all landscapes and is not landscape-specific.

Lesson:

- The bug is probably in the multiplayer reaction pipeline, not a particular landscape reducer.

### 3. Discount/cost/consolidation side branches

At one point a fix was attempted around cost/discount-modified Improvisor consolidation.

Result:

- Wrong target.
- User explicitly clarified there is no discount involved.
- That patch was backed out.

Lesson:

- Do not investigate Wolf Creek/Wine Country/discount or cost-0 branches for this issue unless a new repro explicitly points there.

### 4. Broad normal consolidation click-path patch

A broad patch was briefly added to restore cached consolidation tribute selection before final-click detection, and to pass a drag-consolidation marker through `START_CONSOLIDATE`.

The theory was:

- The client could show consolidation animation locally without sending the authoritative final placement.

Result:

- User rejected this because it was too broad and not Improvisor-specific.
- The patch was backed out.

Backed-out code included:

- `onlineConsolidationStartContext`
- `restoreLocalConsolidationSelection(g, 'before final consolidation click detection')`
- cache bump from `1783676420` to `1783676421`
- a static smoke assertion for that broad ordering

Lesson:

- Do not reintroduce generic consolidation behavior changes. If Improvisor consolidation needs fixing, gate it to Improvisor cards only.

### 5. Client prompt/window patches

Several attempts added or adjusted client-side handling to force or reopen the online Improvisor pause/reaction window.

Current related code still exists:

- polished online Improvisor overlay CSS in `src/styles/zz-codex-last.css`
- `showOnlineImprovisorChoiceWindow`
- `showOnlineImprovisorWaitingWindow`
- `syncOnlineImprovisorReactionUi`
- `forceInstallOnlineImprovisorReactionFromPayload`

Result:

- Failed from the user's perspective.
- The prompt/window still does not open in actual multiplayer testing.

Lesson:

- The UI may be fine, but it may never receive a valid `_serverPendingReaction`.
- Next chat should first prove whether `_serverPendingReaction` exists in the accepted server payload.

### 6. Reaction metadata patches

Several patches tried to attach more metadata to multiplayer actions:

- `reactionActionType`
- `pendingSource`
- `effectCinematic`
- source locations for `MODAL_ACTION`, `PICK_ZONE`, `PICK_CARDS_VISUAL`, etc.

Current related code exists in `src/scripts/18-online-rooms.js`:

- `attachOnlineReactionActionType`
- `attachOnlinePendingEffectSource`
- board action wrapper attaches `effectCinematic` for `triggerCharacterEffect` and `activatePendingWhenSetEffect`

Result:

- Failed from the user's perspective.
- Improvisor windows still do not open.

Lesson:

- Metadata alone is not enough if the server reducer no longer creates pending reaction windows.

### 7. Server-side universal Improvisor reaction reducer attempts

Earlier attempts apparently added server-side functions like:

- `multiplayerImprovisorReactionProfile`
- `collectMultiplayerImprovisorReactionOptions`
- `armMultiplayerImprovisorReactionWindow`
- `maybeArmUniversalImprovisorReaction`
- `armServerReactionWindowForResolvedState`
- `armServerReactionWindowForAuthoritativePostState`

Current state:

- These functions are not present in the current `server/fate-authority-reducer.js`.
- The reducer currently says the server reaction reducer was removed.

Result:

- Whatever those patches were, they either failed, were removed, or were replaced by the client-postState validator reducer.

Lesson:

- Do not assume server reaction arming still exists.
- Re-check the current reducer before making any client UI fix.

### 8. Smoke tests gave false confidence

Some tests/smokes reportedly passed or were added around Havano/reaction behavior, but the user’s real multiplayer test still failed.

Known mismatch:

- `server/fate-fly-room-lifecycle-smoke-test.js` contains reaction-smoke expectations for `_serverPendingReaction` and Havano.
- The current reducer says reaction choices are not server-reduced anymore.

Lesson:

- Existing tests may not be exercising the actual deployed/current multiplayer path.
- Do not claim the issue is fixed based only on static or narrow reducer smoke tests.

## Current best hypothesis

The issue is probably no longer "the modal does not render." It is more likely:

1. An opponent effect action is accepted by the authority server.
2. The accepted action's `payload.postState` does not contain `_serverPendingReaction`.
3. Because there is no `_serverPendingReaction`, the client-side Improvisor UI never opens.
4. The effect resolves or syncs as a normal accepted state, skipping the Improvisor pause/reaction window entirely.

The strongest supporting clue is the current server reducer:

```js
if(type === 'REACTION_CHOICE'){
  return {ok:false, reason:'server reaction reducer removed; reactions must be resolved by client postState'};
}
```

That means the multiplayer Improvisor reaction window may need to be created before acceptance by a server authority path that no longer exists, or the client-postState model needs an Improvisor-specific server interception layer before accepting the effect.

## What the next chat should check first

Do not start by editing UI.

First inspect the accepted websocket message for an opponent effect that should trigger Lydia/Havano/Secules:

- Does the accepted action include `payload.postState._serverPendingReaction`?
- Does `forceInstallOnlineImprovisorReactionFromPayload` run?
- Does `syncOnlineImprovisorReactionUi` see `g._serverPendingReaction`?
- Is `pending.playerIndex` the reacting player?
- Are `pending.options` populated with the expected Improvisor option kinds?

If `_serverPendingReaction` is missing from the accepted payload, the UI cannot open. Fix the server/authority action acceptance path, not the overlay.

## What not to do next

- Do not touch single-player Improvisor logic unless a specific comparison is needed.
- Do not make broad consolidation changes.
- Do not focus only on Havano.
- Do not focus only on one landscape.
- Do not chase discounts/cost modifiers.
- Do not claim success from a smoke test unless it proves a real accepted multiplayer websocket payload contains `_serverPendingReaction` and both clients handle it correctly.

## Safer direction for a real fix

The likely real fix should be Improvisor-specific and authority-side:

1. Find the exact authority path that accepts opponent effect actions in multiplayer.
2. Before committing the effect's final `postState`, inspect the pre-state and action metadata.
3. If the opponent has eligible Improvisor reactions, commit a canonical state with `_serverPendingReaction` instead of immediately applying the final effect.
4. Pause both clients:
   - reacting player sees choice window
   - acting player sees waiting window
5. On `REACTION_CHOICE`, resolve either:
   - decline/timeout: apply the stored effect `postState`
   - negate/deploy: apply the Improvisor-specific negation/deployment result
6. Keep this separate from normal consolidation and normal placement logic.

The key is that the reaction window must be authoritative. A client-only prompt cannot reliably pause the opponent or prevent the effect state from already being accepted.

