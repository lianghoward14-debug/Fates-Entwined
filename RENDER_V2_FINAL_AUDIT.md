# Render V2 Final Audit

Generated during the Phase 12 rollout audit for the render-v2 performance architecture migration.

## Status

Normal match rendering is now intended to run as:

```text
DOM app shell + render-v2 canvas match scene
```

The live match card scene is render-v2 owned by default. Legacy DOM/canvas board rendering remains available only as an explicit rollback path.

## Verified Acceptance Shape

The required live-match report is:

```js
fateRendererV2AcceptanceReport()
```

Expected final shape:

- `pass === true`
- `ownsBoard === true`
- `ownsHand === true`
- `ownsOpponentHand === true`
- `ownsPiles === true`
- `ownsMotionFx === true`
- `board.domCells === 0`
- `board.domBoardCards === 0`
- `hand.domHandCards === 0`
- `motion.domGhostCardsActive === 0`
- `oldRenderer.disabledByV2 === true`
- `oldRenderer.drawRequests === 0`
- `oldRenderer.fallbackForcedDomBoard === false`
- `canvas.layers >= 4`

## Phase 11 Coverage

The Phase 11 coverage report is:

```js
fateRendererV2Phase11Report()
```

The final user-provided report showed:

- `acceptancePass === true`
- `pass === true`
- `blockers.length === 0`
- `remaining.length === 0`

The scenario evidence includes the synthetic board matrix, idle/low-effects/current-DPR auto checks, and the manual interaction scenarios.

## Rollback

Explicit rollback remains:

```js
localStorage.fateDisableMatchRendererV2 = "1"
location.reload()
```

URL rollback remains:

```text
?domBoard=1
```

Restore render-v2:

```js
localStorage.removeItem("fateDisableMatchRendererV2")
location.reload()
```

## Dirty Redraw Follow-Up

Drag-card testing passed ownership acceptance, but produced high dirty draw counts. The follow-up adjustment caps drag drop-preview hover updates to the existing preview interval while keeping the drag ghost itself moving at rAF speed.

The renderer report now separates:

- `dirtyDraws`: heavier dirty render passes
- `hoverOnlyDraws`: hover-only overlay paints
- `hoverLayerRedraws`: total hover layer redraws

This makes future perf reports easier to read and avoids treating every hover-only overlay paint as a heavier scene dirty draw.

## Known Non-Renderer Noise

Missing voiceline requests such as `/setvoicelines/58set.mp3` returned 404 during tests. These are missing audio assets and are not render-v2 ownership blockers.
