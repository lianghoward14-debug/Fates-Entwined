# Support Company

Support Company appears in the in-match deck window, including the developer deck browser.

- Each player has two calls per match. Uses reset for a new match and persist in authoritative snapshots.
- **Call to Arms** adds one reserve card to hand for free, once.
- **Desperate Reinforcement** becomes available after the free call. It adds one reserve card for half the player's current Morale, rounded up, once. The picker displays the exact charge and remaining Morale before confirmation.
- Calls are made during the player's main turn, outside pending choices. Canceling the picker spends nothing.
- Cards retain normal placement costs and limits. Arrivals are reserve additions, not draws or deck searches. Hand limits still apply.
- Desperate Reinforcement is unavailable without Morale rules. Paying the last point of Morale causes defeat.
- The opponent sees the ability announcement and public Morale payment, never the selected card. Owner-only events and hand projections contain the selection.

## Per-game pool

Each match randomly samples 10 distinct Supporters and 5 distinct characters from the eligible catalog (excluding star-rarity, retired, and temporarily disabled cards). Both abilities use this same pool for the whole match. The authoritative state saves it for reconnects and enforces membership in single-player and multiplayer. Canceling or reopening does not reroll the pool or spend a use; only selecting a card and confirming spends it.

## Animation review

Run `node tools/support-company-preview-server.cjs`, then open
`http://127.0.0.1:8766/artifacts/support-company-preview.html`.

- A: Call to Arms — The Company Assembles (current default)
- B: Call to Arms — Dispatch in Flight
- C: Desperate Reinforcement — Hold the Line (current default)
- D: Desperate Reinforcement — The Last Signal

The current gallery embeds the real `showDeckInfo` markup and game styles in a preview fixture. Support Company is now two compact actions inside the existing deck layout, with only the approved descriptions and small horn/shield icons. Narrow-screen grid constraints keep the full controls visible. Earlier standalone panel concepts are archived.

Two additional Call to Arms flag samples are available: Raise the Standard and Standards United. Hold the Line is approved with its bottom curve removed. All playback and animated previews display the action subtitle below the effect: Call to Arms or Desperate Reinforcement.

Announcements use transparent center-board canvas illustrations, following the luminous contours, gold secondary strokes, staged assembly, and particle dissolution of `19-approved-activation-art.js`. They do not use the character banner. No selected card identity enters the animation. Reduced motion uses a still illustration; overlays never intercept input. An animated four-sample comparison is saved as `artifacts/support-company-effects-v3.gif`.

## Validation

- `node server/authoritative-v3/support-company-regression.mjs`: passed. Covers every allowed card, rejected exclusions, separate player allowances, half-Morale rounding, lethal payment, hand limits, pending choices, network privacy, duplicate command replay, and persisted uses.
- `node server/support-company-browser-regression.cjs`: passed with Playwright and installed Edge. Requires the local preview server and Playwright on `NODE_PATH`. Covers four animations, bounded animation cleanup, mobile layout, panel states, private selection, payment, and duplicate callbacks.
- Syntax and diff whitespace checks passed for changed production files.
- Existing `engine-smoke-test.mjs` fails at line 78 (expects BOARD_TARGET, receives REACTION); reproduced with pre-change engine files.
- Existing `phase5-local-session-smoke-test.mjs` fails its route-order assertion; the same assertion fails against the pre-change setup source.

The multiplayer command is implemented in the shared engine and client. A server deployment is required before the live multiplayer service offers it; this change does not deploy or publish the service.

Approved final defaults: Standards United (crossed flags) for Call to Arms, without the bottom circle; Hold the Line for Desperate Reinforcement, without the bottom curve. Both action subtitles are raised to 15% above the effect container bottom.
