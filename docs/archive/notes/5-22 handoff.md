# 5-22 Handoff

This project is a fragile multiplayer card game with a lot of late CSS/JS overrides. Make changes narrowly, verify the exact screen the user mentioned, and avoid broad visual rewrites unless the user explicitly asks for them.

## Before Editing

- Make a full backup when asked. The user strongly dislikes partial backups. Include scripts, styles, assets, HTML, server files, and config.
- Do not remove the latest backup unless the user asks. If asked to remove old backups, keep only the newest complete backup.
- Check existing notes and recent overrides before changing behavior. Use `rg` first.
- The worktree may contain prior user/AI changes. Do not revert unrelated files or “clean up” areas that are not part of the request.
- Version text must bump by `.01` after updates. Current expected flow is `Version 1.xx -> Version 1.xx + .01`.
- Cache-bust edited scripts/styles in `index.html`.
- After game code/style changes, launch the game for the user.

## What To Avoid

- Do not change shared card/deck display components unless the user asked for that exact screen. A prior change to public deck/choose deck card previews accidentally affected multiple deck pickers.
- Do not “improve” layouts by making cards thinner, more cramped, or one-line-only unless requested.
- Do not convert deck preview display cards to a different layout just to optimize performance.
- Do not use canvas previews if they change the visual layout. Keep the original visual structure unless explicitly approved.
- Do not add scrolling to windows where the user has said “no scroll,” except for specific sub-panels they named.
- Do not make UI elements bolder/brighter/larger by guesswork. Small visual requests should stay small.
- Do not let tutorial-only rules leak into normal games. Tutorial is 10 turns; regular AI/free/challenger games should remain 20 turns unless requested otherwise.

## Update Style

- Prefer late, focused overrides in `src/styles/zz-codex-last.css` only when touching CSS, but be aware this file already has stacked overrides. Search for existing selectors before appending more.
- For JS, patch the smallest function that owns the behavior. Avoid replacing whole render paths.
- Keep existing UI idioms: gold borders, dark panels, Cinzel headings, polished modal styling.
- Use existing helpers like `showModal`, `pickCardsVisual`, `renderCardHTML`, `renderCanvasDeckCollection`, `addCardToHand`, `renderGame`, and `renderHand` instead of inventing parallel systems.
- When changing one builder, check both title deck builder and challenger deck builder only if the user says both.

## High-Risk Areas

- `src/scripts/06-rendering-and-helpers.js`: board render, hand render, modal/card picker UI, cinematic, scroll preservation. Easy to introduce double-click or forced-scroll bugs here.
- `src/scripts/05-gameplay-core.js`: rules, effects, consolidation, targeting. Be very careful with consuming cards before validating placement.
- `src/scripts/24-card-grid-canvas-renderer.js`: deck builder canvas cards. Changes here can affect card loading, hitboxes, deck list flicker, and star sheen.
- `src/scripts/09-challenger-mode.js`: challenger screens, deck builder, deck pickers, store/collection/divisions.
- `src/scripts/02-screen-and-deckbuilder.js`: title deck builder and preset picker.
- `src/styles/99-ui-final.css` and `src/styles/zz-codex-last.css`: many overlapping overrides. Later rules often win.

## Specific Ongoing Concerns

- Deck builder star sheen should match the collection tab’s star sheen. If canvas cards are used, CSS pseudo-elements will not show; either draw the same effect on canvas or avoid canvas for that visual.
- Encoded SVG/text must not appear over unloaded card boxes.
- Choose Your Deck page has been laggy, but performance fixes must not alter the display-card layout.
- Consolidation selection should allow deselecting supporters after selecting them. Watch for double click/cell click handling.
- Cards placed/set on the board should not get an unwanted glowing border.
- Mark Kemper extra safe-square updates should not force-scroll/zoom the board to the newly added square.
- Hand UI should not scroll. The desired rule is: if a player exceeds 9 cards in hand from any source, show a polished discard window and require discarding down to 9.
- Card picker windows should stay visually polished, not overly wide, and should support inspecting cards without breaking selection.
- Carolyn lock visuals are sensitive. The lock shackle should not protrude into the body or lose its top.
- Server-authoritative websocket logic should be used for actual human vs human games, not AI games or basic offline actions.

## Verification Checklist

- Run `node --check` on every edited JS file.
- Open the game and verify the exact screens changed.
- For UI edits, test at the common 1920x1080 view shown in screenshots.
- Check both title deck builder and challenger deck builder only when both are affected.
- For rule changes, test the actual card/effect if possible, not just syntax.
- Confirm normal AI games still show `20` turns and tutorial still shows `10`.
- Confirm no unrelated deck picker/card display changed shape, spacing, or card count per row.

