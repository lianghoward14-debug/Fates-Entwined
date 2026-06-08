# Render V2 UI Change Safety Guide

Use this before making further live match UI changes. This is a regression-prevention guide for the current render-v2 match screen, especially zones, hand UI, command dock, drag previews, hover highlights, and consolidation highlights.

## Prime Directive

The live match board/card scene is canvas-owned by render-v2.

Do not reintroduce DOM ownership for:

- board cells
- board cards
- own hand cards
- opponent hand cards
- deck/discard pile visuals
- drag previews
- motion ghosts
- hover highlights
- selection highlights
- consolidation/tribute highlights

DOM can still own app-shell UI and modal UI, such as title screens, deckbuilder, profile/settings, social/chat panels, audio/card-detail modals, and daily login screens.

## Main Files

Prefer these files for live match UI work:

- `src/scripts/render-v2/02-match-layout-engine.js`
- `src/scripts/render-v2/04-match-renderer-adapter.js`
- `src/scripts/render-v2/06-match-scene-input.js`
- `src/scripts/render-v2/09-hand-drag-bridge.js`
- `src/scripts/render-v2/10-card-motion-fx.js`
- `src/scripts/render-v2/11-vfx-director.js`
- `src/styles/match-scene-v2.css`

Only use broad legacy CSS files like `src/styles/game.css`, `src/styles/99-ui-final.css`, or `src/styles/zz-codex-last.css` when the change is truly outside render-v2 or when removing old overrides that are fighting render-v2.

## Avoid

Do not add live match visuals with `.cell`, `.bc`, `.hc`, `.opp-card-back`, `.pile-card-canvas`, or DOM ghost elements.

Do not use `getBoundingClientRect()` per card, per cell, or per pointer frame. Use layout-engine rectangles, hit maps, and canvas-layer coordinates.

Do not patch highlight alignment by adding arbitrary offsets in draw code. If a highlight is offset, fix the rectangle source or the coordinate conversion first.

Do not let hover, drag, pile click, or consolidation selection trigger full layout recalculation unless the board dimensions actually changed.

Do not make CSS changes that affect `#board`, `.board`, `.zone`, `.cell`, `.hand-strip`, or card sizing without checking whether render-v2 already owns that visual.

Do not touch `23-board-canvas-renderer.js` for normal v2 work. It is legacy rollback/quarantine only.

Do not hide a bug by making highlights bigger, blurrier, or glowier. Highlights should be aligned first, then styled.

Do not stack quick fixes across `game.css`, `99-ui-final.css`, `zz-codex-last.css`, and `match-scene-v2.css`. Pick the owning layer and remove conflicting rules when needed.

## Be Careful With Layout Stability

Board shrinking or shifting usually means a DOM layout read changed after interaction, hover, drag, modal state, scrollbar state, or a CSS rule changed measured dimensions.

Before changing layout:

- Identify whether the visual is canvas layout data or DOM shell CSS.
- Keep `#board` dimensions stable during hover, drag, modal open, and consolidation.
- Do not switch `overflow`, `position`, `height`, `min-height`, `max-height`, or `contain` during pointer interactions.
- Do not add borders or padding to measured board containers unless the layout engine accounts for them.
- Prefer changing `02-match-layout-engine.js` for zone/hand/row/card positions.
- Prefer changing `04-match-renderer-adapter.js` for frame art, fills, borders, tabs, badges, and canvas UI decoration.

If the board shifts on click/drag, check these first:

- `getStableBoardViewport` and viewport measurement logic in `04-match-renderer-adapter.js`
- board CSS in `match-scene-v2.css`
- any CSS hover/focus/active rules that change size
- scrollbars appearing/disappearing
- modal-open classes that alter body, board, or shell dimensions

## Highlights

Hover and consolidation highlights must use the same rectangles as the thing being highlighted.

Rules:

- A card hover highlight should use the card rectangle, not the cell rectangle.
- An empty-cell hover highlight should use the cell rectangle.
- A consolidation/tribute highlight should draw around the card border and should not be clipped.
- A board-card highlight should be on the hover/effect layer only when possible.
- Highlight redraws should be dirty-mask scoped, not full-scene redraws.

When changing highlights, inspect:

- hit map entries produced by `04-match-renderer-adapter.js`
- pointer dispatch in `06-match-scene-input.js`
- card/cell rectangles from `02-match-layout-engine.js`
- consolidation state matching in `04-match-renderer-adapter.js`

Do not solve highlight clipping by moving cards. Expand the highlight draw inset/outset or clip region in the highlight layer.

## Hand UI

The hand panel, hand cards, hand hover response, and drag source state should stay canvas-owned.

For hand panel size and centering:

- Change `buildPeripheralLayout` in `02-match-layout-engine.js`.
- Keep the hand panel centered from its own rect, not by nudging individual cards.
- Ensure the card row uses the same `handRect`, `cardW`, `cardH`, `gap`, and `handStartX` math for drawing and hit testing.
- Keep enough inner padding so cards do not touch the inlay border.

For hand hover:

- Keep it lightweight: scale/lift the hovered card on canvas, no DOM card popover.
- Do not add gold glow around hand hover if the request is for plain responsive motion.
- Do not let hand hover change panel or zone layout.

For supporter-limit disabled cards:

- Gray the hand card in the canvas draw path.
- Do not add DOM banners or DOM overlays inside the hand.

## Drag Preview

Drag preview belongs in render-v2 VFX/canvas code.

For drag preview changes:

- Prefer `src/scripts/render-v2/11-vfx-director.js`.
- Keep drag preview movement cheap.
- Do not add DOM ghost cards.
- Do not add outline/glow effects unless specifically requested.
- Scaling the drag preview should not change hit testing or card placement math.

## Zones

Zone position, size, cell mass position, scrollable expanded rows, and card slots belong in the layout engine.

Zone frame art, opacity, borders, corner rails, fate bars, and row color washes belong in the renderer adapter.

Rules:

- Do not use zone CSS zoom or scrollbars for normal 3x3 zones.
- Expanded landscape effects should scroll only the affected zone content, not physically resize all zones.
- The 3x3 mass should be centered inside the zone rect through layout math, not visual offsets.
- Zone corner elements must not overlap the main border.
- If hover squares are offset, fix the source rect; do not visually chase it with magic constants.

## Command Dock

The in-match command dock is canvas-owned if it sits over the live match screen.

Commands should register through `hitMap.uiCommands` in `04-match-renderer-adapter.js` and dispatch in `06-match-scene-input.js`.

Current expected command concepts:

- `end-turn`
- `consolidate`
- `end-game`
- `audio`
- `world-chat`

If adding a command:

- Draw it in `drawCommandDock`.
- Add a matching hit map command.
- Add dispatch behavior in `06-match-scene-input.js`.
- Keep disabled/active states clear.

## Modals And Z-Index

Modals are allowed to be DOM-owned, but canvas hands/cards must not visually punch through them.

When changing modal or overlay behavior:

- Confirm modal overlay z-index is above all render-v2 canvases.
- Confirm hand cards and drag previews are hidden or dimmed behind modal overlays.
- Avoid opening card details immediately during placement animation; wait until card motion finishes if the modal is tied to the placed card.
- Modal close buttons should not pass pointer events through to cards beneath them.

## Daily Login And Non-Match UI

Daily login, title, profile, social, and deckbuilder are DOM/app-shell UI.

Keep those changes out of render-v2 unless they affect the live match screen.

For daily login progress:

- After a reward is claimed once, subsequent opens should show claimed/progress state immediately.
- Do not require clicking claim again just to refresh progress.

## Cache And Load Order

After changing loaded JS/CSS, bump the query string in `index.html`.

Common examples:

- `src/styles/match-scene-v2.css?v=...`
- `src/scripts/render-v2/02-match-layout-engine.js?v=...`
- `src/scripts/render-v2/04-match-renderer-adapter.js?v=...`
- `src/scripts/render-v2/06-match-scene-input.js?v=...`
- `src/scripts/render-v2/11-vfx-director.js?v=...`

If a change appears to do nothing, check cache versions before adding more patches.

## Testing Checklist

Before calling a UI pass done:

1. Run syntax checks for touched JS.

```powershell
node --check src\scripts\render-v2\02-match-layout-engine.js
node --check src\scripts\render-v2\04-match-renderer-adapter.js
node --check src\scripts\render-v2\06-match-scene-input.js
node --check src\scripts\render-v2\11-vfx-director.js
```

2. Run diff whitespace checks.

```powershell
git diff --check
```

3. Launch the game after the update.

```powershell
npm start
```

4. In the game, inspect:

- hand panel centered with the turn timer
- hand cards not touching/crossing the inner border
- drag preview size and no unwanted glow
- zone frames not shifting on click, hover, drag, or modal open
- hover highlights aligned to cards/cells
- consolidation highlights visible and not clipped
- modals above hand/cards
- right command dock buttons hit correctly
- world chat command opens the intended chat UI

5. Run render-v2 reports when available.

```js
fateRendererV2AcceptanceReport()
fateRendererV2Phase11Report()
fateRendererV2CanvasDelta()
```

Expected acceptance basics:

- `pass === true`
- render-v2 owns board, hand, opponent hand, piles, and motion FX
- DOM board cells/cards/hand cards/ghosts are `0`
- old renderer draw requests are `0`
- legacy DOM board fallback is not forced

## Backup Discipline

Before a risky UI pass:

- Make a named backup or checkpoint.
- Keep one backup for the last known acceptable build.
- Keep one backup for the current experimental pass.
- Do not destroy or overwrite rollback support.

Rollback support that must remain:

```text
?domBoard=1
localStorage.fateDisableMatchRendererV2 = "1"
```

## Safe Change Pattern

Use this sequence for future UI work:

1. Identify ownership: canvas render-v2, DOM shell, or modal/app-shell.
2. Find the current winning code path before editing.
3. Make the smallest cohesive change in the owning file.
4. Update hit maps if the clickable visual moved.
5. Update dirty masks if the visual should redraw on hover/consolidation/drag.
6. Bump cache versions.
7. Run checks.
8. Launch the game.
9. Compare screenshots against the requested visual target.

If two attempts fail to fix the same issue, stop adding offsets. Re-check ownership, coordinate conversion, load order, and whether another stylesheet or renderer is winning.
