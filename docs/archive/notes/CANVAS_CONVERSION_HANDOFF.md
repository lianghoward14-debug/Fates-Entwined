# Fates Entwined Canvas Conversion Handoff

Date: 2026-05-18

## Current Direction

The project is moving forward from DOM-heavy board rendering toward a canvas-rendered board inside the existing Electron/web app. Do not revert the board back to the old DOM visual path by default. The DOM board still exists as click/hitbox infrastructure, while the visible board cards are painted onto canvas.

## Main Files To Edit

- `src/scripts/23-board-canvas-renderer.js`
  - New canvas board renderer.
  - Draws board card art, card borders, Fate badges, consolidation outlines, selected states, and Fate-change badge animation.
  - Exposes:
    - `window.fateRenderBoardCanvas()`
    - `window.fateCanvasBoardReport()`
    - `window.fateDisableCanvasBoard()`
    - `window.fateEnableCanvasBoard()`

- `src/scripts/24-card-grid-canvas-renderer.js`
  - Shared canvas renderer for deck-builder collection grids.
  - Paints collection card visuals onto one canvas and overlays lightweight transparent buttons for click/right-click behavior.
  - Used by the title deck builder and Challenger deck builder collection panels.
  - Also paints selected-deck list rows and preset/deck preview hero/minis canvases.
  - Also exposes lightweight canvas image/selectable-grid helpers used by gameplay panel thumbnails and save/edit card choice grids.
  - Exposes:
    - `window.renderCanvasDeckCollection(container, entries, opts)`
    - `window.renderCanvasDeckList(container, entries, opts)`
    - `window.renderCanvasDeckPreviewTile(tile, opts)`
    - `window.scheduleCanvasDeckPreviewTile(tile, opts)`
    - `window.renderCanvasImage(canvas, src, opts)`
    - `window.renderCanvasSelectableCardGrid(container, cards, opts)`
    - `window.refreshCanvasDeckCollectionCounts(container, updater)`

- `src/scripts/06-rendering-and-helpers.js`
  - Still creates the board DOM cells and lightweight `.bc` hitboxes.
  - `shouldUseCanvasBoardVisuals()` controls canvas mode.
  - `createBoardCardEl()` creates minimal DOM cards in canvas mode and preloads canvas images.
  - `renderBoard()` preserves the live canvas element during board rebuilds to reduce flicker.
  - `renderHand()` now uses a retained DOM renderer keyed by card `iid`; it reuses `.hc` nodes and only rewrites a hand card's inner HTML when that card's visual signature changes.
  - `renderOppHand()` now uses a retained DOM renderer keyed by card `iid`; hidden backs and revealed opponent cards are reused instead of replacing the whole strip.
  - `pickCardsVisual()` no longer renders the small Fate badge on search/picker cards and now tags picker bodies with `visual-picker-v2`.

- `src/scripts/05-gameplay-core.js`
  - Consolidation selection state.
  - `highlightTributeCards()` applies `.tribute-cell-available` / `.tribute-cell-selected` to cells.
  - Text labels were removed from consolidation state because they made the canvas process messy.
  - Exact-cost consolidation now resolves on the clicked supporter instead of forcing a second placement click.

- `src/styles/99-ui-final.css`
  - Contains canvas-mode CSS near the end.
  - `html.fate-canvas-board-mode #s-game #fate-board-canvas` is the visible canvas layer.
  - DOM `.bc` elements stay present but transparent for clicks.

- HTML entry files:
  - `index.html`
  - `fate-and-zones_1.html`
  - `fate-and-zones_1_.html`
  - These include script cache keys. Current relevant keys:
    - `99-ui-final.css?v=1778894000`
    - `05-gameplay-core.js?v=1778894000`
    - `06-rendering-and-helpers.js?v=1778894000`
    - `23-board-canvas-renderer.js?v=1778894000`
    - `game.css?v=1778977500`
    - `02-screen-and-deckbuilder.js?v=1778977400`
    - `03-profile-and-progression.js?v=1778977500`
    - `06-rendering-and-helpers.js?v=1778977500`
    - `07-ai.js?v=1778977400`
    - `09-challenger-mode.js?v=1778977500`
    - `18-online-rooms.js?v=1778977400`
    - `20-online-economy.js?v=1778977500`
    - `24-card-grid-canvas-renderer.js?v=1778977500`

## What Has Been Converted So Far

- Board card visuals now render through canvas by default when canvas is available.
- DOM cards on the board are reduced to lightweight hitboxes in canvas mode.
- Player hand rendering is now retained DOM instead of full strip replacement.
- Opponent hand rendering is now retained DOM instead of full strip replacement.
- Canvas renderer has a back buffer to reduce visible clears/flicker.
- Canvas renderer skips transient empty/partial board frames when game state and DOM layout are briefly out of sync.
- Canvas renderer retries briefly when expected board cards exist but DOM card cells or card rects have not caught up.
- Canvas renderer now observes board DOM mutations so newly inserted/changed card hitboxes schedule a redraw immediately.
- Canvas Fate badge exists and is smaller than the first version.
- Fate value changes animate on the canvas badge with a cheap pulse/ring and small delta text.
- Consolidation visuals are simplified:
  - available supporter: dashed gold outline
  - selected supporter: solid gold outline
  - placement-ready supporter: solid green outline
  - no `REINFORCEMENT` / `SELECTED` text
- Exact-cost consolidation auto-places onto the supporter that was just selected to avoid the 1-cost double-click feel.
- Search/card picker windows hide the little Fate number badge.
- Search/card picker windows now render their card page onto one canvas with hitboxes instead of creating `.mc` DOM cards for each page.
- Discard pile viewing now uses a canvas card gallery with click/right-click hitboxes instead of a DOM card grid.
- Revealed-hand viewing now uses the same canvas card gallery instead of a DOM card grid.
- Zone target selection and any-zone target selection now route through the canvas card picker while preserving board-position callback data.
- Zone score cards now use a render signature so their DOM only rewrites when score/control data changes.
- Title deck-builder collection cards now render on a shared canvas with lightweight click/right-click hitboxes instead of nested `.db-mc` image DOM.
- Challenger deck-builder collection cards use the same shared canvas grid when owned cards are available.
- Title deck-builder selected-deck list rows now render on a shared canvas with lightweight open/remove hitboxes instead of DOM image rows.
- Challenger deck-builder selected-deck list rows use the same canvas list renderer.
- Preset/deck preview tiles now use canvas hero art and canvas mini strips in the main deck picker paths:
  - title preset picker
  - Challenger deck pick/browse modals
  - Challenger starter deck pick screen
  - My Presets browse/load modal
  - Free Play preset overlay
  - online room deck picker
- Gameplay panel image surfaces now avoid DOM `<img>` churn where possible:
  - side-panel player/opponent profile pictures paint into canvas
  - discard pile latest-card previews paint into canvas
- Preset/deck detail card grids now use the shared canvas card grid:
  - title My Presets deck contents
  - Challenger deck inspect contents
  - public deck detail contents
- Small save/edit choice grids now use the shared canvas selectable grid:
  - title deck save face/display pickers
  - Challenger deck save face/display pickers
- Card detail and card-info overlay windows have a compact CSS redesign with less empty space.
- Title screen artificial darkening was reduced in performance modes.
- Music assets were restored and included in the Electron package.

## Known Issues / Next Work

- There is still some flicker. Recent work focused on preserving the canvas and avoiding partial frames, but more DOM/canvas sync issues may remain.
- Some card appearances were reported as delayed until clicking a square, especially Temecula Resident and IB Student. The latest renderer adds layout retries for this, but this needs real playtesting.
- Next DOM-heavy process to grind down:
  - remaining non-card modal chrome and small zone-choice button grids
  - topbar/player panels
  - any repeated `innerHTML` rebuilds during gameplay
  - public deck browser/share flow legacy preview tiles in `src/scripts/08-audio-and-meta-ui.js` still contain DOM fallback code, but the loaded online economy module now canvas-paints public deck hub/detail visuals
  - `src/scripts/09-challenger-v2.js` has older duplicate Challenger preview code, but it does not appear to be loaded by the current HTML entry files
  - saved deck detail/content views still use DOM card thumbnails in several places
- Restore point for the latest high-priority conversion pass:
  - `conversion-backups/20260517-030310`
  - `conversion-backups/20260517-030556`
- Keep converting visual-only layers to canvas or lightweight retained DOM. Keep real interactive elements as DOM only where useful.

## How To Run Checks

From:

```powershell
C:\Users\liang\OneDrive\Desktop\Fates Entwined v1.0
```

Use:

```powershell
node --check src\scripts\23-board-canvas-renderer.js
node --check src\scripts\06-rendering-and-helpers.js
node --check src\scripts\05-gameplay-core.js
node --check src\scripts\24-card-grid-canvas-renderer.js
node --check src\scripts\02-screen-and-deckbuilder.js
node --check src\scripts\03-profile-and-progression.js
node --check src\scripts\07-ai.js
node --check src\scripts\09-challenger-mode.js
node --check src\scripts\18-online-rooms.js
```

## How To Rebuild Desktop

Use `npm.cmd`, not plain `npm`:

```powershell
npm.cmd run pack
npm.cmd run dist
```

The desktop shortcut launches:

```text
C:\Users\liang\OneDrive\Desktop\Fates Entwined v1.0\dist\win-unpacked\Fates Entwined.exe
```

After rebuilding, verify package contents if needed:

```powershell
node -e "const asar=require('@electron/asar'); const files=asar.listPackage('dist/win-unpacked/resources/app.asar'); console.log(files.includes('\\src\\scripts\\23-board-canvas-renderer.js')); console.log(files.includes('\\src\\scripts\\05-gameplay-core.js'));"
```

## How To Access / Edit Files

Open the workspace folder:

```text
C:\Users\liang\OneDrive\Desktop\Fates Entwined v1.0
```

The app is a local web/Electron project. Edit source files under:

```text
src\scripts
src\styles
```

Then bump script/style cache keys in the three HTML entry files listed above before rebuilding, otherwise the desktop build may appear stale.

## Important Guidance For Next AI

- Do not default back to DOM board visuals. Canvas board is the forward path.
- Avoid big visual DOM rebuilds in gameplay loops.
- Preserve click behavior through DOM hitboxes while moving expensive visuals to canvas.
- Before claiming performance/flicker is fixed, rebuild desktop and test the packaged app, not only the loose HTML.
- User is specifically sensitive to repeated “fixed” claims that are not real. Be precise about what was changed and what still needs testing.
