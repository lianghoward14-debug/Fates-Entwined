# Fates Entwined Performance Architecture Audit

Date: 2026-06-11

Purpose: replace confidence-based performance work with an evidence trail. This document is not a fix and does not claim performance is solved.

## Bottom Line

The current game is not a completed no-half-measures canvas migration. It is a render-v2 canvas scene layered into a still-active legacy DOM/render system.

That statement is proven by the codebase itself:

- `index.html:508-528` loads both the legacy gameplay/rendering files and the render-v2/canvas files.
- `src/scripts/06-rendering-and-helpers.js:392-454` still routes gameplay updates through `performGameRender`, which calls `renderBoard`, `renderHand`, `renderPiles`, `renderOppHand`, overlays, and topbar updates.
- `src/scripts/render-v2/11-acceptance-report.js:230-250` explicitly lists blockers such as DOM board cells/cards, DOM hand cards, DOM opponent hand visuals, DOM pile canvases, DOM hand drag, DOM motion ghosts, old renderer fallback, and old mutation observer activity.
- `src/scripts/render-v2/08-hand-pile-phase8-report.js:101-112` explicitly says to keep hand/piles in DOM unless testing shows they are hot.

So the earlier "all in" framing was wrong. The code says this is still a staged migration.

## What Is Canvas Now

The render-v2 adapter defines a multi-canvas match scene:

- `src/scripts/render-v2/04-match-renderer-adapter.js:7-15` defines background, card, effect, particle, UI, and hover canvas layers.
- `src/scripts/render-v2/04-match-renderer-adapter.js:2473-2715` renders from game state into canvas layers, builds hit maps, draws scene UI, and records frame metrics.
- `src/scripts/render-v2/04-match-renderer-adapter.js:2778-2800` schedules canvas redraws through `requestAnimationFrame`.
- `src/scripts/render-v2/10-card-motion-fx.js:372-398` routes set-card motion into the v2 VFX path when render-v2 owns the board.
- `src/scripts/render-v2/10-card-motion-fx.js:401-430` routes consolidation tribute motion into the v2 VFX path when target rects are available.

The deck builder also has a canvas renderer available:

- `src/scripts/24-card-grid-canvas-renderer.js:1-2` states that canvas paints card visuals while lightweight buttons preserve behavior.
- `src/scripts/24-card-grid-canvas-renderer.js:169-185` creates the canvas-backed collection grid.
- `src/scripts/24-card-grid-canvas-renderer.js:227-275` still creates DOM hit buttons for accessibility/clicks.

## What Is Still DOM Or Legacy

The legacy gameplay dispatcher still exists and is active:

- `src/scripts/06-rendering-and-helpers.js:708-731` schedules `renderGame` through `requestAnimationFrame`.
- `src/scripts/06-rendering-and-helpers.js:438-448` still calls hand, scores, piles, landscape, opponent hand, tribute highlights, block overlays, and topbar rendering.

The old DOM board renderer still exists:

- `src/scripts/06-rendering-and-helpers.js:1820-1950` contains a full DOM board construction path using `.zone`, `.brow`, `.cell`, and `.bc` elements.
- The v2 branch exits early at `src/scripts/06-rendering-and-helpers.js:1823-1827`, but the legacy path remains live whenever v2 does not own the board.

Hand rendering still has a DOM fallback path:

- `src/scripts/06-rendering-and-helpers.js:2308-2327` has a v2-owned hand path.
- `src/scripts/06-rendering-and-helpers.js:2329-2380` still creates and updates `.hc` DOM cards with `innerHTML` and image elements when that path is not used.

Opponent hand rendering still has DOM fallback and image work:

- `src/scripts/06-rendering-and-helpers.js:1483-1538` creates/updates `.opp-card-back` DOM elements and injects revealed card images.

Modal rendering is DOM-first:

- `src/scripts/06-rendering-and-helpers.js:4049-4107` writes modal title/body/actions using `innerHTML`, creates buttons, schedules SVG decoration, and plays menu sounds.
- `src/scripts/06-rendering-and-helpers.js:4109-4115` closes modals through DOM class/reset work.

Deck builder collection rendering is currently DOM-first despite a canvas renderer existing:

- `src/scripts/02-screen-and-deckbuilder.js:361` disables the canvas path with `if(false && typeof renderCanvasDeckCollection === 'function')`.
- `src/scripts/02-screen-and-deckbuilder.js:379-390` creates a DOM node for every collection card and calls `renderCardHTML`.
- `src/scripts/02-screen-and-deckbuilder.js:393-400` waits for `settleTitleDeckBuilderImages` before replacing children.
- `src/scripts/02-screen-and-deckbuilder.js:319-345` preloads/decodes up to 36 images and can wait up to 420ms.
- `src/scripts/02-screen-and-deckbuilder.js:403-410` refreshes counts by scanning DOM and filtering the deck per card.

Global smoothness/diagnostic systems still observe and wrap UI:

- `src/scripts/21-smoothness-core.js:892-930` installs a `MutationObserver` that watches added image nodes and schedules image optimization.
- `src/scripts/21-smoothness-core.js:1847-1960` installs long-task observation, click-to-paint tracing, and wraps many render/menu functions.

## Known Runtime Evidence From User Trace

The user-provided Electron trace showed:

- `click-to-paint` max around 737ms on title modal close.
- `renderDBCollection` samples around 25-58ms.
- Recent long tasks around 50-121ms.
- `onlineModules loaded=true loading=false deferred=true reason=electron-idle-delay`.
- `selectors modal=1 overlay=1 mc=80 img=118 button=74`.

Interpretation, with uncertainty:

- The slow `renderDBCollection` samples are consistent with the static code path that builds DOM cards and waits on image preload/decode.
- The Electron-only menu lag cannot be blamed on menu CSS yet because the same browser menu reportedly feels much faster.
- The first-click lag may be polluted by focus/DevTools behavior because previous diagnostics recorded `hasFocus=false`, but that does not explain all lag by itself.

## Electron-Specific Evidence And Gaps

Electron shell facts:

- `electron/main.js:178-188` applies command-line switches for device scale factor and background throttling.
- `electron/main.js:215-223` creates a sandboxed renderer with `backgroundThrottling:false`, `nativeWindowOpen:true`, and `devTools:true`.
- `electron/main.js:159-174` serves the app through a local HTTP server at `localhost`.
- `electron/main.js:51-115` currently contains a newly added but not yet fully wired performance-info IPC handler that can report GPU status, app metrics, focus state, and DevTools state.

Important gap:

- `electron/preload.js` currently exposes zoom controls only. The performance-info IPC handler is not exposed to the renderer yet, so it is not useful from the browser console until preload is wired.

## Why "Canvas" Did Not Guarantee 60fps

Canvas reduced some board/card drawing work, but it did not remove all main-thread sources of hitching:

- Gameplay actions still go through legacy `renderGame` scheduling and old render parts.
- The v2 scene still depends on DOM entry points, DOM-hosted canvases, CSS layout size, hit maps, and some old UI elements.
- Menu/deck screens still use DOM card grids and image elements.
- Modal/UI interactions still use `innerHTML`, SVG decoration, button creation, and CSS-driven display changes.
- Global observers/diagnostics can add overhead, especially during high-DOM-change flows.
- Electron can have different GPU/compositor/focus behavior from the browser.

## What Must Be True Before Calling It "No Half Measures"

Do not call the renderer migration "all in" until these are true in a live match report:

- `src/scripts/render-v2/11-acceptance-report.js` blockers are zero.
- `#board .cell` and `#board .bc` are zero during v2 mode.
- `#hand-cards .hc` is zero during v2 mode.
- `#opp-hand` has no visual card DOM during v2 mode.
- Pile visuals are fully in v2 canvas/hit map.
- Hand drag uses the v2 hit map, not DOM hand card geometry.
- Motion effects have no DOM ghost cards.
- Old board canvas renderer is disabled and has no active mutation observer.
- Set/consolidate actions do not call broad DOM render paths during the animation frame.
- Browser and Electron traces for the same action show no long tasks over 50ms and no frame gaps over 33ms.

## Next Correct Process

No more performance patches without this loop:

1. Capture browser and Electron traces for the same action.
2. Record whether lag is scripting, style/layout, paint/composite, image decode, GPU, or focus/wake.
3. Patch only the measured top cause.
4. Re-run the same trace.
5. Keep the patch only if the number improves.

First high-value comparisons:

- Electron menu click with DevTools closed vs open.
- Browser menu click on the same local URL and same viewport.
- Electron `renderDBCollection` on deck screen with current DOM path.
- Match set-card action with render-v2 report before/after.
- Match consolidation with 1 tribute vs 2+ tributes with render-v2 report before/after.

## Candidate Fixes, Not Yet Approved By Evidence

These are likely directions, not claims:

- Wire the Electron performance IPC into preload and include GPU/focus/devtools state in `fateStartupDiag`.
- Enable the existing canvas deck collection path or remove the blocking image decode path from deck builder.
- Treat the render-v2 acceptance report as the migration gate and remove old DOM paths only when the equivalent v2 path is proven.
- Remove diagnostics/observers from normal runtime or put them behind an explicit debug flag.
- For Electron-specific lag, test GPU status and DevTools/focus before changing UI.

## Current Dirty-State Note

This audit was written with an already-dirty worktree. Existing modified files include gameplay, render-v2, Electron, styles, and assets. This document does not revert or normalize those changes.
