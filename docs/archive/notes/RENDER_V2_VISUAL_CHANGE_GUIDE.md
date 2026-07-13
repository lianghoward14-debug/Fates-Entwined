# Render V2 Visual Change Guide

Use this guide before making visual changes to the live match screen.

## Core Rule

The live match card scene is render-v2 canvas owned.

Do not reintroduce DOM ownership for:

- board cells
- board cards
- own hand cards
- opponent hand cards
- deck/discard pile visuals
- drag previews
- motion ghosts
- hover/selection/targeting highlights

DOM may still own app-shell UI such as topbar, buttons, modals, title/deckbuilder/social/profile/settings screens, and card detail modals.

## Preferred Change Path

For live match visuals, prefer editing:

- `src/scripts/render-v2/04-match-renderer-adapter.js`
- `src/scripts/render-v2/02-match-layout-engine.js`
- `src/scripts/render-v2/03-card-texture-cache.js`
- `src/scripts/render-v2/06-match-scene-input.js`
- `src/scripts/render-v2/09-hand-drag-bridge.js`
- `src/scripts/render-v2/10-card-motion-fx.js`
- `src/styles/match-scene-v2.css`

Make changes through render-v2 layout data, hit maps, texture cache, dirty masks, and canvas layers.

## Avoid

Do not add `.cell`, `.bc`, `.hc`, `.opp-card-back`, `.pile-card-canvas`, or DOM ghost cards as live match visuals.

Do not use `getBoundingClientRect()` per card in the normal render path. Use layout-engine rectangles and hit maps.

Do not make hover, drag preview, pile click, or selection redraw the full scene unless layout actually changed.

Do not let `23-board-canvas-renderer.js` draw during v2 ownership. It is legacy rollback/quarantine only.

Do not treat “it looks okay” as enough. Run the reports.

## Required Checks

After visual changes in a live match, run:

```js
fateRendererV2AcceptanceReport()
```

Expected:

- `pass === true`
- `ownsBoard === true`
- `ownsHand === true`
- `ownsOpponentHand === true`
- `ownsPiles === true`
- `ownsMotionFx === true`
- DOM board cells/cards/hand cards/ghosts are `0`
- old renderer `drawRequests === 0`
- old renderer `fallbackForcedDomBoard === false`

For scenario coverage, run:

```js
fateRendererV2Phase11Report()
```

For perf deltas:

```js
fateRendererV2CanvasDelta()
```

## Canvas Layer Intent

Keep layers separated:

- background layer: board frame/background
- card layer: board cards and core scene
- effect layer: motion/fate effects
- UI layer: hands and piles
- hover layer: hover/targeting/drop preview

Hover-only work should stay hover-only. Drag ghost movement should remain cheap and not force board/card redraws every pointer frame.

## Rollback Must Stay

Do not delete rollback support:

```text
?domBoard=1
localStorage.fateDisableMatchRendererV2 = "1"
```

Render-v2 is default, but legacy rollback must remain explicit and available.

## If You Need New Visuals

Add them as render-v2 draw functions or layout fields. If a DOM element is needed for a modal or app-shell overlay, keep it outside the live match card scene and make sure it does not create `.cell`, `.bc`, `.hc`, pile canvases, or motion ghost visuals.
