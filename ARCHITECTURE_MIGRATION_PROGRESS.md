# Fates Entwined Architecture Migration Progress

Created: 2026-06-04

## Product Target

The final target is a professional-feeling digital card game, closer in smoothness and reliability to polished card games such as Pokemon TCG Online / Live than to a patched prototype.

That means every code change should be judged against these goals:

- Smooth board and hand interactions during live play.
- No avoidable full-screen rerenders during small actions.
- Clear ownership of rendering, input, rules, networking, and persistence.
- Multiplayer results that are decided by an authoritative system, not by whichever client writes first.
- Debug reports and handoff notes that a non-coding project owner can use to understand what changed.

## Current Decision

Start with rendering/performance before the deeper multiplayer rebuild.

Reason:

- The performance plan has smaller, high-confidence Phase 0 fixes already proven by code evidence.
- Render invalidation correctness affects both solo and online play.
- A smooth local match screen makes later multiplayer testing easier to trust.
- Multiplayer server-authoritative v2 is important, but it is larger and riskier because it touches rules, networking, reconnects, rewards, and Firebase/Fly ownership.

This does not mean multiplayer is less important. It means performance Phase 0 gives the safest first win and better measurement before large online changes.

## Planned Order

1. Rendering Phase 0: correctness and measurement only.
2. Rendering v2 behind flags: state snapshot, layout engine, canvas scene, input map.
3. Multiplayer Phase A: freeze legacy behavior, instrument, version-gate.
4. Multiplayer reducer vertical slice: private room, coin/turn, play one card, end turn, forfeit, reconnect.
5. Expand multiplayer reducer only after the vertical slice passes tests.

## Active Progress Log

### 2026-06-04

- Reviewed `fates_architecture_docs.zip`.
- Found both architecture plans mostly valid and aligned with the real codebase.
- Confirmed rendering issues in `src/scripts/06-rendering-and-helpers.js`:
  - String render parts can broaden to all render parts.
  - Pointer-deferred render flush can lose dirty-part specificity.
- Confirmed the current canvas board in `src/scripts/23-board-canvas-renderer.js` is still DOM-driven.
- Confirmed multiplayer is not truly server-authoritative yet:
  - Client sends broad `postState`.
  - Server accepts most actions only when client `postState` exists.
  - Server derives some room patches from client-produced state.
- Decision: begin with rendering/performance Phase 0.

### 2026-06-04 Phase 0 Start

Implemented the first rendering/performance Phase 0 changes.

Changed files:

- `src/scripts/06-rendering-and-helpers.js`
- `src/scripts/23-board-canvas-renderer.js`
- `src/scripts/21-smoothness-core.js`
- `index.html`
- `package.json`

What changed:

- `renderGame('hand')`, `renderGame('board')`, and other string parts now stay scoped instead of expanding to every render part.
- Pointer-deferred renders now preserve the accumulated dirty parts instead of flushing through a full `renderGame()` call.
- Render request counters now track total, broad, and scoped requests.
- Render caller diagnostics now track both broad and scoped caller counts when diagnostics are enabled.
- `fateCanvasBoardReport()` now records draw schedule sources, schedule request counts, skipped schedule requests, canvas pixel area, and timing buckets for layout reads, card drawing, retained-frame copy, and visible-canvas copy.
- `fatePerfReport()` and `fateTraceLag()` now include render request counters and the canvas board report.
- Browser cache-busting query strings were updated for edited runtime scripts.
- Added `npm run dev:web` as a no-dependency browser testing command for `tools/solo-static-server.js`.

Verification:

- `node --check src/scripts/06-rendering-and-helpers.js` passed.
- `node --check src/scripts/23-board-canvas-renderer.js` passed.
- `node --check src/scripts/21-smoothness-core.js` passed.
- `node --check tools/solo-static-server.js` passed.
- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` passed.
- Local HTTP delivery smoke test passed for:
  - `index.html?soloNoSw=1&fresh=phase0`
  - `src/scripts/06-rendering-and-helpers.js?v=1780580001`
  - `src/scripts/23-board-canvas-renderer.js?v=1780580001`
  - `src/scripts/21-smoothness-core.js?v=1780580001`
- Started the browser dev server on `http://127.0.0.1:8126/`.
- Opened `http://127.0.0.1:8126/index.html?soloNoSw=1&fresh=phase0` in the default browser.

Still needs browser verification:

- Open the game with a fresh query parameter or `?soloNoSw=1`.
- Start a match and confirm `renderGame('hand')`/scoped renders do not cause full board rerenders.
- Run `fatePerfReport()` and confirm `canvasBoard`, `broadRenderRequests`, and `scopedRenderRequests` appear.
- Compare DOM board fallback via the `domBoard=1` URL in `fateCanvasBoardReport()`.

User-reported Electron `fatePerfReport()` checkpoint:

- `activeScreen: "s-game"`
- `renderRequests: 8`
- `scopedRenderRequests: 8`
- `broadRenderRequests: 0`
- `lastRenderRequestParts: "board,hand,scores,piles,blocks,topbar"`
- `canvasBoard` present and reporting `draws: 19`, `cards: 2`, `expectedCards: 2`, `domCardCells: 2`, `zeroRectCards: 0`
- `longTasks: 0`, `slowFrames: 0`, `suppressedOffscreenGameRenders: 0`
- FPS fields were not meaningful in this checkpoint because `fpsWatchdogEnabled` and `rafMonitorEnabled` were false and `hasFocus` was false while DevTools had focus.

User-reported Electron `fateCanvasBoardReport()` checkpoint:

- `enabled: true`
- `draws: 23`
- `cards: 2`
- `expectedCards: 2`
- `domCardCells: 2`
- `zeroRectCards: 0`
- `imagesPending: 0`
- `cacheSize: 3`
- `canvas: { width: 1625, height: 801, cssW: 1625, cssH: 801, dpr: 1 }`
- `canvasPixels: 1301625`
- `lastMs: 0.7`
- `layoutReadMs: 0`
- `cardLoopMs: 0.4`
- `retainCopyMs: 0.2`
- `visibleCopyMs: 0`
- `scheduleRequests: 36`
- `skippedScheduleRequests: 10`
- `skippedEmptyFrames: 0`
- `lastSource: "board-resize-observer"`
- Main draw sources included `board-mutation-observer: 16`, `board-resize-observer: 7`, `renderBoard: 4`, `startup: 1`, and `fonts-ready: 1`.

Interpretation:

- Canvas board rendering is not currently missing cards or drawing zero-size cards.
- The last draw was fast in this small-board sample.
- The current canvas board is still DOM-event/layout driven, which supports moving toward renderer v2 later.

User-reported Electron DOM-board fallback checkpoint:

- Loaded DOM fallback URL with `domBoard=1`.
- `fateCanvasBoardReport()` returned:
  - `enabled: false`
  - `reason: "canvas-board-unavailable"`
  - fallback URL included `domBoard=1`

Interpretation:

- The fallback flag successfully disables the canvas board path.
- Phase 0 rollback path exists for testing the DOM board separately from canvas board behavior.

### 2026-06-04 Phase 1 Start

Implemented the render snapshot foundation.

Changed files:

- `src/scripts/render-v2/00-render-v2-flags.js`
- `src/scripts/render-v2/01-render-snapshot.js`
- `src/scripts/21-smoothness-core.js`
- `index.html`

What changed:

- Added a render-v2 flag module exposed as `window.FateRenderV2Flags`.
- Added a state-driven render snapshot module exposed as:
  - `window.FateRenderSnapshot`
  - `window.fateBuildRenderSnapshot()`
  - `window.fateRenderSnapshotReport()`
- The snapshot currently reads game state only. It does not own layout, drawing, or input yet.
- The snapshot captures:
  - viewer/current player/phase/turn interaction state;
  - board zones, rows, cells, blockers, mark-safe state, extra rows, and public card visuals;
  - player hand counts, own hand card details, revealed opponent hand cards, deck counts, discard counts, and top discard;
  - landscape id/background/state summary;
  - a stable signature and build timing.
- Hidden/private visual handling is conservative:
  - face-down opponent board cards are masked;
  - opponent hand cards are masked unless revealed by game state;
  - own hand cards remain visible to the local renderer.
- `fatePerfReport()` and `fateTraceLag()` now include:
  - `renderV2Flags`
  - `renderSnapshot`
- `index.html` now loads render-v2 flags and snapshot modules after `06-rendering-and-helpers.js` and before the legacy board canvas renderer.

Verification:

- `node --check src/scripts/render-v2/00-render-v2-flags.js` passed.
- `node --check src/scripts/render-v2/01-render-snapshot.js` passed.
- `node --check src/scripts/21-smoothness-core.js` passed.
- Local HTTP delivery smoke test passed for:
  - `index.html?electron=1&fresh=phase1`
  - `src/scripts/render-v2/00-render-v2-flags.js?v=1780580401`
  - `src/scripts/render-v2/01-render-snapshot.js?v=1780580401`
  - `src/scripts/21-smoothness-core.js?v=1780580001`

Still needs Electron verification:

- Restart or reload Electron so the new scripts load.
- Start a match.
- Run `fateRenderSnapshotReport()`.
- Run `fateBuildRenderSnapshot()` and inspect:
  - `snapshot.counts.boardCards`
  - `snapshot.board.length`
  - `snapshot.players[0].handCount`
  - `snapshot.players[1].handCount`
  - `snapshot.signature`
- Run `fatePerfReport()` and confirm `renderSnapshot` and `renderV2Flags` appear.

User-reported Electron `fateRenderSnapshotReport()` checkpoint:

- `available: true`
- `version: 1`
- `mode: "snapshot"`
- `viewer: 0`
- `zones: 3`
- `boardCards: 1`
- `handCounts: [6, 3]`
- `builds: 1`
- `lastMs: 1.9`
- `signature: "49b842ae"`

Interpretation:

- Phase 1 snapshot builder is available in Electron.
- Snapshot counts are plausible for an early match state.
- Snapshot build time is low enough for Phase 1 diagnostics.

Additional user-reported snapshot signature:

- `signature: "0d77b222"`

Interpretation:

- Snapshot signatures change as match state changes, which is expected.
- This suggests the snapshot builder is reading live state rather than returning a stale cached value.

### 2026-06-04 Phase 2 Start

Implemented the math-only match layout engine foundation.

Changed files:

- `src/scripts/render-v2/02-match-layout-engine.js`
- `src/scripts/21-smoothness-core.js`
- `index.html`

What changed:

- Added `window.FateMatchLayoutEngine`.
- Added console helpers:
  - `window.fateBuildMatchLayout()`
  - `window.fateMatchLayoutReport()`
- The pure layout path is `FateMatchLayoutEngine.build(snapshot, viewport, options)`.
- The convenience path `fateBuildMatchLayout()` builds from the latest render snapshot and a single board-container viewport rect.
- The layout engine does not query `.cell` or `.bc` DOM positions.
- It computes:
  - board rect;
  - zone rects;
  - zone header rects;
  - row rects;
  - row label/cells rects;
  - cell/card rects;
  - card rect list for future canvas drawing/hit maps.
- Row ordering matches the current DOM renderer perspective rule:
  - Player 0 viewer: rows `0, 1, 2`;
  - Player 1 viewer: rows `2, 1, 0`;
  - extra rows are placed near their owner.
- `fatePerfReport()` and `fateTraceLag()` now include `matchLayout`.
- `index.html` now loads `02-match-layout-engine.js` after the snapshot module.

Verification:

- `node --check src/scripts/render-v2/02-match-layout-engine.js` passed.
- `node --check src/scripts/21-smoothness-core.js` passed.
- Local HTTP delivery smoke test passed for:
  - `index.html?electron=1&fresh=phase2`
  - `src/scripts/render-v2/02-match-layout-engine.js?v=1780580801`
  - `src/scripts/21-smoothness-core.js?v=1780580001`

Still needs Electron verification:

- Restart or reload Electron so the new script loads.
- Start a match.
- Run `fateMatchLayoutReport()`.
- Run:
  - `const layout = fateBuildMatchLayout()`
  - `layout.zones.length`
  - `layout.cardRects.length`
  - `layout.viewport`
  - `layout.metrics`
- Run `fatePerfReport()` and confirm `matchLayout` appears.

User-reported Electron `fateMatchLayoutReport()` checkpoint:

- `available: true`
- `version: 1`
- `builds: 1`
- `zones: 3`
- `rows: 9`
- `cells: 27`
- `cards: 0`
- `lastMs: 0.8`
- `snapshotSignature: "228171dd"`
- `viewport: { x: 370, y: 82.9, w: 1021.9, h: 688.8, dpr: 1, ... }`

Interpretation:

- Phase 2 layout engine is available in Electron.
- It computed the expected base board shape: 3 zones, 9 rows, 27 cells.
- Build time is low.
- `cards: 0` is correct only if the board was empty at this checkpoint; test again after placing a card.

User-reported Phase 2 layout metrics checkpoint:

- `padding: 8.2`
- `zoneGap: 8`
- `rowGap: 4.1`
- `cellGap: 4`
- `headerH: 37.9`
- `rowLabelW: 54`

Interpretation:

- Layout metrics are being derived from the current board viewport.
- Values are within the expected compact-board range for the reported Electron viewport.

Phase 2 freshness fix:

- User observed `fateMatchLayoutReport()` still returning `cards: 0` with the old `snapshotSignature: "228171dd"` after board state had changed during testing.
- Root cause: layout helpers preferred the cached `FateRenderSnapshot.last()` snapshot, and snapshot/layout reports reused prior reports unless no report existed.
- Fix:
  - `fateRenderSnapshotReport()` now rebuilds the snapshot from current game state by default.
  - `fateMatchLayoutReport()` now rebuilds the layout from current game state by default.
  - `fateBuildMatchLayout()` now calls `fateBuildRenderSnapshot()` by default.
  - Cached snapshot use is still available only when explicitly passing `{ useLastSnapshot: true }`.
  - Script cache-busting updated to `1780581101` for snapshot and layout engine.

Verification:

- `node --check src/scripts/render-v2/01-render-snapshot.js` passed after the freshness fix.
- `node --check src/scripts/render-v2/02-match-layout-engine.js` passed after the freshness fix.
- Local HTTP delivery smoke test passed for:
  - `index.html?electron=1&fresh=phase2-freshness`
  - `src/scripts/render-v2/01-render-snapshot.js?v=1780581101`
  - `src/scripts/render-v2/02-match-layout-engine.js?v=1780581101`

User-reported post-freshness `fateMatchLayoutReport()` checkpoint:

- `available: true`
- `version: 1`
- `builds: 1`
- `zones: 3`
- `rows: 9`
- `cells: 27`
- `cards: 0`
- `lastMs: 1.4`
- `snapshotSignature: "dc40c856"`
- `viewport: { x: 370, y: 82.9, w: 1040.9, h: 801.4, dpr: 1, ... }`

Interpretation:

- Freshness fix appears active because the signature and viewport differ from the stale checkpoint.
- `cards: 0` is correct only if no card is currently on the board. If a card is visibly on the board, compare against `fateBuildRenderSnapshot().counts.boardCards`.

User-reported Phase 2 card mapping checkpoint:

- After placing a visible board card, `fateBuildMatchLayout().cardRects.length` returned `1`.

Interpretation:

- Phase 2 math layout can map a live board card to a canvas-ready card rectangle.
- This clears the minimum gate for starting Phase 3.

## Phase 3 - Layered Canvas Match Scene

Status: in progress.

Implemented:

- Added a `renderV2=scene` canvas renderer path inside `src/scripts/23-board-canvas-renderer.js`.
- The scene path builds a fresh render snapshot and match layout, then draws from those structures instead of reading `.cell`/`.bc` geometry.
- Layered drawing currently includes:
  - board background
  - zone panels
  - zone headers
  - row labels
  - cells
  - blocked and mark-safe overlays
  - board cards with existing image cache, fallback art, and Fate badges
- The existing DOM-backed canvas renderer remains the fallback.
- Added `fateRenderV2SceneReport()` and embedded `renderV2Scene` diagnostics in `fateCanvasBoardReport()`.
- Scene mode refuses to draw if snapshot board-card count and layout card-rect count disagree.
- Updated `index.html` cache bust for `23-board-canvas-renderer.js` to `1780581601`.

How to test Phase 3:

1. In Electron devtools, run:
   `FateRenderV2Flags.setMode('scene'); location.reload();`
2. Enter a solo match and place a card.
3. Run:
   `fateCanvasBoardReport()`
4. Expected signals:
   - `renderer: "render-v2-scene"`
   - `cards` equals the number of visible board cards
   - `renderV2Scene.enabled: true`
   - `renderV2Scene.expectedCards` equals `renderV2Scene.layoutCards`
   - `domCardCells: null`

Risk:

- Phase 3 currently draws a first full scene layer, but DOM still owns hit targets and interaction classes.
- Tribute/placement visual states are not fully represented in the snapshot yet, so the v2 scene does not claim input ownership.
- If `renderV2Scene.reason` reports `snapshot-layout-card-mismatch`, stay on the DOM fallback and inspect snapshot/layout counts before moving forward.

User-reported Phase 3 scene checkpoint:

- `fateCanvasBoardReport()` returned:
  - `renderer: "render-v2-scene"`
  - `cards: 4`
  - `expectedCards: 4`
  - `domCardCells: null`
  - `imagesPending: 0`
  - `layoutReadMs: 1.1`
  - `cardLoopMs: 0.4`
  - `lastMs: 2.8`
  - `renderV2Scene.enabled: true`

Interpretation:

- Phase 3 data/render path is alive: the v2 scene can render board cards entirely from snapshot + layout.
- This passes the architecture gate for "not DOM geometry dependent."
- Visual parity does not pass yet. User screenshot shows the board/UI looking materially different from the current production board.

Phase 3 blocker before moving on:

- Do not proceed to Phase 4 until v2 scene visual parity is tightened.
- The next Phase 3 work should make scene mode look intentionally compatible with the current board:
  - remove duplicate/competing zone/header treatment
  - match card sizing and row spacing more closely
  - avoid visual disruption to the surrounding hand/topbar/side panels
  - keep the current DOM-canvas/snapshot mode as the normal play fallback while scene mode is being tuned

Phase 3 visual parity correction:

- User confirmed the prior/original board visuals look good and should be preserved.
- Updated `src/scripts/23-board-canvas-renderer.js` so `renderV2=scene` now defaults to `visualMode: "production-card-layer"`.
- In production card-layer mode, the v2 canvas does not paint a replacement board background, zone panels, headers, row labels, or cell grid.
- The existing DOM board visuals remain visible underneath; v2 scene draws only the board-card layer from snapshot + layout.
- The full replacement scene is still available only for diagnostics with:
  - URL query: `renderV2DebugScene=1`
  - or localStorage: `fateRenderV2DebugScene = "1"`
- Updated `index.html` cache bust for `23-board-canvas-renderer.js` to `1780582101`.

Next visual parity checkpoint:

- In scene mode, `fateCanvasBoardReport().renderV2Scene.visualMode` should be `"production-card-layer"`.
- The board should visually resemble the previous/current board, while still reporting `renderer: "render-v2-scene"` and matching `cards`/`expectedCards`.

User-reported Phase 3 production-card-layer checkpoint:

- After placing one visible board card, combined report returned:
  - `canvas.renderer: "render-v2-scene"`
  - `canvas.cards: 1`
  - `canvas.expectedCards: 1`
  - `canvas.domCardCells: null`
  - `scene.visualMode: "production-card-layer"`
  - `scene.layers.background: 0`
  - `scene.layers.zones: 0`
  - `scene.layers.rows: 0`
  - `scene.layers.cells: 0`
  - `scene.layers.cards: 1`
  - `scene.layoutCards: 1`
  - `scene.snapshotSignature` matched `scene.layoutSignature`
  - `scene.lastMs: 0.6`

Interpretation:

- Phase 3 visual parity correction is active: v2 scene is not painting over the board/grid.
- The v2 scene is drawing only the card layer from snapshot + layout.
- This is the preferred production direction for Phase 3 unless a later visual audit finds card positioning or scaling mismatch.

User-reported Phase 3 duplicate-card visual issue:

- Screenshot showed a single placed card appearing doubled/offset.
- Diagnosis: v2 canvas card rendering was active, but the original DOM `.bc` card artwork was still visible underneath as part of the click target.
- Fix:
  - `src/scripts/23-board-canvas-renderer.js` now toggles `html.fate-render-v2-card-layer-mode` whenever `renderV2=scene` owns board-card visuals.
  - `src/styles/99-ui-final.css` hides board `.cell.has-card .bc` visual content only in that v2 card-layer mode.
  - DOM board card elements remain present for hit targets and interaction ownership.
  - Hand cards are not affected.
  - Cache busts updated to `1780582501` for `99-ui-final.css` and `23-board-canvas-renderer.js`.

Next checkpoint:

- In `renderV2=scene`, a placed board card should appear once, not as a double/offset visual.
- Report should still show `renderer: "render-v2-scene"` and `renderV2Scene.visualMode: "production-card-layer"`.

User-reported Phase 3 card alignment issue:

- After the duplicate-card visual was fixed, screenshot showed v2 canvas cards appearing once but not aligned to their board squares.
- Diagnosis:
  - First v2 layout used broad fluid math and a wide `rowLabelW` around `54px`.
  - Production board CSS uses fixed card variables (`--cw`, `--ch`), a slim `12px` row label, small row-label gap, centered flex zones, and `--zone-fit-w`.
  - The v2 math card rectangles therefore drifted from the real production squares.
- Fix:
  - `src/scripts/render-v2/02-match-layout-engine.js` now defaults to production-board CSS geometry:
    - `cardW` mirrors `clamp(108px, 7.45vw, 145px)`
    - `cardH` mirrors `clamp(151px, 10.43vw, 203px)`
    - row label width is `12px`
    - cell gap, row gap, board gap, zone width, board padding, and zone centering mirror the CSS values from `zz-codex-last.css`
  - `src/scripts/23-board-canvas-renderer.js` now reports `renderV2Scene.domAlignment` as a diagnostic comparison between math card rects and DOM `.bc` rects. This is diagnostic only; it does not place cards from DOM rects.
  - Cache busts updated to `1780583001` for `02-match-layout-engine.js` and `23-board-canvas-renderer.js`.

Next checkpoint:

- In `fateCanvasBoardReport().renderV2Scene.domAlignment`, target small drift:
  - `maxDx` near `0`
  - `maxDy` near `0`
  - `maxDw` near `0`
  - `maxDh` near `0`
- Visually, the placed card should sit inside the square rather than between/offset from squares.

User-reported Phase 3 near-final alignment issue:

- After production CSS geometry matching, screenshot showed cards were almost aligned but sitting slightly too high inside their squares.
- Fix:
  - Added `cardOffsetY: 5` to the production CSS metrics in `src/scripts/render-v2/02-match-layout-engine.js`.
  - This nudges v2 board-card rects downward in `production-card-layer` mode.
  - The offset is exposed in `fateBuildMatchLayout().metrics.cardOffsetY` for future tuning.
  - Cache bust updated to `1780583301` for `02-match-layout-engine.js`.

Next checkpoint:

- Reload Electron, place a card, and visually confirm the card now sits vertically centered in the square.
- If still high/low, tune `cardOffsetY` rather than changing renderer drawing code.

User-reported Phase 3 centered-card acceptance:

- User confirmed `fateBuildMatchLayout().metrics.cardOffsetY` returned `5`.
- User confirmed placed v2 scene cards are now centered in the board squares.

Interpretation:

- Phase 3 production-card-layer visual alignment is accepted for the current Electron viewport.
- Current scene mode status:
  - draws from snapshot + math layout
  - preserves the existing production board visuals
  - hides duplicate DOM board-card artwork while retaining DOM hit targets
  - aligns board cards inside squares

Remaining Phase 3 caution:

- Before declaring Phase 3 fully complete, test at least:
  - multiple board cards across different zones and rows
  - opponent row / own row / contested row
  - one card after discard/removal to ensure canvas clears correctly
  - one modal/action flow to make sure hidden DOM card artwork does not break selection affordances

User-reported Phase 3 interaction acceptance:

- User tested action/modal-style interactions with the hidden DOM board-card artwork in v2 scene mode.
- User reported these interactions appear good.

Interpretation:

- Phase 3 is cleared for the current Electron path.
- The v2 scene can remain in `production-card-layer` mode while later phases continue.
- Keep the DOM-backed fallback available, but current evidence supports moving to Phase 4.

## Phase 4 - Card Texture Cache

Status: started.

Implemented:

- Added `src/scripts/render-v2/03-card-texture-cache.js`.
- Added `window.FateCardTextureCache` with:
  - `get(src, options)`
  - `preload(src, options)`
  - `report()`
  - `clear()`
  - `configure(options)`
  - `prune()`
- Added console helpers:
  - `fateCardTextureCacheReport()`
  - `fateClearCardTextureCache()`
- Cache tracks:
  - requests, hits, misses
  - loads, failures, fallback loads
  - image decode attempts/successes
  - `ImageBitmap` attempts/successes when supported
  - LRU evictions and clears
  - entry count, loaded/pending/failed counts, bitmap count
  - total pixel estimate and estimated bytes
  - recent texture entries with load/decode/bitmap timings
- Cache policy:
  - default max entries: `160`
  - default max pixels: `48,000,000`
  - LRU prune skips pending textures
  - closes `ImageBitmap` objects on eviction/clear when possible
- Existing image fallback logic is preserved:
  - uses `getFullCardImageFallbackSrc()` when available
  - otherwise falls back from optimized thumbnails to original PNG path
- `src/scripts/23-board-canvas-renderer.js` now uses `FateCardTextureCache` as the primary card image source.
- Board renderer now draws `rec.bitmap || rec.img`, so decoded bitmaps are used when available.
- `fateCanvasBoardReport()` now includes a `textureCache` report.
- `imagesPending` and `cacheSize` now come from the texture cache when available.
- Added `03-card-texture-cache.js?v=1780583701` before the board renderer in `index.html`.
- Cache-busted `23-board-canvas-renderer.js` to `1780583701`.

Verification:

- `node --check src/scripts/render-v2/03-card-texture-cache.js` passed.
- `node --check src/scripts/23-board-canvas-renderer.js` passed.

Phase 4 test checklist:

- In Electron scene mode, place cards and run:
  - `fateCardTextureCacheReport()`
  - `fateCanvasBoardReport().textureCache`
- Expected signals:
  - `entries` grows with unique card images
  - repeated draws increase `stats.hits`
  - `pending` returns to `0`
  - `loaded` matches visible/preloaded card textures
  - `bitmaps` may grow if Electron supports `createImageBitmap`
  - board cards still visually match Phase 3 accepted alignment

Risk:

- This phase changes image ownership but should not change gameplay state or card positioning.
- If a card fails to appear, compare `fateCardTextureCacheReport().recent` against the card image path and fallback state.

Phase 4 plan audit after user correction:

- User correctly flagged that Phase 4 should not proceed from memory/progress notes alone.
- Re-read the actual plan file:
  - `C:\Users\liang\AppData\Local\Temp\rendering-performance-v2-plan.md`
- Audit finding:
  - Initial Phase 4 draft was directionally useful but incomplete.
  - It matched the required `03-card-texture-cache.js` file direction, image decode/bitmap use, graceful fallback, reporting, and LRU idea.
  - It did not yet match the planned API shape or sized base-card texture key requirements.

Phase 4 amendments after audit:

- `src/scripts/render-v2/03-card-texture-cache.js` now exposes the plan-shaped methods:
  - `preloadVisible(snapshot, layout)`
  - `getBaseCardTexture(card, size, options)`
  - `getArtBitmap(src)`
  - `clearUnused(activeKeys)`
  - `getReport()`
- Existing helpers remain:
  - `get(src, options)` as an alias for `getArtBitmap`
  - `preload(src, options)`
  - `report()`
  - `clear()`
  - `configure(options)`
  - `prune()`
- Cache is now split into:
  - art bitmap records
  - sized base-card texture records
- Base-card texture keys include:
  - card id / iid fallback
  - image source
  - face-up/down state
  - rarity
  - affinity
  - rounded width/height
  - DPR bucket
- Board renderer now asks for `getBaseCardTexture(...)` and draws the cached base card canvas when ready.
- Dynamic overlays remain outside the base texture:
  - Fate badge/pulse
  - tribute cues
  - marked-for-death overlay
  - opponent tint
- `preloadVisible(snapshot, layout)` is now called from the v2 scene path without blocking match start.
- `renderV2Scene.preload` reports visible preload request counts.
- Cache busts updated to `1780584201` for:
  - `03-card-texture-cache.js`
  - `23-board-canvas-renderer.js`

Verification after audit amendments:

- `node --check src/scripts/render-v2/03-card-texture-cache.js` passed.
- `node --check src/scripts/23-board-canvas-renderer.js` passed.
- `git diff --check` passed, aside from normal LF-to-CRLF warnings.

Phase 4 current status:

- Plan-aligned implementation is now in place.
- Electron runtime validation passed.
- User reported:
  - `artEntries: 10`
  - `baseEntries: 7`
  - `bitmaps: 10`
  - `entries: 17`
  - `loaded: 17`
  - `pending: 0`
  - `failed: 0`
  - `estimatedBytes: 21080896`
  - repeated cache hits were present
  - cards remained centered
- Phase 4 is cleared for the current Electron path.

## Phase 5 - V2 Board Ownership

Status: started, opt-in only.

Plan source:

- `C:\Users\liang\AppData\Local\Temp\rendering-performance-v2-plan.md`, section `## 10. Phase 5: v2 board ownership`.

Plan requirement:

- `renderBoard()` must return early when `FateMatchRendererAdapter.ownsBoard()` is true.
- In v2 board-owned mode:
  - do not create board `.cell` elements
  - do not create board `.bc` elements
  - do not call `fateRenderBoardCanvas()`
  - do not let `23-board-canvas-renderer.js` draw
- Legacy fallback:
  - `?domBoard=1`
  - `localStorage.fateDisableMatchRendererV2 = "1"`

Implemented:

- Added `src/scripts/render-v2/04-match-renderer-adapter.js`.
- Added `window.FateMatchRendererAdapter` with:
  - `ownsBoard()`
  - `renderFromGameState(options)`
  - `scheduleRender(source)`
  - `report()`
  - `enable()`
  - `disable()`
- Added console helpers:
  - `fateEnableMatchRendererV2()`
  - `fateDisableMatchRendererV2()`
  - `fateMatchRendererV2Report()`
- Modified `src/scripts/06-rendering-and-helpers.js`:
  - `renderBoard()` now checks `FateMatchRendererAdapter.ownsBoard()` before legacy DOM board creation.
  - If v2 owns the board, it calls `renderFromGameState({ board: true, source: "renderBoard" })` and returns.
- Added script to `index.html`:
  - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780584701`
- Cache-busted `06-rendering-and-helpers.js` to `1780584701`.

Current behavior:

- V2 board ownership is disabled by default.
- Enable with:
  - `fateEnableMatchRendererV2(); location.reload();`
- Disable/fallback with:
  - `fateDisableMatchRendererV2()`
  - or launch with `?domBoard=1`
- In enabled mode, the adapter owns the `#board` children and draws a canvas scene from snapshot + math layout + card texture cache.
- It removes the legacy `fate-board-canvas` if present and does not call `fateRenderBoardCanvas()`.

Verification:

- `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
- `node --check src/scripts/06-rendering-and-helpers.js` passed.

Phase 5 test checklist:

- Enable v2 board ownership:
  - `fateEnableMatchRendererV2(); location.reload();`
- Enter a match and run:
  - `document.querySelectorAll('#board .cell').length`
  - `document.querySelectorAll('#board .bc').length`
  - `fateMatchRendererV2Report()`
- Expected:
  - `.cell` count is `0`
  - `.bc` count is `0`
  - `fateMatchRendererV2Report().ownsBoard === true`
  - `fateMatchRendererV2Report().cards` equals board card count

Risk:

- Phase 5 is board ownership only. Real board input ownership is Phase 6.
- Current v2-owned board should be treated as an opt-in renderer validation path, not default gameplay yet.
- Legacy remains the safe play path until Phase 6 input is implemented.

User-reported Phase 5 DOM ownership checkpoint:

- After enabling v2 board ownership, user ran:
  - `document.querySelectorAll('#board .cell').length`
  - `document.querySelectorAll('#board .bc').length`
  - `fateMatchRendererV2Report()`
- Reported result:
  - `cells: 0`
  - `cards: 0`
  - `report.available: true`
  - `report.version: 1`
  - `report.ownsBoard: true`
  - `report.enableFlag: true`
  - `report.disabled: false`

Interpretation:

- The core Phase 5 DOM ownership gate is passing.
- `renderBoard()` is successfully routing to the v2 adapter instead of building legacy board `.cell` / `.bc` DOM.
- Need one final Phase 5 visual/card-count confirmation before declaring Phase 5 complete:
  - v2 board visually renders expected cards from `G.board`
  - `fateMatchRendererV2Report().cards` equals the current board card count

User-reported Phase 5 issues:

- V2-owned board visually differs from the accepted Phase 3 board look.
- Card placement no longer works when clicking board squares.
- Opponent cards look slightly blurrier.

Interpretation:

- The no-DOM ownership gate is passing, but Phase 5 is not a playable/default path by itself.
- Placement failure is expected from the plan boundary: Phase 5 removes `.cell` DOM targets, while Phase 6 is responsible for renderer-owned input.
- Visual parity still needs tuning in the v2-owned full-board canvas path.
- Blur should be monitored after input is fixed; the adapter now requests high-quality canvas smoothing.

## Phase 6 - Renderer-Owned Input

Status: started.

Plan source:

- `C:\Users\liang\AppData\Local\Temp\rendering-performance-v2-plan.md`, section `## 11. Phase 6: renderer-owned input`.

Plan requirement:

- Create `06-match-scene-input.js`.
- Use layout-engine hit map.
- Board card click should preserve current behavior:
  - spectator opens detail
  - target/consolidation/prompt calls existing prompt/cell action path
  - normal board card calls `activateBoardCard(card, z, r, c)`
- Empty cell click calls `clickCell(z, r, c)`.
- Start with click-to-select, drag later.

Implemented:

- Added `src/scripts/render-v2/06-match-scene-input.js`.
- Added `window.FateMatchSceneInput` class with:
  - `attach(container)`
  - `detach()`
  - `hitTest(x, y)`
  - `handlePointerMove(ev)`
  - `handlePointerDown(ev)`
  - `handlePointerUp(ev)`
- `src/scripts/render-v2/04-match-renderer-adapter.js` now:
  - builds `lastHitMap.cards`
  - builds `lastHitMap.cells`
  - exposes `getHitMap()`
  - attaches `FateMatchSceneInput` to the v2 board canvas
  - reports hit-map counts
  - sets canvas `imageSmoothingQuality = "high"` when supported
- `06-match-scene-input.js` calls existing gameplay functions instead of inventing new rules:
  - `clickCell(z, r, c)`
  - `activateBoardCard(card, z, r, c)`
  - `openCardDetail(card, false, true)` for spectators
- Added script to `index.html`:
  - `src/scripts/render-v2/06-match-scene-input.js?v=1780585201`
- Cache-busted `04-match-renderer-adapter.js` to `1780585201`.

Phase 6 test checklist:

- With v2 board ownership enabled, select a hand card and click an empty board square.
- Expected:
  - card placement works
  - `document.querySelectorAll('#board .cell').length` remains `0`
  - `document.querySelectorAll('#board .bc').length` remains `0`
  - `fateMatchRendererV2Report().hitMap.cells` is greater than `0`
  - `fateMatchRendererV2Report().hitMap.cards` matches visible board cards
- Also test clicking an existing board card.

Risk:

- This is click-first input only.
- Drag/hover polish and selection highlight ownership are not complete yet.
- Existing gameplay functions still contain some DOM lookup side effects; Phase 6 may need adapter shims if specific card effects rely on DOM cells for prompts/animations.

User-reported Phase 6 placement checkpoint:

- With v2 board ownership enabled, report showed:
  - `ownsBoard: true`
  - `enableFlag: true`
  - `disabled: false`
  - `domCells: 0`
  - `domCards: 0`
  - `hitMap.cells: 27`
- After selecting a hand card and clicking a board square, user reported:
  - `boardCards: 5`
  - `selectedHandCard: null`
  - `placing: false`
  - `phase: "main"`
  - `currentPlayer: 0`

Interpretation:

- Phase 6 click-to-place is working through v2 renderer-owned hit testing.
- The v2 board remains DOM-cell-free while placement succeeds.
- This clears the first core Phase 6 acceptance test.

Remaining Phase 6 checks before completion:

- Click an existing board card and confirm normal board-card behavior.
- Test one targeting/consolidation/prompt click path if available.
- Confirm spectator card detail behavior if practical.
- Continue carrying Phase 5 visual polish risk:
  - v2-owned full board still looks different from the accepted Phase 3 production-card-layer board.
  - opponent card blur should be rechecked after more runtime use.

## Phase 7 - Animation Timeline

Status: started.

Plan source:

- `C:\Users\liang\AppData\Local\Temp\rendering-performance-v2-plan.md`, section `## 12. Phase 7: animation timeline`.

Plan requirement:

- Create `07-animation-timeline.js`.
- Add `FateAnimationTimeline` with:
  - `add(animation)`
  - `tick(now)`
  - `hasActiveAnimations()`
  - `clearForCard(iid)`
- Animation examples include:
  - `card-move`
  - `fate-pulse`
- State changes immediately; renderer animates transition between snapshots.
- Moving card draws on fx/ui layer.
- Base cards layer redraws once when animation completes.
- Avoid expensive `shadowBlur` every frame.

Implemented:

- Added `src/scripts/render-v2/07-animation-timeline.js`.
- Added `window.FateAnimationTimeline` class.
- Added shared timeline instance:
  - `window.FateMatchAnimationTimeline`
- Added console helpers:
  - `fateAnimationTimelineReport()`
  - `fateClearCardAnimations(iid)`
- Timeline supports:
  - `add(animation)`
  - `tick(now)`
  - `hasActiveAnimations()`
  - `clearForCard(iid)`
  - `getForCard(iid, kind)`
  - `report()`
- Timeline tracks:
  - active animations
  - recent completed animations
  - added/cleared counts
  - active counts by kind
- `src/scripts/render-v2/04-match-renderer-adapter.js` now:
  - ticks the timeline while drawing the v2-owned board
  - reports timeline status under `fateMatchRendererV2Report().animations`
  - schedules animation redraws only while animations are active
  - detects Fate value changes for visible board cards and adds `fate-pulse` animations
  - draws a cheap fate-pulse overlay without per-frame `shadowBlur`
  - remembers visible board card rects by `iid`
  - adds `card-move` animations when a board card's v2 layout rect changes
  - draws active moving cards on a final overlay pass instead of duplicating the card at both old and new positions
- `src/scripts/render-v2/07-animation-timeline.js` now supports kind-scoped card clears via:
  - `clearForCard(iid, kind)`
  - `clearForCardKind(iid, kind)`
- Added script to `index.html`:
  - `src/scripts/render-v2/07-animation-timeline.js?v=1780585901`
- Cache-busted `04-match-renderer-adapter.js` to `1780585901`.

Current scope:

- Phase 7 has started with timeline ownership, `fate-pulse` support, and board-to-board `card-move` support.
- Hand-to-board movement is not animated yet because the hand is still outside the v2 scene until Phase 8.
- Existing DOM placement/cinematic animations still exist for legacy paths and some gameplay side effects.

Verification:

- `node --check src/scripts/render-v2/07-animation-timeline.js` passed.
- `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
- `git diff --check` passed with line-ending warnings only.
- Electron was launched with `npm start` after the runtime update.
- After adding board-to-board `card-move`, the same checks passed again.

Runtime feedback and stabilization:

- User reported `fateMatchRendererV2Report()` with:
  - `ownsBoard: true`
  - `domCells: 0`
  - `domCards: 0`
  - `hitMap: { cards: 4, cells: 27 }`
  - `animations.active: 0`
  - `animations.added: 94`
  - `draws: 271`
- Interpretation:
  - v2 ownership/input remains functionally active and idle animations are completing.
  - `draws` / `animations.added` are higher than ideal, so animation creation needed tightening.
- User also reported:
  - consolidation highlights are no longer visible in v2-owned board mode
  - Carolyn block visual was reduced to a red square
- Follow-up patch:
  - `src/scripts/render-v2/04-match-renderer-adapter.js` now draws consolidation/tribute cue states directly on canvas:
    - `available`
    - `selected`
    - `ready`
    - `placement`
  - v2 cells now draw Carolyn/Zoe-specific block overlays instead of a generic red fill.
  - v2 `card-move` now only starts when the render snapshot changes, avoiding resize/texture-only layout churn.
  - Cache-busted `04-match-renderer-adapter.js` to `1780586001`.
- Checks:
  - `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
  - `git diff --check` passed with line-ending warnings only.

Phase 7 test checklist:

- With v2 board ownership enabled, run:
  - `fateAnimationTimelineReport()`
  - `fateMatchRendererV2Report().animations`
- Trigger a Fate value change if practical.
- Trigger a board-to-board movement if practical.
- Expected:
  - timeline report is available
  - active animations remain `0` while idle
  - when Fate changes, a temporary `fate-pulse` appears and then completes
  - when an already-boarded card changes cells, a temporary `card-move` appears and then completes
  - v2 board does not redraw continuously while idle

Risk:

- This is still timeline foundation work, not full animation migration.
- Hand-to-board placement animation still needs a future pass once hand/pile rendering moves into v2.

## Render V2 Polish Pass - Board Clarity, Timer, Zone Frame

Status: implemented for user testing.

Reason:

- User paused phase work to polish v2-owned board usability/visual quality.
- Reported issues:
  - board cards looked slightly blurry
  - turn timer/HUD position has been broken since before the render plan work
  - cards flicker when clicking board cards
  - semi-transparent zone backdrops make the board look worse
  - zones should look better and more professional

Implemented:

- `src/scripts/render-v2/03-card-texture-cache.js`
  - Added `preferFullArt` option so v2 board textures can prefer full card PNGs over optimized thumbnails.
- `src/scripts/render-v2/04-match-renderer-adapter.js`
  - Board card base textures now request full art at fixed 2x texture resolution.
  - Fallback art path also prefers full art.
  - Ignored `bitmap-ready` redraw callbacks to reduce texture callback redraw churn.
  - Removed the broad smoky canvas backdrop from the v2 scene.
  - Reduced zone fill opacity and redesigned zones around cleaner gold frames, corner marks, and subtler cells.
  - Kept cell ownership tints much lighter so the background art shows through.
- `src/styles/99-ui-final.css`
  - Added render-v2 polish override:
    - topbar reserves stable space
    - topbar text/timer fallback is hidden
    - `turn-hud` becomes the centered match clock panel near the top of the game screen
    - v2-owned board background is transparent
- `index.html`
  - Cache-busted:
    - `src/styles/99-ui-final.css?v=1780586101`
    - `src/scripts/render-v2/03-card-texture-cache.js?v=1780586101`
    - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780586101`

Verification:

- `node --check src/scripts/render-v2/03-card-texture-cache.js` passed.
- `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
- `git diff --check` passed with line-ending warnings only.

Needs user visual check:

- Card sharpness on the board.
- Whether board-card click flicker is reduced.
- Whether the centered timer is in the right place.
- Whether the new zone frame style feels better.
- Whether the board background is now clean enough without the semi-transparent zone panels.

Follow-up timer duplicate fix:

- User screenshot showed two clock/timer panels.
- Cause:
  - old `.tp-mid` topbar clock shell/pseudo-elements remained visible while the new centered `turn-hud` was active.
- Fix:
  - `src/styles/99-ui-final.css` now collapses/hides `.tp-mid` itself in match UI, including `::before` and `::after`.
  - `turn-hud` remains the single visible match clock.
  - Cache-busted `src/styles/99-ui-final.css` to `1780586201`.

## Phase 8 - Hand/Pile Migration Decision Measurement

Status: started.

Plan source:

- `C:\Users\liang\AppData\Local\Temp\rendering-performance-v2-plan.md`, section `## 13. Phase 8: migrate hand and piles only after measurement`.

Plan requirement:

- After board v2 is stable, measure whether hand/piles are still hot.
- If hot:
  - move own hand, opponent hand placeholders, and deck/discard pile visuals into the v2 scene.
- If not hot:
  - keep hand DOM temporarily
  - fix renderHand scoping
  - continue the performance pass
- Do not migrate unrelated app UI into canvas.

Implemented:

- Added `src/scripts/render-v2/08-hand-pile-phase8-report.js`.
- It wraps:
  - `renderHand`
  - `renderOppHand`
  - `renderPiles`
- It records:
  - call counts
  - average/max/last render time
  - slow call counts
  - recent render samples
  - hand/opponent-hand/pile DOM counts
  - v2 renderer report context
- Added helpers:
  - `fatePhase8HandPileReport()`
  - `fatePhase8IdleReport(ms)`
- Added script to `index.html`:
  - `src/scripts/render-v2/08-hand-pile-phase8-report.js?v=1780586201`

Phase 8 test commands:

- Run after entering a match:
  - `fatePhase8HandPileReport()`
- Run while idle:
  - `await fatePhase8IdleReport(5000)`

Expected:

- If idle deltas are `0` or very low and hand/pile max/avg times are low, Phase 8 should keep hand/piles in DOM for now.
- If renderHand/renderPiles are repeatedly slow or called constantly while idle, Phase 8 should migrate the hot surface or reduce direct render calls.

User Phase 8 measurements:

- `await fatePhase8IdleReport(5000)` returned:
  - `renderHand: 0`
  - `renderOppHand: 0`
  - `renderPiles: 0`
  - `rendererDraws: 0`
- Expanded stats:
  - `renderHand`: `calls: 20`, `avgMs: 1.5`, `maxMs: 10.7`, `slowCalls: 1`
  - `renderOppHand`: `calls: 18`, `avgMs: 0.7`, `maxMs: 1.7`, `slowCalls: 0`
  - `renderPiles`: `calls: 14`, `avgMs: 6.1`, `maxMs: 28.8`, `slowCalls: 3`

Decision:

- Do not migrate hand/opponent hand into canvas right now.
- Idle behavior is clean.
- Hand/opponent-hand render costs are acceptable.
- `renderPiles` is the only hot Phase 8 surface.

Pile optimization:

- `src/scripts/06-rendering-and-helpers.js` now skips repainting discard pile canvas art when the art source, slot size, and DPR have not changed.
- This avoids repainting discard art when only deck/discard counts changed.
- Cache-busted `src/scripts/06-rendering-and-helpers.js` to `1780586301`.

Needs re-test:

- Run:
  - `fatePhase8HandPileReport().stats.renderPiles`
  - `await fatePhase8IdleReport(5000)`
- Expected:
  - idle deltas remain `0`
  - `renderPiles.avgMs` and `maxMs` should drop after a few pile renders

User re-test:

- `renderPiles` improved to:
  - `calls: 26`
  - `avgMs: 3.7`
  - `maxMs: 9.6`
  - `lastMs: 5.8`
- Decision:
  - keep hand/piles in DOM for now
  - Phase 8 is good enough to move on
  - do not migrate hand/piles into canvas unless later gameplay testing shows repeated hot calls

## Phase 9 - V2-Scoped CSS

Status: implemented for user testing.

Plan source:

- `C:\Users\liang\AppData\Local\Temp\rendering-performance-v2-plan.md`, section `## 14. Phase 9: v2-scoped CSS only`.

Plan requirement:

- Add `src/styles/match-scene-v2.css`.
- Scope renderer v2 CSS to the v2 match scene.
- Do not globally rewrite `game.css`.
- Do not rename legacy classes.
- Do not reorganize `99-ui-final.css` or `zz-codex-last.css`.
- Do not delete large CSS sections.
- Include low-effects support scoped to v2.

Implemented:

- Added `src/styles/match-scene-v2.css`.
- Added CSS scoped to:
  - `#s-game.fate-renderer-v2`
  - `html.fate-match-renderer-v2-mode`
  - `#board.fate-match-v2-owned-board`
  - `#fate-match-v2-canvas`
- The v2 stylesheet:
  - positions and contains the v2-owned board/canvas
  - hides any accidental legacy `.cell` / `.bc` board nodes only in v2 mode
  - hides the old `#fate-board-canvas` in v2 mode
  - adds v2-scoped low-effects rules for backdrop/filter/animation suppression
- `src/scripts/render-v2/04-match-renderer-adapter.js` now adds `fate-renderer-v2` to `#s-game` when v2 owns the board.
- Disable path removes:
  - `#s-game.fate-renderer-v2`
  - `#board.fate-match-v2-owned-board`
  - `html.fate-match-renderer-v2-mode`
- `index.html` now loads:
  - `src/styles/match-scene-v2.css?v=1780586401`
- Cache-busted:
  - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780586401`

Phase 9 acceptance checks:

- In v2 mode, run:
  - `document.getElementById('s-game').classList.contains('fate-renderer-v2')`
  - `document.querySelectorAll('#board .cell').length`
  - `document.querySelectorAll('#board .bc').length`
  - `fateMatchRendererV2Report()`
- Expected:
  - `fate-renderer-v2` is `true`
  - board `.cell` count is `0`
  - board `.bc` count is `0`
  - `ownsBoard` remains `true`

User acceptance checkpoint:

- User reported:
  - `v2Class: true`
  - `cells: 0`
  - `cards: 0`
  - `fateMatchRendererV2Report().ownsBoard: true`
  - `enableFlag: true`
  - `disabled: false`
- Interpretation:
  - Phase 9 v2 CSS scoping is active.
  - V2 board ownership continues to suppress legacy `.cell` / `.bc` DOM.
  - Phase 9 implementation is accepted.

## Final Rendering Acceptance Audit

Status: conditionally passed for continuing past the rendering architecture pass, with explicit gaps.

Audit date:

- 2026-06-04

Plan source:

- `C:\Users\liang\AppData\Local\Temp\rendering-performance-v2-plan.md`
- Sections checked:
  - `## 16. Acceptance tests`
  - `## 19. Definition of done`

Static verification:

- `node --check` passed for all render-v2 files:
  - `00-render-v2-flags.js`
  - `01-render-snapshot.js`
  - `02-match-layout-engine.js`
  - `03-card-texture-cache.js`
  - `04-match-renderer-adapter.js`
  - `06-match-scene-input.js`
  - `07-animation-timeline.js`
  - `08-hand-pile-phase8-report.js`
- `node --check` passed for touched legacy render files:
  - `src/scripts/06-rendering-and-helpers.js`
  - `src/scripts/21-smoothness-core.js`
  - `src/scripts/23-board-canvas-renderer.js`
- `git diff --check` passed with line-ending warnings only.

Acceptance checklist:

- Passed: `renderGame()` string parts are scoped. Phase 0 user/runtime reports showed scoped requests with `broadRenderRequests: 0`.
- Passed: pointer-deferred render flushing preserves dirty parts.
- Passed: v2 board renders from state snapshot plus math layout, not hidden DOM card nodes.
- Passed: v2 board creates zero board `.cell` and zero board `.bc` nodes in enabled mode.
- Passed: v2 renderer owns board hit testing through `06-match-scene-input.js`.
- Passed: empty-cell placement works in v2 mode, confirmed by user placement checkpoint.
- Passed: board-card clicking/modal/prompt paths were tested by user and considered good enough to proceed.
- Passed: card texture cache exists, reports loaded/pending/failed counts, and user reports showed `pending: 0`, `failed: 0`.
- Passed: idle v2 board does not continuously redraw. User idle sample returned `drawDelta: 0`, `animationDelta: 0`, `activeAnimations: 0`.
- Passed: Phase 8 measurement supported keeping hand/opponent hand DOM for now.
- Passed: pile render hot path was optimized and improved from `avgMs: 6.1`, `maxMs: 28.8` to `avgMs: 3.7`, `maxMs: 9.6`.
- Passed: v2 CSS was added as `src/styles/match-scene-v2.css` without a global CSS rewrite.
- Passed: legacy fallback remains available by code through `?domBoard=1` and `fateDisableMatchRendererV2()`.
- Partial: performance reports exist through `fatePerfReport()`, `fateTraceLag()`, `fateMatchRendererV2Report()`, `fateCardTextureCacheReport()`, `fateAnimationTimelineReport()`, and `fatePhase8HandPileReport()`.
- Partial: browser throttle and service-worker state are reported in existing diagnostics, but no full automated matrix has been run.
- Not complete: the plan's named `fatePerfMatrixReport()` helper is not present.
- Not complete: the full deterministic matrix across legacy DOM board, current canvas board, v2 board, DPR 1/1.5/2, low-effects on/off, service worker on/off, and all scenarios has not been completed.
- Not complete: online authoritative state apply cannot be accepted yet because server-authoritative multiplayer work has not started.

Known visual/backlog issues:

- V2-owned board is playable, but not final visual parity.
- Some selection/target/consolidation highlights still need polish.
- Some special block visuals were restored from a red-square fallback, but should receive a dedicated visual QA pass.
- Board cards were improved with full-art/high-resolution texture requests, but final sharpness should still be inspected across DPR/zoom.
- The turn timer duplicate was fixed by hiding the old `.tp-mid` shell in v2 match mode and keeping the centered `turn-hud`.

Conclusion:

- Rendering phases 0 through 9 are complete enough to move forward.
- Do not claim the entire rendering architecture is permanently "fixed" until the missing deterministic performance matrix and remaining visual parity checks are completed.
- The next large architecture track can begin, but keep a short rendering polish/backlog pass available before default rollout or packaging.

## V2 Match Visual Experiment

Status: implemented for user testing.

Reason:

- User requested a separate visual checkpoint backup and a more creative match-board direction.
- User specifically allowed:
  - new board design exploration
  - making the hand appear directly at the bottom of the screen
  - hiding the bottom UI/action panel temporarily
  - adjusting the top bar

Backup:

- Created a separate current-state backup before edits:
  - `project-backups\20260604-210439-visual-match-checkpoint`
- This backup preserves the current v2 renderer and match visual checkpoint before the creative board experiment.

Changed files:

- `src/scripts/render-v2/04-match-renderer-adapter.js`
- `src/styles/match-scene-v2.css`
- `index.html`

What changed:

- V2 board zones now draw as lighter luminous lanes over the match background:
  - zone-specific rail colors
  - cleaner corner rails
  - slimmer score capsules
  - subtler cells with faint cross marks for empty cells
- The v2 hand UI is now a floating bottom card row:
  - old hand panel frame hidden
  - hand label hidden
  - cards hover upward from the bottom edge
  - card interaction remains DOM-based for now
- The old bottom action bar is hidden only in v2 renderer mode for this test.
- The topbar is visually tightened in v2 mode, with the centered `turn-hud` kept as the main match clock.
- Cache-busted:
  - `src/styles/match-scene-v2.css?v=1780587001`
  - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780587001`

Risk:

- This is a visual test, not final UX.
- Hiding the bottom action panel means some convenience commands are temporarily unavailable from that panel.
- If the floating hand feels better, the next pass should move critical commands such as End Turn into a cleaner top/right command surface instead of leaving them hidden.

### Pseudo-3D Tabletop Pass

Status: implemented for user testing.

Reason:

- User asked whether the match board could feel more like a 3D tabletop/card battler, with dimensional board/cards.
- Decision:
  - prototype the look in the current v2 canvas first
  - do not introduce Three.js yet
  - preserve existing state/layout/input architecture

Changed files:

- `src/scripts/render-v2/04-match-renderer-adapter.js`
- `src/styles/match-scene-v2.css`
- `index.html`

What changed:

- Added a subtle table-atmosphere layer:
  - radial light bloom
  - vignette
  - perspective lane guide lines
  - depth bands across the board
- Board zones now feel more like raised tabletop planes:
  - luminous rails
  - zone-specific tinting
  - slimmer control score capsules
  - lighter empty-cell cross marks
- Board cards now draw with pseudo-3D treatment:
  - stable per-card tilt
  - contact shadow
  - slight vertical plane compression
  - diagonal surface gleam
  - depth-sorted drawing so lower cards render over farther cards
- The hand now fans along the bottom edge:
  - per-card rotation and vertical offsets
  - stronger hover lift
  - old hand panel frame remains hidden
- The old bottom action panel remains visually removed, but `End Turn` is preserved as a floating command button for playability.
- Cache-busted:
  - `src/styles/match-scene-v2.css?v=1780587401`
  - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780587401`

Risk:

- This is still canvas 2D pseudo-depth, not true 3D camera/lighting.
- Hit testing remains rectangular for now even when cards are tilted visually.
- If this direction is accepted, the next refinement should improve selected-card/target highlights in the same pseudo-3D style.

### Pseudo-3D Visual Tune-Up

Status: implemented for user testing.

Reason:

- User reviewed the first pseudo-3D screenshot and requested:
  - board should not be so transparent
  - hand cards should be much bigger
  - End Turn and consolidation should be pill buttons on the right near chat
  - turn timer should move slightly down
  - remove the dark grounding under hand cards so cards feel like they float

Changed files:

- `src/scripts/render-v2/04-match-renderer-adapter.js`
- `src/styles/match-scene-v2.css`
- `index.html`

What changed:

- V2 board now draws a more opaque table slab before zone/cell rendering.
- Zone panels are more solid and readable against bright landscape backgrounds.
- Floating hand card size increased through `--hcw` / `--hch` in v2 mode.
- Removed the dark radial background under the floating hand.
- Reduced hand-card drop shadow so cards float without a dark puddle.
- End Turn and consolidation buttons now render as separate fixed pill controls near the lower-right/chat area.
- Turn timer/`turn-hud` moved slightly down.
- Cache-busted:
  - `src/styles/match-scene-v2.css?v=1780587601`
  - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780587601`

### V2 Drag Placement And Motion Pass

Status: implemented for user testing.

Reason:

- User requested drag-to-board placement.
- User also requested more elaborate professional-style card motion inspired by modern digital card games.

Changed files:

- `src/scripts/render-v2/04-match-renderer-adapter.js`
- `src/scripts/render-v2/07-animation-timeline.js`
- `src/scripts/render-v2/09-hand-drag-bridge.js`
- `src/styles/match-scene-v2.css`
- `index.html`

What changed:

- Added `src/scripts/render-v2/09-hand-drag-bridge.js`.
- Drag bridge activates only when v2 board ownership is enabled.
- Hand-card drag now uses the v2 renderer hit map instead of legacy DOM `.cell` nodes.
- Supporter cards can be dragged from hand to an empty board cell.
- Non-supporter cards can be dragged onto one of the current player's Supporters to start/select consolidation.
- Drag shows a floating card ghost with valid/invalid visual feedback.
- V2 board draws a canvas drop-target cue from the hit map while dragging.
- Renderer now supports queued hand-to-board placement motion:
  - drag bridge queues the card's starting hand rect
  - once the card appears in the snapshot, the renderer animates it from hand to board
- Card movement animation is more elaborate:
  - longer flight duration for hand-to-board placement
  - soft overshoot easing
  - arc/lift during movement
  - contact shadow changes while the card is in flight
- Added `out-back-soft` easing to `FateAnimationTimeline`.
- Cache-busted:
  - `src/styles/match-scene-v2.css?v=1780587901`
  - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780587901`
  - `src/scripts/render-v2/07-animation-timeline.js?v=1780587901`
  - `src/scripts/render-v2/09-hand-drag-bridge.js?v=1780587901`

Verification:

- `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
- `node --check src/scripts/render-v2/07-animation-timeline.js` passed.
- `node --check src/scripts/render-v2/09-hand-drag-bridge.js` passed.
- `git diff --check` passed with line-ending warnings only.

### V2 Experimental Trial Board Redesign

Status: implemented for Electron/user testing.

Reason:

- User asked to go all out on the board design, try a professional experimental layout, enlarge the zones/hand, restore internal scrolling behavior for Mark-style extra rows, add four squares per row, and improve drag/motion quality.

Changed files:

- `index.html`
- `src/scripts/00-structural-helpers.js`
- `src/scripts/01-data-and-state.js`
- `src/scripts/04-game-setup.js`
- `src/scripts/05-gameplay-core.js`
- `src/scripts/05-gameplay-core-v2.js`
- `src/scripts/06-rendering-and-helpers.js`
- `src/scripts/render-v2/00-render-v2-flags.js`
- `src/scripts/render-v2/01-render-snapshot.js`
- `src/scripts/render-v2/02-match-layout-engine.js`
- `src/scripts/render-v2/04-match-renderer-adapter.js`
- `src/scripts/render-v2/09-hand-drag-bridge.js`
- `src/scripts/render-v2/10-card-motion-fx.js`
- `src/styles/match-scene-v2.css`
- `trial1/index.html`
- `trial2/index.html`
- `trial3/index.html`

What changed:

- Added a v2 trial design flag:
  - `?trial=1`, `?trial=2`, `?trial=3`
  - `/trial1`, `/trial2`, `/trial3` redirect entry points for browser/server testing
  - `FateRenderV2Flags.setTrialDesign(1|2|3)`
- Made new boards initialize with 4 cells per row instead of 3.
- Updated v2 snapshot/layout to render at least 4 cells per row.
- Increased v2 row/zone sizing around the new 4-column row structure.
- Repositioned the old left-side match UI into a horizontal top command/status rail.
- Moved the turn timer HUD into a bottom-left pill.
- Moved action buttons into a bottom-right command pill and restored Audio / End Game / View Selected visibility.
- Enlarged hand cards in the v2 trial layout.
- Added red tint treatment for opponent board cards.
- Made v2 drag preserve the original hand-card grip point, reducing the “spawn from elsewhere” feel.
- Added reinforcement gating to character-card drag:
  - if total available reinforcement is below the character cost, the drag/drop is invalid before placement.
- Added `src/scripts/render-v2/10-card-motion-fx.js`:
  - draw-from-deck flight
  - discard flight from v2 board card position
  - face-up flip reveal pulse
  - consolidation tribute crash animation toward the target square
- Removed the disabled return from `animateDrawCard()` and routes v2 draw motion through the new motion layer.

Verification:

- `node --check src/scripts/00-structural-helpers.js` passed.
- `node --check src/scripts/01-data-and-state.js` passed.
- `node --check src/scripts/04-game-setup.js` passed.
- `node --check src/scripts/05-gameplay-core.js` passed.
- `node --check src/scripts/05-gameplay-core-v2.js` passed.
- `node --check src/scripts/06-rendering-and-helpers.js` passed.
- `node --check src/scripts/render-v2/00-render-v2-flags.js` passed.
- `node --check src/scripts/render-v2/01-render-snapshot.js` passed.
- `node --check src/scripts/render-v2/02-match-layout-engine.js` passed.
- `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
- `node --check src/scripts/render-v2/09-hand-drag-bridge.js` passed.
- `node --check src/scripts/render-v2/10-card-motion-fx.js` passed.
- `git diff --check` passed with line-ending warnings only.

Needs user testing:

- Start a fresh match and confirm all rows show four usable cells.
- Drag a character when reinforcement is too low and confirm it rejects immediately.
- Drag a character when reinforcement is sufficient and confirm consolidation still flows.
- Trigger Mark Kemper and confirm the board uses internal scrolling instead of physically scrolling the whole game.
- Draw, discard, flip, and consolidate to judge whether the new motion layer feels professional.
- Compare trial variants with `?trial=1`, `?trial=2`, and `?trial=3`.

Follow-up pivot:

- User reported the trial HUD was scrambled and drag still felt laggy.
- Root cause:
  - the first trial reused legacy match layout boxes and moved them with heavy CSS overrides
  - the drag ghost cloned the full hand card DOM, pulling in too much inherited style and layout cost
- Fixes:
  - added `src/scripts/render-v2/11-clean-match-shell.js`
  - clean shell creates its own visible HUD:
    - top opponent/landscape/player rail
    - bottom-left turn timer pill
    - bottom-right action dock
  - legacy topbar, left panel, old action bar, old timer, and z-score panels are hidden in clean-shell mode instead of being repositioned
  - board and hand now get dedicated fixed regions in clean-shell mode
  - drag bridge now uses a lightweight custom drag ghost instead of cloning the full `.hc` element
  - drag now caches whether a character can pay reinforcement at drag start
- Verification:
  - `node --check src/scripts/render-v2/11-clean-match-shell.js` passed.
  - `node --check src/scripts/render-v2/09-hand-drag-bridge.js` passed.
  - `git diff --check index.html src/styles/match-scene-v2.css src/scripts/render-v2/09-hand-drag-bridge.js src/scripts/render-v2/11-clean-match-shell.js` passed with line-ending warnings only.

Needs user testing:

- Drag a Supporter from hand to an empty v2 board cell.
- Drag a non-Supporter from hand onto one of your Supporters for consolidation.
- Confirm drag ghost, target cue, and hand-to-board flight feel good.

Follow-up fix:

- User reported:
  - black/darkness leaking behind zones
  - drag was extremely frame-laggy
- Fixes:
  - removed the broad dark table-slab fill from `drawTableAtmosphere()`
  - kept individual zone panels opaque/readable
  - reduced global atmosphere/vignette strength
  - changed `setHoverHit()` so it schedules a canvas redraw only when hover/drop target identity changes
  - throttled drag bridge hover updates to animation frames
- Cache-busted:
  - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780588101`
  - `src/scripts/render-v2/09-hand-drag-bridge.js?v=1780588101`

Follow-up rollback/pivot:

- User decided the trial overhaul was too scrambled and asked to restore the old GitHub/screenshot board feel while keeping:
  - v2 canvas board ownership
  - current larger floating hand design
  - recent card motion/animation work
- Restored board structure toward the old match baseline:
  - base rows are back to three cells
  - v2 snapshot/layout defaults are back to three columns
  - gameplay fallback row capacities now use the live row length, falling back to three rather than four
- Removed the clean-shell script from `index.html` so it no longer loads after refresh.
- Converted the hand drag ghost to a canvas element instead of a cloned DOM card, keeping drag board interaction canvas-oriented.
- Added a final v2 CSS rollback layer so the old vertical left side pane layout wins over the trial horizontal/top-rail layout:
  - player banners, opponent hand, landscape panel, deck/discard piles, and pane width revert toward the GitHub/screenshot look
  - DOM board cells/cards remain hidden under v2 canvas ownership
- Updated the canvas zone renderer to better match the old zone design:
  - darker framed zone panels
  - gold rails/corners
  - old-style black zone badges and score strip
  - subtle owner/contested/opponent row tinting
  - hatch texture and fine gold cell outlines
- Cache-busted:
  - `src/styles/match-scene-v2.css?v=1780592201`
  - `src/scripts/00-structural-helpers.js?v=1780592201`
  - `src/scripts/01-data-and-state.js?v=1780592201`
  - `src/scripts/05-gameplay-core.js?v=1780592201`
  - `src/scripts/06-rendering-and-helpers.js?v=1780592201`
  - `src/scripts/render-v2/01-render-snapshot.js?v=1780592201`
  - `src/scripts/render-v2/02-match-layout-engine.js?v=1780592201`
  - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780592201`
  - `src/scripts/render-v2/09-hand-drag-bridge.js?v=1780592201`
- Verification:
  - `node --check src/scripts/05-gameplay-core.js` passed.
  - `node --check src/scripts/05-gameplay-core-v2.js` passed.
  - `node --check src/scripts/06-rendering-and-helpers.js` passed.
  - `node --check src/scripts/render-v2/01-render-snapshot.js` passed.
  - `node --check src/scripts/render-v2/02-match-layout-engine.js` passed.
  - `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
  - `node --check src/scripts/render-v2/09-hand-drag-bridge.js` passed.
- Needs user testing:
  - reload Electron and confirm the side pane matches the old screenshot again
  - start a fresh match to confirm rows use three cells unless a card effect adds an extra row/cell
  - drag a hand card and confirm the ghost is no longer a black DOM box
  - confirm the old-looking canvas zones still accept placement and consolidation targets

Correction after visual inspection:

- User reported the UI still did not match the old screenshot and drag was still extremely laggy.
- Decision:
  - stop layering trial/clean-shell rollback rules
  - make `src/styles/match-scene-v2.css` a minimal v2 bridge only
  - let the existing GitHub-era match shell CSS drive the side pane, topbar, timer, action bar, and hand strip exactly
  - keep only no-DOM canvas board mounting plus drag/motion overlay styles in the v2 CSS
- Fixes:
  - replaced `src/styles/match-scene-v2.css` with a minimal bridge stylesheet
  - removed the unused `src/scripts/render-v2/11-clean-match-shell.js` experiment
  - kept DOM board zones/cells/cards hidden under `#board.fate-match-v2-owned-board`
  - kept `#fate-match-v2-canvas` as the active board interaction surface
  - changed hand dragging so movement, hit testing, hover updates, and invalid-drop class changes run at most once per animation frame
- Cache-busted:
  - `src/styles/match-scene-v2.css?v=1780592601`
  - `src/scripts/render-v2/09-hand-drag-bridge.js?v=1780592601`
- Verification:
  - `node --check src/scripts/render-v2/09-hand-drag-bridge.js` passed.
  - `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
  - Confirmed `src/styles/match-scene-v2.css` no longer contains v2 layout overrides for `game-left`, `turn-hud`, `actbar`, or `hand-strip`; remaining fixed-position styles are drag/motion overlays only.

Follow-up correction:

- User reported:
  - hand dragging was still very laggy
  - board zones still did not match the old GitHub/screenshot zones
  - old hand UI/tray came back, which was not desired
- Fixes:
  - restored the newer floating hand presentation only:
    - hand tray background/border/label/corners hidden
    - hand cards remain large, floating, and fan-positioned
    - surrounding match shell/side pane remains driven by the old repo CSS
  - copied the old tuned board sizing variables into the v2 canvas layout engine:
    - `cardW = clamp(windowW * 0.0745, 108, 145)`
    - `cardH = clamp(windowW * 0.1043, 151, 203)`
    - old row height, board gap, zone width, zone padding, and label-width proportions
  - removed active board redraws during drag movement:
    - drag still uses the cached canvas hit map
    - ghost invalid state still updates
    - hover board highlight is intentionally not redrawn on every drag frame to improve responsiveness
  - stripped the non-old perspective/atmosphere guide lines from the canvas board
  - softened canvas hatch lines and changed the zone score label back from `CONTROL` to old-style `vs`
- Cache-busted:
  - `src/styles/match-scene-v2.css?v=1780593001`
  - `src/scripts/render-v2/02-match-layout-engine.js?v=1780593001`
  - `src/scripts/render-v2/04-match-renderer-adapter.js?v=1780593001`
  - `src/scripts/render-v2/09-hand-drag-bridge.js?v=1780593001`
- Verification:
  - `node --check src/scripts/render-v2/02-match-layout-engine.js` passed.
  - `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
  - `node --check src/scripts/render-v2/09-hand-drag-bridge.js` passed.
  - `git diff --check` passed with line-ending warnings only.

## Visual Changes Going Forward

The match board must remain v2 canvas-owned. Do not return board zones, board cells, or board cards to DOM rendering as a shortcut. The DOM board can exist only as hidden structure/state compatibility while `#fate-match-v2-canvas` owns visible board rendering and board hit testing.

Strict rules:

- No visible DOM `.zone`, `.cell`, or board `.bc` restoration for the match board.
- Do not make visual fixes by disabling `fateMatchRendererV2`, `fate-match-v2-owned-board`, or the canvas renderer.
- Do not clone full hand-card DOM for drag ghosts. Drag visuals should stay lightweight, preferably canvas or pre-rendered texture based.
- Do not redraw the whole board on every pointer move. Drag should use cached hit maps and at most one animation-frame update.
- If a visual design must match the old board, translate the old CSS measurements and colors into `02-match-layout-engine.js` and `04-match-renderer-adapter.js`; do not re-enable the old DOM zones.
- Keep the old shell/side pane as the source of truth unless the user explicitly asks for a full match-shell redesign.
- If the hand design is changed, keep it independent from board ownership: hand may remain DOM for now, but board remains canvas.

Recommended visual workflow:

- Capture/inspect the exact target screenshot or old GitHub CSS before changing visuals.
- Identify whether the change belongs to:
  - shell/side pane CSS
  - hand CSS
  - canvas layout metrics
  - canvas painting style
  - input/drag performance
- For zone visuals, first update layout metrics in `src/scripts/render-v2/02-match-layout-engine.js`, then paint details in `src/scripts/render-v2/04-match-renderer-adapter.js`.
- For drag performance, profile and reduce work in `src/scripts/render-v2/09-hand-drag-bridge.js` before adding new visual effects.
- After visual changes, launch Electron, verify the canvas renderer report still says `ownsBoard: true`, and check that `domCells`/`domCards` are not visible.

Deployment note:

- A browser deployment is useful for testing and updates, but Electron packaging remains the end target.
- Cloudflare deployment should treat the browser build/static files separately from Electron installer artifacts.
- Before deployment, run a clean smoke test for:
  - title screen
  - match start
  - canvas board ownership
  - card placement
  - consolidation
  - drag responsiveness
  - one modal/effect flow

## Current Closeout State

As of this handoff, the work is not visually finished. The renderer is in a recovery/stabilization point after several experimental board redesign attempts. The important architecture direction is still correct:

- board rendering is v2 canvas-owned
- board DOM cells/cards are hidden
- board layout and card placement are driven by render snapshots plus `02-match-layout-engine.js`
- visible board painting is in `04-match-renderer-adapter.js`
- hand drag logic is in `09-hand-drag-bridge.js`
- motion effects are in `10-card-motion-fx.js`
- the old match shell/side pane should remain the visual source of truth unless a full redesign is explicitly requested

Most recent known user feedback:

- Hand dragging still felt very laggy.
- Canvas zones still did not visually match the old board closely enough.
- The old hand tray/UI returned at one point, but the desired direction is the newer floating hand without the heavy tray.

Most recent implementation response:

- The hand tray was hidden again while keeping large floating/fanned hand cards.
- The canvas layout engine was moved closer to the old tuned board variables from `game.css`.
- Drag movement no longer triggers hover redraws on every pointer move.
- The canvas board's non-old perspective/atmosphere lines were stripped.
- The zone score label was changed back from `CONTROL` to `vs`.

Immediate next steps for a future chat:

- Start by opening Electron and visually inspecting the current match screen. Do not assume the latest CSS is correct without looking.
- Run this in DevTools while in a match:
  - `fateMatchRendererV2Report()`
  - `fateMatchHandDragReport()`
  - `fateBuildMatchLayout().metrics`
- Confirm:
  - `ownsBoard: true`
  - canvas cells are present in the hit map
  - visible DOM board cells/cards are not being used
  - hand tray/corners are hidden
  - drag is not causing repeated board draws
- If drag still lags, instrument `09-hand-drag-bridge.js` first. Do not start by adding more CSS or visual effects.
- If zones still look wrong, compare directly against the old screenshot/GitHub CSS and adjust canvas metrics/paint only. Do not re-enable DOM zones.
- If visual changes become too tangled, prefer a clean small v2 stylesheet over large layered overrides.

## Handoff Rule

Before starting a new major work session, read this file and the latest architecture plan notes.

After each meaningful implementation step, update this file with:

- What changed.
- Which files changed.
- What was tested.
- What remains risky or unfinished.

## 2026-06-05 Hover/Zone/Search Visual Pass

User reported the in-match board still needed to move toward the old GitHub/screenshot feel, and that simply hovering the cursor over board squares dropped FPS badly.

Fixes:

- Moved board hover highlighting onto a separate transparent `#fate-match-v2-hover-canvas`.
- Changed v2 hover updates so crossing squares redraws only the tiny hover overlay instead of scheduling a full board repaint.
- Throttled board pointermove hit testing to one animation-frame update.
- Raised the v2 zone stack upward by changing the production layout vertical alignment.
- Increased the reserved header/score lane so top-row cards do not crowd or clip into the zone Fate score bar.
- Made opponent cards read more clearly red with a stronger cheap canvas tint, still just one clipped gradient/stroke pass per opponent card.
- Added composited CSS search-picker reveal/page/selection animations around the existing picker canvas.
- Bumped cache keys for changed renderer/layout/input/picker/CSS assets in `index.html`, and for the legacy picker/CSS files in `fate-and-zones_1.html` and `fate-and-zones_1_.html`.

Files changed:

- `src/scripts/render-v2/04-match-renderer-adapter.js`
- `src/scripts/render-v2/06-match-scene-input.js`
- `src/scripts/render-v2/02-match-layout-engine.js`
- `src/scripts/06-rendering-and-helpers.js`
- `src/styles/match-scene-v2.css`
- `src/styles/zz-codex-last.css`
- `index.html`
- `fate-and-zones_1.html`
- `fate-and-zones_1_.html`
- `ARCHITECTURE_MIGRATION_PROGRESS.md`

Verification:

- `node --check src/scripts/06-rendering-and-helpers.js` passed.
- `node --check src/scripts/render-v2/04-match-renderer-adapter.js` passed.
- `node --check src/scripts/render-v2/06-match-scene-input.js` passed.
- `node --check src/scripts/render-v2/02-match-layout-engine.js` passed.
- `git diff --check` passed with line-ending warnings only.

Needs user testing:

- Relaunch the game and start a match.
- Sweep the cursor across board cells and confirm FPS no longer collapses.
- Confirm the raised zones and larger score/header lane feel closer to the old board.
- Confirm the stronger opponent red tint is readable but not heavy.
