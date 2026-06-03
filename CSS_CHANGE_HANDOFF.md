# Continuing CSS Changes

This project currently has many older CSS tuning blocks. When continuing layout polish, avoid adding another broad "final override" unless there is no safer option.

## Main Rule

Use `src/styles/zz-codex-last.css` for current polish. The active board/deck-browser tuning is near the end of the file under:

```css
/* Codex 2026-06-03: active end-of-file spacing controls for deck browsers and board headers. */
```

Edit that block directly when adjusting:

- My Decks / My Presets 7-card display strip
- Single-line and two-line deck title/description offsets
- Game board zone header height
- Fate value bar vertical position
- Daily login modal background layering
- Title/Challenger Edit Art modal geometry

## Avoid Cascade Fights

Before changing a visual rule, search for the selector first:

```powershell
rg -n "selector-or-class-name" src/styles
```

If the same selector appears later in `zz-codex-last.css`, the later one wins. Prefer changing the latest matching rule instead of appending another duplicate.

## Cache Busting

After editing CSS or JS, bump the matching query string in `index.html`.

Current examples:

```html
src/styles/zz-codex-last.css?v=1780309600
src/scripts/09-challenger-mode.js?v=1780309600
```

If a change looks correct in source but not in game, check the cache version first.

## Intentional JS Hooks

Some CSS depends on JS-added classes:

- `.preset-title-single-line`
- `.preset-title-two-line`

These are added only in My Decks / My Presets browsers, not Choose Your Deck. Keep that separation so the random-match deck picker does not inherit the custom text nudges.

The random-opponent deck picker also uses:

```js
modal.dataset.escapeLocked = '1'
```

Do not remove this unless Escape should be allowed to leave that required flow.

## Board Header Tuning

The zone banner and fate value bar are controlled together. When changing one, check these rules as a group:

- `.zone`
- `.zone-hdr`
- `.zone-hdr-main`
- `.zone-score-card`

The header height and score-card `top` value should be adjusted together so the fate bar stays visually centered between the zone banner and the top row of board squares.
