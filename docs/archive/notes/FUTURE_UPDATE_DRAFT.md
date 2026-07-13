# Future Update Draft

This project is easiest to keep stable when updates are treated as small, traceable changes. Do not rewrite UI or gameplay paths unless the requested change truly requires it.

## Core Rules

- Every gameplay change must work in single-player, AI play, and multiplayer.
- Prefer shared helpers over one-off logic in AI-only or local-only code.
- Keep card definitions and card art synchronized:
  - `src/scripts/01-data-and-state.js` controls live card stats, type, rarity, text, affiliation, and image reference.
  - Root card PNGs such as `4.png` and `66.png` are the full-detail card art.
  - `optimized/card-thumbs/*.jpg` must be regenerated from the matching full PNG when art or visible stats change.
  - Bump the `index.html` query version for any changed script so the desktop shell does not keep stale code.
- If a card is temporarily removed from the pool, keep its definition and implementation code intact. Use an availability/retirement filter, not deletion.

## Multiplayer Checklist

For every gameplay effect, check the multiplayer path before calling the change done:

- Does the effect serialize through online actions in `src/scripts/18-online-rooms.js`?
- Does the remote client receive the same board, hand, deck, discard, landscape, and status state?
- Does the effect depend on local DOM state? If yes, move the actual rule to game state and use DOM only for presentation.
- If a modal or picker is involved, make sure the action result is what syncs, not just the local click.
- Avoid random results that differ between clients. Use existing seeded/random helpers where available.

## Card Updates

When changing a card:

1. Update the `CARDS` entry in `src/scripts/01-data-and-state.js`.
2. Update effect logic in `src/scripts/05-gameplay-core.js` if behavior changed.
3. Update AI awareness in `src/scripts/07-ai.js` if it changes decisions, placement, targeting, or value.
4. Update deck builder/challenger availability only if the card pool changed.
5. Regenerate the optimized thumbnail from the full PNG.
6. Run at least `node --check` on changed scripts.
7. Launch the game and inspect the card in hand, board, info modal, deck builder, and any effect picker it appears in.

## UI Update Cautions

- Do not change unrelated layouts while fixing a bug.
- Match existing modal/window styles unless the user explicitly asks for a redesign.
- Keep visual effects high performance. Avoid new always-running animations on large lists or modal backgrounds.
- If a visual bug is described as "copy the other screen," find the exact working CSS/render path and reuse it.
- Preserve scroll/zoom positions. Board renders should not force the player back to a default view.

## Asset Notes

- Full card art is stored in root-level numbered PNGs.
- Runtime small cards normally use `optimized/card-thumbs/{id}.jpg`.
- If full art already contains the requested visual change, only regenerate the thumbnail and update data.
- Avoid editing generated thumbnails by hand when a full PNG exists.

## Current Temporary State

- Cards `81` through `100` are temporarily disabled through `TEMP_DISABLED_CARD_IDS` in `src/scripts/01-data-and-state.js`.
- Their definitions and gameplay implementation code are intentionally kept so they can be restored later.
- Chingachlook is currently `cost: 2`.
- Zoe is currently `fate: 4`.
- Mark Menz is currently `fate: 4`.

## Things To Avoid

- Do not delete user-created assets or code unless explicitly asked.
- Do not silently revert user changes.
- Do not declare a fix complete until the relevant data, UI, art/thumbs, and gameplay paths agree.
- Do not make broad refactors while handling a targeted balance or visual change.
- Do not rely only on single-player testing for a mechanic that can happen online.

