# Render V2 Migration Process Recap

This is a quick recap of the render-v2 architecture finish process.

## Starting Point

The goal was to finish the live match rendering migration from a hybrid DOM/canvas setup into:

```text
DOM app shell + render-v2 canvas match scene
```

The plan required render-v2 to own the board, cards, hands, piles, motion effects, drag previews, hit maps, dirty canvas layers, adaptive render scale, and acceptance/performance reporting.

## Main Implementation Steps

1. Added a hard acceptance report:

```js
fateRendererV2AcceptanceReport()
```

This became the main proof point for ownership and blockers.

2. Made render-v2 scene mode the normal/default match renderer while keeping rollback:

```text
?domBoard=1
localStorage.fateDisableMatchRendererV2 = "1"
```

3. Quarantined the old board canvas renderer during v2 ownership so it no longer draws or silently forces DOM-board fallback in normal v2 mode.

4. Expanded the renderer into layered canvases:

- background
- card/main
- effect
- fixed UI
- hover

5. Moved live match surfaces into render-v2 ownership:

- board grid/cards
- own hand
- opponent hand
- deck/discard pile visuals
- drag previews
- motion effects

6. Replaced DOM hand drag dependency with hit-map based drag.

7. Added render-v2 motion/timeline ownership so motion no longer uses DOM ghost cards.

8. Added performance and scenario tooling:

```js
fateRendererV2PerfMatrix()
fateRendererV2CanvasDelta()
fateBeginPerfScenario(name)
fateEndPerfScenario()
fateRunPerfBoardMatrix()
fateRunPhase11AutoSuite()
fateRendererV2Phase11Report()
```

## Testing Process

The acceptance report initially showed blockers for hand, opponent hand, piles, drag, and motion. These were resolved in stages until:

```js
fateRendererV2AcceptanceReport().pass === true
```

Then Phase 11 scenario coverage was added and tested.

Automatic/synthetic checks covered:

- empty board
- 12 board cards
- 27 board cards
- 54 board cards
- idle
- low-effects mode
- current DPR bucket

Manual checks covered:

- hover board card
- hover empty cell
- select board card
- select hand card
- drag hand card
- place one card
- fate pulse
- card to discard motion
- draw from deck motion
- deck click
- discard click
- end turn / resize-related interactions

The final Phase 11 report reached:

```js
{
  acceptancePass: true,
  pass: true,
  blockers: [],
  remaining: []
}
```

## Issues Found And Fixed

- Old fallback flag leaked during board-card selection.
  - Fixed by clearing/ignoring stale forced-DOM fallback state while v2 owns the board.

- Acceptance was too strict when an opponent hand was empty.
  - Fixed by checking expected hand counts; an empty expected hand can still be render-v2 owned.

- Scenario evidence disappeared after refresh.
  - Fixed by persisting Phase 11 scenario evidence in `localStorage`.

- Drag testing produced noisy dirty redraw counts.
  - Followed up by throttling drag drop-preview hover updates while keeping the drag ghost at rAF speed.
  - Split `hoverOnlyDraws` from heavier `dirtyDraws`.

- Missing voiceline `.mp3` requests appeared during tests.
  - Noted as unrelated audio asset noise, not a render-v2 blocker.

## Final Audit

Added:

```text
RENDER_V2_FINAL_AUDIT.md
```

This records acceptance expectations, Phase 11 status, rollback commands, dirty redraw follow-up, and known non-renderer noise.

Added:

```text
RENDER_V2_VISUAL_CHANGE_GUIDE.md
```

This tells future AI/editing passes how to make visual changes without breaking render-v2 ownership.

## GitHub Push

The render-v2 rollout work was committed and pushed to `main`:

```text
ba76d91 Finish render-v2 scene ownership rollout
```

## Current Rule For Future Work

Any live match visual change must preserve:

- render-v2 scene ownership
- zero DOM `.cell`, `.bc`, `.hc`, and motion ghost hot-path visuals
- old renderer disabled in v2
- rollback support
- passing acceptance report

Run this after live match visual changes:

```js
fateRendererV2AcceptanceReport()
```
